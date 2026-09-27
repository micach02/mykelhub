import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartTheme } from './useChartTheme'
import { ChartTooltip } from './ChartTooltip'
import { shortDayLabel } from '../../lib/utils'

export interface TrendSeries {
  key: string
  name: string
  /** Index into the categorical order — assigned per entity, never per rank. */
  slot: 1 | 2 | 3
}

export function TrendChart<T extends { day: string }>({
  data,
  series,
  formatValue,
  formatTick,
  height = 280,
  locale,
}: {
  data: T[]
  series: TrendSeries[]
  formatValue: (v: number) => string
  formatTick: (v: number) => string
  height?: number
  locale: string
}) {
  const theme = useChartTheme()
  const colorFor = (slot: 1 | 2 | 3) =>
    slot === 1 ? theme['series-1'] : slot === 2 ? theme['series-2'] : theme['series-3']

  // Latest value per series doubles as the legend's direct label.
  const latest = useMemo(() => {
    const last = data[data.length - 1] as Record<string, unknown> | undefined
    const out: Record<string, number> = {}
    for (const s of series) out[s.key] = last ? Number(last[s.key] ?? 0) : 0
    return out
  }, [data, series])

  // Keep every Nth tick so labels never collide on narrow screens.
  const tickInterval = Math.max(0, Math.floor(data.length / 7) - 1)

  return (
    <div>
      {series.length > 1 ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {series.map((s) => (
            <li key={s.key} className="flex items-baseline gap-1.5 text-[12px]">
              <span
                className="size-2.5 translate-y-px rounded-[3px]"
                style={{ background: colorFor(s.slot) }}
                aria-hidden
              />
              <span className="text-ink-2">{s.name}</span>
              <span className="tnum font-semibold text-ink">{formatValue(latest[s.key] ?? 0)}</span>
              <span className="text-muted">latest</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorFor(s.slot)} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colorFor(s.slot)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid stroke={theme.grid} strokeDasharray="0" vertical={false} />

            <XAxis
              dataKey="day"
              tickFormatter={(v: string) => shortDayLabel(v, locale)}
              interval={tickInterval}
              tickLine={false}
              axisLine={{ stroke: theme.baseline }}
              tick={{ fill: theme['text-muted'], fontSize: 11 }}
              dy={6}
            />
            <YAxis
              tickFormatter={formatTick}
              tickLine={false}
              axisLine={false}
              width={62}
              tick={{ fill: theme['text-muted'], fontSize: 11 }}
            />

            <Tooltip
              cursor={{ stroke: theme.baseline, strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <ChartTooltip
                    title={shortDayLabel(String(label), locale)}
                    rows={payload.map((p) => ({
                      label: series.find((s) => s.key === p.dataKey)?.name ?? String(p.dataKey),
                      value: formatValue(Number(p.value ?? 0)),
                      color: p.stroke as string,
                    }))}
                  />
                )
              }}
            />

            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={colorFor(s.slot)}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: theme['surface-1'],
                  fill: colorFor(s.slot),
                }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
