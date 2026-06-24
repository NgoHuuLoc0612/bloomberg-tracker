import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { finnhubService }      from '../services/finnhub.service.js';
import { alphaVantageService } from '../services/alpha-vantage.service.js';
import { twelveDataService }   from '../services/twelve-data.service.js';
import { prisma }              from '../db/prisma.client.js';
import {
  SymbolSchema, IntervalSchema,
  StockScreenerSchema,
} from '../schemas/zod.schemas.js';

const stocksRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /quote/:symbol ──────────────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/quote/:symbol', {
    schema: { params: { type: 'object', properties: { symbol: { type: 'string' } } } },
  }, async (req, reply) => {
    const symbol = req.params.symbol.toUpperCase();
    const [finnhubQ, metrics, peers] = await Promise.allSettled([
      finnhubService.getQuote(symbol),
      finnhubService.getBasicFinancials(symbol),
      finnhubService.getPeers(symbol),
    ]);

    const quote   = finnhubQ.status   === 'fulfilled' ? finnhubQ.value   : null;
    const fins    = metrics.status    === 'fulfilled' ? metrics.value    : null;
    const peerList= peers.status      === 'fulfilled' ? peers.value      : [];

    if (!quote) return reply.status(404).send({ success: false, error: `Symbol ${symbol} not found` });

    const m = fins?.metric || {};
    return {
      success: true,
      data: {
        ...quote,
        weekHigh52:  m['52WeekHigh'],
        weekLow52:   m['52WeekLow'],
        peRatio:     m['peNormalizedAnnual'],
        eps:         m['epsNormalizedAnnual'],
        beta:        m['beta'],
        avgVolume10d:m['10DayAverageTradingVolume'],
        netMargin:   m['netMarginAnnual'],
        revenueGrowth3Y: m['revenueGrowth3Y'],
        roe:         m['roeRfy'],
        roa:         m['roaRfy'],
        grossMargin: m['grossMarginAnnual'],
        debtToEquity:m['debtToEquityAnnual'],
        dividendYield:m['dividendYieldIndicatedAnnual'],
        peers: peerList.slice(0, 8),
      },
    };
  });

  // ── GET /quotes/batch?symbols=AAPL,MSFT,GOOGL ──────────────────────────
  fastify.get<{ Querystring: { symbols: string } }>('/quotes/batch', async (req, reply) => {
    const symbolsStr = req.query.symbols;
    if (!symbolsStr) return reply.status(400).send({ success: false, error: 'symbols param required' });

    const symbols = symbolsStr.split(',').map(s => s.trim().toUpperCase()).slice(0, 50);
    const quotes  = await finnhubService.getBatchQuotes(symbols);

    return { success: true, data: Object.fromEntries(quotes) };
  });

  // ── GET /candles/:symbol ─────────────────────────────────────────────────
  fastify.get<{
    Params: { symbol: string };
    Querystring: { interval?: string; from?: string; to?: string; outputSize?: string; source?: string };
  }>('/candles/:symbol', async (req, reply) => {
    const symbol   = req.params.symbol.toUpperCase();
    const interval = req.query.interval || 'D';
    const source   = req.query.source || 'finnhub';
    const to       = req.query.to   ? parseInt(req.query.to)   : Math.floor(Date.now() / 1000);
    const from     = req.query.from ? parseInt(req.query.from) : to - 365 * 24 * 3600;

    let candles;
    if (source === 'twelvedata') {
      const tdInterval = interval === 'D' ? '1day' : interval === 'W' ? '1week' : interval;
      candles = await twelveDataService.getTimeSeries(symbol, tdInterval, parseInt(req.query.outputSize || '500'));
    } else if (source === 'alphavantage') {
      candles = await alphaVantageService.getDailyCandles(symbol, req.query.outputSize === 'full' ? 'full' : 'compact');
    } else {
      candles = await finnhubService.getCandles(symbol, interval, from, to);
    }

    if (!candles?.length) return reply.status(404).send({ success: false, error: 'No candle data available' });

    return { success: true, data: candles, count: candles.length };
  });

  // ── GET /indicators/:symbol ──────────────────────────────────────────────
  fastify.get<{
    Params: { symbol: string };
    Querystring: { interval?: string; indicators?: string };
  }>('/indicators/:symbol', async (req, reply) => {
    const symbol    = req.params.symbol.toUpperCase();
    const interval  = req.query.interval || 'daily';
    const requested = (req.query.indicators || 'rsi,macd,bb,ema20,ema50,ema200,sma50,sma200').split(',');

    const results: Record<string, any> = {};

    await Promise.allSettled(
      requested.map(async (ind) => {
        switch (ind.trim().toLowerCase()) {
          case 'rsi':
            results.rsi   = await alphaVantageService.getRSI(symbol, interval);
            break;
          case 'macd':
            results.macd  = await alphaVantageService.getMACD(symbol, interval);
            break;
          case 'bb':
            results.bb    = await alphaVantageService.getBollingerBands(symbol, interval);
            break;
          case 'ema20':
            results.ema20  = await alphaVantageService.getEMA(symbol, interval, 20);
            break;
          case 'ema50':
            results.ema50  = await alphaVantageService.getEMA(symbol, interval, 50);
            break;
          case 'ema200':
            results.ema200 = await alphaVantageService.getEMA(symbol, interval, 200);
            break;
          case 'sma50':
            results.sma50  = await alphaVantageService.getSMA(symbol, interval, 50);
            break;
          case 'sma200':
            results.sma200 = await alphaVantageService.getSMA(symbol, interval, 200);
            break;
          case 'atr':
            results.atr   = await alphaVantageService.getATR(symbol, interval);
            break;
          case 'obv':
            results.obv   = await alphaVantageService.getOBV(symbol, interval);
            break;
          case 'stoch':
            results.stoch = await twelveDataService.getStochasticOscillator(symbol, interval === 'daily' ? '1day' : interval);
            break;
          case 'adx':
            results.adx   = await twelveDataService.getADX(symbol, interval === 'daily' ? '1day' : interval);
            break;
        }
      })
    );

    return { success: true, symbol, interval, data: results };
  });

  // ── GET /profile/:symbol ─────────────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/profile/:symbol', async (req, reply) => {
    const symbol  = req.params.symbol.toUpperCase();
    const profile = await finnhubService.getCompanyProfile(symbol);
    if (!profile) return reply.status(404).send({ success: false, error: 'Profile not found' });
    return { success: true, data: profile };
  });

  // ── GET /earnings/:symbol ────────────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/earnings/:symbol', async (req, reply) => {
    const symbol   = req.params.symbol.toUpperCase();
    const earnings = await finnhubService.getEarnings(symbol);
    return { success: true, data: earnings };
  });

  // ── GET /recommendations/:symbol ─────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/recommendations/:symbol', async (req, reply) => {
    const symbol = req.params.symbol.toUpperCase();
    const recs   = await finnhubService.getRecommendationTrend(symbol);
    return { success: true, data: recs };
  });

  // ── GET /insider/:symbol ─────────────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/insider/:symbol', async (req, reply) => {
    const symbol  = req.params.symbol.toUpperCase();
    const insider = await finnhubService.getInsiderTransactions(symbol);
    return { success: true, data: insider };
  });

  // ── GET /search?q=apple ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { q: string } }>('/search', async (req, reply) => {
    const q = req.query.q?.trim();
    if (!q || q.length < 1) return reply.status(400).send({ success: false, error: 'Query required' });
    const results = await finnhubService.getSymbolSearch(q);
    return { success: true, data: results };
  });

  // ── GET /market-status ───────────────────────────────────────────────────
  fastify.get('/market-status', async () => {
    const status = await finnhubService.getMarketStatus();
    return { success: true, data: status };
  });

  // ── GET /indices ─────────────────────────────────────────────────────────
  fastify.get('/indices', async () => {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX', 'GLD', 'TLT', 'HYG'];
    const quotes  = await finnhubService.getBatchQuotes(indices);
    return { success: true, data: Object.fromEntries(quotes) };
  });

  // ── GET /movers ──────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { type?: 'gainers' | 'losers' | 'active' } }>('/movers', async (req) => {
    // In production these come from a proper movers API; here we return cached DB records
    const movers = await prisma.stockQuote.findMany({
      orderBy: req.query.type === 'losers'
        ? { changePercent: 'asc' }
        : req.query.type === 'active'
          ? { volume: 'desc' }
          : { changePercent: 'desc' },
      take: 20,
      where: { volume: { gt: 1_000_000 } },
    });
    return { success: true, data: movers };
  });

  // ── POST /watchlist/quotes (get quotes for watchlist) ───────────────────
  fastify.post<{ Body: { symbols: string[] } }>('/watchlist/quotes', {
    schema: { body: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' } } } } },
  }, async (req) => {
    const symbols = (req.body.symbols || []).map(s => s.toUpperCase()).slice(0, 100);
    const quotes  = await finnhubService.getBatchQuotes(symbols);
    return { success: true, data: Object.fromEntries(quotes) };
  });
};

export default stocksRoute;
