import { DEFAULT_OPTIONS, getOptions, OPTIONS_KEY } from "./shared/options";
import { getSiteEnabled, SITE_STATE_KEY } from "./shared/siteState";
import "./content.css";

type RatesResponse = {
  ok: boolean;
  rates?: Record<string, number>;
  error?: string;
};

const PRICE_SELECTORS = [
  "[data-testid*=price]",
  "[class*=price]",
  "[id*=price]",
  ".offer-price__number",
  ".offer-price__currency",
  "[class*=offer-price__number]",
  "[class*=offer-price__currency]"
];

const CURRENCY_REGEX = /(?:\u20AC|EUR|\$|USD|PLN|z\u0142|\bzl\b)/i;
const NUMBER_REGEX = /[0-9][0-9\s.,\u00A0]*[0-9]/;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
const SCAN_DEBOUNCE_MS = 400;
const IDLE_TIMEOUT_MS = 1000;

const ratesCache = new Map<string, Promise<Record<string, number>>>();
let currentOptions = DEFAULT_OPTIONS;
let scanScheduled = false;
let siteEnabled = false;
let observer: MutationObserver | null = null;

function hasInlineForGroup(parent: HTMLElement | null, groupKey: string): boolean {
  if (!parent) {
    return false;
  }
  const inlines = parent.querySelectorAll<HTMLElement>(".ccx-inline[data-ccx-group]");
  for (const inline of inlines) {
    if (inline.dataset.ccxGroup === groupKey) {
      return true;
    }
  }
  return false;
}

function getTextWithoutInline(element: Element, limit?: number): string {
  if (!element.querySelector(".ccx-inline")) {
    const text = element.textContent ?? "";
    return limit ? text.slice(0, limit + 1) : text;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest(".ccx-inline")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let text = "";
  let current = walker.nextNode();
  while (current) {
    text += current.textContent ?? "";
    if (limit && text.length > limit) {
      break;
    }
    current = walker.nextNode();
  }
  return text;
}

function isEligibleElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (SKIP_TAGS.has(element.tagName)) {
    return false;
  }
  if (element.isContentEditable) {
    return false;
  }
  if (element.closest(".ccx-inline")) {
    return false;
  }
  return true;
}

function findCandidateElements(root: Element): Set<HTMLElement> {
  const candidates = new Set<HTMLElement>();

  for (const selector of PRICE_SELECTORS) {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      if (isEligibleElement(element)) {
        candidates.add(element);
      }
    });
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isEligibleElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.textContent ?? "";
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 140) {
        return NodeFilter.FILTER_REJECT;
      }
      const hasCurrency = CURRENCY_REGEX.test(text);
      const hasNumber = NUMBER_REGEX.test(text);
      if (!hasCurrency && !hasNumber) {
        return NodeFilter.FILTER_REJECT;
      }
      if (hasCurrency && hasNumber) {
        return NodeFilter.FILTER_ACCEPT;
      }
      if (!hasNumber) {
        return NodeFilter.FILTER_REJECT;
      }

      const parentText = getTextWithoutInline(parent, 180);
      if (parentText.length <= 180 && CURRENCY_REGEX.test(parentText)) {
        return NodeFilter.FILTER_ACCEPT;
      }

      const container = parent.parentElement;
      if (container) {
        const containerText = getTextWithoutInline(container, 220);
        if (containerText.length <= 220 && CURRENCY_REGEX.test(containerText)) {
          return NodeFilter.FILTER_ACCEPT;
        }
      }

      return NodeFilter.FILTER_REJECT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    const parent = (current as Text).parentElement;
    if (parent && isEligibleElement(parent)) {
      candidates.add(parent);
    }
    current = walker.nextNode();
  }

  return candidates;
}

function detectCurrency(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("EUR") || /\u20AC/.test(text)) {
    return "EUR";
  }
  if (upper.includes("USD") || text.includes("$")) {
    return "USD";
  }
  if (upper.includes("PLN") || /z\u0142/i.test(text) || /\bZL\b/.test(upper)) {
    return "PLN";
  }
  return null;
}

function extractAmount(text: string): number | null {
  const match = text.match(NUMBER_REGEX);
  if (!match) {
    return null;
  }

  let raw = match[0];
  raw = raw.replace(/\u00A0/g, " ");
  raw = raw.replace(/\s/g, "");

  if (!raw) {
    return null;
  }

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma > -1 && lastDot > -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousand = decimal === "," ? "." : ",";
    normalized = raw.replace(new RegExp(`\\${thousand}`, "g"), "");
    normalized = normalized.replace(decimal, ".");
  } else if (lastComma > -1) {
    const parts = raw.split(",");
    const last = parts[parts.length - 1];
    normalized = last.length === 3 ? raw.replace(/,/g, "") : raw.replace(/,/g, ".");
  } else if (lastDot > -1) {
    const parts = raw.split(".");
    const last = parts[parts.length - 1];
    normalized = last.length === 3 ? raw.replace(/\./g, "") : raw;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatCurrency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function buildConversion(amount: number, targets: string[], rates: Record<string, number>): string {
  const parts: string[] = [];
  for (const target of targets) {
    const rate = rates[target];
    if (typeof rate === "number") {
      parts.push(formatCurrency(amount * rate, target));
    }
  }
  if (parts.length === 0) {
    return "";
  }
  return parts.join(" | ");
}

function getContextTexts(element: HTMLElement): string[] {
  const texts: string[] = [];

  const pushText = (value: string | null | undefined, limit: number) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > limit) {
      return;
    }
    texts.push(trimmed);
  };

  pushText(element.textContent, 140);

  const prev = element.previousElementSibling;
  if (prev && !prev.classList.contains("ccx-inline")) {
    pushText(getTextWithoutInline(prev, 80), 80);
  }

  const next = element.nextElementSibling;
  if (next && !next.classList.contains("ccx-inline")) {
    pushText(getTextWithoutInline(next, 80), 80);
  }

  if (element.parentElement) {
    pushText(getTextWithoutInline(element.parentElement, 180), 180);
  }
  if (element.parentElement?.parentElement) {
    pushText(getTextWithoutInline(element.parentElement.parentElement, 220), 220);
  }

  return Array.from(new Set(texts));
}

function removeInline(element: HTMLElement): void {
  const next = element.nextElementSibling;
  if (next && next.classList.contains("ccx-inline")) {
    next.remove();
  }
  element.removeAttribute("data-ccx-processed");
  element.removeAttribute("data-ccx-source");
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

async function requestRates(base: string, symbols: string[]): Promise<Record<string, number>> {
  const response = await sendMessage<RatesResponse>({
    type: "getRates",
    base,
    symbols
  });

  if (!response || !response.ok || !response.rates) {
    const message = response && response.error ? response.error : "Rates unavailable";
    throw new Error(message);
  }

  return response.rates;
}

function getRates(base: string, symbols: string[]): Promise<Record<string, number>> {
  const key = `${base}:${[...symbols].sort().join(",")}`;
  const cached = ratesCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = requestRates(base, symbols).catch((error) => {
    ratesCache.delete(key);
    throw error;
  });
  ratesCache.set(key, pending);
  return pending;
}

async function processElement(element: HTMLElement): Promise<void> {
  if (!isEligibleElement(element)) {
    return;
  }

  const text = (element.textContent ?? "").trim();
  if (!text || text.length > 140) {
    return;
  }

  const hasCurrency = CURRENCY_REGEX.test(text);
  const hasNumber = NUMBER_REGEX.test(text);
  if (!hasCurrency && !hasNumber) {
    return;
  }

  let currency = detectCurrency(text);
  let amount = extractAmount(text);
  let sourceText = text;

  if (!currency || amount === null) {
    const contexts = getContextTexts(element);
    for (const candidate of contexts) {
      if (!currency) {
        const foundCurrency = detectCurrency(candidate);
        if (foundCurrency) {
          currency = foundCurrency;
        }
      }
      if (amount === null) {
        const foundAmount = extractAmount(candidate);
        if (foundAmount !== null) {
          amount = foundAmount;
        }
      }
      if (currency && amount !== null) {
        sourceText = candidate;
        break;
      }
    }
  }

  if (element.dataset.ccxProcessing === "1") {
    return;
  }

  if (element.dataset.ccxProcessed === "1") {
    if (element.dataset.ccxSource === sourceText) {
      return;
    }
    removeInline(element);
  }

  if (!currency || amount === null) {
    return;
  }

  const targets = currentOptions.targets.filter((code) => code !== currency);
  if (targets.length === 0) {
    return;
  }

  const groupKey = `${currency}:${amount}`;
  if (hasInlineForGroup(element.parentElement, groupKey)) {
    return;
  }

  element.dataset.ccxProcessing = "1";
  try {
    const rates = await getRates(currency, targets);
    const conversion = buildConversion(amount, targets, rates);
    if (!conversion) {
      return;
    }

    const badge = document.createElement("span");
    badge.className = "ccx-inline";
    badge.textContent = conversion;
    badge.dataset.ccxGroup = groupKey;

    element.insertAdjacentElement("afterend", badge);
    element.dataset.ccxProcessed = "1";
    element.dataset.ccxSource = sourceText;
  } catch {
    return;
  } finally {
    delete element.dataset.ccxProcessing;
  }
}

function scanAndConvert(): void {
  if (!document.body || !siteEnabled || document.hidden) {
    return;
  }

  const candidates = findCandidateElements(document.body);
  for (const element of candidates) {
    void processElement(element);
  }
}

function scheduleScan(): void {
  if (!siteEnabled || scanScheduled) {
    return;
  }
  scanScheduled = true;
  window.setTimeout(() => {
    scanScheduled = false;
    if (!siteEnabled || document.hidden) {
      return;
    }
    const idleCallback = (window as Window & { requestIdleCallback?: any }).requestIdleCallback;
    if (idleCallback) {
      idleCallback(() => scanAndConvert(), { timeout: IDLE_TIMEOUT_MS });
      return;
    }
    scanAndConvert();
  }, SCAN_DEBOUNCE_MS);
}

function clearConversions(): void {
  document.querySelectorAll(".ccx-inline").forEach((element) => element.remove());
  document.querySelectorAll("[data-ccx-processed]").forEach((element) =>
    element.removeAttribute("data-ccx-processed")
  );
  document.querySelectorAll("[data-ccx-source]").forEach((element) =>
    element.removeAttribute("data-ccx-source")
  );
}

function startObserver(): void {
  if (observer || !document.documentElement) {
    return;
  }
  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function stopObserver(): void {
  if (!observer) {
    return;
  }
  observer.disconnect();
  observer = null;
}

function updateSiteEnabled(nextValue: boolean): void {
  if (siteEnabled === nextValue) {
    return;
  }
  siteEnabled = nextValue;
  if (!siteEnabled) {
    clearConversions();
    stopObserver();
    return;
  }
  scanAndConvert();
  startObserver();
}

async function init(): Promise<void> {
  currentOptions = await getOptions();
  siteEnabled = await getSiteEnabled(window.location.hostname);
  if (siteEnabled) {
    scanAndConvert();
    startObserver();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[OPTIONS_KEY]) {
      getOptions().then((options) => {
        currentOptions = options;
        if (siteEnabled) {
          clearConversions();
          scanAndConvert();
        }
      });
    }
    if (changes[SITE_STATE_KEY]) {
      getSiteEnabled(window.location.hostname).then((enabled) => {
        updateSiteEnabled(enabled);
      });
    }
  });
}

init().catch((error) => {
  console.error("Currency Convertor init failed", error);
});


