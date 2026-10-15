/**
 * Technical Indicators for Kalimati TradingView Chart
 */

const Indicators = {
  // Simple Moving Average
  calculateSMA(data, period = 20) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      result.push({
        time: data[i].time,
        value: +(sum / period).toFixed(2)
      });
    }
    return result;
  },

  // Exponential Moving Average
  calculateEMA(data, period = 9) {
    const result = [];
    if (data.length < period) return result;

    const k = 2 / (period + 1);
    // Initial SMA for the first EMA seed
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i].close;
    }
    let prevEma = sum / period;
    result.push({
      time: data[period - 1].time,
      value: +prevEma.toFixed(2)
    });

    for (let i = period; i < data.length; i++) {
      const currentEma = (data[i].close * k) + (prevEma * (1 - k));
      result.push({
        time: data[i].time,
        value: +currentEma.toFixed(2)
      });
      prevEma = currentEma;
    }
    return result;
  },

  // Bollinger Bands (20, 2)
  calculateBollingerBands(data, period = 20, multiplier = 2) {
    const upper = [];
    const middle = [];
    const lower = [];

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      const mean = sum / period;

      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        varianceSum += Math.pow(data[i - j].close - mean, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);

      const time = data[i].time;
      middle.push({ time, value: +mean.toFixed(2) });
      upper.push({ time, value: +(mean + multiplier * stdDev).toFixed(2) });
      lower.push({ time, value: +(mean - multiplier * stdDev).toFixed(2) });
    }
    return { upper, middle, lower };
  },

  // Relative Strength Index (RSI 14)
  calculateRSI(data, period = 14) {
    const result = [];
    if (data.length <= period) return result;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = data[i].close - data[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));

    result.push({
      time: data[period].time,
      value: +rsi.toFixed(2)
    });

    for (let i = period + 1; i < data.length; i++) {
      const diff = data[i].close - data[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));

      result.push({
        time: data[i].time,
        value: +rsi.toFixed(2)
      });
    }
    return result;
  },

  // Moving Average Convergence Divergence (MACD 12, 26, 9)
  calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (data.length < slowPeriod + signalPeriod) {
      return { macd: [], signal: [], hist: [] };
    }

    const fastEma = Indicators.calculateEMA(data, fastPeriod);
    const slowEma = Indicators.calculateEMA(data, slowPeriod);

    // Map fast by time
    const fastMap = new Map(fastEma.map(item => [item.time, item.value]));

    // MACD line = Fast - Slow
    const macdLine = [];
    for (const slow of slowEma) {
      if (fastMap.has(slow.time)) {
        macdLine.push({
          time: slow.time,
          close: +(fastMap.get(slow.time) - slow.value).toFixed(2),
          value: +(fastMap.get(slow.time) - slow.value).toFixed(2)
        });
      }
    }

    // Signal line = EMA of MACD line
    const signalLine = Indicators.calculateEMA(macdLine, signalPeriod);
    const signalMap = new Map(signalLine.map(item => [item.time, item.value]));

    // Histogram
    const hist = [];
    for (const m of macdLine) {
      if (signalMap.has(m.time)) {
        const sig = signalMap.get(m.time);
        const diff = +(m.value - sig).toFixed(2);
        hist.push({
          time: m.time,
          value: diff,
          color: diff >= 0 ? '#089981' : '#f23645'
        });
      }
    }

    return {
      macd: macdLine.map(item => ({ time: item.time, value: item.value })),
      signal: signalLine,
      hist
    };
  },

  // Heikin-Ashi Candles
  calculateHeikinAshi(candles) {
    if (!candles || candles.length === 0) return [];
    const ha = [];
    let prevHaOpen = candles[0].open;
    let prevHaClose = candles[0].close;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const haClose = +((c.open + c.high + c.low + c.close) / 4).toFixed(2);
      const haOpen = i === 0 ? c.open : +((prevHaOpen + prevHaClose) / 2).toFixed(2);
      const haHigh = +Math.max(c.high, haOpen, haClose).toFixed(2);
      const haLow = +Math.min(c.low, haOpen, haClose).toFixed(2);

      ha.push({
        time: c.time,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        volume: c.volume
      });

      prevHaOpen = haOpen;
      prevHaClose = haClose;
    }
    return ha;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Indicators;
}
