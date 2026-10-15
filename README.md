# 🌶️ Kalimati Pro — TradingView Candlestick Charting Terminal

A high-performance financial charting terminal built with TradingView's official **Lightweight Charts v5** that scrapes, aggregates, and visualizes real-time and multi-year historical wholesale market data from the **[Kalimati Fruit and Vegetable Market Development Board](https://kalimatimarket.gov.np/price#)**.

Primary focus on **Akabare Round Chilli (खुर्सानी अकबरे)** and **Lemon / Lime (कागती)**, with support for all **150+ Kalimati agricultural commodities**.

---

## ✨ Features

- **TradingView Engine:** Powered by Lightweight Charts v5 with 60fps canvas rendering, crosshairs, time-scale panning, and zoom.
- **Akabare & Lemon Quick Switchers:** Instant 1-click pills to toggle between featured commodities.
- **150+ Commodity Catalog:** Searchable catalog with full English translations and categories.
- **Multiple Chart Types:**
  - Candlestick (Green / Red with volatility wicks)
  - Heikin-Ashi
  - Area Chart (Gradient fill)
  - Line Chart
  - OHLC Bars
- **Multi-Timeframe Aggregation:**
  - `1D` — Daily Candlesticks
  - `1W` — Aggregated Weekly OHLC
  - `1M` — Aggregated Monthly OHLC
- **Technical Indicators:**
  - SMA 20 & SMA 50
  - EMA 9 & EMA 21
  - Bollinger Bands (20, 2)
  - Activity & Volatility Index Histogram
  - RSI (14) Oscillator Sub-Panel with 70/30 bands
  - MACD (12, 26, 9) with Signal Line & Histogram
- **Dual Comparison Mode:** Overlay Akabare Chilli vs Lemon on a single canvas for price ratio analysis.
- **Interactive Chart Drawing Tools:** Draw trendlines and horizontal support/resistance levels directly on the chart.
- **Live Wholesale Board:** Pulls today's official daily minimum, maximum, and average wholesale rates.
- **Continuous Auto-Sync:** Automated background scheduler that checks for new market bulletin updates every 30 minutes.
- **100% English Interface:** Clean English commodity names, metric units (Kg), and international date formats.
- **Screenshot & Fullscreen:** One-click export to PNG and full-screen trading desk view.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- npm

### Installation
```bash
git clone https://github.com/prilippoudel/kalimati-tradingview.git
cd kalimati-tradingview
npm install
```

### Run Locally
```bash
npm start
```

Visit **`http://localhost:3000`** in your browser.

---

## 📁 Project Structure

```
kalimati-tradingview/
├── data/                               # Local JSON database & caches from Kalimati
├── public/
│   ├── css/
│   │   └── style.css                   # Obsidian dark TradingView styling
│   ├── js/
│   │   ├── lightweight-charts.standalone.production.js  # TradingView v5 library
│   │   ├── indicators.js               # Mathematical indicator calculations
│   │   ├── chart.js                    # Chart instance & series synchronization
│   │   └── app.js                      # Application state & interactions
│   └── index.html                      # Terminal markup & UI layout
├── commodities.json                    # 152 Kalimati items database
├── commodity_translations.json         # English translations mapping
├── server.js                           # Express server, scraper & auto-sync job
└── package.json
```

---

## 📊 Data Source

Data is fetched directly from the official **Kalimati Fruit and Vegetable Market Development Board** (`kalimatimarket.gov.np`):
- Daily Prices: `https://kalimatimarket.gov.np/price`
- Historical Trends: `https://kalimatimarket.gov.np/api/price-history/{id}`

---

## 📄 License
ISC
