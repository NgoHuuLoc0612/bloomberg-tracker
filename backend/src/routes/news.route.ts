import type { FastifyPluginAsync } from 'fastify';
import { finnhubService } from '../services/finnhub.service.js';
import { prisma }         from '../db/prisma.client.js';

export const newsRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /market?category=general|forex|crypto|merger ─────────────────────
  fastify.get<{ Querystring: { category?: string; page?: string } }>(
    '/market', async (req) => {
      const category = req.query.category || 'general';
      const news     = await finnhubService.getMarketNews(category);
      const page     = parseInt(req.query.page || '1');
      const limit    = 30;
      return {
        success: true,
        data: news.slice((page-1)*limit, page*limit),
        meta: { page, limit, total: news.length },
      };
    }
  );

  // ── GET /company/:symbol ──────────────────────────────────────────────────
  fastify.get<{
    Params: { symbol: string };
    Querystring: { from?: string; to?: string };
  }>('/company/:symbol', async (req) => {
    const symbol = req.params.symbol.toUpperCase();
    const to   = req.query.to   || new Date().toISOString().split('T')[0];
    const from = req.query.from || new Date(Date.now() - 30*24*3600*1000).toISOString().split('T')[0];
    const news = await finnhubService.getCompanyNews(symbol, from, to);
    return { success: true, data: news.slice(0, 50) };
  });

  // ── GET /saved ────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { symbol?: string; page?: string } }>(
    '/saved', async (req) => {
      const page  = parseInt(req.query.page || '1');
      const limit = 30;
      const where: any = {};
      if (req.query.symbol) where.relatedSymbols = { has: req.query.symbol.toUpperCase() };

      const [articles, total] = await Promise.all([
        prisma.newsArticle.findMany({
          where, orderBy: { publishedAt: 'desc' },
          skip: (page-1)*limit, take: limit,
        }),
        prisma.newsArticle.count({ where }),
      ]);
      return { success: true, data: articles, meta: { page, limit, total } };
    }
  );
};

export default newsRoute;

// ─── Screener ──────────────────────────────────────────────────────────────────
export const screenerRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET / (Stock Screener) ────────────────────────────────────────────────
  fastify.get<{ Querystring: Record<string, string> }>('/', async (req) => {
    const {
      exchange, sector, minMarketCap, maxMarketCap, minPrice, maxPrice,
      minPE, maxPE, minChangePct, maxChangePct, minVolume,
      sortBy = 'marketCap', sortDir = 'desc',
      page = '1', limit: limitStr = '50',
    } = req.query;

    const limit  = Math.min(parseInt(limitStr), 200);
    const offset = (parseInt(page) - 1) * limit;

    const where: any = {};
    if (exchange)    where.exchange = exchange;
    if (sector)      where.sector   = { contains: sector, mode: 'insensitive' };
    if (minPrice)    where.price    = { ...where.price,     gte: parseFloat(minPrice)    };
    if (maxPrice)    where.price    = { ...where.price,     lte: parseFloat(maxPrice)    };
    if (minChangePct)where.changePercent = { ...where.changePercent, gte: parseFloat(minChangePct) };
    if (maxChangePct)where.changePercent = { ...where.changePercent, lte: parseFloat(maxChangePct) };
    if (minVolume)   where.volume   = { gte: parseInt(minVolume) };
    if (minMarketCap)where.marketCap= { ...where.marketCap, gte: parseFloat(minMarketCap)};
    if (maxMarketCap)where.marketCap= { ...where.marketCap, lte: parseFloat(maxMarketCap)};
    if (minPE)       where.peRatio  = { ...where.peRatio,   gte: parseFloat(minPE)       };
    if (maxPE)       where.peRatio  = { ...where.peRatio,   lte: parseFloat(maxPE)       };

    const orderBy: any = {};
    const validSorts: Record<string, string> = {
      price: 'price', change: 'change', changePct: 'changePercent',
      volume: 'volume', marketCap: 'marketCap', pe: 'peRatio',
    };
    const dbSort = validSorts[sortBy] || 'marketCap';
    orderBy[dbSort] = sortDir === 'asc' ? 'asc' : 'desc';

    const [stocks, total] = await Promise.all([
      prisma.stockQuote.findMany({ where, orderBy, skip: offset, take: limit }),
      prisma.stockQuote.count({ where }),
    ]);

    return { success: true, data: stocks, meta: { page: parseInt(page), limit, total, pages: Math.ceil(total/limit) } };
  });

  // ── GET /sectors ──────────────────────────────────────────────────────────
  fastify.get('/sectors', async () => {
    const result = await prisma.stockQuote.groupBy({
      by: ['sector'],
      _count: { symbol: true },
      _avg: { changePercent: true, peRatio: true },
      _sum: { marketCap: true },
      where: { sector: { not: null } },
      orderBy: { _sum: { marketCap: 'desc' } },
    });
    return {
      success: true,
      data: result.map((r: any) => ({
        sector:      r.sector,
        stockCount:  r._count.symbol,
        avgChange:   r._avg.changePercent,
        avgPE:       r._avg.peRatio,
        totalMarketCap: r._sum.marketCap,
      })),
    };
  });

  // ── GET /heatmap ──────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { sector?: string } }>('/heatmap', async (req) => {
    const where: any = { marketCap: { gt: 1_000_000_000 } };  // > $1B market cap
    if (req.query.sector) where.sector = req.query.sector;

    const stocks = await prisma.stockQuote.findMany({
      where, select: {
        symbol: true, companyName: true, sector: true,
        changePercent: true, marketCap: true, volume: true,
      },
      orderBy: { marketCap: 'desc' },
      take: 500,
    });

    return { success: true, data: stocks };
  });

  // ── GET /top-movers ───────────────────────────────────────────────────────
  fastify.get('/top-movers', async () => {
    const [gainers, losers, mostActive] = await Promise.all([
      prisma.stockQuote.findMany({
        where: { volume: { gt: 500_000 } },
        orderBy: { changePercent: 'desc' },
        take: 10,
      }),
      prisma.stockQuote.findMany({
        where: { volume: { gt: 500_000 } },
        orderBy: { changePercent: 'asc' },
        take: 10,
      }),
      prisma.stockQuote.findMany({
        orderBy: { volume: 'desc' },
        take: 10,
      }),
    ]);
    return { success: true, data: { gainers, losers, mostActive } };
  });

  // ── GET /presets/:preset ──────────────────────────────────────────────────
  fastify.get<{ Params: { preset: string } }>('/presets/:preset', async (req, reply) => {
    const presets: Record<string, any> = {
      'large-cap':   { marketCap: { gt: 10_000_000_000 }, orderBy: { marketCap: 'desc' } },
      'high-growth': { changePercent: { gt: 5 }, volume: { gt: 1_000_000 }, orderBy: { changePercent: 'desc' } },
      'dividend':    { peRatio: { gt: 0, lt: 20 }, marketCap: { gt: 1_000_000_000 }, orderBy: { peRatio: 'asc' } },
      'value':       { peRatio: { gt: 0, lt: 15 }, marketCap: { gt: 5_000_000_000 }, orderBy: { marketCap: 'desc' } },
      'momentum':    { changePercent: { gt: 2 }, volume: { gt: 2_000_000 }, orderBy: { changePercent: 'desc' } },
    };

    const config = presets[req.params.preset];
    if (!config) return reply.status(404).send({ success: false, error: 'Preset not found' });

    const { orderBy, ...where } = config;
    const stocks = await prisma.stockQuote.findMany({ where, orderBy, take: 50 });
    return { success: true, data: stocks };
  });
};
