import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, CheckCheck, AlertTriangle, X } from "lucide-react";
import {
  STAGES, completedExample, initialState, nextStage, submitStage, updateDrafts, DEFAULT_DRAFTS,
  type DemoState, type Drafts, type FieldErrors, type StageId,
} from "@/demo/model";
import { loadState, saveState } from "@/demo/storage";
import { Intro } from "@/components/demo/Intro";
import { Stepper } from "@/components/demo/Stepper";
import { StageForm } from "@/components/demo/StageForm";
import { Ledger, Summary } from "@/components/demo/Ledger";
import { Btn, ConfirmDialog, DemoTag } from "@/components/demo/ui";

type Screen = "intro" | "work";
type Pending = null | { kind: "example" | "reset" | "guide"; title: string; text: string; label: string };

function App() {
  const [{ state: loaded, error: loadErr }] = useState(loadState);
  const [state, setState] = useState<DemoState>(loaded);
  const [storageError, setStorageError] = useState<string | null>(loadErr);
  const [screen, setScreen] = useState<Screen>(Object.keys(loaded.records).length ? "work" : "intro");
  const [active, setActive] = useState<StageId>(nextStage(loaded) ?? 7);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [guide, setGuide] = useState(false);
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => { const e = saveState(state); setStorageError((prev) => e ?? (prev?.startsWith("Не удалось сохранить") ? null : prev)); }, [state]);

  const stateRef = useRef(state); stateRef.current = state;

  // Autoplay: every ~5s submit the next stage with the original example values.
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      const s = stateRef.current;
      const n = nextStage(s);
      if (!n) { setPlaying(false); return; }
      const reset = { ...s, drafts: { ...s.drafts, [keyFor(n)]: structuredClone(DEFAULT_DRAFTS[keyFor(n)]) } } as DemoState;
      const res = submitStage(reset, n, new Date().toISOString());
      if (res.ok) {
        setState(res.state); setActive(n); setErrors({});
        setFlash(`Авто: ${STAGES[n - 1].role} отправил демо-запись этапа ${n}`);
        if (!nextStage(res.state)) setPlaying(false);
      } else setPlaying(false);
      setTick((x) => x + 1);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [playing, tick]);

  const onDraft = useCallback(<K extends keyof Drafts>(key: K, patch: Partial<Drafts[K]>) => {
    setPlaying(false);
    setState((s) => updateDrafts(s, key, patch, true));
  }, []);

  const onSubmit = () => {
    setPlaying(false);
    const res = submitStage(state, active, new Date().toISOString(), true);
    if (!res.ok) { setErrors(res.fields ?? {}); setFlash(res.error); return; }
    setState(res.state); setErrors({});
    setFlash(`Этап ${active} отправлен (демо-запись)`);
    const n = nextStage(res.state); if (n) setActive(n);
  };

  const apply = (kind: "example" | "reset" | "guide") => {
    setPending(null); setErrors({});
    if (kind === "example") { const s = completedExample(new Date().toISOString()); setState(s); setActive(7); setPlaying(false); setGuide(false); setScreen("work"); setFlash("Загружен готовый пример"); }
    if (kind === "reset") { setState(initialState()); setActive(1); setPlaying(false); setGuide(false); setScreen("intro"); setFlash(null); }
    if (kind === "guide") { setState(initialState()); setActive(1); setGuide(true); setScreen("work"); setTick(0); setPlaying(true); setFlash("Автопоказ: отправляет ДЕМО-записи по исходному примеру"); }
  };
  const ask = (kind: "example" | "reset" | "guide") => {
    const hasData = Object.keys(state.records).length > 0;
    if (state.custom || (kind === "reset" && hasData) || (kind === "guide" && hasData)) {
      const map = {
        example: ["Заменить ваши изменения?", "Ваши правки в демо будут заменены готовым примером.", "Заменить"],
        reset: ["Сбросить демо?", "Удаляются только данные этого демо в браузере. Основная система не затрагивается.", "Сбросить"],
        guide: ["Начать показ заново?", "Текущие демо-записи будут заменены исходным примером.", "Начать показ"],
      }[kind];
      setPending({ kind, title: map[0], text: map[1], label: map[2] });
    } else apply(kind);
  };

  const done = !nextStage(state);
  const cur = nextStage(state);

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
          <button type="button" data-testid="link-home" onClick={() => { setPlaying(false); setScreen("intro"); }} className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight">AgroLink</span><span className="text-xs uppercase tracking-[.16em] text-muted-foreground">operation</span>
          </button>
          <DemoTag />
          <span className="hidden text-sm text-muted-foreground md:inline">Сопутствующая работа: фактическая стоимость из источников</span>
          <div className="ml-auto flex flex-wrap gap-1">
            <Btn variant="ghost" testId="button-header-example" onClick={() => ask("example")}><CheckCheck className="h-4 w-4" /><span className="hidden sm:inline">Готовый пример</span></Btn>
            <Btn variant="ghost" testId="button-reset" onClick={() => ask("reset")}><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">Сброс демо</span></Btn>
          </div>
        </div>
      </header>

      {storageError && (
        <div className="border-b border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-8" data-testid="text-storage-error">
          <div className="mx-auto flex max-w-7xl items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{storageError}</span><button type="button" data-testid="button-dismiss-storage" onClick={() => setStorageError(null)}><X className="h-4 w-4" /></button></div>
        </div>
      )}

      {screen === "intro" ? (
        <Intro onGuide={() => ask("guide")} onManual={() => { setGuide(false); setScreen("work"); setActive(nextStage(state) ?? 7); }} onExample={() => ask("example")} />
      ) : (
        <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-8">
          {guide && (
            <div className="border border-foreground bg-card" data-testid="panel-autoplay">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex-1 text-sm">
                  <div className="font-semibold">{done ? "Показ завершён: итог 15 800 KZT подтверждён" : playing ? `Автопоказ: следующий шаг — ${cur ? STAGES[cur - 1].role : ""}` : "Автопоказ на паузе"}</div>
                  <div className="text-xs text-muted-foreground">Автоматически отправляет ДЕМО-записи исходного примера каждые ~5 секунд. Сервер не вызывается. Любая правка формы ставит паузу.</div>
                </div>
                {!done && <Btn variant="line" testId="button-autoplay-toggle" onClick={() => { setPlaying((p) => !p); setTick((x) => x + 1); }}>{playing ? <><Pause className="h-4 w-4" />Пауза</> : <><Play className="h-4 w-4" />Продолжить</>}</Btn>}
                <Btn variant="ghost" testId="button-autoplay-close" onClick={() => { setPlaying(false); setGuide(false); }}>Пройти самостоятельно</Btn>
              </div>
              {playing && <div key={tick} className="autobar h-0.5 bg-accent" />}
            </div>
          )}
          {flash && <div className="rise num border-l-2 border-foreground bg-muted px-3 py-2 text-xs" data-testid="text-flash" key={flash}>{flash}</div>}
          <Stepper state={state} active={active} onSelect={(id) => { setActive(id); setErrors({}); }} />
          <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            <StageForm state={state} stage={active} errors={errors} onDraft={onDraft} onSubmit={onSubmit} />
            <div className="space-y-4">
              <Summary state={state} />
              <Ledger state={state} />
            </div>
          </div>
        </main>
      )}

      <ConfirmDialog open={!!pending} title={pending?.title ?? ""} text={pending?.text ?? ""} confirmLabel={pending?.label ?? ""} onCancel={() => setPending(null)} onConfirm={() => pending && apply(pending.kind)} />
    </div>
  );
}

function keyFor(id: StageId): keyof Drafts {
  return (["plan", "start", "tok", "motor", "fuel", "hr", "finish"] as const)[id - 1];
}

export default App;
