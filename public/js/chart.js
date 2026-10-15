/**
 * Kalimati TradingView Chart Manager using Lightweight Charts v5
 */

class KalimatiChart {
  constructor(mainContainerId, subContainerId) {
    this.mainContainer = document.getElementById(mainContainerId);
    this.subContainer = document.getElementById(subContainerId);

    this.chart = null;
    this.subChart = null;

    // Series
    this.primarySeries = null;
    this.volumeSeries = null;
    this.compareSeries = null;

    // Indicator series maps
    this.indicatorSeries = {};
    this.subSeries = {};

    // Current State
    this.chartType = 'candles'; // 'candles', 'area', 'line', 'bars', 'heikin-ashi'
    this.activeIndicators = new Set(['vol']); // default volume on
    this.activeOscillator = 'none'; // 'none', 'rsi', 'macd'
    this.isComparing = false;
    this.compareData = null;
    this.events = [];
    this.showEventMarkers = true;

    // Data cache
    this.currentCandles = [];
    this.rawCommodity = null;
    this.currentTimeframe = '1D';

    // Theme options
    this.theme = 'dark';

    this.initCharts();
    this.setupResizeObserver();
  }

  getThemeOptions() {
    const isDark = this.theme === 'dark';
    return {
      layout: {
        background: { type: 'solid', color: isDark ? '#131722' : '#ffffff' },
        textColor: isDark ? '#9db2c6' : '#1e222d',
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      },
      grid: {
        vertLines: { color: isDark ? '#1e222d' : '#f0f3fa' },
        horzLines: { color: isDark ? '#1e222d' : '#f0f3fa' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#434651' : '#b2b5be',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: '#2962ff'
        },
        horzLine: {
          color: isDark ? '#434651' : '#b2b5be',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: '#2962ff'
        }
      },
      rightPriceScale: {
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2
        }
      },
      timeScale: {
        borderColor: isDark ? '#2a2e39' : '#e0e3eb',
        timeVisible: true,
        secondsVisible: false
      }
    };
  }

  initCharts() {
    const themeOpts = this.getThemeOptions();

    // 1. Main Price Chart
    this.chart = LightweightCharts.createChart(this.mainContainer, {
      ...themeOpts,
      width: this.mainContainer.clientWidth,
      height: this.mainContainer.clientHeight
    });

    // 2. Sub Chart for Oscillators (RSI / MACD)
    this.subChart = LightweightCharts.createChart(this.subContainer, {
      ...themeOpts,
      width: this.subContainer.clientWidth,
      height: this.subContainer.clientHeight,
      rightPriceScale: {
        borderColor: themeOpts.rightPriceScale.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 }
      }
    });

    // Synchronize time scales
    let isSyncing = false;
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      this.subChart.timeScale().setVisibleLogicalRange(range);
      isSyncing = false;
    });

    this.subChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      this.chart.timeScale().setVisibleLogicalRange(range);
      isSyncing = false;
    });

    // Crosshair movement handler for HUD legend
    this.chart.subscribeCrosshairMove(param => this.onCrosshairMove(param));
  }

  setupResizeObserver() {
    const ro = new ResizeObserver(() => {
      if (this.mainContainer && this.chart) {
        this.chart.applyOptions({
          width: this.mainContainer.clientWidth,
          height: this.mainContainer.clientHeight
        });
      }
      if (this.subContainer && this.subChart) {
        this.subChart.applyOptions({
          width: this.subContainer.clientWidth,
          height: this.subContainer.clientHeight
        });
      }
    });
    ro.observe(this.mainContainer);
    ro.observe(this.subContainer);
  }

  setChartType(type) {
    if (this.chartType === type) return;
    this.chartType = type;
    this.render();
  }

  setData(commodity, candles, timeframe = '1D', events = []) {
    this.rawCommodity = commodity;
    this.currentCandles = candles;
    this.currentTimeframe = timeframe;
    this.events = events || [];
    this.render();
    this.chart.timeScale().fitContent();
    this.subChart.timeScale().fitContent();
  }

  setCompareData(commodity, candles) {
    this.compareData = { commodity, candles };
    this.renderCompareSeries();
  }

  clearCompare() {
    this.compareData = null;
    this.isComparing = false;
    if (this.compareSeries) {
      try { this.chart.removeSeries(this.compareSeries); } catch (e) {}
      this.compareSeries = null;
    }
  }

  toggleIndicator(indicatorId, isEnabled) {
    if (isEnabled) {
      this.activeIndicators.add(indicatorId);
    } else {
      this.activeIndicators.delete(indicatorId);
    }

    if (['rsi', 'macd'].includes(indicatorId)) {
      if (isEnabled) {
        this.activeOscillator = indicatorId;
        this.subContainer.classList.add('visible');
      } else {
        if (this.activeOscillator === indicatorId) {
          this.activeOscillator = 'none';
          this.subContainer.classList.remove('visible');
        }
      }
    }
    this.renderIndicators();
  }

  render() {
    if (!this.currentCandles || this.currentCandles.length === 0) return;

    // 1. Remove previous primary series
    if (this.primarySeries) {
      try { this.chart.removeSeries(this.primarySeries); } catch (e) {}
      this.primarySeries = null;
      this.seriesMarkers = null;
    }

    // 2. Create new primary series according to chartType
    const upColor = '#089981';
    const downColor = '#f23645';

    if (this.chartType === 'candles') {
      this.primarySeries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: upColor,
        downColor: downColor,
        borderVisible: false,
        wickUpColor: upColor,
        wickDownColor: downColor
      });
      this.primarySeries.setData(this.currentCandles);
    } else if (this.chartType === 'heikin-ashi') {
      const haCandles = Indicators.calculateHeikinAshi(this.currentCandles);
      this.primarySeries = this.chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: upColor,
        downColor: downColor,
        borderVisible: false,
        wickUpColor: upColor,
        wickDownColor: downColor
      });
      this.primarySeries.setData(haCandles);
    } else if (this.chartType === 'area') {
      this.primarySeries = this.chart.addSeries(LightweightCharts.AreaSeries, {
        topColor: 'rgba(41, 98, 255, 0.45)',
        bottomColor: 'rgba(41, 98, 255, 0.02)',
        lineColor: '#2962ff',
        lineWidth: 2
      });
      const areaData = this.currentCandles.map(c => ({ time: c.time, value: c.close }));
      this.primarySeries.setData(areaData);
    } else if (this.chartType === 'line') {
      this.primarySeries = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#2962ff',
        lineWidth: 2
      });
      const lineData = this.currentCandles.map(c => ({ time: c.time, value: c.close }));
      this.primarySeries.setData(lineData);
    } else if (this.chartType === 'bars') {
      this.primarySeries = this.chart.addSeries(LightweightCharts.BarSeries, {
        upColor: upColor,
        downColor: downColor
      });
      this.primarySeries.setData(this.currentCandles);
    }

    // 3. Render Volume series
    this.renderVolume();

    // 4. Render Active Technical Indicators
    this.renderIndicators();

    // 5. Render Comparison if active
    if (this.isComparing && this.compareData) {
      this.renderCompareSeries();
    }

    // 6. Render Price Spike / News Event Markers
    this.renderEventMarkers();

    // 7. Update HUD with latest candle
    const last = this.currentCandles[this.currentCandles.length - 1];
    const prev = this.currentCandles.length > 1 ? this.currentCandles[this.currentCandles.length - 2] : last;
    this.updateLegend(last, prev);
  }

  renderEventMarkers() {
    if (!this.primarySeries || !this.showEventMarkers || !this.events || this.events.length === 0) return;
    
    // Convert events into TradingView series markers
    const markers = this.events.slice(-40).map(e => {
      const isUp = e.direction === 'up';
      const hasNews = e.newsArticles && e.newsArticles.length > 0;
      return {
        time: e.time,
        position: isUp ? 'aboveBar' : 'belowBar',
        color: isUp ? '#ff9800' : '#00e5ff',
        shape: isUp ? 'arrowUp' : 'arrowDown',
        text: `${isUp ? '▲' : '▼'}${Math.abs(e.changePct)}%${hasNews ? ' 📰' : ''}`,
        size: hasNews ? 2 : 1
      };
    });

    // Markers must be sorted strictly by time
    markers.sort((a, b) => a.time.localeCompare(b.time));

    try {
      if (this.seriesMarkers && typeof this.seriesMarkers.setMarkers === 'function') {
        this.seriesMarkers.setMarkers(markers);
      } else if (typeof LightweightCharts.createSeriesMarkers === 'function') {
        this.seriesMarkers = LightweightCharts.createSeriesMarkers(this.primarySeries, markers);
      } else if (typeof this.primarySeries.setMarkers === 'function') {
        this.primarySeries.setMarkers(markers);
      }
    } catch (err) {
      console.warn('Could not set series markers:', err.message);
    }
  }

  zoomToDate(targetDate) {
    if (!this.chart || !targetDate) return;
    const d = new Date(targetDate);
    const fromDate = new Date(d.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = new Date(d.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    this.chart.timeScale().setVisibleRange({ from: fromDate, to: toDate });
  }

  renderVolume() {
    if (this.volumeSeries) {
      try { this.chart.removeSeries(this.volumeSeries); } catch (e) {}
      this.volumeSeries = null;
    }

    if (!this.activeIndicators.has('vol')) return;

    this.volumeSeries = this.chart.addSeries(LightweightCharts.HistogramSeries, {
      color: '#26a69a',
      title: 'Activity Index',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
      scaleMargins: {
        top: 0.82,
        bottom: 0
      }
    });

    const volData = this.currentCandles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)'
    }));
    this.volumeSeries.setData(volData);
  }

  renderIndicators() {
    // Clear previous indicators on main chart
    for (const key of Object.keys(this.indicatorSeries)) {
      try { this.chart.removeSeries(this.indicatorSeries[key]); } catch (e) {}
    }
    this.indicatorSeries = {};

    // Clear sub chart
    for (const key of Object.keys(this.subSeries)) {
      try { this.subChart.removeSeries(this.subSeries[key]); } catch (e) {}
    }
    this.subSeries = {};

    if (!this.currentCandles || this.currentCandles.length === 0) return;

    // SMA 20
    if (this.activeIndicators.has('sma20')) {
      const sma = Indicators.calculateSMA(this.currentCandles, 20);
      const s = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#ff9800',
        lineWidth: 1.5,
        title: 'SMA 20'
      });
      s.setData(sma);
      this.indicatorSeries['sma20'] = s;
    }

    // SMA 50
    if (this.activeIndicators.has('sma50')) {
      const sma = Indicators.calculateSMA(this.currentCandles, 50);
      const s = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#2196f3',
        lineWidth: 1.5,
        title: 'SMA 50'
      });
      s.setData(sma);
      this.indicatorSeries['sma50'] = s;
    }

    // EMA 9
    if (this.activeIndicators.has('ema9')) {
      const ema = Indicators.calculateEMA(this.currentCandles, 9);
      const s = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#e040fb',
        lineWidth: 1.5,
        title: 'EMA 9'
      });
      s.setData(ema);
      this.indicatorSeries['ema9'] = s;
    }

    // EMA 21
    if (this.activeIndicators.has('ema21')) {
      const ema = Indicators.calculateEMA(this.currentCandles, 21);
      const s = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: '#00e5ff',
        lineWidth: 1.5,
        title: 'EMA 21'
      });
      s.setData(ema);
      this.indicatorSeries['ema21'] = s;
    }

    // Bollinger Bands
    if (this.activeIndicators.has('bb')) {
      const bb = Indicators.calculateBollingerBands(this.currentCandles, 20, 2);
      const upper = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(33, 150, 243, 0.7)',
        lineWidth: 1,
        title: 'BB Upper'
      });
      const middle = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(255, 152, 0, 0.7)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'BB Mid'
      });
      const lower = this.chart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(33, 150, 243, 0.7)',
        lineWidth: 1,
        title: 'BB Lower'
      });
      upper.setData(bb.upper);
      middle.setData(bb.middle);
      lower.setData(bb.lower);
      this.indicatorSeries['bb_upper'] = upper;
      this.indicatorSeries['bb_mid'] = middle;
      this.indicatorSeries['bb_lower'] = lower;
    }

    // Oscillators on Sub Chart
    if (this.activeOscillator === 'rsi') {
      const rsi = Indicators.calculateRSI(this.currentCandles, 14);
      const rsiSeries = this.subChart.addSeries(LightweightCharts.LineSeries, {
        color: '#9c27b0',
        lineWidth: 2,
        title: 'RSI 14'
      });
      rsiSeries.setData(rsi);

      // 70 and 30 Overbought/Oversold Baseline
      const obLine = this.subChart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(242, 54, 69, 0.5)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed
      });
      const osLine = this.subChart.addSeries(LightweightCharts.LineSeries, {
        color: 'rgba(8, 153, 129, 0.5)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed
      });
      if (rsi.length > 0) {
        obLine.setData(rsi.map(r => ({ time: r.time, value: 70 })));
        osLine.setData(rsi.map(r => ({ time: r.time, value: 30 })));
      }

      this.subSeries['rsi'] = rsiSeries;
      this.subSeries['rsi_ob'] = obLine;
      this.subSeries['rsi_os'] = osLine;
    } else if (this.activeOscillator === 'macd') {
      const macdData = Indicators.calculateMACD(this.currentCandles, 12, 26, 9);
      const macdSeries = this.subChart.addSeries(LightweightCharts.LineSeries, {
        color: '#2962ff',
        lineWidth: 1.5,
        title: 'MACD'
      });
      const signalSeries = this.subChart.addSeries(LightweightCharts.LineSeries, {
        color: '#ff9800',
        lineWidth: 1.5,
        title: 'Signal'
      });
      const histSeries = this.subChart.addSeries(LightweightCharts.HistogramSeries, {
        title: 'Histogram'
      });

      macdSeries.setData(macdData.macd);
      signalSeries.setData(macdData.signal);
      histSeries.setData(macdData.hist);

      this.subSeries['macd'] = macdSeries;
      this.subSeries['macd_signal'] = signalSeries;
      this.subSeries['macd_hist'] = histSeries;
    }
  }

  renderCompareSeries() {
    if (this.compareSeries) {
      try { this.chart.removeSeries(this.compareSeries); } catch (e) {}
      this.compareSeries = null;
    }

    if (!this.compareData || !this.compareData.candles) return;

    this.compareSeries = this.chart.addSeries(LightweightCharts.LineSeries, {
      color: '#ff9800',
      lineWidth: 2,
      title: `${this.compareData.commodity.english} (NPR)`
    });

    const compareLine = this.compareData.candles.map(c => ({
      time: c.time,
      value: c.close
    }));
    this.compareSeries.setData(compareLine);
  }

  onCrosshairMove(param) {
    if (!param.time || !param.seriesData || !this.primarySeries) {
      // Revert to latest candle
      if (this.currentCandles.length > 0) {
        const last = this.currentCandles[this.currentCandles.length - 1];
        const prev = this.currentCandles.length > 1 ? this.currentCandles[this.currentCandles.length - 2] : last;
        this.updateLegend(last, prev);
      }
      return;
    }

    const data = param.seriesData.get(this.primarySeries);
    if (!data) return;

    // Look up previous candle for change calc
    const idx = this.currentCandles.findIndex(c => c.time === param.time);
    const prev = idx > 0 ? this.currentCandles[idx - 1] : data;

    let ohlc = data;
    if (this.chartType === 'line' || this.chartType === 'area') {
      ohlc = {
        time: param.time,
        open: data.value,
        high: data.value,
        low: data.value,
        close: data.value,
        volume: this.currentCandles[idx]?.volume || 0
      };
    }

    this.updateLegend(ohlc, prev);
  }

  updateLegend(candle, prevCandle) {
    const oEl = document.getElementById('hud-open');
    const hEl = document.getElementById('hud-high');
    const lEl = document.getElementById('hud-low');
    const cEl = document.getElementById('hud-close');
    const chEl = document.getElementById('hud-change');
    const volEl = document.getElementById('hud-vol');
    const dateEl = document.getElementById('hud-date');

    if (!candle || !oEl) return;

    const open = candle.open !== undefined ? candle.open : candle.value;
    const high = candle.high !== undefined ? candle.high : candle.value;
    const low = candle.low !== undefined ? candle.low : candle.value;
    const close = candle.close !== undefined ? candle.close : candle.value;

    const prevClose = prevCandle && prevCandle.close !== undefined ? prevCandle.close : open;
    const change = +(close - prevClose).toFixed(2);
    const changePct = prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
    const isUp = change >= 0;

    oEl.textContent = open.toFixed(2);
    hEl.textContent = high.toFixed(2);
    lEl.textContent = low.toFixed(2);
    cEl.textContent = close.toFixed(2);
    cEl.className = isUp ? 'val-up' : 'val-down';

    const sign = change >= 0 ? '+' : '';
    chEl.textContent = `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
    chEl.className = isUp ? 'hud-change val-up' : 'hud-change val-down';

    if (volEl && candle.volume) {
      volEl.textContent = candle.volume.toLocaleString();
    }
    if (dateEl && candle.time) {
      dateEl.textContent = candle.time;
    }
  }

  exportScreenshot() {
    const canvas = this.mainContainer.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Kalimati_${this.rawCommodity ? this.rawCommodity.english.replace(/[^a-zA-Z0-9]/g, '_') : 'Chart'}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  toggleFullscreen() {
    const appEl = document.getElementById('trading-workstation');
    if (!document.fullscreenElement) {
      appEl.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }
}

window.KalimatiChart = KalimatiChart;
