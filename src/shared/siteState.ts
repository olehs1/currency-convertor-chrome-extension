import { storageGet, storageSet } from "./storage";

export const SITE_STATE_KEY = "ccxSiteState";

type SiteStateMap = Record<string, boolean>;

function normalizeHost(host: string): string | null {
  if (!host) {
    return null;
  }
  const normalized = host.trim().toLowerCase();
  return normalized ? normalized : null;
}

async function readStateMap(): Promise<SiteStateMap> {
  const stored = await storageGet<SiteStateMap>(SITE_STATE_KEY);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return {};
  }
  return stored;
}

export async function getSiteEnabled(host: string): Promise<boolean> {
  const key = normalizeHost(host);
  if (!key) {
    return false;
  }
  const stored = await readStateMap();
  return stored[key] === true;
}

export async function setSiteEnabled(host: string, enabled: boolean): Promise<void> {
  const key = normalizeHost(host);
  if (!key) {
    return;
  }
  const stored = await readStateMap();
  const next = { ...stored };
  if (enabled) {
    next[key] = true;
  } else {
    delete next[key];
  }
  await storageSet(SITE_STATE_KEY, next);
}
