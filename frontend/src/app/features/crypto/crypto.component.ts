import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal, computed
} from '@angular/core';
import { CommonModule }     from '@angular/common';
import { FormsModule }      from '@angular/forms';
import { RouterLink }       from '@angular/router';
import { Subject, takeUntil, interval, switchMap } from 'rxjs';
import { CryptoService }    from '../../core/services/crypto.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { cryptoMarkets, cryptoGlobal, tickCache } from '../../core/signals/market.store';
import type { CryptoMarket, CryptoGlobalStats } from '../../core/models/crypto.model';

@Component({
  selector: 'app-crypto',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="crypto-shell">

  <!-- ── GLOBAL STATS BAR ─────────────────────────────────────────────── -->
  <div class="crypto-global">
    @if (global()) {
      <div class="cglo-stat"><span>MCAP</span><span class="mono">{{ fmt(global()!.totalMarketCap) }}</span>
        <span class="mono" [class.gain]="global()!.marketCapChange24h>0" [class.loss]="global()!.marketCapChange24h<0">
          {{ global()!.marketCapChange24h > 0 ? '+' : '' }}{{ global()!.marketCapChange24h | number:'1.2-2' }}%
        </span>
      </div>
      <div class="cglo-stat"><span>24H VOL</span><span class="mono">{{ fmt(global()!.totalVolume) }}</span></div>
      <div class="cglo-stat"><span>BTC.D</span><span class="mono accent">{{ global()!.btcDominance | number:'1.1-1' }}%</span></div>
      <div class="cglo-stat"><span>ETH.D</span><span class="mono" style="color:#3b82f6">{{ global()!.ethDominance | number:'1.1-1' }}%</span></div>
      <div class="cglo-stat"><span>COINS</span><span class="mono">{{ global()!.activeCryptocurrencies | number }}</span></div>
      <div class="cglo-stat"><span>DEFI VOL</span><span class="mono">{{ fmt(global()!.defiVolume) }}</span></div>
    }
  </div>

  <div class="crypto-body">

    <!-- ── LEFT: MARKET TABLE ──────────────────────────────────────────── -->
    <div class="crypto-left">
      <!-- Filters -->
      <div class="crypto-filters">
        <input class="bb-input" style="width:180px" placeholder="S Search coin..." [(ngModel)]="filterQuery" />
        <div class="bb-tabs" style="border:none">
          @for (t of tabs; track t) {
            <div class="bb-tabs__tab" [class.active]="activeTab === t" (click)="activeTab = t">{{ t }}</div>
          }
        </div>
        <div style="margin-left:auto;display:flex;gap:6px">
          <select class="bb-select" style="width:120px" [(ngModel)]="sortCol" (change)="sortBy(sortCol)">
            <option value="marketCapRank">Rank</option>
            <option value="currentPrice">Price</option>
            <option value="priceChangePct24h">24h %</option>
            <option value="marketCap">Market Cap</option>
            <option value="totalVolume">Volume</option>
          </select>
        </div>
      </div>

      <div class="crypto-table-wrap">
        <table class="bb-table">
          <thead>
            <tr>
              <th style="width:30px">#</th>
              <th style="text-align:left">Asset</th>
              <th>Price</th>
              <th>1h %</th>
              <th>24h %</th>
              <th>7d %</th>
              <th>Market Cap</th>
              <th>Volume 24h</th>
              <th style="width:100px">Sparkline 7d</th>
            </tr>
          </thead>
          <tbody>
            @for (c of filteredCoins(); track c.id) {
              <tr (click)="selectCoin(c)" [class.active]="selectedCoin()?.id === c.id">
                <td style="color:#4a5e7a;font-size:9px">{{ c.marketCapRank }}</td>
                <td style="text-align:left">
                  <div style="display:flex;align-items:center;gap:8px">
                    @if (c.image) {
                      <img [src]="c.image" width="18" height="18" style="border-radius:50%"
                        onerror="this.style.display='none'" />
                    }
                    <div>
                      <div class="mono accent" style="font-weight:700;font-size:11px">{{ c.symbol }}</div>
                      <div style="font-size:9px;color:#4a5e7a">{{ c.name }}</div>
                    </div>
                  </div>
                </td>
                <td class="mono">{{ '$' + formatPrice(c.currentPrice) }}</td>
                <td class="mono" style="font-size:10px;color:#4a5e7a">—</td>
                <td class="mono" [class.gain]="c.priceChangePct24h>0" [class.loss]="c.priceChangePct24h<0">
                  {{ c.priceChangePct24h > 0 ? '+' : '' }}{{ c.priceChangePct24h | number:'1.2-2' }}%
                </td>
                <td class="mono" [class.gain]="(c.priceChangePct7d??0)>0" [class.loss]="(c.priceChangePct7d??0)<0">
                  {{ c.priceChangePct7d != null ? ((c.priceChangePct7d>0?'+':'') + (c.priceChangePct7d | number:'1.2-2') + '%') : '-' }}
                </td>
                <td class="mono">{{ fmt(c.marketCap) }}</td>
                <td class="mono">{{ fmt(c.totalVolume) }}</td>
                <td>
                  @if (c.sparkline?.length) {
                    <svg [attr.viewBox]="'0 0 100 30'" width="100" height="30">
                      <polyline
                        [attr.points]="sparklinePoints(c.sparkline!)"
                        fill="none"
                        [attr.stroke]="c.priceChangePct7d! >= 0 ? '#00d97e' : '#ff3355'"
                        stroke-width="1.5" />
                    </svg>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── RIGHT: COIN DETAIL ──────────────────────────────────────────── -->
    <div class="crypto-right">
      @if (selectedCoin()) {
        <div class="coin-detail">
          <div class="coin-header">
            @if (selectedCoin()!.image) {
              <img [src]="selectedCoin()!.image" width="32" height="32" style="border-radius:50%" />
            }
            <div>
              <div class="coin-header__name">{{ selectedCoin()!.name }}</div>
              <div class="coin-header__sym accent mono">{{ selectedCoin()!.symbol }} / USDT</div>
            </div>
            <div style="margin-left:auto;text-align:right">
              <div class="mono" style="font-size:20px;color:#d4e0f5;font-weight:600">{{ '$' +  formatPrice(selectedCoin()!.currentPrice)  }}</div>
              <div class="mono" style="font-size:12px" [class.gain]="selectedCoin()!.priceChangePct24h>0" [class.loss]="selectedCoin()!.priceChangePct24h<0">
                {{ selectedCoin()!.priceChangePct24h>0?'+':'' }}{{ selectedCoin()!.priceChangePct24h | number:'1.2-2' }}%
              </div>
            </div>
          </div>

          <!-- OHLC stats -->
          <div class="coin-ohlc">
            <div class="coin-ohlc__item"><span>24H HIGH</span><span class="mono gain">{{ '$' +  formatPrice(selectedCoin()!.high24h)  }}</span></div>
            <div class="coin-ohlc__item"><span>24H LOW</span><span class="mono loss">{{ '$' +  formatPrice(selectedCoin()!.low24h)  }}</span></div>
            <div class="coin-ohlc__item"><span>24H VOL</span><span class="mono">{{ fmt(selectedCoin()!.totalVolume) }}</span></div>
            <div class="coin-ohlc__item"><span>SUPPLY</span><span class="mono">{{ (selectedCoin()!.circulatingSupply | number:'1.0-0') }}</span></div>
            @if (selectedCoin()!.ath) {
              <div class="coin-ohlc__item"><span>ATH</span><span class="mono accent">{{ '$' +  formatPrice(selectedCoin()!.ath!)  }}</span></div>
            }
            @if (selectedCoin()!.maxSupply) {
              <div class="coin-ohlc__item"><span>MAX SUPPLY</span><span class="mono">{{ (selectedCoin()!.maxSupply! | number:'1.0-0') }}</span></div>
            }
          </div>

          <!-- Order Book -->
          @if (orderBook()) {
            <div class="order-book">
              <div class="bb-panel__header">ORDER BOOK</div>
              <div class="ob-body">
                <div class="ob-side">
                  <div class="ob-header"><span>BID PRICE</span><span>SIZE</span><span>TOTAL</span></div>
                  @for (b of orderBook()!.bids.slice(0,8); track b.price) {
                    <div class="ob-row ob-row--bid"
                      [style.background]="'rgba(0,217,126,' + depthPct(b.total, orderBook()!.bids) * 0.3 + ')'">
                      <span class="mono gain">{{ b.price | number:'1.2-8' }}</span>
                      <span class="mono">{{ b.quantity | number:'1.4-4' }}</span>
                      <span class="mono">{{ b.total | number:'1.2-2' }}</span>
                    </div>
                  }
                </div>
                <div class="ob-spread">
                  SPREAD {{ orderBook()!.spread | number:'1.4-8' }} ({{ orderBook()!.spreadPct | number:'1.4-4' }}%)
                </div>
                <div class="ob-side">
                  <div class="ob-header"><span>ASK PRICE</span><span>SIZE</span><span>TOTAL</span></div>
                  @for (a of orderBook()!.asks.slice(0,8); track a.price) {
                    <div class="ob-row ob-row--ask"
                      [style.background]="'rgba(255,51,85,' + depthPct(a.total, orderBook()!.asks) * 0.3 + ')'">
                      <span class="mono loss">{{ a.price | number:'1.2-8' }}</span>
                      <span class="mono">{{ a.quantity | number:'1.4-4' }}</span>
                      <span class="mono">{{ a.total | number:'1.2-2' }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="coin-empty">
          <span>B</span>
          <span>Select a coin</span>
        </div>
      }
    </div>
  </div>
</div>
  `,
  styleUrl: './crypto.component.scss',
})
export class CryptoComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  readonly cryptoMarkets = cryptoMarkets;
  readonly global        = cryptoGlobal;

  selectedCoin = signal<CryptoMarket | null>(null);
  orderBook    = signal<any>(null);
  filterQuery  = '';
  activeTab    = 'ALL';
  sortCol      = 'marketCapRank';
  sortDir      = 1;
  tabs         = ['ALL','TOP 100','DeFi','L1/L2','TRENDING'];

  filteredCoins = computed(() => {
    let coins = cryptoMarkets();
    if (this.filterQuery) {
      const q = this.filterQuery.toLowerCase();
      coins = coins.filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    return [...coins].sort((a: any, b: any) => {
      const av = a[this.sortCol] ?? 0;
      const bv = b[this.sortCol] ?? 0;
      return (av - bv) * this.sortDir;
    }).slice(0, 100);
  });

  constructor(
    private crypto: CryptoService,
    private ws:     WebSocketService,
    private cdr:    ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadMarkets();
    this.crypto.getGlobalStats().pipe(takeUntil(this.destroy$)).subscribe();

    // Subscribe to top crypto via WS
    this.ws.subscribeCrypto(['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','ADAUSDT','XRPUSDT','DOTUSDT','AVAXUSDT','MATICUSDT','LINKUSDT']);

    interval(30_000).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadMarkets());
  }

  private loadMarkets() {
    this.crypto.getMarkets(undefined, 100).pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  selectCoin(coin: CryptoMarket) {
    this.selectedCoin.set(coin);
    this.orderBook.set(null);
    // Load order book
    const sym = coin.symbol.replace('USDT', '');
    this.crypto.getOrderBook(sym).pipe(takeUntil(this.destroy$)).subscribe(ob => {
      this.orderBook.set(ob);
      this.cdr.markForCheck();
    });
    // Subscribe WS
    this.ws.subscribeCrypto([coin.symbol + 'USDT']);
  }

  sortBy(col: string) {
    if (this.sortCol === col) this.sortDir *= -1;
    else { this.sortCol = col; this.sortDir = col === 'marketCapRank' ? 1 : -1; }
  }

  depthPct(total: number, side: any[]): number {
    const max = Math.max(...side.map(x => x.total));
    return max > 0 ? total / max : 0;
  }

  sparklinePoints(data: number[]): string {
    if (!data?.length) return '';
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 30 - ((v - min) / range) * 28;
      return `${x},${y}`;
    }).join(' ');
  }

  formatPrice(p: number): string {
    if (!p) return '0';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    if (p >= 0.01) return p.toFixed(6);
    return p.toFixed(8);
  }

  fmt(v: number): string {
    if (v >= 1e12) return '$' + (v/1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6)  return '$' + (v/1e6).toFixed(2) + 'M';
    return '$' + v.toFixed(0);
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
