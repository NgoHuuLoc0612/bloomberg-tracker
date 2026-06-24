import type { FastifyPluginAsync } from 'fastify';
import { prisma }             from '../db/prisma.client.js';
import { finnhubService }     from '../services/finnhub.service.js';
import { coinGeckoService }   from '../services/coingecko.service.js';
import { redisPublisher, REDIS_CHANNELS } from '../config/redis.js';
import {
  CreatePortfolioSchema, CreateTransactionSchema,
  CreateWatchlistSchema, AddWatchlistItemSchema,
  CreateAlertSchema,
} from '../schemas/zod.schemas.js';

const portfolioRoute: FastifyPluginAsync = async (fastify) => {

  // ─── Portfolios ────────────────────────────────────────────────────────────
  fastify.get('/portfolios', async () => {
    // Using a demo userId; in production this comes from JWT
    const userId = 'demo-user';
    const portfolios = await prisma.portfolio.findMany({
      where:   { userId },
      include: { positions: true, _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: portfolios };
  });

  fastify.post('/portfolios', async (req, reply) => {
    const body   = CreatePortfolioSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.flatten() });

    const userId   = 'demo-user';
    const existing = await prisma.portfolio.count({ where: { userId } });
    const portfolio= await prisma.portfolio.create({
      data: { ...body.data, userId, isDefault: existing === 0 },
    });
    return reply.status(201).send({ success: true, data: portfolio });
  });

  fastify.get<{ Params: { id: string } }>('/portfolios/:id', async (req, reply) => {
    const portfolio = await prisma.portfolio.findUnique({
      where:   { id: req.params.id },
      include: { positions: true, snapshots: { orderBy: { snapshotDate: 'desc' }, take: 90 } },
    });
    if (!portfolio) return reply.status(404).send({ success: false, error: 'Portfolio not found' });
    return { success: true, data: portfolio };
  });

  fastify.delete<{ Params: { id: string } }>('/portfolios/:id', async (req, reply) => {
    await prisma.portfolio.delete({ where: { id: req.params.id } });
    return { success: true, message: 'Portfolio deleted' };
  });

  // ─── Portfolio Value & P&L (with live prices) ─────────────────────────────
  fastify.get<{ Params: { id: string } }>('/portfolios/:id/value', async (req, reply) => {
    const portfolio = await prisma.portfolio.findUnique({
      where:   { id: req.params.id },
      include: { positions: true },
    });
    if (!portfolio) return reply.status(404).send({ success: false, error: 'Not found' });

    const stockSymbols = portfolio.positions.filter((p: any) => p.assetType === 'STOCK' || p.assetType === 'ETF').map((p: any) => p.symbol);
    const cryptoIds    = portfolio.positions.filter((p: any) => p.assetType === 'CRYPTO').map((p: any) => p.symbol.toLowerCase());

    const [stockQuotes, cryptoMarkets] = await Promise.allSettled([
      stockSymbols.length ? finnhubService.getBatchQuotes(stockSymbols) : Promise.resolve(new Map()),
      cryptoIds.length ? coinGeckoService.getMarkets('usd', cryptoIds) : Promise.resolve([]),
    ]);

    const sqMap = stockQuotes.status === 'fulfilled' ? stockQuotes.value : new Map();
    const cgMap = new Map((cryptoMarkets.status === 'fulfilled' ? cryptoMarkets.value : []).map(c => [c.symbol, c]));

    let totalValue  = 0;
    let totalCost   = 0;
    let totalPnL    = 0;
    let dayChange   = 0;

    const enriched = portfolio.positions.map((pos: any) => {
      const shares   = Number(pos.shares);
      const avgCost  = Number(pos.avgCostBasis);
      const costBasis= shares * avgCost;

      let currentPrice = 0, change = 0, changePct = 0;

      if (pos.assetType === 'STOCK' || pos.assetType === 'ETF') {
        const q = sqMap.get(pos.symbol);
        if (q) { currentPrice = q.price; change = q.change; changePct = q.changePercent; }
      } else if (pos.assetType === 'CRYPTO') {
        const c = cgMap.get(pos.symbol);
        if (c) { currentPrice = c.currentPrice; change = c.priceChange24h; changePct = c.priceChangePct24h; }
      }

      const posValue  = shares * currentPrice;
      const posGain   = posValue - costBasis;
      const posDayGain= shares * change;

      totalValue += posValue;
      totalCost  += costBasis;
      totalPnL   += posGain;
      dayChange  += posDayGain;

      return {
        ...pos,
        currentPrice,
        totalValue:    posValue,
        unrealizedPnL: posGain,
        unrealizedPct: costBasis > 0 ? (posGain / costBasis) * 100 : 0,
        dayGain:       posDayGain,
        dayGainPct:    changePct,
        weight:        0, // computed below
        change, changePct,
      };
    });

    // Compute weights
    enriched.forEach((p: any) => { p.weight = totalValue > 0 ? (p.totalValue / totalValue) * 100 : 0; });

    // Sector breakdown
    const sectorBreakdown: Record<string, number> = {};
    for (const p of enriched) {
      const sector = p.sector || 'Unknown';
      sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + p.totalValue;
    }

    return {
      success: true,
      data: {
        portfolioId:   portfolio.id,
        name:          portfolio.name,
        totalValue,
        totalCost,
        totalPnL,
        totalPnLPct:   totalCost > 0 ? (totalPnL / totalCost) * 100 : 0,
        dayChange,
        dayChangePct:  totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
        positions:     enriched,
        sectorBreakdown,
        currency:      portfolio.currency,
        timestamp:     Date.now(),
      },
    };
  });

  // ─── Transactions ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { symbol?: string; type?: string; page?: string } }>(
    '/portfolios/:id/transactions', async (req) => {
      const page  = parseInt(req.query.page || '1');
      const limit = 50;
      const where: any = { portfolioId: req.params.id };
      if (req.query.symbol) where.symbol = req.query.symbol.toUpperCase();
      if (req.query.type)   where.type   = req.query.type;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { executedAt: 'desc' }, skip: (page-1)*limit, take: limit }),
        prisma.transaction.count({ where }),
      ]);
      return { success: true, data: transactions, meta: { page, limit, total, pages: Math.ceil(total/limit) } };
    }
  );

  fastify.post('/transactions', async (req, reply) => {
    const body = CreateTransactionSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.flatten() });

    const tx = body.data;
    const totalAmount = tx.shares * tx.price + tx.fees;

    // Upsert position
    const existingPos = await prisma.portfolioPosition.findUnique({
      where: { portfolioId_symbol: { portfolioId: tx.portfolioId, symbol: tx.symbol } },
    });

    let position;
    if (tx.type === 'BUY') {
      if (existingPos) {
        const existingShares = Number(existingPos.shares);
        const existingCost   = Number(existingPos.avgCostBasis);
        const newShares      = existingShares + tx.shares;
        const newAvgCost     = ((existingShares * existingCost) + (tx.shares * tx.price)) / newShares;
        position = await prisma.portfolioPosition.update({
          where: { id: existingPos.id },
          data:  { shares: newShares, avgCostBasis: newAvgCost },
        });
      } else {
        position = await prisma.portfolioPosition.create({
          data: {
            portfolioId: tx.portfolioId, symbol: tx.symbol,
            assetType: tx.assetType, shares: tx.shares,
            avgCostBasis: tx.price, openedAt: new Date(tx.executedAt),
          },
        });
      }
    } else if (tx.type === 'SELL' && existingPos) {
      const remainingShares = Number(existingPos.shares) - tx.shares;
      if (remainingShares < 0) return reply.status(400).send({ success: false, error: 'Insufficient shares' });
      const realizedGain = (tx.price - Number(existingPos.avgCostBasis)) * tx.shares;
      if (remainingShares === 0) {
        await prisma.portfolioPosition.delete({ where: { id: existingPos.id } });
      } else {
        position = await prisma.portfolioPosition.update({
          where: { id: existingPos.id },
          data: { shares: remainingShares, realizedPnL: { increment: realizedGain } },
        });
      }
    }

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        portfolioId: tx.portfolioId,
        positionId:  position?.id,
        symbol:      tx.symbol,
        assetType:   tx.assetType,
        type:        tx.type,
        shares:      tx.shares,
        price:       tx.price,
        totalAmount,
        fees:        tx.fees,
        notes:       tx.notes,
        executedAt:  new Date(tx.executedAt),
      },
    });

    // Notify WS clients
    redisPublisher.publish(REDIS_CHANNELS.PORTFOLIO_UPDATE, JSON.stringify({
      portfolioId: tx.portfolioId, transactionId: transaction.id, type: 'TRANSACTION',
    }));

    return reply.status(201).send({ success: true, data: transaction });
  });

  // ─── Watchlists ────────────────────────────────────────────────────────────
  fastify.get('/watchlists', async () => {
    const userId = 'demo-user';
    const data = await prisma.watchlist.findMany({
      where:   { userId },
      include: { symbols: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { success: true, data };
  });

  fastify.post('/watchlists', async (req, reply) => {
    const body = CreateWatchlistSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.flatten() });
    const userId = 'demo-user';
    const count  = await prisma.watchlist.count({ where: { userId } });
    const data   = await prisma.watchlist.create({
      data: { ...body.data, userId, isDefault: count === 0 },
    });
    return reply.status(201).send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/watchlists/:id/items', async (req, reply) => {
    const body = AddWatchlistItemSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.flatten() });
    const count = await prisma.watchlistItem.count({ where: { watchlistId: req.params.id } });
    const data  = await prisma.watchlistItem.create({
      data: { ...body.data, watchlistId: req.params.id, sortOrder: count },
    });
    return reply.status(201).send({ success: true, data });
  });

  fastify.delete<{ Params: { id: string; symbol: string } }>(
    '/watchlists/:id/items/:symbol', async (req, reply) => {
      await prisma.watchlistItem.deleteMany({
        where: { watchlistId: req.params.id, symbol: req.params.symbol.toUpperCase() },
      });
      return { success: true };
    }
  );

  // ─── Price Alerts ──────────────────────────────────────────────────────────
  fastify.get('/alerts', async () => {
    const userId = 'demo-user';
    const data = await prisma.priceAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return { success: true, data };
  });

  fastify.post('/alerts', async (req, reply) => {
    const body = CreateAlertSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: body.error.flatten() });
    const userId = 'demo-user';
    const data   = await prisma.priceAlert.create({
      data: { ...body.data, userId, expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null },
    });
    return reply.status(201).send({ success: true, data });
  });

  fastify.delete<{ Params: { id: string } }>('/alerts/:id', async (req) => {
    await prisma.priceAlert.delete({ where: { id: req.params.id } });
    return { success: true };
  });

  fastify.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    '/alerts/:id/toggle', async (req) => {
      const data = await prisma.priceAlert.update({
        where: { id: req.params.id },
        data:  { isActive: req.body.isActive },
      });
      return { success: true, data };
    }
  );
};

export default portfolioRoute;
