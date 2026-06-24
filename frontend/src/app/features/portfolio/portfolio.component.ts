import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ChangeDetectionStrategy,
  ChangeDetectorRef, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { RouterLink }   from '@angular/router';
import {
  createChart, IChartApi, ColorType
} from 'lightweight-charts';
import { Subject, takeUntil, switchMap } from 'rxjs';
import { PortfolioService } from '../../core/services/portfolio.service';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  portfolioValue, portfolioList, activePortfolioId,
  tickCache, addNotification
} from '../../core/signals/market.store';
import type { PortfolioValue, Portfolio, Transaction } from '../../core/models/crypto.model';

type PanelTab = 'OVERVIEW' | 'POSITIONS' | 'TRANSACTIONS' | 'ALERTS' | 'ANALYTICS';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="port-shell">

  <!-- ══ LEFT SIDEBAR ══════════════════════════════════════════════════════ -->
  <div class="port-sidebar">
    <div class="port-sidebar__header">
      <span>PORTFOLIOS</span>
      <button class="bb-btn bb-btn--sm bb-btn--icon" (click)="showNewPortfolio = true">+</button>
    </div>

    @for (p of portfolioList(); track p.id) {
      <div class="port-sidebar__item" [class.active]="activePortfolioId() === p.id"
        (click)="selectPortfolio(p.id)">
        <div class="port-sidebar__item-name">{{ p.name }}</div>
        <div class="port-sidebar__item-meta">{{ p.positions.length }} positions · {{ p.currency }}</div>
      </div>
    }

    @if (showNewPortfolio) {
      <div class="port-new-form">
        <input class="bb-input" placeholder="Portfolio name" [(ngModel)]="newPortName" />
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="bb-btn bb-btn--primary bb-btn--sm" style="flex:1" (click)="createPortfolio()">Create</button>
          <button class="bb-btn bb-btn--sm" (click)="showNewPortfolio = false; newPortName = ''">✕</button>
        </div>
      </div>
    }
  </div>

  <!-- ══ MAIN CONTENT ══════════════════════════════════════════════════════ -->
  <div class="port-main">

    @if (portfolioValue()) {
      <!-- ── VALUE BANNER ─────────────────────────────────────────────── -->
      <div class="port-banner">
        <div class="port-banner__total">
          <div class="port-banner__label">TOTAL VALUE</div>
          <div class="port-banner__value mono">{{ '$' + (portfolioValue()!.totalValue | number:'1.2-2') }}</div>
        </div>
        <div class="port-banner__pnl">
          <div class="port-banner__label">TOTAL P&L</div>
          <div class="port-banner__pnlval mono" [class.gain]="portfolioValue()!.totalPnL > 0" [class.loss]="portfolioValue()!.totalPnL < 0">
            {{ portfolioValue()!.totalPnL > 0 ? '+' : '' }}{{ '$' + (portfolioValue()!.totalPnL | number:'1.2-2') }}
            ({{ portfolioValue()!.totalPnLPct > 0 ? '+' : '' }}{{ portfolioValue()!.totalPnLPct | number:'1.2-2' }}%)
          </div>
        </div>
        <div class="port-banner__day">
          <div class="port-banner__label">TODAY</div>
          <div class="port-banner__dayval mono" [class.gain]="portfolioValue()!.dayChange > 0" [class.loss]="portfolioValue()!.dayChange < 0">
            {{ portfolioValue()!.dayChange > 0 ? '+' : '' }}{{ '$' + (portfolioValue()!.dayChange | number:'1.2-2') }}
            ({{ portfolioValue()!.dayChangePct > 0 ? '+' : '' }}{{ portfolioValue()!.dayChangePct | number:'1.2-2' }}%)
          </div>
        </div>
        <div class="port-banner__cost">
          <div class="port-banner__label">COST BASIS</div>
          <div class="port-banner__value mono">{{ '$' + (portfolioValue()!.totalCost | number:'1.2-2') }}</div>
        </div>
        <div class="port-banner__actions">
          <button class="bb-btn" (click)="showBuyModal = true">+ BUY</button>
          <button class="bb-btn bb-btn--danger" (click)="showSellModal = true">- SELL</button>
        </div>
      </div>

      <!-- ── TABS ─────────────────────────────────────────────────────── -->
      <div class="bb-tabs" style="padding:0 16px;border-bottom:1px solid #1a2840">
        @for (t of tabs; track t) {
          <div class="bb-tabs__tab" [class.active]="activeTab === t" (click)="activeTab = t">{{ t }}</div>
        }
      </div>

      <!-- ── OVERVIEW ──────────────────────────────────────────────────── -->
      @if (activeTab === 'OVERVIEW') {
        <div class="port-overview">
          <div class="port-overview__chart-wrap">
            <div class="bb-panel__header">PORTFOLIO PERFORMANCE (90 DAYS)</div>
            <div #perfChart class="port-perf-chart"></div>
          </div>

          <div class="port-overview__breakdown">
            <!-- Allocation Pie -->
            <div class="bb-panel">
              <div class="bb-panel__header">ALLOCATION</div>
              <div class="bb-panel__body">
                <svg viewBox="0 0 160 160" width="160" height="160" style="display:block;margin:0 auto">
                  @for (slice of allocationSlices(); track slice.symbol; let i = $index) {
                    <path [attr.d]="slice.path" [attr.fill]="slice.color" opacity="0.85" />
                  }
                  <circle cx="80" cy="80" r="45" fill="#0c1322" />
                  <text x="80" y="77" text-anchor="middle" fill="#8da0bc" font-size="9" font-family="sans-serif">POSITIONS</text>
                  <text x="80" y="90" text-anchor="middle" fill="#ff9500" font-size="13" font-weight="700" font-family="monospace">{{ portfolioValue()!.positions.length }}</text>
                </svg>
                <div class="alloc-legend">
                  @for (slice of allocationSlices().slice(0,8); track slice.symbol) {
                    <div class="alloc-item">
                      <span class="alloc-dot" [style.background]="slice.color"></span>
                      <span class="alloc-sym">{{ slice.symbol }}</span>
                      <span class="alloc-pct mono">{{ slice.weight | number:'1.1-1' }}%</span>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Sector Breakdown -->
            <div class="bb-panel">
              <div class="bb-panel__header">BY SECTOR</div>
              <div class="bb-panel__body" style="padding:8px">
                @for (entry of sectorBreakdown(); track entry[0]) {
                  <div class="sector-alloc">
                    <span style="font-size:10px;color:#8da0bc;flex:1">{{ entry[0] }}</span>
                    <div class="sector-alloc__bar-wrap">
                      <div class="sector-alloc__bar"
                        [style.width.%]="(entry[1] / portfolioValue()!.totalValue) * 100">
                      </div>
                    </div>
                    <span class="mono" style="font-size:10px;min-width:50px;text-align:right">
                      {{ '$' + (entry[1] | number:'1.0-0') }}
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- ── POSITIONS ──────────────────────────────────────────────────── -->
      @if (activeTab === 'POSITIONS') {
        <div class="port-positions">
          <table class="bb-table">
            <thead><tr>
              <th>Symbol</th><th>Shares</th><th>Avg Cost</th><th>Price</th>
              <th>Value</th><th>Unreal P&L</th><th>Day Gain</th><th>Weight</th>
              <th>Sector</th><th></th>
            </tr></thead>
            <tbody>
              @for (pos of portfolioValue()!.positions; track pos.id) {
                <tr [routerLink]="['/chart', pos.symbol]">
                  <td>
                    <span class="accent mono" style="font-weight:700">{{ pos.symbol }}</span>
                    <span [class]="'asset-badge asset-badge--' + pos.assetType.toLowerCase()">{{ pos.assetType }}</span>
                  </td>
                  <td class="mono">{{ pos.shares | number:'1.0-8' }}</td>
                  <td class="mono">{{ '$' + (pos.avgCostBasis | number:'1.2-4') }}</td>
                  <td class="mono">{{ pos.currentPrice ? '$' + (pos.currentPrice | number:'1.2-4') : '—' }}</td>
                  <td class="mono">{{ '$' + ((pos.totalValue ?? 0) | number:'1.2-2') }}</td>
                  <td>
                    <div class="mono" [class.gain]="(pos.unrealizedPnL ?? 0) > 0" [class.loss]="(pos.unrealizedPnL ?? 0) < 0">
                      {{ (pos.unrealizedPnL ?? 0) > 0 ? '+' : '' }}{{ '$' + ((pos.unrealizedPnL ?? 0) | number:'1.2-2') }}
                    </div>
                    <div class="mono" style="font-size:9px" [class.gain]="(pos.unrealizedPct ?? 0) > 0" [class.loss]="(pos.unrealizedPct ?? 0) < 0">
                      {{ (pos.unrealizedPct ?? 0) > 0 ? '+' : '' }}{{ pos.unrealizedPct | number:'1.2-2' }}%
                    </div>
                  </td>
                  <td class="mono" [class.gain]="(pos.dayGain ?? 0) > 0" [class.loss]="(pos.dayGain ?? 0) < 0">
                    {{ (pos.dayGain ?? 0) > 0 ? '+' : '' }}{{ '$' + ((pos.dayGain ?? 0) | number:'1.2-2') }}
                  </td>
                  <td>
                    <div class="weight-bar">
                      <div class="weight-bar__fill" [style.width.%]="pos.weight ?? 0"></div>
                    </div>
                    <span class="mono" style="font-size:9px">{{ pos.weight | number:'1.1-1' }}%</span>
                  </td>
                  <td style="font-size:9px;color:#4a5e7a">{{ pos.sector || '—' }}</td>
                  <td>
                    <button class="bb-btn bb-btn--sm bb-btn--danger" (click)="$event.stopPropagation(); openSell(pos.symbol)">SELL</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ── TRANSACTIONS ───────────────────────────────────────────────── -->
      @if (activeTab === 'TRANSACTIONS') {
        <div class="port-transactions">
          <div class="trans-filters">
            <select class="bb-select" style="width:120px" [(ngModel)]="txFilter.type">
              <option value="">All Types</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
            </select>
            <input class="bb-input" style="width:140px" placeholder="Symbol" [(ngModel)]="txFilter.symbol" />
            <button class="bb-btn bb-btn--sm" (click)="loadTransactions()">Apply</button>
          </div>

          <table class="bb-table">
            <thead><tr>
              <th>Date</th><th>Type</th><th>Symbol</th>
              <th>Shares</th><th>Price</th><th>Total</th><th>Fees</th><th>Notes</th>
            </tr></thead>
            <tbody>
              @for (tx of transactions(); track tx.id) {
                <tr>
                  <td class="mono" style="font-size:10px">{{ tx.executedAt | date:'yyyy-MM-dd HH:mm' }}</td>
                  <td>
                    <span [class]="'tx-badge tx-badge--' + tx.type.toLowerCase()">{{ tx.type }}</span>
                  </td>
                  <td class="accent mono">{{ tx.symbol }}</td>
                  <td class="mono">{{ tx.shares | number:'1.0-8' }}</td>
                  <td class="mono">{{ '$' + (tx.price | number:'1.2-4') }}</td>
                  <td class="mono">{{ '$' + (tx.totalAmount | number:'1.2-2') }}</td>
                  <td class="mono" style="color:#4a5e7a">{{ '$' + (tx.fees | number:'1.2-2') }}</td>
                  <td style="font-size:10px;color:#8da0bc;max-width:120px;overflow:hidden;text-overflow:ellipsis">{{ tx.notes || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ── ANALYTICS ─────────────────────────────────────────────────── -->
      @if (activeTab === 'ANALYTICS') {
        <div class="port-analytics" style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="bb-panel">
            <div class="bb-panel__header">RETURN METRICS</div>
            <div class="bb-panel__body">
              <div class="analytics-row"><span>Total Return</span>
                <span class="mono" [class.gain]="portfolioValue()!.totalPnLPct>0" [class.loss]="portfolioValue()!.totalPnLPct<0">
                  {{ portfolioValue()!.totalPnLPct>0?'+':'' }}{{ portfolioValue()!.totalPnLPct | number:'1.2-2' }}%
                </span>
              </div>
              <div class="analytics-row"><span>Day Return</span>
                <span class="mono" [class.gain]="portfolioValue()!.dayChangePct>0" [class.loss]="portfolioValue()!.dayChangePct<0">
                  {{ portfolioValue()!.dayChangePct>0?'+':'' }}{{ portfolioValue()!.dayChangePct | number:'1.2-2' }}%
                </span>
              </div>
              <div class="analytics-row"><span>Total Invested</span><span class="mono">{{ '$' + (portfolioValue()!.totalCost | number:'1.2-2') }}</span></div>
              <div class="analytics-row"><span>Market Value</span><span class="mono">{{ '$' + (portfolioValue()!.totalValue | number:'1.2-2') }}</span></div>
              <div class="analytics-row"><span>Unrealized P&L</span>
                <span class="mono" [class.gain]="portfolioValue()!.totalPnL>0" [class.loss]="portfolioValue()!.totalPnL<0">
                  {{ '$' + (portfolioValue()!.totalPnL | number:'1.2-2') }}
                </span>
              </div>
            </div>
          </div>

          <div class="bb-panel">
            <div class="bb-panel__header">TOP PERFORMERS</div>
            <div class="bb-panel__body" style="padding:0">
              @for (pos of topPerformers(); track pos.symbol) {
                <div class="perf-row">
                  <span class="accent mono">{{ pos.symbol }}</span>
                  <span class="mono" [class.gain]="(pos.unrealizedPct ?? 0)>0" [class.loss]="(pos.unrealizedPct ?? 0)<0">
                    {{ (pos.unrealizedPct ?? 0)>0?'+':'' }}{{ pos.unrealizedPct | number:'1.2-2' }}%
                  </span>
                  <span class="mono" style="color:#4a5e7a">{{ '$' + ((pos.unrealizedPnL ?? 0) | number:'1.2-2') }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      }

    } @else {
      <div class="port-empty">
        <div class="port-empty__icon">o</div>
        <div class="port-empty__title">No Portfolio Selected</div>
        <div class="port-empty__sub">Create or select a portfolio to track your investments</div>
        <button class="bb-btn bb-btn--primary" (click)="showNewPortfolio = true">+ Create Portfolio</button>
      </div>
    }
  </div>

  <!-- ══ BUY MODAL ════════════════════════════════════════════════════════ -->
  @if (showBuyModal) {
    <div class="modal-overlay" (click)="showBuyModal = false">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal__header"><span>ADD TRANSACTION</span><button class="bb-btn bb-btn--icon" (click)="showBuyModal = false">✕</button></div>
        <div class="modal__body">
          <div class="form-row">
            <label>Type</label>
            <select class="bb-select" [(ngModel)]="newTx.type">
              <option>BUY</option><option>SELL</option><option>DIVIDEND</option>
            </select>
          </div>
          <div class="form-row">
            <label>Symbol</label>
            <input class="bb-input" [(ngModel)]="newTx.symbol" placeholder="AAPL" />
          </div>
          <div class="form-row">
            <label>Asset Type</label>
            <select class="bb-select" [(ngModel)]="newTx.assetType">
              <option>STOCK</option><option>CRYPTO</option><option>ETF</option>
            </select>
          </div>
          <div class="form-row">
            <label>Shares / Units</label>
            <input class="bb-input" type="number" step="0.00000001" [(ngModel)]="newTx.shares" placeholder="0" />
          </div>
          <div class="form-row">
            <label>Price per Share ($)</label>
            <input class="bb-input" type="number" step="0.0001" [(ngModel)]="newTx.price" placeholder="0.00" />
          </div>
          <div class="form-row">
            <label>Fees ($)</label>
            <input class="bb-input" type="number" step="0.01" [(ngModel)]="newTx.fees" placeholder="0.00" />
          </div>
          <div class="form-row">
            <label>Date</label>
            <input class="bb-input" type="datetime-local" [(ngModel)]="newTx.executedAt" />
          </div>
          <div class="form-row">
            <label>Notes</label>
            <input class="bb-input" [(ngModel)]="newTx.notes" placeholder="Optional notes..." />
          </div>
          <div class="modal__total">
            Total: <span class="mono accent">{{ '$' + ((newTx.shares * newTx.price + newTx.fees) | number:'1.2-2') }}</span>
          </div>
        </div>
        <div class="modal__footer">
          <button class="bb-btn" (click)="showBuyModal = false">Cancel</button>
          <button class="bb-btn bb-btn--primary" (click)="submitTransaction()" [disabled]="!newTx.symbol || !newTx.shares || !newTx.price">
            Confirm {{ newTx.type }}
          </button>
        </div>
      </div>
    </div>
  }

</div>
  `,
  styleUrls: ['./portfolio.component.scss']
})
export class PortfolioComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('perfChart', { static: false }) perfChartRef!: ElementRef<HTMLDivElement>;

  private destroy$ = new Subject<void>();
  private perfChart: IChartApi | null = null;

  readonly portfolioValue  = portfolioValue;
  readonly portfolioList   = portfolioList;
  readonly activePortfolioId = activePortfolioId;

  transactions = signal<Transaction[]>([]);
  loading      = signal(false);
  showNewPortfolio = false;
  showBuyModal  = false;
  showSellModal = false;
  newPortName   = '';
  activeTab: PanelTab = 'OVERVIEW';
  tabs: PanelTab[]    = ['OVERVIEW','POSITIONS','TRANSACTIONS','ANALYTICS'];
  txFilter = { type: '', symbol: '' };

  newTx = {
    type: 'BUY', symbol: '', assetType: 'STOCK',
    shares: 0, price: 0, fees: 0,
    executedAt: new Date().toISOString().slice(0, 16),
    notes: '',
  };

  allocationSlices = computed(() => {
    const pv = portfolioValue();
    if (!pv?.positions.length) return [];
    const colors = ['#ff9500','#00d4ff','#00d97e','#3b82f6','#8b5cf6','#f59e0b','#ec4899','#14b8a6'];
    const total = pv.totalValue;
    let cumAngle = -Math.PI / 2;
    return pv.positions.map((pos, i) => {
      const weight = pos.totalValue ? pos.totalValue / total : 0;
      const angle  = weight * 2 * Math.PI;
      const x1 = 80 + 70 * Math.cos(cumAngle);
      const y1 = 80 + 70 * Math.sin(cumAngle);
      cumAngle += angle;
      const x2 = 80 + 70 * Math.cos(cumAngle);
      const y2 = 80 + 70 * Math.sin(cumAngle);
      const large = angle > Math.PI ? 1 : 0;
      return {
        symbol: pos.symbol,
        weight: (weight * 100),
        color:  colors[i % colors.length],
        path: weight > 0.005
          ? `M80,80 L${x1},${y1} A70,70 0 ${large},1 ${x2},${y2} Z`
          : '',
      };
    }).filter(s => s.path);
  });

  sectorBreakdown = computed(() => {
    const pv = portfolioValue();
    if (!pv) return [];
    return Object.entries(pv.sectorBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  });

  topPerformers = computed(() => {
    const pv = portfolioValue();
    if (!pv) return [];
    return [...pv.positions].sort((a, b) => (b.unrealizedPct ?? 0) - (a.unrealizedPct ?? 0)).slice(0, 8);
  });

  constructor(private ps: PortfolioService, private ws: WebSocketService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.ps.getPortfolios().pipe(takeUntil(this.destroy$)).subscribe(ports => {
      if (ports.length > 0 && !activePortfolioId()) {
        this.selectPortfolio(ports[0].id);
      }
      this.cdr.markForCheck();
    });
  }

  ngAfterViewInit() {
    if (activePortfolioId()) this.initPerfChart();
  }

  selectPortfolio(id: string) {
    activePortfolioId.set(id);
    this.ps.getPortfolioValue(id).pipe(takeUntil(this.destroy$)).subscribe(pv => {
      if (pv) {
        // Subscribe to all position symbols via WS
        const stocks = pv.positions.filter(p => p.assetType === 'STOCK').map(p => p.symbol);
        const crypto = pv.positions.filter(p => p.assetType === 'CRYPTO').map(p => p.symbol);
        if (stocks.length) this.ws.subscribeStock(stocks);
        if (crypto.length) this.ws.subscribeCrypto(crypto);
      }
      this.cdr.markForCheck();
      setTimeout(() => this.initPerfChart(), 100);
    });
    this.loadTransactions();
  }

  private initPerfChart() {
    if (!this.perfChartRef?.nativeElement) return;
    this.perfChart?.remove();
    this.perfChart = createChart(this.perfChartRef.nativeElement, {
      layout: { background: { type: ColorType.Solid, color: '#060a14' }, textColor: '#8da0bc' },
      grid:   { vertLines: { color: '#0f1e33' }, horzLines: { color: '#0f1e33' } },
      timeScale: { borderColor: '#1a2840', timeVisible: true },
      rightPriceScale: { borderColor: '#1a2840', scaleMargins: { top: 0.1, bottom: 0.1 } },
      height: 200,
    });

    const areaSeries = this.perfChart?.addAreaSeries( {
      topColor:    'rgba(255,149,0,0.4)',
      bottomColor: 'rgba(255,149,0,0.0)',
      lineColor:   '#ff9500', lineWidth: 2,
    });

    // Generate mock performance data from snapshots
    const pv = portfolioValue();
    if (pv) {
      const days = 90;
      const baseValue = pv.totalValue * 0.85;
      const data = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        const noise = (Math.random() - 0.45) * 0.02;
        const trend = (i / days) * 0.15;
        return {
          time: Math.floor(date.getTime() / 1000) as any,
          value: baseValue * (1 + trend + noise),
        };
      });
      areaSeries.setData(data);
      this.perfChart.timeScale().fitContent();
    }
  }

  loadTransactions() {
    const id = activePortfolioId();
    if (!id) return;
    this.ps.getTransactions(id, this.txFilter).pipe(takeUntil(this.destroy$))
      .subscribe(({ data }) => { this.transactions.set(data); this.cdr.markForCheck(); });
  }

  createPortfolio() {
    if (!this.newPortName.trim()) return;
    this.ps.createPortfolio(this.newPortName.trim()).pipe(takeUntil(this.destroy$)).subscribe(p => {
      if (p) { this.showNewPortfolio = false; this.newPortName = ''; addNotification('info', `Portfolio "${p.name}" created`); }
    });
  }

  openSell(symbol: string) {
    this.newTx = { ...this.newTx, type: 'SELL', symbol };
    this.showBuyModal = true;
  }

  submitTransaction() {
    const id = activePortfolioId();
    if (!id) return;
    this.ps.addTransaction({ ...this.newTx, portfolioId: id }).pipe(takeUntil(this.destroy$)).subscribe(tx => {
      if (tx) {
        addNotification('info', `${this.newTx.type} ${this.newTx.shares} ${this.newTx.symbol} recorded`);
        this.showBuyModal = false;
        this.selectPortfolio(id);
        this.newTx = { type: 'BUY', symbol: '', assetType: 'STOCK', shares: 0, price: 0, fees: 0, executedAt: new Date().toISOString().slice(0, 16), notes: '' };
      }
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); this.perfChart?.remove(); }
}
