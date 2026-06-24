import {
  Component, Input, OnChanges, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, SimpleChanges, ChangeDetectionStrategy
} from '@angular/core';
import {
  createChart, IChartApi,
  ColorType, LineStyle, type Time
} from 'lightweight-charts';

@Component({
  selector: 'app-mini-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #chartEl class="mini-chart-canvas"></div>`,
  styles: [`
    :host    { display: block; }
    .mini-chart-canvas { width: 100%; height: 100%; }
  `],
})
export class MiniChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('chartEl', { static: false }) chartEl!: ElementRef<HTMLDivElement>;

  @Input() data:       Array<{ time: number; value?: number; close?: number }> = [];
  @Input() type:       'area' | 'line' = 'area';
  @Input() positive    = true;          // color direction
  @Input() height      = 60;
  @Input() showGrid    = false;
  @Input() showAxis    = false;
  @Input() showCrosshair = false;

  private chart: IChartApi | null = null;
  private resizeObs: ResizeObserver | null = null;

  ngAfterViewInit() { this.buildChart(); }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && this.chart) this.updateData();
    if (changes['positive'] && this.chart) this.rebuildChart();
  }

  private buildChart() {
    const el = this.chartEl?.nativeElement;
    if (!el || !this.data?.length) return;

    const green     = '#00d97e';
    const red       = '#ff3355';
    const lineColor = this.positive ? green : red;

    this.chart = createChart(el, {
      width:  el.clientWidth,
      height: this.height,
      layout: {
        background:  { type: ColorType.Solid, color: 'transparent' },
        textColor:   'transparent',
      },
      grid: {
        vertLines: { visible: this.showGrid, color: '#0f1e33' },
        horzLines: { visible: this.showGrid, color: '#0f1e33' },
      },
      crosshair:     { mode: this.showCrosshair ? 1 : 0 },
      rightPriceScale:{ visible: this.showAxis, borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: {
        visible:      this.showAxis,
        borderVisible:false,
        fixLeftEdge:  true,
        fixRightEdge: true,
      },
      handleScroll:     false,
      handleScale:      false,
    });

    const chartData = this.data.map(d => ({
      time:  d.time as Time,
      value: d.value ?? d.close ?? 0,
    }));

    if (this.type === 'area') {
      const series = this.chart.addAreaSeries( {
        topColor:    this.positive ? 'rgba(0,217,126,0.3)' : 'rgba(255,51,85,0.3)',
        bottomColor: this.positive ? 'rgba(0,217,126,0.0)' : 'rgba(255,51,85,0.0)',
        lineColor,
        lineWidth: 1,
        crosshairMarkerVisible: this.showCrosshair,
        priceLineVisible:       false,
        lastValueVisible:       false,
      });
      series.setData(chartData);
    } else {
      const series = this.chart.addLineSeries( {
        color: lineColor,
        lineWidth: 1,
        crosshairMarkerVisible: this.showCrosshair,
        priceLineVisible:       false,
        lastValueVisible:       false,
      });
      series.setData(chartData);
    }

    this.chart.timeScale().fitContent();

    this.resizeObs = new ResizeObserver(entries => {
      if (this.chart && entries[0]) {
        this.chart.resize(entries[0].contentRect.width, this.height);
      }
    });
    this.resizeObs.observe(el);
  }

  private updateData() {
    this.rebuildChart();
  }

  private rebuildChart() {
    this.chart?.remove();
    this.chart = null;
    setTimeout(() => this.buildChart(), 0);
  }

  ngOnDestroy() {
    this.resizeObs?.disconnect();
    this.chart?.remove();
  }
}
