import React, { useEffect, useMemo, useState } from "react";
import { DEFAULT_OPTIONS, getOptions, setOptions } from "../shared/options";
import { getSiteEnabled, setSiteEnabled } from "../shared/siteState";

const FALLBACK_CURRENCIES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  PLN: "Polish Zloty"
};

type SiteInfo = {
  host: string;
  enabled: boolean;
};

export default function App() {
  const [targets, setTargets] = useState<string[]>(DEFAULT_OPTIONS.targets);
  const [optionsStatus, setOptionsStatus] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [currencies, setCurrencies] = useState<Record<string, string>>(FALLBACK_CURRENCIES);
  const [selectedCode, setSelectedCode] = useState<string>(DEFAULT_OPTIONS.targets[0] ?? "");
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [siteStatus, setSiteStatus] = useState<string>("");

  useEffect(() => {
    getOptions()
      .then((options) => {
        setTargets(options.targets);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    fetch("https://api.frankfurter.app/currencies")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Currency list unavailable");
        }
        return response.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object") {
          return;
        }
        setCurrencies(data as Record<string, string>);
      })
      .catch(() => {
        setCurrencies(FALLBACK_CURRENCIES);
      });
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    setOptionsStatus("Saving...");
    setOptions({ targets })
      .then(() => setOptionsStatus("Saved"))
      .catch(() => setOptionsStatus("Save failed"));
  }, [targets, loaded]);

  const currencyCodes = useMemo(() => Object.keys(currencies).sort(), [currencies]);

  useEffect(() => {
    if (!currencyCodes.length) {
      return;
    }
    setSelectedCode((previous) => (currencyCodes.includes(previous) ? previous : currencyCodes[0]));
  }, [currencyCodes]);

  useEffect(() => {
    function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
      return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve(tabs[0]);
        });
      });
    }

    function getHost(url?: string): string | null {
      if (!url) {
        return null;
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          return parsed.hostname;
        }
      } catch {
        return null;
      }
      return null;
    }

    getActiveTab()
      .then((tab) => {
        const host = getHost(tab?.url);
        if (!host) {
          setSiteInfo(null);
          return;
        }
        return getSiteEnabled(host).then((enabled) => {
          setSiteInfo({ host, enabled });
        });
      })
      .catch(() => setSiteInfo(null));
  }, []);

  function addCurrency() {
    const code = selectedCode.toUpperCase();
    if (!code) {
      return;
    }
    setTargets((previous) => {
      if (previous.includes(code)) {
        setOptionsStatus("Already selected.");
        return previous;
      }
      return [...previous, code];
    });
  }

  function removeCurrency(code: string) {
    setTargets((previous) => {
      if (previous.length === 1 && previous[0] === code) {
        setOptionsStatus("Select at least one currency.");
        return previous;
      }
      return previous.filter((item) => item !== code);
    });
  }

  function toggleSite(enabled: boolean) {
    if (!siteInfo) {
      return;
    }
    const host = siteInfo.host;
    setSiteInfo((previous) => (previous ? { ...previous, enabled } : previous));
    setSiteStatus("Saving...");
    setSiteEnabled(host, enabled)
      .then(() => setSiteStatus(enabled ? "Enabled for this site." : "Disabled for this site."))
      .catch(() => {
        setSiteStatus("Save failed");
        setSiteInfo((previous) => (previous ? { ...previous, enabled: !enabled } : previous));
      });
  }

  return (
    <div className="popup">
      <header className="popup__header">
        <h1>Currency Convertor</h1>
        <p>Shows converted prices next to detected values.</p>
      </header>
      <section className="popup__section">
        <div className="popup__label">This site</div>
        {siteInfo ? (
          <div className="popup__site-row">
            <div className="popup__site-name" title={siteInfo.host}>
              {siteInfo.host}
            </div>
            <label className="popup__switch">
              <input
                type="checkbox"
                checked={siteInfo.enabled}
                onChange={(event) => toggleSite(event.target.checked)}
              />
              <span className="popup__slider" />
            </label>
          </div>
        ) : (
          <div className="popup__hint">Open a regular website to toggle the site setting.</div>
        )}
        {siteStatus ? <div className="popup__status">{siteStatus}</div> : null}
      </section>
      <section className="popup__section">
        <div className="popup__label">Target currencies</div>
        <div className="popup__toolbar">
          <select
            className="popup__select"
            value={selectedCode}
            onChange={(event) => setSelectedCode(event.target.value)}
          >
            {currencyCodes.map((code) => (
              <option key={code} value={code}>
                {code}
                {currencies[code] ? ` — ${currencies[code]}` : ""}
              </option>
            ))}
          </select>
          <button className="popup__add" type="button" onClick={addCurrency}>
            +
          </button>
        </div>
        <div className="popup__options">
          {targets.map((code) => (
            <button
              className="popup__pill"
              key={code}
              type="button"
              onClick={() => removeCurrency(code)}
              aria-label={`Remove ${code}`}
            >
              <span>{code}</span>
              <span className="popup__pill-icon">×</span>
            </button>
          ))}
        </div>
        <div className="popup__hint">Base currency is detected from the page.</div>
        {optionsStatus ? <div className="popup__status">{optionsStatus}</div> : null}
      </section>
    </div>
  );
}

