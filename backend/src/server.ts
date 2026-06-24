// Fix: Prisma returns BigInt for volume/avgVolume fields, which JSON.stringify
// cannot serialize natively. This makes all BigInt values serialize as numbers.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { redisClient } from './config/redis.js';
import { prisma } from './db/prisma.client.js';
import { WsManager } from './websocket/ws.manager.js';
import { FinnhubWsClient } from './websocket/finnhub.ws.js';
import { BinanceWsClient } from './websocket/binance.ws.js';
import stocksRoute from './routes/stocks.route.js';
import cryptoRoute from './routes/crypto.route.js';
import portfolioRoute from './routes/portfolio.route.js';
import newsRoute from './routes/news.route.js';
import screenerRoute from './routes/screener.route.js';
import economicCalendarRoute from './routes/economic-calendar.route.js';

const server = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  },
  trustProxy: true,
  ajv: {
    customOptions: {
      removeAdditional: 'all',
      coerceTypes: 'array',
      useDefaults: true,
    },
  },
});

// ─── Global Error Handler ────────────────────────────────────────────────────
server.setErrorHandler((error, _req, reply) => {
  server.log.error(error);
  if (error.validation) {
    reply.status(400).send({ success: false, error: 'Validation Error', details: error.validation });
    return;
  }
  if (error.statusCode === 429) {
    reply.status(429).send({ success: false, error: 'Rate limit exceeded. Please slow down.' });
    return;
  }
  reply.status(error.statusCode || 500).send({
    success: false,
    error: env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
  });
});

// ─── Plugins ─────────────────────────────────────────────────────────────────
await server.register(fastifyCors, {
  origin: [env.FRONTEND_URL, 'http://localhost:4200', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

await server.register(fastifyHelmet, {
  contentSecurityPolicy: false,
});

await server.register(fastifyCompress, {
  global: true,
  threshold: 1024,
});

await server.register(fastifyRateLimit, {
  global: true,
  max: env.RATE_LIMIT_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
  redis: redisClient,
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: () => ({ success: false, error: 'Too many requests' }),
});

await server.register(fastifyWebsocket, {
  options: {
    maxPayload: 1024 * 1024, // 1MB max
    perMessageDeflate: true,
  },
});

// ─── Shared State ─────────────────────────────────────────────────────────────
const wsManager    = new WsManager(redisClient);
const finnhubWs    = new FinnhubWsClient(env.FINNHUB_API_KEY, wsManager);
const binanceWs    = new BinanceWsClient(wsManager);

// Attach to server for route access
server.decorate('wsManager',  wsManager);
server.decorate('finnhubWs',  finnhubWs);
server.decorate('binanceWs',  binanceWs);

// ─── WebSocket Endpoint ───────────────────────────────────────────────────────
server.get('/ws', { websocket: true }, (socket, req) => {
  wsManager.addClient(socket as any, req);
});

// ─── REST Routes ──────────────────────────────────────────────────────────────
await server.register(stocksRoute,    { prefix: '/api/v1/stocks' });
await server.register(cryptoRoute,    { prefix: '/api/v1/crypto' });
await server.register(portfolioRoute, { prefix: '/api/v1/portfolio' });
await server.register(newsRoute,      { prefix: '/api/v1/news' });
await server.register(screenerRoute,  { prefix: '/api/v1/screener' });
await server.register(economicCalendarRoute, { prefix: '/api/v1/economic-calendar' });

// ─── Health & Meta ────────────────────────────────────────────────────────────
server.get('/health', {
  schema: {
    response: { 200: { type: 'object', properties: {
      status:    { type: 'string' },
      version:   { type: 'string' },
      timestamp: { type: 'string' },
      services:  { type: 'object' },
    }}},
  }
}, async () => {
  const [redisOk, dbOk] = await Promise.allSettled([
    redisClient.ping().then(r => r === 'PONG'),
    prisma.$queryRaw`SELECT 1`.then(() => true),
  ]);

  return {
    status:    'ok',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      redis:      redisOk.status === 'fulfilled' ? redisOk.value : false,
      database:   dbOk.status   === 'fulfilled' ? dbOk.value   : false,
      finnhubWs:  finnhubWs.getStatus().connected,
      binanceWs:  binanceWs.getStatus().connected,
      wsClients:  wsManager.getStats().connectedClients,
    },
  };
});

server.get('/api/v1/ws/stats', async () => wsManager.getStats());

server.get('/api/v1/feeds/status', async () => ({
  finnhub: finnhubWs.getStatus(),
  binance: binanceWs.getStatus(),
}));

// ─── Startup ──────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    // Verify DB connection
    await prisma.$connect();
    console.log('✅ PostgreSQL 18 (EDB) connected');

    // Verify Redis
    const pong = await redisClient.ping();
    if (pong !== 'PONG') throw new Error('Redis ping failed');
    console.log('✅ Redis (Memurai) connected');

    // Start WebSocket data feeds
    await finnhubWs.connect();
    await binanceWs.connect();

    // Start HTTP server
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Bloomberg Tracker API running at http://0.0.0.0:${env.PORT}`);
    console.log(`📡 WebSocket endpoint: ws://0.0.0.0:${env.PORT}/ws`);
    console.log(`🔍 Health check: http://0.0.0.0:${env.PORT}/health\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  finnhubWs.disconnect();
  binanceWs.disconnect();
  await server.close();
  await prisma.$disconnect();
  await redisClient.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
