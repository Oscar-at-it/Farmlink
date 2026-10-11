import { kes } from '../api.js';

const short = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : String(Math.round(n));
function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v) || v;
}

// Revenue bars with profit drawn inside them: the dark part of each bar is what you kept.
export default function BarChart({ data }) {
  const W = 720, H = 250, pad = { l: 48, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(...data.map(d => d.revenue), 1));
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, bw = iw / data.length;
  const y = v => pad.t + ih - (v / max) * ih;
  const step = Math.ceil(data.length / 8);
  const label = d => new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue and profit by day">
      {[0, 1, 2, 3, 4].map(i => {
        const v = (max / 4) * i;
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="chart__grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="chart__tick">{short(v)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pad.l + i * bw + bw * 0.14, w = bw * 0.72;
        return (
          <g key={d.date}>
            <title>{`${label(d.date)}: revenue ${kes(d.revenue)}, profit ${kes(d.profit)}, ${d.sales} sale${d.sales === 1 ? '' : 's'}`}</title>
            <rect x={x} y={y(d.revenue)} width={w} height={Math.max(ih - (y(d.revenue) - pad.t), 0)} className="chart__rev" />
            <rect x={x} y={y(d.profit)} width={w} height={Math.max(ih - (y(d.profit) - pad.t), 0)} className="chart__profit" />
            {i % step === 0 && <text x={x + w / 2} y={H - 8} textAnchor="middle" className="chart__tick">{label(d.date)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
