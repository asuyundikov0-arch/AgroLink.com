import { ArrowRight, Play, CheckCheck } from "lucide-react";
import { Btn, DemoTag } from "./ui";
import { STAGES } from "@/demo/model";

const preview = [
  ["Водитель (Автопарк, 10 т × 30 км × 28)", "8 400"],
  ["Грузчик Тока (2 ч × 900)", "1 800"],
  ["Дизель (Топливный склад, 20 л × 280)", "5 600"],
];

export function Intro({ onGuide, onManual, onExample }: { onGuide: () => void; onManual: () => void; onExample: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div className="rise">
          <div className="flex items-center gap-3"><DemoTag /><span className="text-xs uppercase tracking-[.2em] text-muted-foreground">Учебный пример, не реальные данные</span></div>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Сколько на самом деле стоила доставка семян?</h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Это то, что предлагалось в документе, но в виде живой программы. Агроном не вводит фактическую стоимость руками.
            Она собирается из записей тех, кто реально сделал работу: <b className="text-foreground">Ток</b> отправил семена и грузчика,
            <b className="text-foreground"> Автопарк</b> рассчитал водителя, <b className="text-foreground">Топливный склад</b> выдал дизель,
            <b className="text-foreground"> ОК</b> утвердил зарплату.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Btn onClick={onGuide} testId="button-guide" className="py-3.5 text-base"><Play className="h-4 w-4" />Показать весь процесс</Btn>
            <Btn variant="line" onClick={onManual} testId="button-manual" className="py-3.5"><ArrowRight className="h-4 w-4" />Пройти самостоятельно</Btn>
            <Btn variant="ghost" onClick={onExample} testId="button-example" className="py-3.5"><CheckCheck className="h-4 w-4" />Готовый пример</Btn>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Всё хранится только в этом браузере. Основная система AgroLink и её данные не затрагиваются.</p>
        </div>

        <div className="rise border border-foreground bg-card" style={{ animationDelay: ".12s" }}>
          <div className="flex items-center justify-between border-b border-foreground px-5 py-3">
            <span className="text-xs uppercase tracking-[.18em]">Итог, к которому придём</span><DemoTag />
          </div>
          <div className="p-5">
            <div className="text-sm text-muted-foreground">Доставка семян · Поле 1 · к посеву 100 га</div>
            <div className="mt-4 space-y-2">
              {preview.map(([k, val]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-dashed border-border pb-2 text-sm"><span>{k}</span><span className="num">{val}</span></div>
              ))}
            </div>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-sm">Факт сопутствующей работы</span>
              <span className="num text-3xl font-semibold">15 800</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground num"><span>План 16 000 · ниже плана на 200</span><span>158 KZT/га</span></div>
            <div className="mt-4 border-l-2 border-accent bg-muted px-3 py-2 text-xs">Семена 10 т — отдельная статья, в эту сумму не входят. 158 KZT/га — только доставка, не полная стоимость посева.</div>
          </div>
        </div>
      </div>

      <div className="mt-14">
        <div className="text-xs uppercase tracking-[.2em] text-muted-foreground">7 шагов · кто что вносит</div>
        <ol className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-7">
          {STAGES.map((s) => (
            <li key={s.id} className="bg-background p-4">
              <div className="num text-xs text-muted-foreground">0{s.id}</div>
              <div className="mt-1 text-sm font-semibold">{s.role}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.title}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
