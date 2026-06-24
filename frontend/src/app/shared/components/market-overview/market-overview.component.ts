import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal, effect
} from '@angular/core';
import { CommonModule }    from '@angular/common';
import { RouterLink }      from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MarketService }   from '../../../core/services/market.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { tickCache, indicesTape, marketStatus } from '../../../core/signals/market.store';
import type { StockQuote } from '../../../core/models/stock.model';

interface IndexCard {
  symbol:   string;
  label:    string;
  category: string;
}

const INDEX_CARDS: IndexCard[] = [
  { symbol: 'SPY',  label: 'S&P 500',    category: 'US EQUITIES' },
  { symbol: 'QQQ',  label: 'NASDAQ 100', category: 'US EQUITIES' },
  { symbol: 'DIA',  label: 'DOW JONES',  category: 'US EQUITIES' },
  { symbol: 'IWM',  label: 'RUSSELL 2000',category:'US EQUITIES' },
  { symbol: 'VIX',  label: 'VIX',        category: 'VOLATILITY'  },
  { symbol: 'GLD',  label: 'GOLD',       category: 'COMMODITIES' },
  { symbol: 'USO',  label: 'OIL',        category: 'COMMODITIES' },
  { symbol: 'TLT',  label: 'US BONDS',   category: 'FIXED INCOME'},
  { symbol: 'DXY',  label: 'USD INDEX',  category: 'FOREX'       },
  { symbol: 'EEM',  label: 'EMERGING',   category: 'GLOBAL'      },
  { symbol: 'EFA',  label: 'INTL',       category: 'GLOBAL'      },
  { symbol: 'FXI',  label: 'CHINA',      category: 'GLOBAL'      },
];

@Component({
  selector: 'app-market-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
<div class="mkt-overview">
  <div class="mkt-overview__header">
    <span class="mkt-overview__title">GLOBAL MARKETS</span>
    <div class="mkt-status">
      <div class="ws-dot" [class.connected]="marketStatus().isOpen"></div>
      <span>{{ marketStatus().isOpen ? 'MARKET OPEN' : 'MARKET CLOSED' }}</span>
    </div>
  </div>

  <div class="mkt-grid">
    @for (card of cards; track card.symbol) {
      <div class="mkt-card" [routerLink]="['/chart', card.symbol]"
        [class.mkt-card--gain]="getChange(card.symbol) > 0"
        [class.mkt-card--loss]="getChange(card.symbol) < 0"
        [class.mkt-card--flashed]="flashedSymbols.has(card.symbol)">
        <div class="mkt-card__cat">{{ card.category }}</div>
        <div class="mkt-card__sym">{{ card.symbol }}</div>
        <div class="mkt-card__name">{{ card.label }}</div>
        <div class="mkt-card__price mono">
          {{ getPrice(card.symbol) ? '$' + (getPrice(card.symbol)! | number:'1.2-2') : '—' }}
        </div>
        <div class="mkt-card__change mono"
          [class.gain]="getChange(card.symbol) > 0"
          [class.loss]="getChange(card.symbol) < 0">
          {{ getChange(card.symbol) > 0 ? '^' : getChange(card.symbol) < 0 ? 'v' : '-' }}
          {{ getChangePct(card.symbol) !== 0 ? ((getChangePct(card.symbol) > 0 ? '+' : '') + (getChangePct(card.symbol) | number:'1.2-2') + '%') : '0.00%' }}
        </div>
        <!-- Inline bar -->
        <div class="mkt-card__bar-track">
          <div class="mkt-card__bar"
            [style.width.%]="Math.min(Math.abs(getChangePct(card.symbol)) * 10, 100)"
            [class.gain-bg]="getChangePct(card.symbol) > 0"
            [class.loss-bg]="getChangePct(card.symbol) < 0">
          </div>
        </div>
      </div>
    }
  </div>
</div>
  `,
  styles: [`
    .mkt-overview { background: #0c1322; }
    .mkt-overview__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border-bottom: 1px solid #1a2840;
      font-size: 9px; font-weight: 700; letter-spacing: 1.5px;
      color: #4a5e7a; text-transform: uppercase;
    }
    .mkt-status { display: flex; align-items: center; gap: 5px; }
    .ws-dot { width: 6px; height: 6px; border-radius: 50%; background: #4a5e7a; }
    .ws-dot.connected { background: #00d97e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { transform:scale(1) } 50% { transform:scale(1.4) } }

    .mkt-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 1px;
      background: #1a2840;
    }
    .mkt-card {
      background: #0d1526;
      padding: 8px 10px;
      cursor: pointer;
      transition: background 150ms;
      border-left: 2px solid transparent;
      position: relative;
      overflow: hidden;
    }
    .mkt-card:hover { background: #131d30; }
    .mkt-card--gain { border-left-color: rgba(0,217,126,0.5); }
    .mkt-card--loss { border-left-color: rgba(255,51,85,0.5); }
    .mkt-card--flashed { animation: flash 600ms ease; }
    @keyframes flash { 30% { background: rgba(255,149,0,0.08); } }

    .mkt-card__cat  { font-size: 7px; letter-spacing: 1px; color: #4a5e7a; text-transform: uppercase; margin-bottom: 2px; }
    .mkt-card__sym  { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 700; color: #ff9500; }
    .mkt-card__name { font-size: 9px; color: #4a5e7a; margin-bottom: 4px; }
    .mkt-card__price { font-size: 14px; font-weight: 600; color: #d4e0f5; }
    .mkt-card__change { font-size: 10px; margin-top: 2px; }
    .mkt-card__bar-track { height: 2px; background: #1a2840; border-radius: 1px; margin-top: 6px; overflow: hidden; }
    .mkt-card__bar { height: 100%; border-radius: 1px; transition: width 500ms ease; min-width: 2px; }

    .gain { color: #00d97e; } .loss { color: #ff3355; }
    .gain-bg { background: #00d97e; } .loss-bg { background: #ff3355; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-feature-settings: 'tnum'; }
  `]
})
export class MarketOverviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private quotes   = new Map<string, StockQuote>();

  readonly marketStatus = marketStatus;
  readonly tickCache    = tickCache;
  readonly Math         = Math;
  flashedSymbols        = new Set<string>();
  cards = INDEX_CARDS;

  constructor(private market: MarketService, private ws: WebSocketService, private cdr: ChangeDetectorRef) {
    effect(() => {
      const cache = tickCache();
      for (const card of this.cards) {
        if (cache.has(card.symbol)) {
          this.flashedSymbols.add(card.symbol);
          setTimeout(() => { this.flashedSymbols.delete(card.symbol); this.cdr.markForCheck(); }, 650);
        }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit() {
    const syms = this.cards.map(c => c.symbol);
    this.market.getBatchQuotes(syms).pipe(takeUntil(this.destroy$)).subscribe(qs => {
      Object.entries(qs).forEach(([sym, q]) => this.quotes.set(sym, q));
      this.cdr.markForCheck();
    });
    this.ws.subscribeStock(syms);
  }

  getPrice(sym: string): number | null {
    const tick = tickCache().get(sym);
    return tick?.price ?? this.quotes.get(sym)?.price ?? null;
  }

  getChange(sym: string): number {
    const tick = tickCache().get(sym);
    return tick?.change ?? this.quotes.get(sym)?.change ?? 0;
  }

  getChangePct(sym: string): number {
    const tick = tickCache().get(sym);
    return tick?.changePct ?? this.quotes.get(sym)?.changePercent ?? 0;
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
