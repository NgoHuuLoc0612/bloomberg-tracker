import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal, computed
} from '@angular/core';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { RouterLink }      from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PortfolioService } from '../../core/services/portfolio.service';
import { MarketService }    from '../../core/services/market.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { watchlists, tickCache, addNotification } from '../../core/signals/market.store';

@Component({
  selector: 'app-watchlist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="wl-shell">
  <!-- ── SIDEBAR ──────────────────────────────────────────────────────── -->
  <div class="wl-sidebar">
    <div class="wl-sidebar__header">
      <span>WATCHLISTS</span>
      <button class="bb-btn bb-btn--icon bb-btn--sm" (click)="showNew = !showNew" title="New Watchlist">+</button>
    </div>

    @if (showNew) {
      <div class="wl-new-form">
        <input class="bb-input" placeholder="Watchlist name..." [(ngModel)]="newName"
          (keydown.enter)="createWatchlist()" (keydown.escape)="showNew=false; newName=''" />
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="bb-btn bb-btn--primary bb-btn--sm" style="flex:1" (click)="createWatchlist()"
            [disabled]="!newName.trim()">Create</button>
          <button class="bb-btn bb-btn--sm" (click)="showNew=false; newName=''">Cancel</button>
        </div>
      </div>
    }

    @for (wl of watchlists(); track wl.id) {
      <div class="wl-sidebar__item" [class.active]="activeId === wl.id" (click)="selectList(wl)">
        <div class="wl-sidebar__item-name">{{ wl.name }}</div>
        <div class="wl-sidebar__item-meta">
          {{ wl.symbols?.length || 0 }} symbols
          @if (wl.isDefault) { <span class="wl-default-badge">DEFAULT</span> }
        </div>
      </div>
    }

    @if (watchlists().length === 0 && !showNew) {
      <div class="wl-sidebar__empty">
        <span>No watchlists yet</span>
      </div>
    }
  </div>

  <!-- ── MAIN ─────────────────────────────────────────────────────────── -->
  <div class="wl-main">
    @if (activeId) {
      <!-- Toolbar -->
      <div class="wl-toolbar">
        <div class="wl-add-form">
          <input class="bb-input" style="width:180px" placeholder="S Add symbol (AAPL, BTC...)..."
            [(ngModel)]="addSymbol" (keydown.enter)="addToWatchlist()"
            (keydown.escape)="addSymbol=''" />
          <select class="bb-select" style="width:100px" [(ngModel)]="addAssetType">
            <option value="STOCK">STOCK</option>
            <option value="CRYPTO">CRYPTO</option>
            <option value="ETF">ETF</option>
            <option value="FOREX">FOREX</option>
          </select>
          <button class="bb-btn bb-btn--primary bb-btn--sm" (click)="addToWatchlist()"
            [disabled]="!addSymbol.trim()">+ ADD</button>
        </div>

        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <span class="wl-count">{{ enrichedItems().length }} symbols</span>
          <button class="bb-btn bb-btn--sm" (click)="refreshQuotes()" title="Refresh">↻ Refresh</button>
        </div>
      </div>

      <!-- Table -->
      <div class="wl-table-wrap">
        @if (loading()) {
          <div class="wl-loading">
            <div class="wl-spinner"></div>
            Loading quotes...
          </div>
        } @else if (enrichedItems().length === 0) {
          <div class="wl-empty">
            <div class="wl-empty__icon">*</div>
            <div class="wl-empty__title">Watchlist is empty</div>
            <div class="wl-empty__sub">Add symbols using the search box above</div>
          </div>
        } @else {
          <table class="bb-table">
            <thead>
              <tr>
                <th style="text-align:left">Symbol</th>
                <th style="text-align:left">Name</th>
                <th>Price</th>
                <th>Change</th>
                <th>% Change</th>
                <th>Volume</th>
                <th>Market Cap</th>
                <th>52W High</th>
                <th>52W Low</th>
                <th>P/E</th>
                <th>Type</th>
                <th style="width:60px"></th>
              </tr>
            </thead>
            <tbody>
              @for (item of enrichedItems(); track item.symbol) {
                <tr [routerLink]="['/chart', item.symbol]"
                  [class.wl-row--flash-gain]="flashedGain.has(item.symbol)"
                  [class.wl-row--flash-loss]="flashedLoss.has(item.symbol)">
                  <td style="text-align:left">
                    <span class="mono accent" style="font-weight:700;font-size:12px">{{ item.symbol }}</span>
                  </td>
                  <td style="text-align:left;max-width:160px">
                    <span style="font-size:10px;color:#8da0bc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">
                      {{ item.quote?.companyName || item.displayName || '—' }}
                    </span>
                  </td>
                  <td class="mono" style="font-size:12px;font-weight:500">
                    {{ item.quote ? '$' + fmtPrice(item.quote.price) : '—' }}
                  </td>
                  <td class="mono" [class.gain]="(item.quote?.change ?? 0) > 0" [class.loss]="(item.quote?.change ?? 0) < 0">
                    {{ item.quote ? ((item.quote.change > 0 ? '+' : '') + fmtPrice(item.quote.change)) : '—' }}
                  </td>
                  <td>
                    @if (item.quote) {
                      <span class="wl-pct-badge"
                        [class.gain]="item.quote.changePercent > 0"
                        [class.loss]="item.quote.changePercent < 0">
                        {{ item.quote.changePercent > 0 ? '^' : 'v' }}
                        {{ item.quote.changePercent | number:'1.2-2' }}%
                      </span>
                    } @else { <span style="color:#4a5e7a">—</span> }
                  </td>
                  <td class="mono" style="font-size:10px">
                    {{ item.quote?.volume ? fmtVol(item.quote!.volume) : '—' }}
                  </td>
                  <td class="mono" style="font-size:10px">
                    {{ item.quote?.marketCap ? fmtMcap(item.quote!.marketCap!) : '—' }}
                  </td>
                  <td class="mono gain" style="font-size:10px">
                    {{ item.quote?.weekHigh52 ? '$' + (item.quote!.weekHigh52! | number:'1.2-2') : '—' }}
                  </td>
                  <td class="mono loss" style="font-size:10px">
                    {{ item.quote?.weekLow52 ? '$' + (item.quote!.weekLow52! | number:'1.2-2') : '—' }}
                  </td>
                  <td class="mono" style="font-size:10px">
                    {{ item.quote?.peRatio ? (item.quote!.peRatio! | number:'1.1-1') : '—' }}
                  </td>
                  <td>
                    <span class="wl-type-badge" [class]="'wl-type-badge--' + item.assetType.toLowerCase()">
                      {{ item.assetType }}
                    </span>
                  </td>
                  <td>
                    <button class="bb-btn bb-btn--icon bb-btn--sm wl-remove-btn"
                      title="Remove from watchlist"
                      (click)="$event.stopPropagation(); removeItem(item.symbol)">✕</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    } @else {
      <div class="wl-no-list">
        <div class="wl-no-list__icon">o</div>
        <div class="wl-no-list__title">Select or create a watchlist</div>
      </div>
    }
  </div>
</div>
  `,
  styles: [`
    .wl-shell { display:flex;height:100%;overflow:hidden;background:#060a14; }

    /* Sidebar */
    .wl-sidebar {
      width:220px;background:#0c1322;border-right:1px solid #1a2840;
      overflow-y:auto;flex-shrink:0;display:flex;flex-direction:column;
    }
    .wl-sidebar::-webkit-scrollbar{width:3px}
    .wl-sidebar::-webkit-scrollbar-thumb{background:#1e3555}
    .wl-sidebar__header {
      display:flex;align-items:center;justify-content:space-between;
      padding:10px 12px;border-bottom:1px solid #1a2840;flex-shrink:0;
      font-size:9px;font-weight:700;letter-spacing:1.5px;color:#4a5e7a;text-transform:uppercase;
    }
    .wl-sidebar__item {
      padding:9px 12px;border-bottom:1px solid #0f1e33;cursor:pointer;
      border-left:2px solid transparent;transition:all 150ms;
    }
    .wl-sidebar__item:hover{background:#131d30;color:#d4e0f5}
    .wl-sidebar__item.active{border-left-color:#ff9500;background:rgba(255,149,0,0.05)}
    .wl-sidebar__item-name{font-size:12px;color:#d4e0f5;font-weight:500}
    .wl-sidebar__item-meta{font-size:9px;color:#4a5e7a;margin-top:2px;display:flex;align-items:center;gap:6px}
    .wl-sidebar__empty{padding:20px 12px;font-size:11px;color:#4a5e7a;text-align:center}
    .wl-default-badge{font-size:8px;padding:1px 4px;background:rgba(255,149,0,0.15);color:#ff9500;border-radius:2px;font-weight:700;letter-spacing:0.5px}
    .wl-new-form{padding:10px 12px;border-bottom:1px solid #1a2840;background:#0d1526}

    /* Main */
    .wl-main{flex:1;display:flex;flex-direction:column;overflow:hidden}
    .wl-toolbar{
      display:flex;align-items:center;gap:8px;padding:8px 12px;
      border-bottom:1px solid #1a2840;flex-shrink:0;background:#0d1526;
    }
    .wl-add-form{display:flex;align-items:center;gap:6px}
    .wl-count{font-size:10px;color:#4a5e7a;font-family:'IBM Plex Mono',monospace}

    /* Table */
    .wl-table-wrap{flex:1;overflow:auto}
    .wl-table-wrap::-webkit-scrollbar{width:4px;height:4px}
    .wl-table-wrap::-webkit-scrollbar-thumb{background:#1e3555}

    /* Flash animations */
    @keyframes flashGain { 0%, 100% { background:transparent } 30% { background:rgba(0,217,126,0.12) } }
    @keyframes flashLoss { 0%, 100% { background:transparent } 30% { background:rgba(255,51,85,0.12) } }
    .wl-row--flash-gain{animation:flashGain 600ms ease}
    .wl-row--flash-loss{animation:flashLoss 600ms ease}

    /* Badges */
    .wl-pct-badge{
      display:inline-flex;align-items:center;gap:2px;
      font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;
      padding:2px 6px;border-radius:2px;
    }
    .wl-pct-badge.gain{background:rgba(0,217,126,0.12);color:#00d97e}
    .wl-pct-badge.loss{background:rgba(255,51,85,0.12);color:#ff3355}
    .wl-type-badge{font-size:8px;padding:1px 5px;border-radius:2px;font-weight:700;letter-spacing:0.5px}
    .wl-type-badge--stock{background:rgba(59,130,246,0.15);color:#3b82f6}
    .wl-type-badge--crypto{background:rgba(255,149,0,0.15);color:#ff9500}
    .wl-type-badge--etf{background:rgba(0,212,255,0.12);color:#00d4ff}
    .wl-type-badge--forex{background:rgba(139,92,246,0.15);color:#8b5cf6}
    .wl-remove-btn{color:#4a5e7a;transition:all 150ms}
    .wl-remove-btn:hover{color:#ff3355;border-color:#ff3355}

    /* Empty / loading states */
    .wl-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#4a5e7a;font-size:11px}
    .wl-spinner{width:28px;height:28px;border:2px solid #1a2840;border-top-color:#ff9500;border-radius:50%;animation:spin 0.8s linear infinite}
    @keyframes spin { to { transform:rotate(360deg) } }
    .wl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:#4a5e7a}
    .wl-empty__icon{font-size:48px;opacity:0.15}
    .wl-empty__title{font-size:14px;font-weight:500;color:#8da0bc}
    .wl-empty__sub{font-size:11px}
    .wl-no-list{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#4a5e7a}
    .wl-no-list__icon{font-size:56px;opacity:0.1}
    .wl-no-list__title{font-size:14px;color:#4a5e7a}

    .gain{color:#00d97e}.loss{color:#ff3355}.accent{color:#ff9500}
    .mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'}
    .bb-btn--primary{background:#ff9500;border-color:#ff9500;color:#000}
    .bb-btn--primary:hover{background:#c47300;color:#000}
    .bb-btn--primary:disabled{opacity:0.4;cursor:not-allowed}
  `],
})
export class WatchlistComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  readonly watchlists = watchlists;

  quotes    = signal<Record<string, any>>({});
  loading   = signal(false);
  showNew   = false;
  newName   = '';
  activeId  = '';
  addSymbol    = '';
  addAssetType = 'STOCK';
  flashedGain  = new Set<string>();
  flashedLoss  = new Set<string>();

  enrichedItems = computed(() => {
    const wl = watchlists().find(w => w.id === this.activeId);
    if (!wl?.symbols) return [];
    const tc   = tickCache();
    const qmap = this.quotes();
    return wl.symbols.map((item: any) => {
      const tick  = tc.get(item.symbol.toUpperCase());
      const quote = qmap[item.symbol] ?? null;
      return {
        ...item,
        quote: tick
          ? { ...(quote ?? {}), price: tick.price, change: tick.change, changePercent: tick.changePct, volume: tick.volume ?? quote?.volume ?? 0 }
          : quote,
      };
    });
  });

  constructor(
    private ps:     PortfolioService,
    private market: MarketService,
    private ws:     WebSocketService,
    private cdr:    ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.ps.getWatchlists().pipe(takeUntil(this.destroy$)).subscribe(lists => {
      const def = lists.find(l => l.isDefault) ?? lists[0];
      if (def) this.selectList(def);
      this.cdr.markForCheck();
    });
  }

  selectList(wl: any) {
    this.activeId = wl.id;
    const symbols = (wl.symbols ?? []).map((s: any) => s.symbol);
    if (!symbols.length) return;

    this.loading.set(true);
    this.market.getBatchQuotes(symbols).pipe(takeUntil(this.destroy$)).subscribe(qs => {
      this.quotes.set(qs);
      this.loading.set(false);
      this.cdr.markForCheck();
    });

    // Subscribe real-time
    const stocks = (wl.symbols ?? []).filter((s: any) => s.assetType !== 'CRYPTO').map((s: any) => s.symbol);
    const crypto = (wl.symbols ?? []).filter((s: any) => s.assetType === 'CRYPTO').map((s: any) => s.symbol + 'USDT');
    if (stocks.length) this.ws.subscribeStock(stocks);
    if (crypto.length) this.ws.subscribeCrypto(crypto);

    // Flash on tick updates
    this.ws.tick$.pipe(takeUntil(this.destroy$)).subscribe(tick => {
      const sym = tick.symbol;
      const prev = this.quotes()[sym]?.price ?? 0;
      if (prev !== tick.price) {
        const set = tick.change >= 0 ? this.flashedGain : this.flashedLoss;
        set.add(sym);
        setTimeout(() => { set.delete(sym); this.cdr.markForCheck(); }, 650);
        this.cdr.markForCheck();
      }
    });
  }

  addToWatchlist() {
    const sym = this.addSymbol.trim().toUpperCase();
    if (!sym || !this.activeId) return;

    this.ps.addToWatchlist(this.activeId, sym, this.addAssetType)
      .pipe(takeUntil(this.destroy$))
      .subscribe(item => {
        if (item) {
          addNotification('info', `${sym} added to watchlist`);
          this.addSymbol = '';
          // Refresh list
          this.ps.getWatchlists().pipe(takeUntil(this.destroy$)).subscribe(lists => {
            const current = lists.find(l => l.id === this.activeId);
            if (current) this.selectList(current);
          });
        }
      });
  }

  removeItem(symbol: string) {
    this.ps.removeFromWatchlist(this.activeId, symbol)
      .pipe(takeUntil(this.destroy$))
      .subscribe(ok => {
        if (ok) {
          addNotification('info', `${symbol} removed from watchlist`);
          this.ps.getWatchlists().pipe(takeUntil(this.destroy$)).subscribe(lists => {
            const current = lists.find(l => l.id === this.activeId);
            if (current) this.selectList(current);
          });
        }
      });
  }

  createWatchlist() {
    if (!this.newName.trim()) return;
    this.ps.createWatchlist(this.newName.trim()).pipe(takeUntil(this.destroy$)).subscribe(wl => {
      if (wl) {
        this.showNew = false;
        this.newName = '';
        addNotification('info', `Watchlist "${wl.name}" created`);
        this.selectList(wl);
      }
    });
  }

  refreshQuotes() {
    const wl = watchlists().find(w => w.id === this.activeId);
    if (wl) this.selectList(wl);
  }

  fmtPrice(p: number): string {
    if (!p && p !== 0) return '—';
    const abs = Math.abs(p);
    if (abs >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1)    return p.toFixed(4);
    if (abs >= 0.01) return p.toFixed(6);
    return p.toFixed(8);
  }

  fmtVol(v: number):  string { return v>=1e9?(v/1e9).toFixed(1)+'B':v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':v.toFixed(0); }
  fmtMcap(v: number): string { return v>=1e12?'$'+(v/1e12).toFixed(2)+'T':v>=1e9?'$'+(v/1e9).toFixed(2)+'B':'$'+(v/1e6).toFixed(1)+'M'; }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
