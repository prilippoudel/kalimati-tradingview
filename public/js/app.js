/**
 * Kalimati TradingView Application Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const chartInstance = new KalimatiChart('main-chart-canvas', 'sub-chart-canvas');

  // State
  let currentCommodityId = '303.4'; // Default Akabrey
  let currentTimeframe = '1D';
  let allCommodities = [];
  let currentData = null;
  let isComparing = false;
  let activeDrawingTool = 'cursor'; // 'cursor', 'trendline', 'horzline'

  // Drawing state
  const drawingCanvas = document.getElementById('drawing-canvas');
  const dCtx = drawingCanvas.getContext('2d');
  let drawings = []; // [{ type: 'line', x1, y1, x2, y2 }, { type: 'horz', y }]
  let isDrawing = false;
  let currentDraft = null;

  function resizeDrawingCanvas() {
    const mainChartEl = document.getElementById('main-chart-canvas');
    if (!mainChartEl) return;
    drawingCanvas.width = mainChartEl.clientWidth;
    drawingCanvas.height = mainChartEl.clientHeight;
    redrawCanvas();
  }
  window.addEventListener('resize', resizeDrawingCanvas);

  function redrawCanvas() {
    dCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    dCtx.lineWidth = 1.5;

    for (const d of drawings) {
      if (d.type === 'line') {
        dCtx.strokeStyle = '#2962ff';
        dCtx.beginPath();
        dCtx.moveTo(d.x1, d.y1);
        dCtx.lineTo(d.x2, d.y2);
        dCtx.stroke();
      } else if (d.type === 'horz') {
        dCtx.strokeStyle = '#ff9800';
        dCtx.setLineDash([4, 4]);
        dCtx.beginPath();
        dCtx.moveTo(0, d.y);
        dCtx.lineTo(drawingCanvas.width, d.y);
        dCtx.stroke();
        dCtx.setLineDash([]);
      }
    }

    if (currentDraft) {
      dCtx.strokeStyle = '#00e5ff';
      dCtx.beginPath();
      if (currentDraft.type === 'line') {
        dCtx.moveTo(currentDraft.x1, currentDraft.y1);
        dCtx.lineTo(currentDraft.x2, currentDraft.y2);
      } else if (currentDraft.type === 'horz') {
        dCtx.setLineDash([4, 4]);
        dCtx.moveTo(0, currentDraft.y);
        dCtx.lineTo(drawingCanvas.width, currentDraft.y);
        dCtx.setLineDash([]);
      }
      dCtx.stroke();
    }
  }

  drawingCanvas.addEventListener('mousedown', (e) => {
    if (activeDrawingTool === 'cursor') return;
    const rect = drawingCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    isDrawing = true;
    if (activeDrawingTool === 'trendline') {
      currentDraft = { type: 'line', x1: x, y1: y, x2: x, y2: y };
    } else if (activeDrawingTool === 'horzline') {
      currentDraft = { type: 'horz', y: y };
    }
    redrawCanvas();
  });

  drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !currentDraft) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentDraft.type === 'line') {
      currentDraft.x2 = x;
      currentDraft.y2 = y;
    } else if (currentDraft.type === 'horz') {
      currentDraft.y = y;
    }
    redrawCanvas();
  });

  drawingCanvas.addEventListener('mouseup', () => {
    if (!isDrawing || !currentDraft) return;
    drawings.push(currentDraft);
    currentDraft = null;
    isDrawing = false;
    redrawCanvas();
  });

  // Load Commodities list
  async function loadCommodities() {
    try {
      const res = await fetch('/api/commodities');
      const data = await res.json();
      allCommodities = data.commodities || [];
      populateSearchDropdown(allCommodities);
      populateWatchlist(allCommodities);
    } catch (e) {
      console.error('Failed to load commodities:', e);
    }
  }

  // Populate searchable dropdown
  function populateSearchDropdown(commodities) {
    const select = document.getElementById('symbol-select');
    if (!select) return;
    select.innerHTML = '';

    // Favorites group (Akabrey & Lemon)
    const optGroupFav = document.createElement('optgroup');
    optGroupFav.label = '⭐ Featured Commodities';

    const akabare = commodities.find(c => c.id === '303.4');
    if (akabare) {
      const opt = new Option(`🌶️ ${akabare.english}`, akabare.id);
      optGroupFav.appendChild(opt);
    }

    const lemon = commodities.find(c => c.id === '203');
    if (lemon) {
      const opt = new Option(`🍋 ${lemon.english}`, lemon.id);
      optGroupFav.appendChild(opt);
    }
    select.appendChild(optGroupFav);

    // Other Popular
    const optGroupPop = document.createElement('optgroup');
    optGroupPop.label = '🌿 Other Kalimati Commodities';
    commodities
      .filter(c => c.id !== '303.4' && c.id !== '203')
      .forEach(c => {
        const opt = new Option(c.english, c.id);
        optGroupPop.appendChild(opt);
      });
    select.appendChild(optGroupPop);

    select.value = currentCommodityId;
    select.addEventListener('change', (e) => {
      switchCommodity(e.target.value);
    });
  }

  // Populate Right Watchlist
  async function populateWatchlist(commodities) {
    const listEl = document.getElementById('watchlist-items');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Selected priority watchlist items
    const watchlistIds = ['303.4', '203', '101.1', '104.1', '106.1', '301', '302.1', '109'];
    const items = commodities.filter(c => watchlistIds.includes(c.id));

    // Sort to keep Akabrey & Lemon on top
    items.sort((a, b) => {
      if (a.id === '303.4') return -1;
      if (b.id === '303.4') return 1;
      if (a.id === '203') return -1;
      if (b.id === '203') return 1;
      return 0;
    });

    for (const item of items) {
      const row = document.createElement('div');
      row.className = `watchlist-item ${item.id === currentCommodityId ? 'active' : ''}`;
      row.dataset.id = item.id;

      const icon = item.id === '303.4' ? '🌶️' : item.id === '203' ? '🍋' : '🥬';

      row.innerHTML = `
        <div class="wl-left">
          <div class="wl-icon">${icon}</div>
          <div class="wl-meta">
            <span class="wl-symbol">${item.english}</span>
            <span class="wl-name">Wholesale</span>
          </div>
        </div>
        <div class="wl-right">
          <span class="wl-price" id="wl-price-${item.id}">--</span>
          <span class="wl-change" id="wl-chg-${item.id}">--</span>
        </div>
      `;

      row.addEventListener('click', () => {
        switchCommodity(item.id);
      });

      listEl.appendChild(row);
    }

    // Fetch and populate quick prices for watchlist
    for (const item of items) {
      fetch(`/api/history/${item.id}?timeframe=1D`)
        .then(r => r.json())
        .then(res => {
          if (!res || !res.stats) return;
          const pEl = document.getElementById(`wl-price-${item.id}`);
          const cEl = document.getElementById(`wl-chg-${item.id}`);
          if (pEl) pEl.textContent = `NPR ${res.stats.currentPrice}`;
          if (cEl) {
            const isUp = res.stats.change >= 0;
            const sign = isUp ? '+' : '';
            cEl.textContent = `${sign}${res.stats.changePct}%`;
            cEl.className = `wl-change ${isUp ? 'val-up' : 'val-down'}`;
          }
        })
        .catch(() => {});
    }
  }

  // Fetch & load Commodity History
  async function loadData(commodityId, timeframe = currentTimeframe) {
    const loadingOverlay = document.getElementById('chart-loading');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
      const res = await fetch(`/api/history/${commodityId}?timeframe=${timeframe}`);
      const data = await res.json();
      currentData = data;

      // Update Chart
      chartInstance.setData(data.commodity, data.candles, timeframe);
      resizeDrawingCanvas();

      // Update Header Ticker HUD
      updateHeaderTicker(data);

      // Update Market Stats Sidebar
      updateMarketStats(data);

      // If comparing Akabrey & Lemon, fetch the counterpart
      if (isComparing) {
        const compareId = commodityId === '303.4' ? '203' : '303.4';
        const compRes = await fetch(`/api/history/${compareId}?timeframe=${timeframe}`);
        const compData = await compRes.json();
        chartInstance.setCompareData(compData.commodity, compData.candles);
      }
    } catch (err) {
      console.error('Error loading commodity data:', err);
    } finally {
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }

  function updateHeaderTicker(data) {
    const comm = data.commodity;
    const stats = data.stats;

    document.getElementById('header-title').textContent = comm.english;
    document.getElementById('header-nepali-title').textContent = 'Fresh Wholesale Rate • Per Kg';
    document.getElementById('header-price').textContent = `NPR ${stats.currentPrice}`;

    const sign = stats.change >= 0 ? '+' : '';
    const isUp = stats.change >= 0;
    const chgEl = document.getElementById('header-change');
    chgEl.textContent = `${sign}${stats.change.toFixed(2)} (${sign}${stats.changePct}%) Today`;
    chgEl.className = `ticker-change ${isUp ? 'val-up' : 'val-down'}`;

    if (data.englishDate) {
      document.getElementById('nepali-date-badge').textContent = `📅 ${data.englishDate}`;
    }

    // Active chip highlight
    document.querySelectorAll('.symbol-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.id === comm.id);
    });

    // Update watchlist active selection
    document.querySelectorAll('.watchlist-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === comm.id);
    });

    const symbolSelect = document.getElementById('symbol-select');
    if (symbolSelect && symbolSelect.value !== comm.id) {
      symbolSelect.value = comm.id;
    }
  }

  function updateMarketStats(data) {
    const s = data.stats;
    if (!s) return;

    document.getElementById('stat-high52').textContent = `NPR ${s.high52}`;
    document.getElementById('stat-low52').textContent = `NPR ${s.low52}`;
    document.getElementById('stat-ath').textContent = `NPR ${s.allTimeHigh}`;
    document.getElementById('stat-atl').textContent = `NPR ${s.allTimeLow}`;
    document.getElementById('stat-volatility').textContent = `${s.volatility30}%`;
    document.getElementById('stat-days').textContent = `${s.totalTradingDays} Days`;

    // Today's official daily particular if present
    if (s.todayParticular) {
      document.getElementById('stat-today-min').textContent = `NPR ${s.todayParticular.min}`;
      document.getElementById('stat-today-max').textContent = `NPR ${s.todayParticular.max}`;
      document.getElementById('stat-today-avg').textContent = `NPR ${s.todayParticular.avg}`;
      document.getElementById('stat-unit').textContent = s.todayParticular.unit || 'Kg';
    } else {
      document.getElementById('stat-today-min').textContent = `NPR ${(s.currentPrice * 0.9).toFixed(1)}`;
      document.getElementById('stat-today-max').textContent = `NPR ${(s.currentPrice * 1.1).toFixed(1)}`;
      document.getElementById('stat-today-avg').textContent = `NPR ${s.currentPrice}`;
      document.getElementById('stat-unit').textContent = 'Kg';
    }

    // Technical Bias Meter
    const biasEl = document.getElementById('market-bias-badge');
    if (biasEl) {
      if (s.changePct > 2) {
        biasEl.textContent = 'BULLISH 🔥';
        biasEl.className = 'bias-badge bias-bull';
      } else if (s.changePct < -2) {
        biasEl.textContent = 'BEARISH ❄️';
        biasEl.className = 'bias-badge bias-bear';
      } else {
        biasEl.textContent = 'NEUTRAL ⚖️';
        biasEl.className = 'bias-badge bias-neutral';
      }
    }
  }

  function switchCommodity(id) {
    currentCommodityId = id;
    loadData(id, currentTimeframe);
  }

  // Event Listeners

  // Quick Chips (Akabrey & Lemon)
  document.querySelectorAll('.symbol-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      switchCommodity(chip.dataset.id);
    });
  });

  // Timeframe Buttons (1D, 1W, 1M)
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      loadData(currentCommodityId, currentTimeframe);
    });
  });

  // Chart Style Dropdown
  const chartTypeSelect = document.getElementById('chart-type-select');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', (e) => {
      chartInstance.setChartType(e.target.value);
    });
  }

  // Indicator Checkboxes
  document.querySelectorAll('.ind-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      chartInstance.toggleIndicator(e.target.dataset.ind, e.target.checked);
    });
  });

  // Compare Mode Toggle
  const compareToggle = document.getElementById('compare-toggle-btn');
  if (compareToggle) {
    compareToggle.addEventListener('click', () => {
      isComparing = !isComparing;
      chartInstance.isComparing = isComparing;
      compareToggle.classList.toggle('active', isComparing);

      if (isComparing) {
        const otherId = currentCommodityId === '303.4' ? '203' : '303.4';
        fetch(`/api/history/${otherId}?timeframe=${currentTimeframe}`)
          .then(r => r.json())
          .then(compData => {
            chartInstance.setCompareData(compData.commodity, compData.candles);
          });
      } else {
        chartInstance.clearCompare();
      }
    });
  }

  // Refresh Button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      try {
        await fetch(`/api/refresh/${currentCommodityId}`, { method: 'POST' });
        await loadData(currentCommodityId, currentTimeframe);
      } finally {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      }
    });
  }

  // Drawing Tools
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool === 'clear') {
        drawings = [];
        redrawCanvas();
        return;
      }

      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDrawingTool = tool;

      if (tool === 'cursor') {
        drawingCanvas.style.pointerEvents = 'none';
      } else {
        drawingCanvas.style.pointerEvents = 'auto';
      }
    });
  });

  // Screenshot Export
  const screenshotBtn = document.getElementById('screenshot-btn');
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', () => chartInstance.exportScreenshot());
  }

  // Fullscreen
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => chartInstance.toggleFullscreen());
  }

  // Initial load
  await loadCommodities();
  await loadData(currentCommodityId, currentTimeframe);
});
