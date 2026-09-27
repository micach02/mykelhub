import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './useChartTheme'
import { ChartTooltip } from './ChartTooltip'

export interface ColumnRow {
  label: string
  value: number
  /** Marks the column as the current period so it can be emphasised. */
  highlight?: boolean
}

/** Single-series magnitude columns: one hue, 4px rounded data-ends on the
 *  value end, 2px surface gap between neighbours. */
export function ColumnChart({
  rows,
  formatValue,
  formatTick,
  height = 240,
  valueName = 'Value',
}: {
  rows: ColumnRow[]
  formatValue: (v: number) => string
  formatTick: (v: number) => string
  height?: number
  valueName?: string
}) {
  const theme = useChartTheme()

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="26%">
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="label"
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
            cursor={{ fill: theme.grid, fillOpacity: 0.45 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: valueName,
                      value: formatValue(Number(payload[0].value ?? 0)),
                      color: theme['series-1'],
                    },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((row, i) => (
              <Cell
                key={i}
                fill={theme['series-1']}
                fillOpacity={row.highlight === false ? 0.45 : 1}
                stroke={theme['surface-1']}
                strokeWidth={2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
