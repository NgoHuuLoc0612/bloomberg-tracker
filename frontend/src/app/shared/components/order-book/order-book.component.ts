import {
  Component, Input, OnChanges, OnDestroy, SimpleChanges,
  ChangeDetectionStrategy, ChangeDetectorRef, signal, computed
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { Subject, takeUntil, interval, switchMap } from 'rxjs';
import { CryptoService } from '../../../core/services/crypto.service';

interface OrderBookEntry { price: number; quantity: number; total: number; }
interface OrderBook {
  symbol: string; bids: OrderBookEntry[]; asks: OrderBookEntry[];
  spread: number; spreadPct: number; bestBid: number; bestAsk: number;
}

@Component({
  selector: 'app-order-book',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
<div class="ob">
  <div class="ob__header">
    <span class="ob__title">ORDER BOOK · {{ symbol }}</span>
    @if (book()) {
      <span class="ob__spread mono">
        SPREAD {{ book()!.spread | number:'1.2-8' }}
        ({{ book()!.spreadPct | number:'1.4-4' }}%)
      </span>
    }
  </div>

  @if (!book()) {
    <div class="ob__loading">Loading order book...</div>
  } @else {
    <div class="ob__cols">
      <!-- ASKS (top, reversed — lowest ask at bottom nearest spread) -->
      <div class="ob__side ob__side--ask">
        <div class="ob__col-header">
          <span>PRICE (USDT)</span><span>SIZE</span><span>TOTAL</span>
        </div>
        @for (a of asksReversed(); track a.price) {
          <div class="ob__row ob__row--ask"
            [class.ob__row--best]="a.price === book()!.bestAsk"
            [style.background]="depthBg(a.total, maxAskTotal(), 'rgba(255,51,85,')">
            <span class="mono loss">{{ a.price | number:'1.2-8' }}</span>
            <span class="mono">{{ a.quantity | number:'1.4-6' }}</span>
            <span class="mono">{{ a.total | number:'1.2-2' }}</span>
          </div>
        }
      </div>

      <!-- SPREAD LINE -->
      <div class="ob__spread-line">
        <span class="mono accent">{{ book()!.bestAsk | number:'1.2-8' }}</span>
        <span class="ob__spread-badge">SPREAD {{ book()!.spread | number:'1.4-8' }}</span>
        <span class="mono accent">{{ book()!.bestBid | number:'1.2-8' }}</span>
      </div>

      <!-- BIDS -->
      <div class="ob__side ob__side--bid">
        <div class="ob__col-header">
          <span>PRICE (USDT)</span><span>SIZE</span><span>TOTAL</span>
        </div>
        @for (b of book()!.bids.slice(0, depth); track b.price) {
          <div class="ob__row ob__row--bid"
            [class.ob__row--best]="b.price === book()!.bestBid"
            [style.background]="depthBg(b.total, maxBidTotal(), 'rgba(0,217,126,')">
            <span class="mono gain">{{ b.price | number:'1.2-8' }}</span>
            <span class="mono">{{ b.quantity | number:'1.4-6' }}</span>
            <span class="mono">{{ b.total | number:'1.2-2' }}</span>
          </div>
        }
      </div>
    </div>

    <!-- Depth Visualization -->
    <div class="ob__depth">
      <div class="ob__depth-label">CUMULATIVE DEPTH</div>
      <div class="ob__depth-bars">
        <div class="ob__depth-bid"
          [style.width.%]="bidDepthPct()">
          <span class="mono" style="font-size:9px;padding:0 4px">{{ totalBidLiquidity() | number:'1.0-0' }}</span>
        </div>
        <div class="ob__depth-ask"
          [style.width.%]="askDepthPct()">
          <span class="mono" style="font-size:9px;padding:0 4px">{{ totalAskLiquidity() | number:'1.0-0' }}</span>
        </div>
      </div>
    </div>
  }
</div>
  `,
  styles: [`
    .ob { display:flex;flex-direction:column;height:100%;background:#060a14;overflow:hidden; }
    .ob__header { display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#0c1322;border-bottom:1px solid #1a2840;flex-shrink:0; }
    .ob__title  { font-size:9px;font-weight:700;letter-spacing:1.5px;color:#4a5e7a;text-transform:uppercase; }
    .ob__spread { font-size:9px;color:#4a5e7a; }
    .ob__loading{ display:flex;align-items:center;justify-content:center;flex:1;color:#4a5e7a;font-size:11px; }
    .ob__cols   { display:flex;flex-direction:column;flex:1;overflow:hidden; }
    .ob__side   { overflow-y:auto;flex:1; }
    .ob__side::-webkit-scrollbar { width:3px; }
    .ob__side::-webkit-scrollbar-thumb { background:#1e3555; }
    .ob__col-header { display:grid;grid-template-columns:1fr 1fr 1fr;padding:3px 10px;font-size:8px;font-weight:700;letter-spacing:1px;color:#4a5e7a;text-transform:uppercase;border-bottom:1px solid #1a2840;position:sticky;top:0;background:#060a14;z-index:1; }
    .ob__col-header span:not(:first-child) { text-align:right; }
    .ob__row { display:grid;grid-template-columns:1fr 1fr 1fr;padding:2px 10px;font-size:10px;border-bottom:1px solid #0a1220;transition:filter 100ms;cursor:default;position:relative; }
    .ob__row:hover { filter:brightness(1.25); }
    .ob__row--best { outline:1px solid rgba(255,149,0,0.3); }
    .ob__row span:not(:first-child) { text-align:right; }
    .ob__spread-line { display:flex;flex-direction:column;align-items:center;padding:4px;background:#0c1322;border-top:1px solid #1a2840;border-bottom:1px solid #1a2840;gap:2px;flex-shrink:0; }
    .ob__spread-badge { font-size:8px;letter-spacing:1px;color:#4a5e7a;text-transform:uppercase; }
    .ob__depth { padding:6px 10px;border-top:1px solid #1a2840;flex-shrink:0; }
    .ob__depth-label { font-size:8px;font-weight:700;letter-spacing:1px;color:#4a5e7a;text-transform:uppercase;margin-bottom:4px; }
    .ob__depth-bars { display:flex;height:16px;border-radius:2px;overflow:hidden;gap:1px; }
    .ob__depth-bid  { background:rgba(0,217,126,0.3);border-radius:2px 0 0 2px;display:flex;align-items:center;color:#00d97e;min-width:2px;transition:width 300ms ease; }
    .ob__depth-ask  { background:rgba(255,51,85,0.3);border-radius:0 2px 2px 0;display:flex;align-items:center;justify-content:flex-end;color:#ff3355;min-width:2px;transition:width 300ms ease; }
    .gain{color:#00d97e} .loss{color:#ff3355} .accent{color:#ff9500}
    .mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'}
  `]
})
export class OrderBookComponent implements OnChanges, OnDestroy {
  @Input() symbol = 'BTC';
  @Input() depth  = 12;
  @Input() autoRefresh = true;

  private destroy$ = new Subject<void>();
  book = signal<OrderBook | null>(null);

  asksReversed = computed(() => {
    const b = this.book();
    return b ? [...b.asks.slice(0, this.depth)].reverse() : [];
  });

  maxBidTotal = computed(() => {
    const b = this.book();
    return b?.bids.length ? Math.max(...b.bids.slice(0, this.depth).map(x => x.total)) : 1;
  });

  maxAskTotal = computed(() => {
    const b = this.book();
    return b?.asks.length ? Math.max(...b.asks.slice(0, this.depth).map(x => x.total)) : 1;
  });

  totalBidLiquidity = computed(() => this.book()?.bids.slice(0,this.depth).reduce((s,b) => s + b.total, 0) ?? 0);
  totalAskLiquidity = computed(() => this.book()?.asks.slice(0,this.depth).reduce((s,a) => s + a.total, 0) ?? 0);

  bidDepthPct = computed(() => {
    const b = this.totalBidLiquidity(), a = this.totalAskLiquidity();
    return b + a > 0 ? (b / (b + a)) * 100 : 50;
  });
  askDepthPct = computed(() => 100 - this.bidDepthPct());

  constructor(private crypto: CryptoService, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['symbol']) this.load();
  }

  private load() {
    if (!this.symbol) return;
    this.crypto.getOrderBook(this.symbol, this.depth).pipe(
      takeUntil(this.destroy$)
    ).subscribe((ob: any) => { this.book.set(ob); this.cdr.markForCheck(); });

    if (this.autoRefresh) {
      interval(2000).pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.crypto.getOrderBook(this.symbol, this.depth))
      ).subscribe((ob: any) => { this.book.set(ob); this.cdr.markForCheck(); });
    }
  }

  depthBg(total: number, max: number, colorPrefix: string): string {
    const pct = max > 0 ? total / max : 0;
    return `${colorPrefix}${(pct * 0.25).toFixed(3)})`;
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
