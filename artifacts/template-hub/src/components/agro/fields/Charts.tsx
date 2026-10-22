import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ha, haNum } from "./shared";

const axisTick = { fontSize: 10, fill: "hsl(207 18% 45%)" };
const tipFmt = (v: number | string) => ha(Number(v));

export function CropAreaChart({ data }: { data: { crop: string; area: number }[] }) {
  const h = Math.max(140, data.length * 34 + 30);
  return (
    <div style={{ height: h }} data-testid="chart-crop-area">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="hsl(205 21% 90%)" />
          <XAxis type="number" domain={[0, "auto"]} tick={axisTick} tickFormatter={(v: number) => haNum(v)} />
          <YAxis type="category" dataKey="crop" width={110} tick={axisTick} />
          <Tooltip formatter={tipFmt} cursor={{ fill: "hsl(205 25% 93% / .6)" }} />
          <Bar dataKey="area" name="Площадь сезона" fill="#61A9BD" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, formatter: (v: number) => haNum(v) }} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OpPlanFactChart({ data }: { data: { name: string; planned: number; actual: number }[] }) {
  const h = Math.max(160, data.length * 46 + 50);
  return (
    <div style={{ height: h }} data-testid="chart-operations-plan-fact">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke="hsl(205 21% 90%)" />
          <XAxis type="number" domain={[0, "auto"]} tick={axisTick} tickFormatter={(v: number) => haNum(v)} />
          <YAxis type="category" dataKey="name" width={120} tick={axisTick} />
          <Tooltip formatter={(v: number | string) => `${haNum(Number(v))} га-операций`} cursor={{ fill: "hsl(205 25% 93% / .6)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="planned" name="План" fill="#C1C1C1" radius={[0, 3, 3, 0]} isAnimationActive={false} />
          <Bar dataKey="actual" name="Факт" fill="#44986D" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
