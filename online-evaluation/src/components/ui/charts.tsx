'use client';

// Graphiques legers en SVG (sans dependance) : colonnes et courbe, une seule serie.
// Regles : barres <= 24 px a bout arrondi (4 px) et base carree, ligne 2 px, marqueurs r=4 avec
// anneau blanc, grille fine, texte en couleurs de texte (jamais la couleur de la serie),
// infobulle au survol ET au clavier, tableau de donnees accessible.
import { useEffect, useRef, useState, type ReactNode } from 'react';

const SERIES = '#5242e2'; // brand-600 (valide : bande de luminance, chroma, contraste >= 3:1)
const GRID = '#e8ebf2';
const AXIS_TEXT = '#64748b';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 2 ? 2 : m <= 4 ? 4 : m <= 5 ? 5 : 10) * p;
}

/** colonne : bout arrondi en haut, base carree */
function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Tooltip({ x, y, value, label, width }: { x: number; y: number; value: ReactNode; label: ReactNode; width: number }) {
  const left = Math.max(4, Math.min(width - 4, x));
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 px-2.5 py-1.5 text-center shadow-lg" style={{ left, top: y - 8 }}>
      <p className="text-sm font-semibold leading-tight text-white">{value}</p>
      <p className="whitespace-nowrap text-[11px] leading-tight text-slate-300">{label}</p>
    </div>
  );
}

export interface Datum { key: string; label: string; value: number; tip?: string }

function DataTable({ data, valueHeader, format }: { data: Datum[]; valueHeader: string; format: (v: number) => string }) {
  return (
    <details className="mt-2 text-xs text-slate-500">
      <summary className="cursor-pointer select-none hover:text-slate-700">Voir les données</summary>
      <table className="mt-2 w-full text-start">
        <thead><tr><th className="py-1 text-start font-semibold">Période</th><th className="py-1 text-end font-semibold">{valueHeader}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.key} className="border-t border-slate-100"><td className="py-1">{d.tip ?? d.label}</td><td className="py-1 text-end tabular-nums text-slate-700">{format(d.value)}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

export function ColumnChart({ data, height = 180, ariaLabel, valueHeader = 'Valeur', format = (v) => String(v), labelEvery = 1 }: {
  data: Datum[]; height?: number; ariaLabel: string; valueHeader?: string; format?: (v: number) => string; labelEvery?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30, padB = 22, padT = 10;
  const innerW = Math.max(0, width - padL);
  const innerH = height - padB - padT;
  const yMax = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const ticks = [0, yMax / 2, yMax];

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS_TEXT}>{Number.isInteger(t) ? t : t.toFixed(1)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + band * i + (band - barW) / 2;
              const h = (d.value / yMax) * innerH;
              const active = hover === i;
              return (
                <g key={d.key} tabIndex={0} role="graphics-symbol" aria-label={`${d.tip ?? d.label} : ${format(d.value)}`}
                  onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  className="outline-none">
                  <rect x={padL + band * i} y={padT} width={band} height={innerH} fill={active ? 'rgba(82,66,226,0.06)' : 'transparent'} rx={6} />
                  {d.value > 0 && <path d={columnPath(x, padT + innerH - h, barW, h)} fill={SERIES} opacity={hover == null || active ? 1 : 0.55} />}
                  {(data.length - 1 - i) % labelEvery === 0 && <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>{d.label}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hover != null && data[hover] && (
          <Tooltip width={width} x={padL + band * hover + band / 2} y={y(data[hover].value)} value={format(data[hover].value)} label={data[hover].tip ?? data[hover].label} />
        )}
      </div>
      <DataTable data={data} valueHeader={valueHeader} format={format} />
    </div>
  );
}

/** Courbe de progression (valeurs 0..1 affichees en %), seuil de reference facultatif. */
export function LineChart({ data, height = 200, ariaLabel, threshold, thresholdLabel = 'seuil' }: {
  data: Datum[]; height?: number; ariaLabel: string; threshold?: number; thresholdLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 38, padR = 44, padB = 22, padT = 12;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padB - padT;
  const n = data.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - Math.max(0, Math.min(1, v)) * innerH;
  const pct = (v: number) => `${Math.round(100 * v)} %`;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('');
  const area = n ? `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : '';

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n === 1 ? 0 : Math.round(((px) / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS_TEXT}>{pct(t)}</text>
              </g>
            ))}
            {threshold != null && (
              <g>
                <line x1={padL} x2={width - padR} y1={y(threshold)} y2={y(threshold)} stroke="#94a3b8" strokeWidth={1} />
                <text x={width - padR + 6} y={y(threshold)} dominantBaseline="middle" fontSize={10} fill={AXIS_TEXT}>{thresholdLabel}</text>
              </g>
            )}
            {n > 0 && <path d={area} fill={SERIES} opacity={0.1} />}
            {n > 1 && <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="#94a3b8" strokeWidth={1} />}
            {data.map((d, i) => (
              <circle key={d.key} cx={x(i)} cy={y(d.value)} r={hover === i ? 5.5 : 4} fill={SERIES} stroke="#fff" strokeWidth={2} />
            ))}
            {n > 0 && <text x={x(n - 1) + 10} y={y(data[n - 1].value)} dominantBaseline="middle" fontSize={12} fontWeight={600} fill="#0f172a">{pct(data[n - 1].value)}</text>}
            {n > 0 && <text x={x(0)} y={height - 6} textAnchor="start" fontSize={11} fill={AXIS_TEXT}>{data[0].label}</text>}
            {n > 1 && <text x={x(n - 1)} y={height - 6} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>{data[n - 1].label}</text>}
            <rect x={padL - 8} y={padT} width={innerW + 16} height={innerH} fill="transparent" tabIndex={0} aria-label="Parcourir les points avec les flèches"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(n - 1)} onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n - 1) - 1));
                if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
              }} className="cursor-crosshair outline-none" />
          </svg>
        )}
        {hover != null && data[hover] && <Tooltip width={width} x={x(hover)} y={y(data[hover].value)} value={pct(data[hover].value)} label={data[hover].tip ?? data[hover].label} />}
      </div>
      <DataTable data={data} valueHeader="Score" format={pct} />
    </div>
  );
}

/** Barre de progression fine (0..1) */
export function Meter({ value, tone = 'brand' }: { value: number | null; tone?: 'brand' | 'green' | 'amber' | 'red' }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const fill = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500' }[tone];
  const track = { brand: 'bg-brand-100', green: 'bg-emerald-100', amber: 'bg-amber-100', red: 'bg-rose-100' }[tone];
  return <span className={`block h-1.5 w-full overflow-hidden rounded-full ${track}`}><span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.round(100 * v)}%` }} /></span>;
}
