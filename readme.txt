Currency Convertor (Chrome Extension)
====================================

Goal
- When you visit a site, detect the base price currency (USD/EUR/PLN) and show the same value converted into the other currencies next to it.
- Works on any site (examples: mobile.de, otomoto.pl).
- Uses TypeScript + React + Manifest V3.

Features
- Auto-detects USD, EUR, PLN by symbol or code.
- Injects conversions next to detected prices on the page.
- Popup UI to choose which target currencies to show.
- Rates cached for 1 hour via https://api.frankfurter.app.

Project structure
- src/content.tsx: finds prices and injects conversions.
- src/background.ts: rate fetch + cache.
- src/popup/*: React UI for currency selection.
- src/manifest.json: Chrome extension config.

Setup
1) Install Node.js 18+.
2) Install dependencies:
   npm install

Build
- One-time build:
  npm run build
- Watch mode (rebuild on changes):
  npm run dev

Load into Chrome
1) Go to chrome://extensions.
2) Enable Developer mode.
3) Click "Load unpacked" and select the dist folder.

Test
1) Open a page with prices (e.g., mobile.de or otomoto.pl).
2) You should see converted values next to the original price.
3) Use the extension popup to enable or disable currencies.

Notes
- The base currency is detected from the page text (symbol or code).
- Prices are parsed heuristically. Some sites may need extra selectors if they hide prices in complex markup.
