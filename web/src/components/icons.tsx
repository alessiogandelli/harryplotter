import type { ColumnType, MarkType } from '../lib/types';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

/** Small drawings of each chart type, so the picker reads at a glance. */
export function MarkIcon({ mark, size = 22 }: { mark: MarkType; size?: number }) {
  const body = (() => {
    switch (mark) {
      case 'scatter': return <g fill="currentColor"><circle cx="6" cy="16" r="1.7" /><circle cx="9.5" cy="12" r="1.7" /><circle cx="13" cy="13.5" r="1.7" /><circle cx="16" cy="8" r="1.7" /><circle cx="19" cy="6" r="1.7" /><circle cx="11" cy="17" r="1.7" opacity=".5" /></g>;
      case 'line': return <path {...S} d="M3 17l4.5-5 4 3 4.5-7 4.5 3" />;
      case 'area': return <><path d="M3 19V14l4.5-4 4 3 4.5-6 4.5 3v9z" fill="currentColor" opacity=".25" /><path {...S} d="M3 14l4.5-4 4 3 4.5-6 4.5 3" /></>;
      case 'bar': return <g fill="currentColor"><rect x="4" y="11" width="4" height="9" rx="1" /><rect x="10" y="5" width="4" height="15" rx="1" /><rect x="16" y="9" width="4" height="11" rx="1" opacity=".6" /></g>;
      case 'histogram': return <g fill="currentColor"><rect x="3" y="15" width="3.4" height="5" /><rect x="6.6" y="10" width="3.4" height="10" /><rect x="10.2" y="5" width="3.4" height="15" /><rect x="13.8" y="9" width="3.4" height="11" /><rect x="17.4" y="14" width="3.4" height="6" /></g>;
      case 'density': return <><path d="M3 19c3 0 4-11 8-11s5 11 10 11z" fill="currentColor" opacity=".25" /><path {...S} d="M3 19c3 0 4-11 8-11s5 11 10 11" /></>;
      case 'box': return <g {...S}><path d="M8 4v4M8 16v4M16 7v3M16 15v3" /><rect x="5" y="8" width="6" height="8" rx="1" /><rect x="13" y="10" width="6" height="5" rx="1" /><path d="M5 12h6M13 12.5h6" /></g>;
      case 'violin': return <><path d="M8 3c-1 4-4 5-4 9s3 5 4 9c1-4 4-5 4-9S9 7 8 3z" fill="currentColor" opacity=".25" /><path {...S} d="M8 3c-1 4-4 5-4 9s3 5 4 9c1-4 4-5 4-9S9 7 8 3zM17 6c-1 3-3.5 4-3.5 7s2.5 3 3.5 6c1-3 3.5-3 3.5-6S18 9 17 6z" /></>;
      case 'strip': return <g fill="currentColor"><circle cx="6" cy="8" r="1.4" /><circle cx="8.5" cy="11" r="1.4" /><circle cx="6.5" cy="14" r="1.4" /><circle cx="8" cy="17" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="18" cy="9" r="1.4" /><circle cx="15.5" cy="11" r="1.4" /><circle cx="17.5" cy="13" r="1.4" /><rect x="4" y="11.6" width="6.5" height="1.4" rx=".7" opacity=".9" /><rect x="13.5" y="8.8" width="6.5" height="1.4" rx=".7" opacity=".9" /></g>;
      case 'heatmap': return <g fill="currentColor"><rect x="4" y="4" width="5" height="5" rx="1" opacity=".9" /><rect x="10" y="4" width="5" height="5" rx="1" opacity=".4" /><rect x="16" y="4" width="4" height="5" rx="1" opacity=".65" /><rect x="4" y="10" width="5" height="5" rx="1" opacity=".3" /><rect x="10" y="10" width="5" height="5" rx="1" opacity=".8" /><rect x="16" y="10" width="4" height="5" rx="1" opacity=".5" /><rect x="4" y="16" width="5" height="4" rx="1" opacity=".6" /><rect x="10" y="16" width="5" height="4" rx="1" opacity=".2" /><rect x="16" y="16" width="4" height="4" rx="1" opacity=".95" /></g>;
      case 'corr': return <g fill="currentColor"><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="4" y="10" width="5" height="5" rx="1" opacity=".55" /><rect x="10" y="10" width="5" height="5" rx="1" /><rect x="4" y="16" width="5" height="4" rx="1" opacity=".3" /><rect x="10" y="16" width="5" height="4" rx="1" opacity=".7" /><rect x="16" y="16" width="4" height="4" rx="1" /></g>;
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{body}</svg>;
}

export function TypeIcon({ type }: { type: ColumnType }) {
  const label = type === 'number' ? '#' : type === 'date' ? '◷' : type === 'category' ? 'Aa' : '¶';
  return <span className={`type-icon type-${type}`} title={type}>{label}</span>;
}

/** The logo: a lightning-bolt plot line through three data points. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1f3d6d" />
      <path d="M7 22l6-7 4 3.5L25 8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="22" r="2.2" fill="#fff" />
      <circle cx="17" cy="18.5" r="2.2" fill="#fff" />
      <circle cx="25" cy="8" r="2.2" fill="#e0b04f" />
    </svg>
  );
}
