# Currency Convertor (Chrome Extension)

Detects prices on any webpage and shows conversions between USD, EUR, and PLN.
Built with TypeScript, React, and Chrome Manifest V3.

## Features
- Auto-detects USD, EUR, and PLN by symbol or code.
- Injects conversions next to detected prices on the page.
- Popup UI to choose which target currencies to show.
- Rates cached for 1 hour via `https://api.frankfurter.app`.

## Project structure
- `src/content.tsx`: finds prices and injects conversions.
- `src/content.css`: injected styles for price annotations.
- `src/background.ts`: rate fetch + cache.
- `src/popup/*`: React UI for currency selection.
- `src/shared/*`: shared types and storage helpers.
- `src/manifest.json`: Chrome extension config.

## Setup
1. Install Node.js 18+.
2. Install dependencies:
   ```bash
   npm install
   ```

## Scripts
- One-time build:
  ```bash
  npm run build
  ```
- Watch mode (rebuild on changes):
  ```bash
  npm run dev
  ```
- Preview build output:
  ```bash
  npm run preview
  ```

## Load into Chrome
1. Go to `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked" and select the `dist` folder.

## Usage
1. Open a page with prices (e.g., mobile.de or otomoto.pl).
2. Converted values appear next to the original price.
3. Use the extension popup to enable or disable currencies.

## Notes
- Base currency is detected from page text (symbol or code).
- Prices are parsed heuristically; some sites may need extra selectors if
  they hide prices in complex markup.
