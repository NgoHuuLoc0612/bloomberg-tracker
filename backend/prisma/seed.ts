import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SP500_STOCKS = [
  { symbol:'AAPL', companyName:'Apple Inc.', exchange:'NASDAQ', sector:'Technology', industry:'Consumer Electronics', price:175.43, change:2.15, changePercent:1.24, open:173.28, high:176.50, low:172.90, previousClose:173.28, volume:65842000, marketCap:2720000000000, peRatio:28.5, eps:6.16, beta:1.21, weekHigh52:199.62, weekLow52:164.08 },
  { symbol:'MSFT', companyName:'Microsoft Corporation', exchange:'NASDAQ', sector:'Technology', industry:'Software', price:415.32, change:3.89, changePercent:0.94, open:411.43, high:416.89, low:410.25, previousClose:411.43, volume:21456000, marketCap:3085000000000, peRatio:36.2, eps:11.45, beta:0.90, weekHigh52:468.35, weekLow52:309.45 },
  { symbol:'GOOGL', companyName:'Alphabet Inc.', exchange:'NASDAQ', sector:'Communication Services', industry:'Internet Content & Information', price:175.98, change:1.45, changePercent:0.83, open:174.53, high:177.21, low:174.12, previousClose:174.53, volume:18234000, marketCap:2180000000000, peRatio:27.8, eps:6.52, beta:1.05, weekHigh52:193.31, weekLow52:130.67 },
  { symbol:'AMZN', companyName:'Amazon.com Inc.', exchange:'NASDAQ', sector:'Consumer Discretionary', industry:'Internet Retail', price:189.46, change:2.78, changePercent:1.49, open:186.68, high:190.12, low:186.23, previousClose:186.68, volume:31567000, marketCap:1970000000000, peRatio:44.1, eps:4.30, beta:1.15, weekHigh52:201.20, weekLow52:118.35 },
  { symbol:'NVDA', companyName:'NVIDIA Corporation', exchange:'NASDAQ', sector:'Technology', industry:'Semiconductors', price:875.39, change:15.42, changePercent:1.79, open:859.97, high:879.44, low:857.31, previousClose:859.97, volume:42876000, marketCap:2155000000000, peRatio:62.8, eps:13.94, beta:1.68, weekHigh52:974.00, weekLow52:389.80 },
  { symbol:'META', companyName:'Meta Platforms Inc.', exchange:'NASDAQ', sector:'Communication Services', industry:'Internet Content & Information', price:521.78, change:6.23, changePercent:1.21, open:515.55, high:524.33, low:514.22, previousClose:515.55, volume:14523000, marketCap:1325000000000, peRatio:28.9, eps:18.03, beta:1.22, weekHigh52:544.23, weekLow52:279.40 },
  { symbol:'TSLA', companyName:'Tesla Inc.', exchange:'NASDAQ', sector:'Consumer Discretionary', industry:'Auto Manufacturers', price:254.13, change:-4.56, changePercent:-1.76, open:258.69, high:259.43, low:253.25, previousClose:258.69, volume:98234000, marketCap:808000000000, peRatio:64.2, eps:3.96, beta:2.18, weekHigh52:299.29, weekLow52:138.80 },
  { symbol:'JPM',  companyName:'JPMorgan Chase & Co.', exchange:'NYSE', sector:'Financials', industry:'Diversified Banks', price:205.34, change:1.23, changePercent:0.60, open:204.11, high:206.78, low:203.45, previousClose:204.11, volume:8765000, marketCap:590000000000, peRatio:12.4, eps:16.56, beta:1.11, weekHigh52:219.65, weekLow52:144.34 },
  { symbol:'V',    companyName:'Visa Inc.', exchange:'NYSE', sector:'Financials', industry:'Credit Services', price:278.92, change:0.89, changePercent:0.32, open:278.03, high:279.87, low:277.24, previousClose:278.03, volume:5678000, marketCap:1140000000000, peRatio:31.5, eps:8.85, beta:0.94, weekHigh52:290.96, weekLow52:227.78 },
  { symbol:'WMT',  companyName:'Walmart Inc.', exchange:'NYSE', sector:'Consumer Staples', industry:'Discount Stores', price:68.43, change:0.54, changePercent:0.80, open:67.89, high:68.97, low:67.72, previousClose:67.89, volume:12345000, marketCap:550000000000, peRatio:29.8, eps:2.30, beta:0.58, weekHigh52:74.37, weekLow52:47.29 },
  { symbol:'JNJ',  companyName:'Johnson & Johnson', exchange:'NYSE', sector:'Healthcare', industry:'Drug Manufacturers', price:147.23, change:-0.87, changePercent:-0.59, open:148.10, high:148.45, low:146.89, previousClose:148.10, volume:6789000, marketCap:354000000000, peRatio:9.8, eps:15.02, beta:0.56, weekHigh52:163.74, weekLow52:143.13 },
  { symbol:'PG',   companyName:'Procter & Gamble Co.', exchange:'NYSE', sector:'Consumer Staples', industry:'Household Products', price:168.45, change:0.78, changePercent:0.47, open:167.67, high:169.23, low:167.34, previousClose:167.67, volume:4523000, marketCap:396000000000, peRatio:27.4, eps:6.15, beta:0.57, weekHigh52:176.22, weekLow52:139.69 },
  { symbol:'XOM',  companyName:'Exxon Mobil Corp.', exchange:'NYSE', sector:'Energy', industry:'Oil & Gas Integrated', price:118.67, change:-1.23, changePercent:-1.02, open:119.90, high:120.34, low:118.12, previousClose:119.90, volume:14567000, marketCap:474000000000, peRatio:13.7, eps:8.66, beta:0.87, weekHigh52:123.75, weekLow52:95.77 },
  { symbol:'MA',   companyName:'Mastercard Inc.', exchange:'NYSE', sector:'Financials', industry:'Credit Services', price:476.23, change:3.45, changePercent:0.73, open:472.78, high:478.92, low:471.34, previousClose:472.78, volume:3456000, marketCap:445000000000, peRatio:35.8, eps:13.30, beta:1.09, weekHigh52:499.35, weekLow52:367.95 },
  { symbol:'UNH',  companyName:'UnitedHealth Group Inc.', exchange:'NYSE', sector:'Healthcare', industry:'Healthcare Plans', price:502.18, change:-3.42, changePercent:-0.68, open:505.60, high:506.78, low:501.23, previousClose:505.60, volume:2345000, marketCap:462000000000, peRatio:22.1, eps:22.71, beta:0.56, weekHigh52:559.30, weekLow52:446.19 },
  { symbol:'HD',   companyName:'Home Depot Inc.', exchange:'NYSE', sector:'Consumer Discretionary', industry:'Home Improvement Retail', price:367.45, change:2.34, changePercent:0.64, open:365.11, high:369.78, low:364.23, previousClose:365.11, volume:3456000, marketCap:364000000000, peRatio:23.5, eps:15.64, beta:1.01, weekHigh52:395.00, weekLow52:274.26 },
  { symbol:'BAC',  companyName:'Bank of America Corp.', exchange:'NYSE', sector:'Financials', industry:'Diversified Banks', price:39.12, change:0.45, changePercent:1.16, open:38.67, high:39.45, low:38.52, previousClose:38.67, volume:45678000, marketCap:302000000000, peRatio:12.8, eps:3.06, beta:1.35, weekHigh52:43.98, weekLow52:26.32 },
  { symbol:'ABBV', companyName:'AbbVie Inc.', exchange:'NYSE', sector:'Healthcare', industry:'Drug Manufacturers', price:178.92, change:1.23, changePercent:0.69, open:177.69, high:179.78, low:177.34, previousClose:177.69, volume:3789000, marketCap:315000000000, peRatio:59.5, eps:3.01, beta:0.72, weekHigh52:188.64, weekLow52:127.33 },
  { symbol:'COST', companyName:'Costco Wholesale Corp.', exchange:'NASDAQ', sector:'Consumer Staples', industry:'Discount Stores', price:872.43, change:5.67, changePercent:0.65, open:866.76, high:875.23, low:865.43, previousClose:866.76, volume:1234000, marketCap:388000000000, peRatio:52.8, eps:16.52, beta:0.82, weekHigh52:934.22, weekLow52:552.28 },
  { symbol:'NFLX', companyName:'Netflix Inc.', exchange:'NASDAQ', sector:'Communication Services', industry:'Entertainment', price:698.45, change:8.90, changePercent:1.29, open:689.55, high:701.23, low:688.34, previousClose:689.55, volume:4567000, marketCap:300000000000, peRatio:45.2, eps:15.45, beta:1.30, weekHigh52:721.35, weekLow52:344.73 },
  { symbol:'AMD',  companyName:'Advanced Micro Devices', exchange:'NASDAQ', sector:'Technology', industry:'Semiconductors', price:163.78, change:3.21, changePercent:2.00, open:160.57, high:164.89, low:160.12, previousClose:160.57, volume:34567000, marketCap:265000000000, peRatio:289.0, eps:0.57, beta:1.89, weekHigh52:227.30, weekLow52:114.52 },
  { symbol:'CRM',  companyName:'Salesforce Inc.', exchange:'NYSE', sector:'Technology', industry:'Software', price:297.34, change:2.45, changePercent:0.83, open:294.89, high:299.23, low:294.23, previousClose:294.89, volume:4321000, marketCap:289000000000, peRatio:51.2, eps:5.81, beta:1.23, weekHigh52:318.71, weekLow52:193.61 },
  { symbol:'DIS',  companyName:'Walt Disney Co.', exchange:'NYSE', sector:'Communication Services', industry:'Entertainment', price:101.23, change:-1.34, changePercent:-1.31, open:102.57, high:103.12, low:100.89, previousClose:102.57, volume:9876000, marketCap:185000000000, peRatio:44.1, eps:2.30, beta:1.29, weekHigh52:123.74, weekLow52:78.73 },
  { symbol:'PYPL', companyName:'PayPal Holdings Inc.', exchange:'NASDAQ', sector:'Financials', industry:'Credit Services', price:62.45, change:-0.78, changePercent:-1.23, open:63.23, high:63.78, low:62.12, previousClose:63.23, volume:8765000, marketCap:67000000000, peRatio:15.4, eps:4.05, beta:1.34, weekHigh52:95.91, weekLow52:50.25 },
  { symbol:'COIN', companyName:'Coinbase Global Inc.', exchange:'NASDAQ', sector:'Financials', industry:'Financial Services', price:234.56, change:12.34, changePercent:5.55, open:222.22, high:238.90, low:220.45, previousClose:222.22, volume:12345000, marketCap:60000000000, peRatio:null as any, eps:-2.31, beta:3.45, weekHigh52:283.93, weekLow52:45.86 },
];

async function main() {
  console.log('🌱 Seeding Bloomberg Tracker database...');

  // Upsert all stock quotes
  let count = 0;
  for (const stock of SP500_STOCKS) {
    await prisma.stockQuote.upsert({
      where:  { symbol: stock.symbol },
      create: stock,
      update: {
        price:          stock.price,
        change:         stock.change,
        changePercent:  stock.changePercent,
        open:           stock.open,
        high:           stock.high,
        low:            stock.low,
        previousClose:  stock.previousClose,
        volume:         stock.volume,
        updatedAt:      new Date(),
      },
    });
    count++;
  }
  console.log(`✅ Seeded ${count} stock quotes`);

  // Create demo user
  const user = await prisma.user.upsert({
    where:  { email: 'demo@bloomberg.com' },
    update: {},
    create: {
      id:          'demo-user',
      email:       'demo@bloomberg.com',
      displayName: 'Demo Trader',
      currency:    'USD',
      timezone:    'America/New_York',
    },
  });
  console.log(`✅ Demo user: ${user.email}`);

  // Create default portfolio
  const existing = await prisma.portfolio.findFirst({ where: { userId: user.id } });
  let portfolio = existing;
  if (!existing) {
    portfolio = await prisma.portfolio.create({
      data: {
        userId:    user.id,
        name:      'Main Portfolio',
        currency:  'USD',
        isDefault: true,
      },
    });

    // Seed sample positions
    const positions = [
      { symbol: 'AAPL',  assetType: 'STOCK' as const, shares: 50,   avgCostBasis: 145.20, openedAt: new Date('2022-01-15') },
      { symbol: 'MSFT',  assetType: 'STOCK' as const, shares: 25,   avgCostBasis: 310.45, openedAt: new Date('2022-03-10') },
      { symbol: 'NVDA',  assetType: 'STOCK' as const, shares: 10,   avgCostBasis: 420.00, openedAt: new Date('2023-01-20') },
      { symbol: 'GOOGL', assetType: 'STOCK' as const, shares: 30,   avgCostBasis: 128.50, openedAt: new Date('2022-06-05') },
      { symbol: 'TSLA',  assetType: 'STOCK' as const, shares: 20,   avgCostBasis: 220.00, openedAt: new Date('2023-02-14') },
    ];

    for (const pos of positions) {
      await prisma.portfolioPosition.create({
        data: { portfolioId: portfolio.id, ...pos },
      });
    }
    console.log(`✅ Portfolio seeded with ${positions.length} positions`);
  }

  // Create default watchlist
  const wlExist = await prisma.watchlist.findFirst({ where: { userId: user.id } });
  if (!wlExist) {
    const wl = await prisma.watchlist.create({
      data: { userId: user.id, name: 'Tech Watchlist', isDefault: true },
    });
    const watchSymbols = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','AMD','CRM'];
    for (let i = 0; i < watchSymbols.length; i++) {
      await prisma.watchlistItem.create({
        data: { watchlistId: wl.id, symbol: watchSymbols[i], assetType: 'STOCK', sortOrder: i },
      });
    }
    console.log(`✅ Watchlist seeded with ${watchSymbols.length} symbols`);
  }

  // Seed sample news
  const newsItems = [
    { headline: 'Federal Reserve signals potential rate cuts in 2025 as inflation cools', source: 'Reuters', category: 'general', url: 'https://reuters.com', datetime: Math.floor(Date.now()/1000) - 3600, relatedSymbols: ['SPY','QQQ'] },
    { headline: 'NVIDIA beats Q3 estimates with record data center revenue of $18.4B', source: 'Bloomberg', category: 'technology', url: 'https://bloomberg.com', datetime: Math.floor(Date.now()/1000) - 7200, relatedSymbols: ['NVDA'] },
    { headline: 'Apple launches M4 chip lineup across entire Mac portfolio', source: 'The Verge', category: 'technology', url: 'https://theverge.com', datetime: Math.floor(Date.now()/1000) - 10800, relatedSymbols: ['AAPL'] },
    { headline: 'Bitcoin surges past $70,000 as ETF inflows hit record $1.2B in single day', source: 'CoinDesk', category: 'crypto', url: 'https://coindesk.com', datetime: Math.floor(Date.now()/1000) - 14400, relatedSymbols: ['COIN','BTCUSDT'] },
    { headline: 'Tesla Cybertruck production ramp accelerates; company targets 250K units in 2025', source: 'Electrek', category: 'general', url: 'https://electrek.co', datetime: Math.floor(Date.now()/1000) - 18000, relatedSymbols: ['TSLA'] },
  ];

  for (const news of newsItems) {
    const { datetime, ...newsData } = news;
    await prisma.newsArticle.upsert({
      where:  { externalId: news.headline.slice(0, 50) },
      create: { ...newsData, publishedAt: new Date(datetime * 1000), externalId: news.headline.slice(0, 50) },
      update: {},
    });
  }

  console.log(`✅ Seeded ${newsItems.length} news articles`);

  console.log('\n🚀 Database seeded successfully!');
}

main()
  .catch((e) => { console.error('❌ Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
