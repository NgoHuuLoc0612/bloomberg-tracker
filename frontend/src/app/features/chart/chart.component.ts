import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, Input, signal, computed,
  effect, ChangeDetectionStrategy, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  createChart, IChartApi, ISeriesApi,
  ColorType, CrosshairMode, LineStyle,
  type CandlestickData, type Time,
} from 'lightweight-charts';
import { Subject, takeUntil, combineLatest, switchMap, debounceTime } from 'rxjs';
import { MarketService }    from '../../core/services/market.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { IndexedDbService } from '../../core/services/indexeddb.service';
import {
  activeSymbol, activeInterval, assetType, tickCache, activeTick,
  stockQuotes, addNotification
} from '../../core/signals/market.store';
import type { OHLCVCandle, TechnicalIndicators, StockQuote, EarningsReport, RecommendationTrend } from '../../core/models/stock.model';

type ChartType = 'candlestick' | 'line' | 'area' | 'bar';
type TimeInterval = '1min' | '5min' | '15min' | '30min' | '1h' | '4h' | 'D' | 'W' | 'M';

interface IndicatorConfig {
  id:      string;
  label:   string;
  enabled: boolean;
  color?:  string;
  panel:   'main' | 'sub';
}

@Component({
  selector: 'app-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="chart-shell">

  <!-- ══ SYMBOL HEADER ══════════════════════════════════════════════════════ -->
  <div class="chart-header">
    <div class="chart-header__left">
      <div class="chart-symbol">
        <span class="chart-symbol__ticker">{{ currentSymbol() }}</span>
        @if (quote()) {
          <span class="chart-symbol__name">{{ quote()!.companyName }}</span>
          <span class="chart-symbol__exchange badge-flat">{{ quote()!.exchange }}</span>
        }
      </div>

      @if (quote()) {
        <div class="chart-price-block">
          <span class="chart-price mono">{{ quote()!.price | number:'1.2-4' }}</span>
          <span class="chart-change mono" [class.gain]="quote()!.changePercent > 0" [class.loss]="quote()!.changePercent < 0">
            {{ quote()!.changePercent > 0 ? '+' : '' }}{{ quote()!.change | number:'1.2-4' }}
            ({{ quote()!.changePercent > 0 ? '+' : '' }}{{ quote()!.changePercent | number:'1.2-2' }}%)
          </span>
          <span class="chart-session mono">{{ marketSession() }}</span>
        </div>

        <div class="chart-stats">
          <div class="chart-stat">
            <span class="chart-stat__lbl">O</span>
            <span class="chart-stat__val mono">{{ quote()!.open | number:'1.2-2' }}</span>
          </div>
          <div class="chart-stat">
            <span class="chart-stat__lbl">H</span>
            <span class="chart-stat__val mono gain">{{ quote()!.high | number:'1.2-2' }}</span>
          </div>
          <div class="chart-stat">
            <span class="chart-stat__lbl">L</span>
            <span class="chart-stat__val mono loss">{{ quote()!.low | number:'1.2-2' }}</span>
          </div>
          <div class="chart-stat">
            <span class="chart-stat__lbl">C</span>
            <span class="chart-stat__val mono">{{ quote()!.previousClose | number:'1.2-2' }}</span>
          </div>
          <div class="chart-stat">
            <span class="chart-stat__lbl">VOL</span>
            <span class="chart-stat__val mono">{{ formatVolume(quote()!.volume) }}</span>
          </div>
          @if (quote()!.marketCap) {
            <div class="chart-stat">
              <span class="chart-stat__lbl">MCAP</span>
              <span class="chart-stat__val mono">{{ formatMarketCap(quote()!.marketCap!) }}</span>
            </div>
          }
          @if (quote()!.peRatio) {
            <div class="chart-stat">
              <span class="chart-stat__lbl">P/E</span>
              <span class="chart-stat__val mono">{{ quote()!.peRatio | number:'1.1-1' }}</span>
            </div>
          }
        </div>
      }

      @if (livePrice()) {
        <div class="chart-live-dot">
          <div class="ws-dot connected"></div>
          <span class="mono">LIVE</span>
        </div>
      }
    </div>

    <div class="chart-header__right">
      <!-- Interval Selector -->
      <div class="bb-tabs chart-intervals">
        @for (iv of intervals; track iv.value) {
          <div class="bb-tabs__tab" [class.active]="currentInterval() === iv.value"
            (click)="changeInterval(iv.value)">{{ iv.label }}</div>
        }
      </div>

      <!-- Chart Type -->
      <div class="chart-type-btns">
        @for (ct of chartTypes; track ct.value) {
          <button class="bb-btn bb-btn--sm" [class.active]="chartType() === ct.value"
            (click)="changeChartType(ct.value)" [title]="ct.label">{{ ct.icon }}</button>
        }
      </div>
    </div>
  </div>

  <!-- ══ TOOLBAR ════════════════════════════════════════════════════════════ -->
  <div class="chart-toolbar">
    <div class="chart-toolbar__indicators">
      @for (ind of indicators; track ind.id) {
        <button class="bb-btn bb-btn--sm" [class.active]="ind.enabled"
          (click)="toggleIndicator(ind)">{{ ind.label }}</button>
      }
    </div>
    <div class="chart-toolbar__actions">
      <button class="bb-btn bb-btn--sm" (click)="fitContent()">Fit</button>
      <button class="bb-btn bb-btn--sm" (click)="resetZoom()">Reset</button>
      <button class="bb-btn bb-btn--sm" (click)="addToWatchlist()">* Watch</button>
      <button class="bb-btn bb-btn--sm" (click)="showOrderPanel = !showOrderPanel">+ Trade</button>
    </div>
  </div>

  <!-- ══ CHART + PANELS ═════════════════════════════════════════════════════ -->
  <div class="chart-workspace">

    <!-- Main Chart -->
    <div class="chart-area">
      <div #chartContainer class="chart-canvas"></div>
      @if (loading()) {
        <div class="chart-loading">
          <div class="chart-loading__spinner"></div>
          <span>Loading {{ currentSymbol() }}...</span>
        </div>
      }
      <!-- Crosshair data tooltip -->
      @if (crosshairData()) {
        <div class="chart-crosshair">
          <span class="mono">{{ crosshairData()!.time }}</span>
          <span class="mono">O: {{ crosshairData()!.open | number:'1.4-4' }}</span>
          <span class="mono">H: <span class="gain">{{ crosshairData()!.high | number:'1.4-4' }}</span></span>
          <span class="mono">L: <span class="loss">{{ crosshairData()!.low | number:'1.4-4' }}</span></span>
          <span class="mono">C: {{ crosshairData()!.close | number:'1.4-4' }}</span>
          <span class="mono">V: {{ formatVolume(crosshairData()!.volume) }}</span>
        </div>
      }
    </div>

    <!-- Sub-chart (RSI / MACD) -->
    @if (showSubChart()) {
      <div class="chart-sub">
        <div #subChartContainer class="chart-canvas"></div>
        <div class="chart-sub__label">
          {{ activeSubIndicator() | uppercase }}
        </div>
      </div>
    }

    <!-- Right panel: Quote Details / News -->
    <div class="chart-right-panel">
      <div class="bb-tabs">
        @for (tab of rightPanelTabs; track tab) {
          <div class="bb-tabs__tab" [class.active]="rightTab === tab" (click)="rightTab = tab">{{ tab }}</div>
        }
      </div>

      @switch (rightTab) {
        @case ('INFO') {
          @if (quote()) {
            <div class="chart-info-grid">
              <div class="info-row"><span>52W High</span><span class="mono gain">{{ quote()!.weekHigh52 | number:'1.2-2' }}</span></div>
              <div class="info-row"><span>52W Low</span><span class="mono loss">{{ quote()!.weekLow52 | number:'1.2-2' }}</span></div>
              <div class="info-row"><span>Beta</span><span class="mono">{{ quote()!.beta | number:'1.2-2' }}</span></div>
              <div class="info-row"><span>EPS</span><span class="mono">{{ quote()!.eps | number:'1.2-2' }}</span></div>
              <div class="info-row"><span>Div Yield</span><span class="mono">{{ quote()!.dividendYield | number:'1.2-2' }}%</span></div>
              <div class="info-row"><span>ROE</span><span class="mono">{{ quote()!.roe | number:'1.1-1' }}%</span></div>
              <div class="info-row"><span>Net Margin</span><span class="mono">{{ quote()!.netMargin | number:'1.1-1' }}%</span></div>
              <div class="info-row"><span>D/E Ratio</span><span class="mono">{{ quote()!.debtToEquity | number:'1.2-2' }}</span></div>
            </div>
            <!-- Peers -->
            @if (quote()!.peers?.length) {
              <div class="chart-peers">
                <div class="panel-section-title">PEERS</div>
                @for (peer of quote()!.peers!.slice(0,6); track peer) {
                  <span class="chart-peer" (click)="loadSymbol(peer)">{{ peer }}</span>
                }
              </div>
            }
          }
        }
        @case ('NEWS') {
          <div class="chart-news-list">
            @for (n of companyNews(); track n.id) {
              <a class="chart-news-item" [href]="n.url" target="_blank" rel="noopener">
                <span class="chart-news-item__src">{{ n.source }}</span>
                <span class="chart-news-item__head">{{ n.headline }}</span>
                <span class="chart-news-item__time">{{ n.datetime * 1000 | date:'MMM d HH:mm' }}</span>
              </a>
            }
          </div>
        }
        @case ('EARNINGS') {
          <div class="chart-earnings-list">
            <table class="bb-table bb-table--sm">
              <thead>
                <tr>
                  <th>Period</th><th>Est</th><th>Actual</th><th>Surprise</th>
                </tr>
              </thead>
              <tbody>
                @for (e of earnings(); track e.period) {
                  <tr>
                    <td>{{ e.period }}</td>
                    <td class="mono">{{ e.estimate | number:'1.2-2' }}</td>
                    <td class="mono" [class.gain]="e.actual! > e.estimate!" [class.loss]="e.actual! < e.estimate!">
                      {{ e.actual | number:'1.2-2' }}
                    </td>
                    <td class="mono" [class.gain]="e.surprisePct! > 0" [class.loss]="e.surprisePct! < 0">
                      {{ e.surprisePct ? (e.surprisePct > 0 ? '+' : '') + (e.surprisePct | number:'1.1-1') + '%' : '-' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('RECS') {
          @for (r of recommendations().slice(0,4); track r.period) {
            <div class="chart-rec">
              <div class="chart-rec__period">{{ r.period }}</div>
              <div class="chart-rec__bars">
                <div class="chart-rec__bar chart-rec__bar--buy"   [style.width.%]="recPct(r.buy   + r.strongBuy,   r)" title="Buy {{ r.buy + r.strongBuy }}">
                  <span>B {{ r.buy + r.strongBuy }}</span>
                </div>
                <div class="chart-rec__bar chart-rec__bar--hold"  [style.width.%]="recPct(r.hold, r)" title="Hold {{ r.hold }}">
                  <span>H {{ r.hold }}</span>
                </div>
                <div class="chart-rec__bar chart-rec__bar--sell"  [style.width.%]="recPct(r.sell  + r.strongSell, r)" title="Sell {{ r.sell + r.strongSell }}">
                  <span>S {{ r.sell + r.strongSell }}</span>
                </div>
              </div>
            </div>
          }
        }
      }
    </div>
  </div>

</div>
  `,
  styleUrls: ['./chart.component.scss']
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartContainer',    { static: false }) chartContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('subChartContainer', { static: false }) subChartContainer!: ElementRef<HTMLDivElement>;

  @Input() set symbol(v: string) { if (v) this.loadSymbol(v); }

  private destroy$  = new Subject<void>();
  private chart:    IChartApi | null = null;
  private subChart: IChartApi | null = null;
  private candleSeries:  ISeriesApi<'Candlestick'> | null = null;
  private lineSeries:    ISeriesApi<'Line'> | null = null;
  private areaSeries:    ISeriesApi<'Area'> | null = null;
  private volumeSeries:  ISeriesApi<'Histogram'> | null = null;
  private ema20Series:   ISeriesApi<'Line'> | null = null;
  private ema50Series:   ISeriesApi<'Line'> | null = null;
  private ema200Series:  ISeriesApi<'Line'> | null = null;
  private bb_upperSeries:ISeriesApi<'Line'> | null = null;
  private bb_lowerSeries:ISeriesApi<'Line'> | null = null;
  private rsiSeries:     ISeriesApi<'Line'> | null = null;
  private macdSeries:    ISeriesApi<'Line'> | null = null;
  private macdSignal:    ISeriesApi<'Line'> | null = null;
  private macdHist:      ISeriesApi<'Histogram'> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastCandleTime = 0;

  readonly currentSymbol  = activeSymbol;
  readonly currentInterval= activeInterval;
  readonly assetType      = assetType;
  readonly tickCache      = tickCache;

  loading          = signal(false);
  chartType        = signal<ChartType>('candlestick');
  quote            = signal<StockQuote | null>(null);
  earnings         = signal<EarningsReport[]>([]);
  recommendations  = signal<RecommendationTrend[]>([]);
  companyNews      = signal<any[]>([]);
  crosshairData    = signal<any>(null);
  activeSubIndicator = signal<string>('rsi');
  livePrice        = signal<number | null>(null);
  candles          = signal<OHLCVCandle[]>([]);

  rightTab     = 'INFO';
  showOrderPanel = false;
  rightPanelTabs = ['INFO','NEWS','EARNINGS','RECS'];

  intervals: Array<{ value: TimeInterval; label: string }> = [
    { value: '1min', label: '1m' }, { value: '5min', label: '5m' },
    { value: '15min', label: '15m' }, { value: '1h', label: '1h' },
    { value: '4h', label: '4h' }, { value: 'D', label: '1D' },
    { value: 'W', label: '1W' }, { value: 'M', label: '1M' },
  ];

  chartTypes = [
    { value: 'candlestick' as ChartType, icon: '#', label: 'Candlestick' },
    { value: 'line'        as ChartType, icon: '~', label: 'Line'        },
    { value: 'area'        as ChartType, icon: '^', label: 'Area'        },
  ];

  indicators: IndicatorConfig[] = [
    { id: 'ema20',  label: 'EMA 20',  enabled: true,  color: '#f59e0b', panel: 'main' },
    { id: 'ema50',  label: 'EMA 50',  enabled: true,  color: '#3b82f6', panel: 'main' },
    { id: 'ema200', label: 'EMA 200', enabled: false, color: '#8b5cf6', panel: 'main' },
    { id: 'bb',     label: 'BB',      enabled: false, color: '#6366f1', panel: 'main' },
    { id: 'vol',    label: 'VOL',     enabled: true,  panel: 'main'  },
    { id: 'rsi',    label: 'RSI 14',  enabled: false, color: '#00d4ff', panel: 'sub' },
    { id: 'macd',   label: 'MACD',    enabled: false, panel: 'sub'  },
  ];

  showSubChart = computed(() => this.indicators.some(i => i.panel === 'sub' && i.enabled));
  marketSession = computed(() => {
    const now = new Date();
    const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const h = et.getHours(), m = et.getMinutes();
    const mins = h * 60 + m;
    if (mins < 240)  return 'NIGHT';
    if (mins < 570)  return 'PRE-MARKET';
    if (mins < 960)  return 'REGULAR';
    if (mins < 1200) return 'AFTER-HRS';
    return 'CLOSED';
  });

  constructor(
    private market:   MarketService,
    private ws:       WebSocketService,
    private idb:      IndexedDbService,
    private route:    ActivatedRoute,
    private router:   Router,
    private zone:     NgZone,
    private cdr:      ChangeDetectorRef,
  ) {
    // React to live ticks
    effect(() => {
      const tick = tickCache().get(this.currentSymbol());
      if (!tick) return;
      this.livePrice.set(tick.price);
      this.updateLastCandle(tick.price, tick.volume ?? 0);
      // Update quote signal
      const q = this.quote();
      if (q) {
        this.quote.set({ ...q, price: tick.price, change: tick.change, changePercent: tick.changePct });
      }
    });
  }

  ngOnInit() {
    // Load from route param
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const sym = params.get('symbol');
      if (sym) this.loadSymbol(sym.toUpperCase());
      else this.loadSymbol(activeSymbol());
    });
  }

  ngAfterViewInit() {
    this.initChart();
    this.setupResize();
    this.loadSymbol(activeSymbol());
  }

  private initChart() {
    if (!this.chartContainer?.nativeElement) return;

    const chartOpts = {
      layout: {
        background: { type: ColorType.Solid, color: '#060a14' },
        textColor:  '#8da0bc',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines:   { color: '#0f1e33', style: LineStyle.Dotted },
        horzLines:   { color: '#0f1e33', style: LineStyle.Dotted },
      },
      crosshair: {
        mode:  1 as any, // CrosshairMode.Normal
        vertLine:   { color: '#ff9500', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#ff9500' },
        horzLine:   { color: '#ff9500', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#ff9500' },
      },
      rightPriceScale: {
        borderColor: '#1a2840',
        textColor:   '#8da0bc',
        scaleMargins:{ top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor:    '#1a2840',
        textColor:      '#8da0bc',
        timeVisible:    true,
        secondsVisible: false,
      }
    };

    this.chart = createChart(this.chartContainer.nativeElement, chartOpts as any);

    // Crosshair subscriber
    this.chart.subscribeCrosshairMove(param => {
      if (!param.time || !this.candleSeries) { this.crosshairData.set(null); return; }
      const data = param.seriesData.get(this.candleSeries) as any;
      if (data) {
        this.zone.run(() => {
          this.crosshairData.set({
            time:   new Date((param.time as number) * 1000).toLocaleString(),
            open:   data.open, high: data.high, low: data.low, close: data.close, volume: data.volume ?? 0,
          });
          this.cdr.markForCheck();
        });
      }
    });
  }

  private setupResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => {
        const el = this.chartContainer?.nativeElement;
        if (el && this.chart) this.chart.resize(el.clientWidth, el.clientHeight);
      });
    });
    if (this.chartContainer?.nativeElement) {
      this.resizeObserver.observe(this.chartContainer.nativeElement);
    }
  }

  loadSymbol(symbol: string) {
    activeSymbol.set(symbol.toUpperCase());
    this.ws.subscribeStock([symbol.toUpperCase()]);
    this.loadAll();
  }

  private async loadAll() {
    this.loading.set(true);
    const symbol   = this.currentSymbol();
    const interval = this.currentInterval();

    // Load in parallel
    const [quoteData, candleData, newsData, earningsData, recsData] = await Promise.allSettled([
      this.market.getQuote(symbol).toPromise(),
      this.loadCandlesWithCache(symbol, interval),
      this.market.getCompanyNews(symbol).toPromise(),
      this.market.getEarnings(symbol).toPromise(),
      this.market.getRecommendations(symbol).toPromise(),
    ]);

    if (quoteData.status    === 'fulfilled') this.quote.set(quoteData.value ?? null);
    if (earningsData.status === 'fulfilled') this.earnings.set(earningsData.value ?? []);
    if (recsData.status     === 'fulfilled') this.recommendations.set(recsData.value ?? []);
    if (newsData.status     === 'fulfilled') this.companyNews.set(newsData.value ?? []);

    if (candleData.status === 'fulfilled' && candleData.value.length > 0) {
      this.candles.set(candleData.value);
      this.renderChart(candleData.value);
    }

    // Load active indicators
    const activeInds = this.indicators.filter(i => i.enabled).map(i => i.id);
    if (activeInds.length > 0) await this.loadIndicators(activeInds);

    this.loading.set(false);
    this.cdr.markForCheck();
  }

  private async loadCandlesWithCache(symbol: string, interval: string): Promise<OHLCVCandle[]> {
    const cached = await this.idb.getCandles(symbol, interval);
    if (cached?.length) return cached;

    const data = await this.market.getCandles(symbol, interval).toPromise() ?? [];
    if (data.length) await this.idb.saveCandles(symbol, interval, data);
    return data;
  }

  private renderChart(data: OHLCVCandle[]) {
    if (!this.chart) return;

    // Remove all existing series
    this.clearSeries();

    const chartData = data.map(c => ({
      time:   c.time as Time,
      open:   c.open, high: c.high, low: c.low, close: c.close,
    }));
    const volumeData = data.map(c => ({
      time:  c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0,217,126,0.4)' : 'rgba(255,51,85,0.4)',
    }));

    const ct = this.chartType();

    if (ct === 'candlestick') {
      this.candleSeries = this.chart.addCandlestickSeries( {
        upColor:    '#00d97e', downColor: '#ff3355',
        borderUpColor: '#00d97e', borderDownColor: '#ff3355',
        wickUpColor: '#00d97e', wickDownColor: '#ff3355',
      });
      this.candleSeries.setData(chartData);
    } else if (ct === 'line') {
      this.lineSeries = this.chart.addLineSeries( {
        color: '#ff9500', lineWidth: 2, crosshairMarkerVisible: true,
      });
      this.lineSeries.setData(data.map(c => ({ time: c.time as Time, value: c.close })));
    } else if (ct === 'area') {
      this.areaSeries = this.chart.addAreaSeries( {
        topColor:    'rgba(255,149,0,0.4)',
        bottomColor: 'rgba(255,149,0,0.0)',
        lineColor:   '#ff9500', lineWidth: 2,
      });
      this.areaSeries.setData(data.map(c => ({ time: c.time as Time, value: c.close })));
    }

    // Volume
    const volEnabled = this.indicators.find(i => i.id === 'vol')?.enabled;
    if (volEnabled) {
      this.volumeSeries = this.chart.addHistogramSeries( {
        color: 'rgba(255,149,0,0.3)', priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      this.chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, borderVisible: false });
      this.volumeSeries.setData(volumeData);
    }

    this.lastCandleTime = data[data.length - 1]?.time ?? 0;

    this.chart.timeScale().fitContent();

    // Apply active overlay indicators
    this.applyOverlayIndicators();
  }

  private async applyOverlayIndicators() {
    const symbol   = this.currentSymbol();
    const interval = this.currentInterval();
    const activeMainInds = this.indicators.filter(i => i.enabled && i.panel === 'main' && i.id !== 'vol');
    if (!activeMainInds.length) return;

    const indNames = activeMainInds.map(i => i.id);
    const inds = await this.market.getIndicators(symbol, interval === 'D' ? 'daily' : '1day', indNames).toPromise();
    if (!inds) return;

    if (inds.ema20?.length && this.chart) {
      this.ema20Series = this.chart.addLineSeries( { color: '#f59e0b', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      this.ema20Series.setData(inds.ema20.map(p => ({ time: p.time as Time, value: p.value })));
    }
    if (inds.ema50?.length && this.chart) {
      this.ema50Series = this.chart.addLineSeries( { color: '#3b82f6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      this.ema50Series.setData(inds.ema50.map(p => ({ time: p.time as Time, value: p.value })));
    }
    if (inds.ema200?.length && this.chart) {
      this.ema200Series = this.chart.addLineSeries( { color: '#8b5cf6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      this.ema200Series.setData(inds.ema200.map(p => ({ time: p.time as Time, value: p.value })));
    }
    if (inds.bb?.length && this.chart) {
      this.bb_upperSeries = this.chart.addLineSeries( { color: 'rgba(99,102,241,0.6)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      this.bb_upperSeries.setData(inds.bb.map(p => ({ time: p.time as Time, value: p.upper })));
      this.bb_lowerSeries = this.chart.addLineSeries( { color: 'rgba(99,102,241,0.6)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      this.bb_lowerSeries.setData(inds.bb.map(p => ({ time: p.time as Time, value: p.lower })));
    }
  }

  private async loadIndicators(indIds: string[]) {
    const symbol   = this.currentSymbol();
    const interval = this.currentInterval() === 'D' ? 'daily' : '1day';
    const subInds  = this.indicators.filter(i => i.panel === 'sub' && i.enabled);
    if (!subInds.length || !this.subChartContainer?.nativeElement) return;

    // Init sub-chart if needed
    if (!this.subChart) {
      this.subChart = createChart(this.subChartContainer.nativeElement, ({
        layout:       { background: { type: ColorType.Solid, color: '#060a14' }, textColor: '#8da0bc' },
        grid:         { vertLines: { color: '#0f1e33' }, horzLines: { color: '#0f1e33' } },
        timeScale:    { borderColor: '#1a2840' },
        rightPriceScale: { borderColor: '#1a2840', scaleMargins: { top: 0.1, bottom: 0.1 } },
        height: 120,
      }) as any);
    }

    const inds = await this.market.getIndicators(symbol, interval, subInds.map(i => i.id)).toPromise();
    if (!inds) return;

    if (inds.rsi?.length && this.subChart) {
      this.activeSubIndicator.set('rsi');
      this.rsiSeries = this.subChart!.addLineSeries( { color: '#00d4ff', lineWidth: 1 });
      this.rsiSeries.setData(inds.rsi.map(p => ({ time: p.time as Time, value: p.value })));
      // Overbought/oversold lines
      [70, 30].forEach(level => {
        const ls = this.subChart!.addLineSeries( { color: 'rgba(255,51,85,0.3)', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
        ls.setData(inds.rsi!.map(p => ({ time: p.time as Time, value: level })));
      });
    } else if (inds.macd?.length && this.subChart) {
      this.activeSubIndicator.set('macd');
      this.macdSeries  = this.subChart!.addLineSeries( { color: '#00d4ff', lineWidth: 1 });
      this.macdSignal  = this.subChart!.addLineSeries( { color: '#ff9500', lineWidth: 1 });
      this.macdHist    = this.subChart!.addHistogramSeries( {
        color: '#00d97e',
      });
      this.macdSeries.setData(inds.macd.map(p => ({ time: p.time as Time, value: p.macd })));
      this.macdSignal.setData(inds.macd.map(p => ({ time: p.time as Time, value: p.signal })));
      this.macdHist.setData(inds.macd.map(p => ({ time: p.time as Time, value: p.histogram, color: p.histogram >= 0 ? '#00d97e' : '#ff3355' })));
    }
  }

  private updateLastCandle(price: number, volume: number) {
    if (!this.chart || !this.candleSeries) return;
    const now = Math.floor(Date.now() / 1000);
    const cs  = this.candles();
    const last = cs[cs.length - 1];
    if (!last) return;

    const updated: CandlestickData = {
      time:  last.time as Time,
      open:  last.open,
      high:  Math.max(last.high, price),
      low:   Math.min(last.low,  price),
      close: price,
    };
    this.candleSeries.update(updated);

    if (this.volumeSeries) {
      this.volumeSeries.update({
        time:  last.time as Time,
        value: volume,
        color: price >= last.open ? 'rgba(0,217,126,0.4)' : 'rgba(255,51,85,0.4)',
      });
    }
  }

  private clearSeries() {
    [
      this.candleSeries, this.lineSeries, this.areaSeries,
      this.volumeSeries, this.ema20Series, this.ema50Series, this.ema200Series,
      this.bb_upperSeries, this.bb_lowerSeries,
    ].forEach(s => { if (s && this.chart) try { this.chart.removeSeries(s as any); } catch {} });
    this.candleSeries = this.lineSeries = this.areaSeries = this.volumeSeries =
    this.ema20Series  = this.ema50Series = this.ema200Series =
    this.bb_upperSeries = this.bb_lowerSeries = null;
  }

  async toggleIndicator(ind: IndicatorConfig) {
    ind.enabled = !ind.enabled;
    this.renderChart(this.candles());
    await this.loadIndicators(this.indicators.filter(i => i.enabled).map(i => i.id));
  }

  changeInterval(iv: TimeInterval) {
    activeInterval.set(iv);
    this.loadAll();
  }

  changeChartType(ct: ChartType) {
    this.chartType.set(ct);
    this.renderChart(this.candles());
  }

  fitContent()  { this.chart?.timeScale().fitContent(); }
  resetZoom()   { this.chart?.timeScale().resetTimeScale(); }
  addToWatchlist() { addNotification('info', `Added ${this.currentSymbol()} to watchlist`); }

  formatVolume(v: number): string {
    if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v/1e3).toFixed(2) + 'K';
    return v.toString();
  }

  formatMarketCap(v: number): string {
    if (v >= 1e12) return '$' + (v/1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v/1e9).toFixed(2)  + 'B';
    return '$' + (v/1e6).toFixed(2) + 'M';
  }

  recPct(val: number, r: RecommendationTrend): number {
    const total = r.buy + r.strongBuy + r.hold + r.sell + r.strongSell;
    return total > 0 ? (val / total) * 100 : 0;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.chart?.remove();
    this.subChart?.remove();
  }
}
