const express = require('express');
const path = require('path');
const fs = require('fs');
const newsService = require('./newsService');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Load commodity list
let commoditiesList = [];
try {
  commoditiesList = JSON.parse(fs.readFileSync(path.join(__dirname, 'commodities.json'), 'utf8'));
} catch (e) {
  commoditiesList = [
    { id: '303.4', name: 'खुर्सानी हरियो(अकबरे)', english: 'Chilli Green (Akbare)', category: 'Spices' },
    { id: '203', name: 'कागती', english: 'Lime / Lemon', category: 'Fruits' },
    { id: '101.1', name: 'गोलभेडा ठूलो(नेपाली)', english: 'Tomato Big (Nepali)', category: 'Vegetables' },
    { id: '104.1', name: 'आलु रातो(लाम्चो)', english: 'Potato Red', category: 'Vegetables' },
    { id: '106.1', name: 'प्याज सुकेको (भारतीय)', english: 'Onion Dry', category: 'Vegetables' }
  ];
}

// Load commodity translations
let translationMap = {};
try {
  const transData = JSON.parse(fs.readFileSync(path.join(__dirname, 'commodity_translations.json'), 'utf8'));
  for (const t of transData) {
    translationMap[t.id] = t.english;
  }
} catch (e) {
  console.warn('Error reading commodity_translations.json:', e);
}

commoditiesList = commoditiesList.map(item => ({
  ...item,
  name: item.name,
  english: translationMap[item.id] || item.name,
  isPopular: ['303.4', '203', '101.1', '104.1', '106.1', '301', '302.1', '109.1'].includes(item.id)
}));

// Session and CSRF fetcher
async function getKalimatiSession(url = 'https://kalimatimarket.gov.np/price-history') {
  const pageRes = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const html = await pageRes.text();
  const tokenMatch = html.match(/id="csrf"[^>]*value="([^"]+)"/);
  if (!tokenMatch) throw new Error('Could not find CSRF token from Kalimati');
  const token = tokenMatch[1];
  
  let cookies = '';
  if (pageRes.headers.getSetCookie) {
    cookies = pageRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  } else {
    const rawCookie = pageRes.headers.get('set-cookie');
    if (rawCookie) cookies = rawCookie.split(';')[0];
  }
  return { token, cookies, html };
}

// Fetch historical data from Kalimati
async function fetchCommodityHistory(commodityId, fromDate = '2022-01-01', toDate = null) {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!toDate) toDate = todayStr;
  const cachePath = path.join(DATA_DIR, `cache_${commodityId}.json`);
  
  // Use cached data if fresh (< 1 hour old AND has recent data)
  if (fs.existsSync(cachePath)) {
    try {
      const stat = fs.statSync(cachePath);
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const hasToday = cached.prices && cached.prices.date && cached.prices.date.includes(todayStr);

      // If cached less than 1 hour ago, or if today is already collected, return cache
      if (ageHours < 1 || hasToday) {
        return cached;
      }
    } catch (e) {
      console.warn('Error reading cache:', e);
    }
  }

  // Live fetch
  try {
    const session = await getKalimatiSession();
    const postRes = await fetch(`https://kalimatimarket.gov.np/api/price-history/${commodityId}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://kalimatimarket.gov.np/price-history',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': session.cookies
      },
      body: new URLSearchParams({
        locale: 'en',
        _token: session.token,
        from: fromDate,
        to: toDate
      })
    });

    if (!postRes.ok) throw new Error(`Kalimati API returned status ${postRes.status}`);
    const data = await postRes.json();
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.error(`Error fetching commodity ${commodityId}:`, err.message);
    // Fall back to existing cache if available
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
    const rawPath = path.join(DATA_DIR, `raw_${commodityId}.json`);
    if (fs.existsSync(rawPath)) {
      return JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    }
    throw err;
  }
}

// Scrape today's wholesale table
let todayCache = null;
let todayCacheTime = 0;

async function fetchTodayPrices() {
  if (todayCache && (Date.now() - todayCacheTime) < 1800000) {
    return todayCache;
  }

  try {
    const session = await getKalimatiSession('https://kalimatimarket.gov.np/price');
    const today = new Date().toISOString().slice(0, 10);
    const postRes = await fetch('https://kalimatimarket.gov.np/price', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://kalimatimarket.gov.np/price',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': session.cookies
      },
      body: new URLSearchParams({
        _token: session.token,
        datePricing: today
      })
    });

    const resHtml = await postRes.text();
    const englishDate = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const rowRegex = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<\/tr>/g;
    const items = [];
    let match;
    while ((match = rowRegex.exec(resHtml)) !== null) {
      const rawUnit = match[2].trim();
      items.push({
        name: match[1].trim(),
        unit: (rawUnit.includes('के') || rawUnit.includes('केजी')) ? 'Kg' : (rawUnit.includes('दर्जन') ? 'Dozen' : rawUnit),
        min: parseFloat(match[3].replace(/[^\d.]/g, '')),
        max: parseFloat(match[4].replace(/[^\d.]/g, '')),
        avg: parseFloat(match[5].replace(/[^\d.]/g, ''))
      });
    }

    todayCache = { englishDate, items, fetchedAt: new Date().toISOString() };
    todayCacheTime = Date.now();
    return todayCache;
  } catch (err) {
    console.error('Error fetching today prices:', err.message);
    if (todayCache) return todayCache;
    return { nepaliDate: '', items: [], fetchedAt: null };
  }
}

// Transform raw Kalimati time series into OHLC candlestick format
function buildCandles(raw, timeframe = '1D') {
  if (!raw || !raw.prices || !raw.prices.date) return [];
  const dates = raw.prices.date;
  const avgs = raw.prices.avg.map(v => parseFloat(v));

  const daily = [];
  for (let i = 0; i < dates.length; i++) {
    const close = avgs[i];
    const open = i > 0 ? avgs[i - 1] : close;
    const changePct = open > 0 ? Math.abs(close - open) / open : 0;
    // Volatility spread for natural wicks
    const spread = Math.max(0.015, Math.min(0.065, changePct * 0.6 + 0.02));

    let high, low;
    if (close >= open) {
      high = +(Math.max(open, close) * (1 + spread)).toFixed(2);
      low = +(Math.min(open, close) * (1 - spread * 0.6)).toFixed(2);
    } else {
      high = +(Math.max(open, close) * (1 + spread * 0.6)).toFixed(2);
      low = +(Math.min(open, close) * (1 - spread)).toFixed(2);
    }

    // Trading activity proxy
    const volume = Math.round(1500 + Math.abs(close - open) * 180 + ((i % 7) * 120));

    daily.push({
      time: dates[i],
      open: +open.toFixed(2),
      high,
      low,
      close: +close.toFixed(2),
      avg: +close.toFixed(2),
      volume
    });
  }

  if (timeframe === '1D') return daily;

  // Aggregate into 1W or 1M
  const groups = {};
  for (const c of daily) {
    const d = new Date(c.time);
    let key;
    if (timeframe === '1W') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      key = monday.toISOString().slice(0, 10);
    } else if (timeframe === '1M') {
      key = c.time.slice(0, 7) + '-01';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  const result = [];
  for (const [key, items] of Object.entries(groups)) {
    items.sort((a, b) => a.time.localeCompare(b.time));
    const open = items[0].open;
    const close = items[items.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const it of items) {
      if (it.high > high) high = it.high;
      if (it.low < low) low = it.low;
      volume += it.volume || 0;
    }
    result.push({
      time: key,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      avg: +close.toFixed(2),
      volume
    });
  }
  return result;
}

// Compute key market statistics
function computeStats(candles, todayPrices, commodityId) {
  if (!candles || candles.length === 0) return {};
  const current = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : current;

  const change = +(current.close - prev.close).toFixed(2);
  const changePct = prev.close > 0 ? +((change / prev.close) * 100).toFixed(2) : 0;

  // 52-week (last 365 daily points)
  const lastYear = candles.slice(-365);
  let high52 = -Infinity;
  let low52 = Infinity;
  for (const c of lastYear) {
    if (c.high > high52) high52 = c.high;
    if (c.low < low52) low52 = c.low;
  }

  // All time
  let allTimeHigh = -Infinity;
  let allTimeLow = Infinity;
  for (const c of candles) {
    if (c.high > allTimeHigh) allTimeHigh = c.high;
    if (c.low < allTimeLow) allTimeLow = c.low;
  }

  // 30-day volatility
  const last30 = candles.slice(-30);
  const returns = [];
  for (let i = 1; i < last30.length; i++) {
    returns.push((last30[i].close - last30[i - 1].close) / last30[i - 1].close);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length || 1);
  const volatility30 = +(Math.sqrt(variance) * 100).toFixed(2);

  // Match with today's parsed wholesale board
  let todayParticular = null;
  if (todayPrices && todayPrices.items) {
    const isAkabare = commodityId === '303.4';
    const isLemon = commodityId === '203';
    for (const item of todayPrices.items) {
      if (isAkabare && item.name.includes('अकबरे')) {
        todayParticular = item;
        break;
      }
      if (isLemon && item.name.includes('कागती')) {
        todayParticular = item;
        break;
      }
    }
  }

  return {
    currentPrice: current.close,
    change,
    changePct,
    date: current.time,
    high52: +high52.toFixed(2),
    low52: +low52.toFixed(2),
    allTimeHigh: +allTimeHigh.toFixed(2),
    allTimeLow: +allTimeLow.toFixed(2),
    volatility30,
    todayParticular,
    totalTradingDays: candles.length
  };
}

// REST Endpoints
app.get('/api/commodities', (req, res) => {
  res.json({
    status: 'success',
    commodities: commoditiesList
  });
});

app.get('/api/history/:id', async (req, res) => {
  try {
    const commodityId = req.params.id;
    const timeframe = req.query.timeframe || '1D';
    const raw = await fetchCommodityHistory(commodityId);
    const candles = buildCandles(raw, timeframe);
    const today = await fetchTodayPrices();
    const stats = computeStats(candles, today, commodityId);

    const info = commoditiesList.find(c => c.id === commodityId) || {
      id: commodityId,
      name: raw.commodity,
      english: raw.commodity
    };

    // Calculate anomalies and correlate with news
    let events = [];
    try {
      const articles = await newsService.fetchAgriculturalNews();
      const anomalies = newsService.detectPriceAnomalies(candles, commodityId, info.english);
      events = newsService.correlateAnomaliesWithNews(anomalies, articles);
    } catch (e) {
      console.warn('Error calculating events:', e.message);
    }

    res.json({
      status: 'success',
      commodity: info,
      timeframe,
      stats,
      englishDate: today.englishDate,
      events,
      candles
    });
  } catch (err) {
    console.error('API Error /api/history:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/news', async (req, res) => {
  try {
    const articles = await newsService.fetchAgriculturalNews();
    res.json({ status: 'success', articles });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const commodityId = req.params.id;
    const raw = await fetchCommodityHistory(commodityId);
    const candles = buildCandles(raw, '1D');
    const articles = await newsService.fetchAgriculturalNews();
    const info = commoditiesList.find(c => c.id === commodityId) || { id: commodityId, english: 'Commodity' };
    const anomalies = newsService.detectPriceAnomalies(candles, commodityId, info.english);
    const events = newsService.correlateAnomaliesWithNews(anomalies, articles);
    res.json({ status: 'success', events });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/today', async (req, res) => {
  try {
    const data = await fetchTodayPrices();
    res.json({ status: 'success', ...data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/refresh/:id', async (req, res) => {
  try {
    const commodityId = req.params.id;
    const cachePath = path.join(DATA_DIR, `cache_${commodityId}.json`);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
    const raw = await fetchCommodityHistory(commodityId);
    const candles = buildCandles(raw, '1D');
    res.json({ status: 'success', count: candles.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Fallback index
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Recurring background auto-sync: checks Kalimati and news every 30 minutes
setInterval(async () => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    console.log(`[Auto-Sync ${todayStr}] Checking Kalimati Market & News for fresh updates...`);
    await fetchCommodityHistory('303.4', '2022-01-01', todayStr);
    await fetchCommodityHistory('203', '2022-01-01', todayStr);
    await fetchTodayPrices();
    await newsService.fetchAgriculturalNews();
    console.log(`[Auto-Sync ${todayStr}] Auto-sync successfully completed.`);
  } catch (err) {
    console.warn('[Auto-Sync] Warning:', err.message);
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🚀 Kalimati TradingView Server running on http://localhost:${PORT}`);
});
