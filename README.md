# ◆ Bloomberg Tracker — Terminal-Style Market Dashboard

> Full-stack stock & crypto tracker with a Bloomberg-terminal look. Real-time WebSocket price feeds, TradingView charts, portfolio P&L, a stock screener, a crypto order book, a live market-news feed, and price alerts.

This is a learning/demo project, not a production trading platform. See [Known Limitations](#known-limitations) before you rely on any of its numbers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Fastify 4, TypeScript 5, Node.js 22 |
| Database | PostgreSQL 16+ |
| Cache | Redis (ioredis client) |
| ORM | Prisma 5 |
| Validation | Zod |
| Real-time | `ws` library + Redis pub/sub |
| Frontend | Angular 18, standalone components, RxJS 7 |
| State | Angular Signals (`signal`, `computed`) |
| Charts | TradingView Lightweight Charts 4.x |
| Offline cache | IndexedDB via `idb` |
| Market data | Finnhub, Alpha Vantage, Twelve Data, CoinGecko |
| News | RSS feeds (MarketWatch, Seeking Alpha, Benzinga, SEC, Federal Reserve, IMF, CoinDesk) |
| Crypto real-time | Binance public WebSocket |
| Stock real-time | Finnhub WebSocket |

---

## Prerequisites

1. **Node.js 22+** — https://nodejs.org
2. **PostgreSQL** (any 16+ distribution — official installer, Docker, or your OS package manager), running on the default port **5432**.
   Create a user and database:
   ```sql
   CREATE USER bloomberg_user WITH PASSWORD 'bloomberg_pass';
   CREATE DATABASE bloomberg_tracker OWNER bloomberg_user;
   GRANT ALL PRIVILEGES ON DATABASE bloomberg_tracker TO bloomberg_user;
   ```
3. **Redis**, running on the default port **6379**.
   - Linux: `sudo apt install redis-server`
   - macOS: `brew install redis`
   - Windows: use WSL2 + the Linux instructions above, or Memurai
4. **API keys** (all have a free tier):
   - Finnhub — https://finnhub.io → Dashboard → API Key
   - Alpha Vantage — https://www.alphavantage.co/support/#api-key
   - Twelve Data — https://twelvedata.com → Get API Key
   - CoinGecko — optional. The public API works without a key; only add one if you have a real CoinGecko Demo/Pro key (see [Known Limitations](#known-limitations) for why a wrong key breaks things).

---

## Installation

### 1. Backend

```bash
cd bloomberg-tracker/backend
npm install
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL="postgresql://bloomberg_user:bloomberg_pass@localhost:5432/bloomberg_tracker?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
FINNHUB_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
TWELVE_DATA_API_KEY=your_key_here
COINGECKO_API_KEY=                       # leave blank — see Known Limitations
JWT_SECRET=$(openssl rand -hex 32)       # generate a real random string, don't leave the placeholder
```

```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

- API: http://localhost:3000
- WebSocket: ws://localhost:3000/ws
- Health check: http://localhost:3000/health

> `npm run dev` and `npm run start` load `.env` via Node's built-in `--env-file` flag. If you ever see `❌ Invalid environment variables` even though `.env` looks correct, you're most likely running the server with a command that skips this flag.

### 2. Frontend

In a separate terminal:

```bash
cd bloomberg-tracker/frontend
npm install
npm start
```

- App: http://localhost:4200

The dev server proxies `/api/*` to `http://localhost:3000` and `/ws` to `ws://localhost:3000`.

---

## Project Structure

```
bloomberg-tracker/
├── backend/
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma          ← 14 models (see below)
│   │   └── seed.ts                ← seeds 25 sample stocks, 1 demo user/portfolio, 5 news rows
│   └── src/
│       ├── server.ts              ← Fastify entry point, BigInt JSON patch lives here
│       ├── config/
│       │   ├── env.ts             ← Zod-validated environment
│       │   └── redis.ts           ← Redis client + withCache helper
│       ├── db/prisma.client.ts
│       ├── services/
│       │   ├── finnhub.service.ts
│       │   ├── alpha-vantage.service.ts
│       │   ├── coingecko.service.ts
│       │   ├── twelve-data.service.ts
│       │   ├── rss-feed.service.ts ← fetches/parses the 7 news RSS sources
│       │   └── alert.service.ts    ← cron job, checks price alerts every 30s
│       ├── websocket/
│       │   ├── ws.manager.ts
│       │   ├── finnhub.ws.ts
│       │   └── binance.ws.ts
│       └── routes/
│           ├── stocks.route.ts
│           ├── crypto.route.ts
│           ├── portfolio.route.ts
│           ├── news.route.ts            ← also contains the screener handlers
│           ├── screener.route.ts        ← re-exports from news.route.ts
│           └── economic-calendar.route.ts
│
└── frontend/
    └── src/app/
        ├── core/
        │   ├── models/
        │   ├── services/          ← HTTP + WebSocket + IndexedDB clients
        │   └── signals/market.store.ts
        └── features/
            ├── dashboard/
            ├── chart/
            ├── portfolio/
            ├── crypto/
            ├── screener/
            ├── watchlist/
            ├── news/
            └── economic-calendar/  ← live news feed (see below), not a macro calendar
```

---

## API Reference

### Stocks
```
GET  /api/v1/stocks/quote/:symbol
GET  /api/v1/stocks/candles/:symbol?interval=D&source=twelvedata|finnhub|alphavantage
GET  /api/v1/stocks/indicators/:symbol?interval=daily&indicators=ema20,ema50,bb,rsi,macd
GET  /api/v1/stocks/profile/:symbol
GET  /api/v1/stocks/earnings/:symbol
GET  /api/v1/stocks/recommendations/:symbol
GET  /api/v1/stocks/search?q=apple
GET  /api/v1/stocks/market-status
```

> `source=finnhub` for candles only works with a paid Finnhub plan — the free tier returns 403. The frontend defaults to `source=twelvedata`.

### Crypto
```
GET  /api/v1/crypto/markets?per_page=100&page=1
GET  /api/v1/crypto/global
GET  /api/v1/crypto/orderbook/:symbol?limit=20
GET  /api/v1/crypto/trending
```

### Portfolio
```
GET  /api/v1/portfolio/portfolios
POST /api/v1/portfolio/portfolios
POST /api/v1/portfolio/transactions
GET  /api/v1/portfolio/watchlists
POST /api/v1/portfolio/watchlists
GET  /api/v1/portfolio/alerts
POST /api/v1/portfolio/alerts
```

> All of these use a single hardcoded `userId = 'demo-user'`. There is no real authentication — see Known Limitations.

### Screener
```
GET  /api/v1/screener/heatmap
GET  /api/v1/screener/top-movers
```

> These query the `StockQuote` table in PostgreSQL — they're not hardcoded — but that table is only populated once by `seed.ts`. Nothing refreshes it automatically, so prices stay frozen at whatever they were when you last ran the seed script.

### Market News Feed (formerly "Economic Calendar")
```
GET  /api/v1/economic-calendar/feed?source=&category=
GET  /api/v1/economic-calendar/sources
POST /api/v1/economic-calendar/refresh
```

Aggregates and caches (5 min TTL) headlines from MarketWatch, Seeking Alpha, Benzinga, SEC, Federal Reserve, IMF, and CoinDesk. This replaced an earlier version that just rendered 15 hardcoded fake events — it is **not** a macroeconomic events calendar (no NFP/CPI/FOMC release schedule with actual-vs-forecast numbers). The `EconomicEvent` Prisma model still exists in the schema but nothing currently writes to it.

---

## WebSocket Protocol

Connect to `ws://localhost:3000/ws`.

**Subscribe:**
```json
{ "action": "subscribe", "type": "stock", "symbols": ["AAPL", "MSFT", "NVDA"] }
{ "action": "subscribe", "type": "crypto", "symbols": ["BTCUSDT", "ETHUSDT"] }
```

**Tick message:**
```json
{
  "type": "tick",
  "assetType": "STOCK",
  "symbol": "AAPL",
  "price": 175.43,
  "change": 2.15,
  "changePct": 1.24,
  "volume": 65842000,
  "timestamp": 1713456789000
}
```

---

## Known Limitations

This list exists because every item on it was hit and fixed during real setup — not theoretical.

- **No real authentication.** All portfolio/watchlist/alert routes use a hardcoded `userId = 'demo-user'`. The seed script pins that user's database `id` to the literal string `'demo-user'` — if you ever reseed without that, every write to those routes fails with a foreign-key error.
- **Screener data is static.** `top-movers` and `heatmap` read from PostgreSQL, not from a live API, but nothing refreshes that table after the initial seed. Prices will not change while the app runs unless you reseed.
- **Finnhub's `/stock/candle` endpoint requires a paid plan.** The free tier returns `403 You don't have access to this resource`. Candle/chart data is fetched from Twelve Data by default instead.
- **CoinGecko key must be a Demo/Pro key, or blank.** Pasting an unrelated API key (e.g. your Twelve Data key) into `COINGECKO_API_KEY` causes CoinGecko to reject every request with `error_code 10010` ("If you are using a Pro API key, please change your root URL…"). Leaving it blank uses the public free tier and works fine for this project's usage volume.
- **`.env` is not loaded automatically.** Nothing in this codebase calls `dotenv.config()`. The npm scripts load it via Node 22's `--env-file=.env` flag instead — if you change how the server is started, make sure that flag (or an equivalent) is still present.
- **The "Economic Calendar" is a news feed, not a macro calendar.** See the API section above.
- **Free-tier rate limits apply.** Twelve Data's free plan is limited to roughly 8 requests/minute; CoinGecko's public tier to a similarly low number. Heavy use of the chart or crypto views can trigger `429` responses — this is expected, not a bug.

---

## Available npm Scripts

**Backend** (`cd backend`):
```bash
npm run dev             # tsx watch --env-file=.env src/server.ts
npm run build           # tsc compile to dist/
npm run start           # node --env-file=.env dist/server.js
npm run prisma:generate
npm run prisma:push     # push schema without migration history
npm run prisma:seed     # run prisma/seed.ts
npm run prisma:studio   # Prisma Studio GUI on :5555
```

**Frontend** (`cd frontend`):
```bash
npm start                # ng serve --host 0.0.0.0 --port 4200
npm run build            # ng build --configuration production
```

---

## Design System

| Token | Value | Usage |
|---|---|---|
| Background | `#060a14` | App shell |
| Panel | `#0c1322` | Headers, sidebars |
| Orange | `#ff9500` | Accent, symbols, active states |
| Green | `#00d97e` | Gains, positive |
| Red | `#ff3355` | Losses, negative |
| Cyan | `#00d4ff` | Highlights |
| Text | `#d4e0f5` | Primary content |
| Muted | `#4a5e7a` | Labels, metadata |
| Font | IBM Plex Mono | All numbers and prices |

---

*Bloomberg Tracker — Angular 18 · Fastify · PostgreSQL · Redis · TradingView · Finnhub · Binance · CoinGecko · Alpha Vantage · Twelve Data*