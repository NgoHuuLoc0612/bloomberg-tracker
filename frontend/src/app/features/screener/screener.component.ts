// ─────────────────────────────────────────────────────────────────────────────
// screener.component.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { RouterLink }   from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MarketService } from '../../core/services/market.service';
import type { ScreenerResult, ScreenerFilters } from '../../core/models/stock.model';

@Component({
  selector: 'app-screener',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
<div class="screener-shell">

  <div class="screener-header">
    <span class="screener-title">STOCK SCREENER</span>
    <div class="screener-presets">
      @for (p of presets; track p.id) {
        <button class="bb-btn bb-btn--sm" [class.active]="activePreset === p.id"
          (click)="loadPreset(p.id)">{{ p.label }}</button>
      }
    </div>
  </div>

  <div class="screener-body">
    <!-- FILTERS SIDEBAR -->
    <div class="screener-filters">
      <div class="filter-section-title">FILTERS</div>

      <div class="filter-group">
        <label>Exchange</label>
        <select class="bb-select" [(ngModel)]="filters.exchange">
          <option value="">All</option>
          <option value="NASDAQ">NASDAQ</option>
          <option value="NYSE">NYSE</option>
          <option value="AMEX">AMEX</option>
        </select>
      </div>

      <div class="filter-group">
        <label>Sector</label>
        <select class="bb-select" [(ngModel)]="filters.sector">
          <option value="">All Sectors</option>
          @for (s of sectors; track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
      </div>

      <div class="filter-group">
        <label>Price Range ($)</label>
        <div class="filter-range">
          <input class="bb-input" type="number" placeholder="Min" [(ngModel)]="filters.minPrice" />
          <span style="color:#4a5e7a">—</span>
          <input class="bb-input" type="number" placeholder="Max" [(ngModel)]="filters.maxPrice" />
        </div>
      </div>

      <div class="filter-group">
        <label>Market Cap</label>
        <select class="bb-select" [(ngModel)]="mcapPreset" (change)="applyMcap()">
          <option value="">Any</option>
          <option value="mega">Mega (>$200B)</option>
          <option value="large">Large ($10B-$200B)</option>
          <option value="mid">Mid ($2B-$10B)</option>
          <option value="small">Small ($300M-$2B)</option>
          <option value="micro">Micro (<$300M)</option>
        </select>
      </div>

      <div class="filter-group">
        <label>P/E Ratio</label>
        <div class="filter-range">
          <input class="bb-input" type="number" placeholder="Min" [(ngModel)]="filters.minPE" />
          <span style="color:#4a5e7a">—</span>
          <input class="bb-input" type="number" placeholder="Max" [(ngModel)]="filters.maxPE" />
        </div>
      </div>

      <div class="filter-group">
        <label>Volume (min)</label>
        <input class="bb-input" type="number" placeholder="e.g. 1000000" [(ngModel)]="filters.minVolume" />
      </div>

      <div class="filter-group">
        <label>% Change 24h</label>
        <div class="filter-range">
          <input class="bb-input" type="number" placeholder="Min %" [(ngModel)]="filters.minChangePct" />
          <span style="color:#4a5e7a">—</span>
          <input class="bb-input" type="number" placeholder="Max %" [(ngModel)]="filters.maxChangePct" />
        </div>
      </div>

      <div class="filter-group">
        <label>Beta</label>
        <div class="filter-range">
          <input class="bb-input" type="number" placeholder="Min" step="0.1" [(ngModel)]="filters.minBeta" />
          <span style="color:#4a5e7a">—</span>
          <input class="bb-input" type="number" placeholder="Max" step="0.1" [(ngModel)]="filters.maxBeta" />
        </div>
      </div>

      <button class="bb-btn bb-btn--primary" style="width:100%;margin-top:12px" (click)="runScreener()">
        > RUN SCREEN
      </button>
      <button class="bb-btn" style="width:100%;margin-top:6px" (click)="resetFilters()">Reset</button>

      <div class="filter-meta">{{ meta()?.total ?? 0 }} results</div>
    </div>

    <!-- RESULTS TABLE -->
    <div class="screener-results">
      @if (loading()) {
        <div class="screener-loading">
          <div class="chart-loading__spinner"></div>
          Running screen...
        </div>
      } @else {
        <div class="screener-sort-bar">
          <span style="font-size:10px;color:#4a5e7a">{{ results().length }} stocks · Sort by:</span>
          @for (col of sortCols; track col.key) {
            <button class="bb-btn bb-btn--sm" [class.active]="filters.sortBy === col.key"
              (click)="setSort(col.key)">
              {{ col.label }} {{ filters.sortBy === col.key ? (filters.sortDir === 'asc' ? '↑' : '↓') : '' }}
            </button>
          }
        </div>

        <div class="screener-table-wrap">
          <table class="bb-table">
            <thead><tr>
              <th>Symbol</th><th>Company</th><th>Price</th>
              <th>Change</th><th>Volume</th><th>Mkt Cap</th>
              <th>P/E</th><th>Beta</th><th>Sector</th>
            </tr></thead>
            <tbody>
              @for (s of results(); track s.symbol) {
                <tr [routerLink]="['/chart', s.symbol]">
                  <td><span class="accent mono">{{ s.symbol }}</span></td>
                  <td style="font-size:10px;color:#8da0bc;max-width:140px;overflow:hidden;text-overflow:ellipsis">{{ s.companyName }}</td>
                  <td class="mono">{{ '$' + (s.price | number:'1.2-2') }}</td>
                  <td>
                    <span class="mono" [class.gain]="s.changePercent>0" [class.loss]="s.changePercent<0">
                      {{ s.changePercent > 0 ? '+' : '' }}{{ s.changePercent | number:'1.2-2' }}%
                    </span>
                  </td>
                  <td class="mono">{{ fmtVol(s.volume) }}</td>
                  <td class="mono">{{ s.marketCap ? fmtMcap(s.marketCap) : '-' }}</td>
                  <td class="mono">{{ s.peRatio ? (s.peRatio | number:'1.1-1') : '-' }}</td>
                  <td class="mono">{{ s.beta ? (s.beta | number:'1.2-2') : '-' }}</td>
                  <td style="font-size:9px;color:#4a5e7a">{{ s.sector }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (meta() && meta()!.pages > 1) {
          <div class="screener-pagination">
            <button class="bb-btn bb-btn--sm" (click)="prevPage()" [disabled]="page === 1">← Prev</button>
            <span class="mono" style="font-size:10px">Page {{ page }} / {{ meta()!.pages }}</span>
            <button class="bb-btn bb-btn--sm" (click)="nextPage()" [disabled]="page >= meta()!.pages">Next →</button>
          </div>
        }
      }
    </div>
  </div>
</div>
  `,
  styles: [`
    .screener-shell { display:flex;flex-direction:column;height:100%;overflow:hidden; }
    .screener-header { display:flex;align-items:center;gap:12px;padding:8px 16px;background:#0c1322;border-bottom:1px solid #1a2840;flex-shrink:0; }
    .screener-title { font-size:11px;font-weight:700;letter-spacing:2px;color:#8da0bc; }
    .screener-presets { display:flex;gap:4px; }
    .screener-body { display:flex;flex:1;overflow:hidden; }
    .screener-filters { width:220px;padding:12px;background:#0d1526;border-right:1px solid #1a2840;overflow-y:auto;flex-shrink:0; }
    .filter-section-title { font-size:9px;font-weight:700;letter-spacing:1.5px;color:#4a5e7a;text-transform:uppercase;margin-bottom:12px; }
    .filter-group { margin-bottom:12px; }
    .filter-group label { display:block;font-size:9px;font-weight:700;letter-spacing:1px;color:#4a5e7a;text-transform:uppercase;margin-bottom:4px; }
    .filter-range { display:flex;align-items:center;gap:4px; }
    .filter-meta { font-size:9px;color:#4a5e7a;text-align:center;margin-top:8px; }
    .screener-results { flex:1;overflow:hidden;display:flex;flex-direction:column; }
    .screener-loading { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#4a5e7a;font-size:12px; }
    .screener-sort-bar { display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid #1a2840;flex-shrink:0;overflow-x:auto; }
    .screener-table-wrap { flex:1;overflow:auto; }
    .screener-pagination { display:flex;align-items:center;justify-content:center;gap:12px;padding:8px;border-top:1px solid #1a2840;flex-shrink:0; }
    .chart-loading__spinner { width:28px;height:28px;border:2px solid #1a2840;border-top-color:#ff9500;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .accent { color:#ff9500; } .gain { color:#00d97e; } .loss { color:#ff3355; }
    .mono { font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'; }
    .bb-btn.active { background:rgba(255,149,0,0.1);border-color:#c47300;color:#ff9500; }
  `]
})
export class ScreenerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  results = signal<ScreenerResult[]>([]);
  meta    = signal<any>(null);
  loading = signal(false);
  page    = 1;
  mcapPreset = '';
  activePreset = '';

  filters: ScreenerFilters = {
    sortBy: 'marketCap', sortDir: 'desc', limit: 50
  };

  sectors = [
    'Technology','Healthcare','Financials','Consumer Discretionary',
    'Communication Services','Industrials','Consumer Staples',
    'Energy','Utilities','Real Estate','Materials',
  ];

  presets = [
    { id: 'large-cap',   label: 'Large Cap'   },
    { id: 'high-growth', label: 'High Growth' },
    { id: 'value',       label: 'Value'       },
    { id: 'dividend',    label: 'Dividend'    },
    { id: 'momentum',    label: 'Momentum'    },
  ];

  sortCols: Array<{ key: string; label: string }> = [
    { key: 'marketCap', label: 'MCap'   },
    { key: 'changePct', label: '% Chg'  },
    { key: 'volume',    label: 'Volume' },
    { key: 'price',     label: 'Price'  },
    { key: 'pe',        label: 'P/E'    },
  ];

  constructor(private market: MarketService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.runScreener(); }

  runScreener() {
    this.loading.set(true);
    this.market.screenStocks({ ...this.filters, page: this.page }).pipe(
      takeUntil(this.destroy$)
    ).subscribe(({ data, meta }) => {
      this.results.set(data);
      this.meta.set(meta);
      this.loading.set(false);
      this.cdr.markForCheck();
    });
  }

  loadPreset(id: string) {
    this.activePreset = id;
    this.loading.set(true);
    this.market.getScreenerPreset(id).pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.results.set(data);
      this.loading.set(false);
      this.cdr.markForCheck();
    });
  }

  resetFilters() {
    this.filters = { sortBy: 'marketCap', sortDir: 'desc', limit: 50 };
    this.mcapPreset = '';
    this.activePreset = '';
    this.page = 1;
    this.runScreener();
  }

  applyMcap() {
    const map: Record<string, [number|undefined, number|undefined]> = {
      mega:  [200e9, undefined], large: [10e9, 200e9],
      mid:   [2e9, 10e9],       small: [300e6, 2e9], micro: [undefined, 300e6],
    };
    const [min, max] = map[this.mcapPreset] ?? [undefined, undefined];
    this.filters.minMarketCap = min; this.filters.maxMarketCap = max;
  }

  setSort(key: any) {
    if (this.filters.sortBy === key) {
      this.filters.sortDir = this.filters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.filters.sortBy = key; this.filters.sortDir = 'desc';
    }
    this.runScreener();
  }

  prevPage() { if (this.page > 1) { this.page--; this.runScreener(); } }
  nextPage() { this.page++; this.runScreener(); }

  fmtVol(v: number)  { return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':String(v); }
  fmtMcap(v: number) { return v>=1e12?'$'+(v/1e12).toFixed(1)+'T':v>=1e9?'$'+(v/1e9).toFixed(1)+'B':'$'+(v/1e6).toFixed(0)+'M'; }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
