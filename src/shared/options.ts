import { storageGet, storageSet } from "./storage";

export type Options = {
  targets: string[];
};

export const OPTIONS_KEY = "ccxOptions";
export const DEFAULT_OPTIONS: Options = {
  targets: ["USD", "EUR", "PLN"]
};

const CURRENCY_CODE = /^[A-Z]{3}$/;

function normalizeTargets(targets: string[]): string[] {
  const seen = new Set<string>();
  for (const target of targets) {
    const upper = String(target).toUpperCase();
    if (CURRENCY_CODE.test(upper)) {
      seen.add(upper);
    }
  }
  return Array.from(seen);
}

export async function getOptions(): Promise<Options> {
  const stored = await storageGet<Options>(OPTIONS_KEY);
  if (!stored || !Array.isArray(stored.targets)) {
    return DEFAULT_OPTIONS;
  }
  const targets = normalizeTargets(stored.targets);
  if (targets.length === 0) {
    return DEFAULT_OPTIONS;
  }
  return { targets };
}

export async function setOptions(options: Options): Promise<void> {
  const targets = normalizeTargets(options.targets);
  const next = targets.length ? targets : DEFAULT_OPTIONS.targets;
  await storageSet(OPTIONS_KEY, { targets: next });
}


