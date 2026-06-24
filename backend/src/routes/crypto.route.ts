import type { FastifyPluginAsync } from 'fastify';
import { coinGeckoService } from '../services/coingecko.service.js';

const cryptoRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /markets ─────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { vs_currency?: string; ids?: string; page?: string; per_page?: string } }>(
    '/markets', async (req) => {
      const { vs_currency = 'usd', ids, page = '1', per_page = '100' } = req.query;
      const idList = ids?.split(',').map(s => s.trim());
      const data = await coinGeckoService.getMarkets(
        vs_currency, idList, parseInt(per_page), parseInt(page)
      );
      return { success: true, data, count: data.length };
    }
  );

  // ── GET /coin/:id ─────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/coin/:id', async (req, reply) => {
    const data = await coinGeckoService.getCoinDetails(req.params.id);
    if (!data) return reply.status(404).send({ success: false, error: 'Coin not found' });
    return { success: true, data };
  });

  // ── GET /coin/:id/ohlcv ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { days?: string; vs_currency?: string } }>(
    '/coin/:id/ohlcv', async (req) => {
      const days = req.query.days === 'max' ? 'max' : parseInt(req.query.days || '30');
      const data = await coinGeckoService.getOHLCV(req.params.id, req.query.vs_currency || 'usd', days);
      return { success: true, data };
    }
  );

  // ── GET /coin/:id/chart ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { days?: string; vs_currency?: string } }>(
    '/coin/:id/chart', async (req) => {
      const days = req.query.days === 'max' ? 'max' : parseInt(req.query.days || '30');
      const data = await coinGeckoService.getMarketChart(req.params.id, req.query.vs_currency || 'usd', days);
      return { success: true, data };
    }
  );

  // ── GET /global ──────────────────────────────────────────────────────────
  fastify.get('/global', async () => {
    const data = await coinGeckoService.getGlobalStats();
    return { success: true, data };
  });

  // ── GET /trending ────────────────────────────────────────────────────────
  fastify.get('/trending', async () => {
    const data = await coinGeckoService.getTrending();
    return { success: true, data };
  });

  // ── GET /orderbook/:symbol (Binance) ─────────────────────────────────────
  fastify.get<{ Params: { symbol: string }; Querystring: { limit?: string } }>(
    '/orderbook/:symbol', async (req, reply) => {
      try {
        const symbol = req.params.symbol.toUpperCase();
        const limit  = Math.min(parseInt(req.query.limit || '20'), 100);
        const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}USDT&limit=${limit}`);
        const raw = await res.json() as any;
        if (raw.code) return reply.status(400).send({ success: false, error: raw.msg });

        const bids = (raw.bids as string[][]).map(([p, q]) => ({
          price: parseFloat(p), quantity: parseFloat(q),
          total: parseFloat(p) * parseFloat(q),
        }));
        const asks = (raw.asks as string[][]).map(([p, q]) => ({
          price: parseFloat(p), quantity: parseFloat(q),
          total: parseFloat(p) * parseFloat(q),
        }));

        const bestBid = bids[0]?.price  || 0;
        const bestAsk = asks[0]?.price  || 0;
        const spread  = bestAsk - bestBid;
        const midPrice= (bestBid + bestAsk) / 2;

        return {
          success: true,
          data: {
            symbol, bids, asks,
            spread,
            spreadPct: midPrice > 0 ? (spread / midPrice) * 100 : 0,
            bestBid, bestAsk,
            timestamp: Date.now(),
            lastUpdateId: raw.lastUpdateId,
          },
        };
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    }
  );

  // ── GET /binance/ticker/:symbol ───────────────────────────────────────────
  fastify.get<{ Params: { symbol: string } }>('/binance/ticker/:symbol', async (req, reply) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const [t24Raw, btRaw] = await Promise.all([
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`),
        fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${symbol}USDT`),
      ]);
      const ticker24h: any  = await t24Raw.json();
      const bookTicker: any = await btRaw.json();
      if (ticker24h.code) return reply.status(400).send({ success: false, error: ticker24h.msg });

      return {
        success: true,
        data: {
          symbol,
          price:         parseFloat(ticker24h.lastPrice),
          priceChange:   parseFloat(ticker24h.priceChange),
          priceChangePct:parseFloat(ticker24h.priceChangePercent),
          open:          parseFloat(ticker24h.openPrice),
          high:          parseFloat(ticker24h.highPrice),
          low:           parseFloat(ticker24h.lowPrice),
          volume:        parseFloat(ticker24h.volume),
          quoteVolume:   parseFloat(ticker24h.quoteVolume),
          count:         ticker24h.count,
          bestBid:       parseFloat(bookTicker.bidPrice),
          bestAsk:       parseFloat(bookTicker.askPrice),
          bidQty:        parseFloat(bookTicker.bidQty),
          askQty:        parseFloat(bookTicker.askQty),
          timestamp:     ticker24h.closeTime,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── GET /binance/klines/:symbol ───────────────────────────────────────────
  fastify.get<{
    Params: { symbol: string };
    Querystring: { interval?: string; limit?: string };
  }>('/binance/klines/:symbol', async (req, reply) => {
    try {
      const symbol   = req.params.symbol.toUpperCase();
      const interval = req.query.interval || '1d';
      const limit    = Math.min(parseInt(req.query.limit || '500'), 1000);
      const res  = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
      );
      const raw  = await res.json();
      if (!Array.isArray(raw)) return reply.status(400).send({ success: false, error: 'Invalid symbol' });

      const candles = raw.map((k: any[]) => ({
        time:   Math.floor(k[0] / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      return { success: true, data: candles };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── GET /defi ─────────────────────────────────────────────────────────────
  fastify.get('/defi', async () => {
    const data = await coinGeckoService.getMarkets('usd', [
      'uniswap','aave','compound-governance-token','maker',
      'curve-dao-token','synthetix-network-token','yearn-finance',
      'sushi','balancer','bancor',
    ], 10);
    return { success: true, data };
  });

  // ── GET /dominance ────────────────────────────────────────────────────────
  fastify.get('/dominance', async () => {
    const [global, top] = await Promise.all([
      coinGeckoService.getGlobalStats(),
      coinGeckoService.getMarkets('usd', undefined, 10, 1),
    ]);
    const totalMcap = global.totalMarketCap;
    const dominance = top.map(c => ({
      symbol:    c.symbol,
      name:      c.name,
      marketCap: c.marketCap,
      dominance: totalMcap > 0 ? (c.marketCap / totalMcap) * 100 : 0,
    }));
    return { success: true, data: { global, dominance } };
  });
};

export default cryptoRoute;
