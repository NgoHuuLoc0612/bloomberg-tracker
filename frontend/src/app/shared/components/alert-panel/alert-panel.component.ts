import {
  Component, OnInit, OnDestroy, ChangeDetectionStrategy,
  ChangeDetectorRef, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PortfolioService } from '../../../core/services/portfolio.service';
import { tickCache, activeAlerts, addNotification } from '../../../core/signals/market.store';
import type { PriceAlert } from '../../../core/models/crypto.model';

@Component({
  selector: 'app-alert-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
<div class="alert-panel">
  <div class="alert-panel__header">
    <span>PRICE ALERTS</span>
    <button class="bb-btn bb-btn--sm bb-btn--icon" (click)="showCreate = !showCreate" title="New Alert">+</button>
  </div>

  @if (showCreate) {
    <div class="alert-create">
      <div class="alert-form-row">
        <input class="bb-input" placeholder="Symbol (AAPL)" [(ngModel)]="newAlert.symbol" style="width:100px" />
        <select class="bb-select" [(ngModel)]="newAlert.assetType" style="width:90px">
          <option>STOCK</option><option>CRYPTO</option><option>ETF</option>
        </select>
      </div>
      <div class="alert-form-row">
        <select class="bb-select" [(ngModel)]="newAlert.condition" style="flex:1">
          <option value="ABOVE">Price Above</option>
          <option value="BELOW">Price Below</option>
          <option value="CROSSES_UP">Crosses Up</option>
          <option value="CROSSES_DOWN">Crosses Down</option>
          <option value="PERCENT_UP">% Up From Now</option>
          <option value="PERCENT_DOWN">% Down From Now</option>
        </select>
        <input class="bb-input" type="number" placeholder="Target" [(ngModel)]="newAlert.targetPrice" step="0.0001" style="width:100px" />
      </div>
      <input class="bb-input" placeholder="Custom message (optional)" [(ngModel)]="newAlert.message" />
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="bb-btn bb-btn--primary bb-btn--sm" style="flex:1" (click)="createAlert()" [disabled]="!newAlert.symbol || !newAlert.targetPrice">Create</button>
        <button class="bb-btn bb-btn--sm" (click)="showCreate = false">Cancel</button>
      </div>
    </div>
  }

  <div class="alert-list">
    @if (activeAlerts().length === 0) {
      <div class="alert-empty">No alerts configured</div>
    }
    @for (alert of activeAlerts(); track alert.id) {
      <div class="alert-item" [class.alert-item--triggered]="alert.isTriggered" [class.alert-item--inactive]="!alert.isActive">
        <div class="alert-item__header">
          <span class="alert-item__sym mono accent">{{ alert.symbol }}</span>
          <span class="alert-item__cond">{{ condLabel(alert.condition) }}</span>
          <span class="alert-item__target mono">{{ '$' + (alert.targetPrice | number:'1.2-4') }}</span>
          <div class="alert-item__actions">
            <button class="bb-btn bb-btn--icon bb-btn--sm" (click)="toggleAlert(alert)" [title]="alert.isActive ? 'Disable' : 'Enable'">
              {{ alert.isActive ? '*' : '○' }}
            </button>
            <button class="bb-btn bb-btn--icon bb-btn--sm bb-btn--danger" (click)="deleteAlert(alert.id)" title="Delete">✕</button>
          </div>
        </div>
        <div class="alert-item__meta">
          @if (alert.isTriggered) {
            <span class="alert-badge alert-badge--triggered">TRIGGERED</span>
          } @else if (alert.isActive) {
            <span class="alert-badge alert-badge--active">* WATCHING</span>
            @if (getLivePrice(alert.symbol)) {
              <span class="mono" style="font-size:9px;color:#8da0bc">
                NOW: {{ '$' + (getLivePrice(alert.symbol) | number:'1.2-4') }}
                ({{ distPct(alert) | number:'1.2-2' }}% away)
              </span>
            }
          } @else {
            <span class="alert-badge">PAUSED</span>
          }
          @if (alert.message) {
            <span class="alert-item__msg">{{ alert.message }}</span>
          }
        </div>
      </div>
    }
  </div>
</div>
  `,
  styles: [`
    .alert-panel { display:flex;flex-direction:column;height:100%;background:#060a14; }
    .alert-panel__header {
      display:flex;align-items:center;justify-content:space-between;
      padding:8px 12px;background:#0c1322;border-bottom:1px solid #1a2840;
      font-size:9px;font-weight:700;letter-spacing:1.5px;color:#4a5e7a;text-transform:uppercase;
    }
    .alert-create { padding:10px;border-bottom:1px solid #1a2840;display:flex;flex-direction:column;gap:6px;background:#0d1526; }
    .alert-form-row { display:flex;gap:6px; }
    .alert-list { flex:1;overflow-y:auto; }
    .alert-list::-webkit-scrollbar { width:3px; }
    .alert-list::-webkit-scrollbar-thumb { background:#1e3555; }
    .alert-empty { display:flex;align-items:center;justify-content:center;padding:24px;color:#4a5e7a;font-size:11px; }
    .alert-item { padding:8px 12px;border-bottom:1px solid #0f1e33;transition:background 150ms; }
    .alert-item:hover { background:#0d1526; }
    .alert-item--triggered { background:rgba(255,51,85,0.05);border-left:2px solid #ff3355; }
    .alert-item--inactive  { opacity:0.5; }
    .alert-item__header { display:flex;align-items:center;gap:8px; }
    .alert-item__sym  { font-size:12px;font-weight:700; }
    .alert-item__cond { font-size:9px;color:#4a5e7a;flex:1; }
    .alert-item__target { font-size:11px;color:#d4e0f5; }
    .alert-item__actions { display:flex;gap:3px; }
    .alert-item__meta { display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap; }
    .alert-item__msg  { font-size:9px;color:#4a5e7a;font-style:italic; }
    .alert-badge { font-size:8px;padding:2px 6px;border-radius:2px;font-weight:700;letter-spacing:0.5px;background:#101829;color:#4a5e7a; }
    .alert-badge--active    { background:rgba(0,217,126,0.1);color:#00d97e; }
    .alert-badge--triggered { background:rgba(255,51,85,0.15);color:#ff3355; }
    .accent{color:#ff9500} .gain{color:#00d97e} .loss{color:#ff3355}
    .mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:'tnum'}
    .bb-btn--danger:hover{border-color:#ff3355;color:#ff3355}
  `]
})
export class AlertPanelComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  readonly activeAlerts = activeAlerts;
  readonly tickCache    = tickCache;

  showCreate = false;
  newAlert = {
    symbol: '', assetType: 'STOCK', alertType: 'PRICE',
    condition: 'ABOVE', targetPrice: 0, message: '',
  };

  condLabels: Record<string, string> = {
    ABOVE: 'above', BELOW: 'below',
    CROSSES_UP: 'crosses ↑', CROSSES_DOWN: 'crosses ↓',
    PERCENT_UP: '% up', PERCENT_DOWN: '% down',
  };

  constructor(private ps: PortfolioService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.ps.getAlerts().pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  createAlert() {
    this.ps.createAlert({ ...this.newAlert }).pipe(takeUntil(this.destroy$)).subscribe((a: any) => {
      if (a) {
        addNotification('alert', `Alert created: ${this.newAlert.symbol} ${this.condLabels[this.newAlert.condition]} $${this.newAlert.targetPrice}`);
        this.showCreate = false;
        this.newAlert = { symbol: '', assetType: 'STOCK', alertType: 'PRICE', condition: 'ABOVE', targetPrice: 0, message: '' };
        this.cdr.markForCheck();
      }
    });
  }

  toggleAlert(alert: PriceAlert) {
    this.ps.toggleAlert(alert.id, !alert.isActive).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.ps.getAlerts().pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    });
  }

  deleteAlert(id: string) {
    this.ps.deleteAlert(id).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.ps.getAlerts().pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
    });
  }

  getLivePrice(symbol: string): number | null {
    return tickCache().get(symbol.toUpperCase())?.price ?? null;
  }

  distPct(alert: PriceAlert): number {
    const price = this.getLivePrice(alert.symbol);
    if (!price) return 0;
    return ((alert.targetPrice - price) / price) * 100;
  }

  condLabel(cond: string): string { return this.condLabels[cond] ?? cond; }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
}
