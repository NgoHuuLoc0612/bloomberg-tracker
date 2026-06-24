import { Pipe, PipeTransform } from '@angular/core';

// ─────────────────────────────────────────────────────────────────────────────
// Price Format Pipe — smart decimal places based on price magnitude
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'priceFormat', standalone: true, pure: true })
export class PriceFormatPipe implements PipeTransform {
  transform(value: number | null | undefined, prefix = '$'): string {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const abs = Math.abs(value);
    let formatted: string;
    if      (abs === 0)    formatted = '0.00';
    else if (abs >= 10000) formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (abs >= 1000)  formatted = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else if (abs >= 100)   formatted = value.toFixed(2);
    else if (abs >= 10)    formatted = value.toFixed(3);
    else if (abs >= 1)     formatted = value.toFixed(4);
    else if (abs >= 0.1)   formatted = value.toFixed(5);
    else if (abs >= 0.01)  formatted = value.toFixed(6);
    else                   formatted = value.toFixed(8);
    return prefix + formatted;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Percent Change Pipe — format with sign, color class hint
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'pctChange', standalone: true, pure: true })
export class PctChangePipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Large Number Pipe — $1.23T / $456.7B / $78.9M / $1.2K
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'largeNum', standalone: true, pure: true })
export class LargeNumPipe implements PipeTransform {
  transform(value: number | null | undefined, prefix = '$', decimals = 2): string {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if      (abs >= 1e12) return `${sign}${prefix}${(abs/1e12).toFixed(decimals)}T`;
    else if (abs >= 1e9)  return `${sign}${prefix}${(abs/1e9).toFixed(decimals)}B`;
    else if (abs >= 1e6)  return `${sign}${prefix}${(abs/1e6).toFixed(decimals)}M`;
    else if (abs >= 1e3)  return `${sign}${prefix}${(abs/1e3).toFixed(decimals)}K`;
    return `${sign}${prefix}${abs.toFixed(decimals)}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume Pipe — 1.23B / 456.7M / 78.9K
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'volume', standalone: true, pure: true })
export class VolumePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '—';
    if (value >= 1e9)  return (value/1e9).toFixed(2)  + 'B';
    if (value >= 1e6)  return (value/1e6).toFixed(2)  + 'M';
    if (value >= 1e3)  return (value/1e3).toFixed(1)  + 'K';
    return value.toFixed(0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Ago Pipe — "2 min ago" / "3 hrs ago" / "Jan 5"
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'timeAgo', standalone: true, pure: false })
export class TimeAgoPipe implements PipeTransform {
  transform(value: number | string | Date | null | undefined): string {
    if (!value) return '—';
    const ts   = typeof value === 'number' && value < 9999999999 ? value * 1000 : +new Date(value);
    const diff = (Date.now() - ts) / 1000;
    if (diff <  60)    return `${Math.floor(diff)}s ago`;
    if (diff <  3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff <  86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff <  604800)return `${Math.floor(diff/86400)}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Color Pipe — returns CSS class name
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'changeColor', standalone: true, pure: true })
export class ChangeColorPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (!value) return 'flat';
    return value > 0 ? 'gain' : value < 0 ? 'loss' : 'flat';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supply Format — 19.5M BTC / 21M max
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'supply', standalone: true, pure: true })
export class SupplyPipe implements PipeTransform {
  transform(value: number | null | undefined, symbol = ''): string {
    if (!value) return '—';
    const suffix = symbol ? ` ${symbol}` : '';
    if (value >= 1e12) return (value/1e12).toFixed(2) + 'T' + suffix;
    if (value >= 1e9)  return (value/1e9).toFixed(2)  + 'B' + suffix;
    if (value >= 1e6)  return (value/1e6).toFixed(2)  + 'M' + suffix;
    if (value >= 1e3)  return (value/1e3).toFixed(1)  + 'K' + suffix;
    return value.toFixed(0) + suffix;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline Pipe — array of numbers → SVG polyline points string
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'sparkline', standalone: true, pure: true })
export class SparklinePipe implements PipeTransform {
  transform(data: number[] | null | undefined, width = 100, height = 30): string {
    if (!data?.length) return '';
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }
}
