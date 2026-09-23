/** Hand-rolled inline SVG charts (§11.1): sparklines and bars only. */

export function Sparkline({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return (
      <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {values.length === 1 && <circle cx={width / 2} cy={height / 2} r={3} />}
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
      <circle cx={lx} cy={ly} r={3} />
    </svg>
  );
}

export function Bar({ value, max = 100, tier }: { value: number; max?: number; tier?: number }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / (max || 1)));
  const color = tier == null ? 'var(--t2)' : `var(--t${Math.max(1, tier)})`;
  return (
    <div className="bar" role="presentation">
      <i style={{ width: `${pct}%`, background: value > 0 ? color : 'transparent' }} />
    </div>
  );
}

/** Small column row: sessions per week for the last 8 weeks. */
export function MiniColumns({ values, labels, height = 44 }: { values: number[]; labels?: string[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <div
            className="w-full rounded-[4px]"
            style={{ height: `${Math.max(v ? 12 : 4, (100 * v) / max)}%`, background: v ? 'var(--t2)' : 'var(--surf3)' }}
            aria-label={`${v} sessions`}
          />
          {labels && <span className="text-[10px] text-dim2 font-semibold">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}
