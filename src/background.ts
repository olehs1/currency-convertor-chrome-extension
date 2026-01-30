import { storageGet, storageSet } from "./shared/storage";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_KEY_PREFIX = "ccxRates:";

type CachedRates = {
  base: string;
  fetchedAt: number;
  rates: Record<string, number>;
};

type RatesMessage = {
  type: "getRates";
  base: string;
  symbols: string[];
};

function cacheKey(base: string): string {
  return `${CACHE_KEY_PREFIX}${base}`;
}

async function fetchRates(base: string, symbols: string[]): Promise<Record<string, number>> {
  const url = new URL("https://api.frankfurter.app/latest");
  url.searchParams.set("from", base);
  url.searchParams.set("to", symbols.join(","));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Rate fetch failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object" || !data.rates) {
    throw new Error("Unexpected rate response");
  }

  return data.rates as Record<string, number>;
}

async function getRates(base: string, symbols: string[]): Promise<Record<string, number>> {
  const key = cacheKey(base);
  const cached = await storageGet<CachedRates>(key);
  const now = Date.now();
  const isFresh = Boolean(cached && now - cached.fetchedAt < CACHE_TTL_MS);

  if (cached && isFresh) {
    const hasAll = symbols.every((symbol) => cached.rates[symbol] !== undefined);
    if (hasAll) {
      return cached.rates;
    }
  }

  const freshRates = await fetchRates(base, symbols);
  const mergedRates = cached && isFresh ? { ...cached.rates, ...freshRates } : freshRates;

  const entry: CachedRates = {
    base,
    fetchedAt: now,
    rates: mergedRates
  };

  await storageSet(key, entry);
  return mergedRates;
}

chrome.runtime.onMessage.addListener((message: RatesMessage, _sender, sendResponse) => {
  if (!message || message.type !== "getRates") {
    return false;
  }

  if (!message.base || !Array.isArray(message.symbols)) {
    sendResponse({ ok: false, error: "Invalid rate request" });
    return false;
  }

  getRates(message.base, message.symbols)
    .then((rates) => sendResponse({ ok: true, rates }))
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : "Rate lookup failed";
      sendResponse({ ok: false, error: messageText });
    });

  return true;
});


