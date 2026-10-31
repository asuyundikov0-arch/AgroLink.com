import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { validateState, type DemoState, type Result, type Role } from './engine';
import { createSeed } from './seed';

export const STORAGE_KEY = 'agrolink.company-ecosystem-demo.v1';

export type LoadStatus =
  | { kind: 'ok' }
  | { kind: 'corrupt'; error: string }
  | { kind: 'unavailable'; error: string };

export type Section = 'overview' | 'register' | 'custody' | 'requests' | 'journal' | 'ecosystem';

export type DialogState =
  | { kind: 'receipt'; itemId?: string }
  | { kind: 'issue'; itemId?: string; fromHolder?: string }
  | { kind: 'transfer'; itemId?: string; fromHolder?: string }
  | { kind: 'return'; itemId?: string; employeeId?: string }
  | { kind: 'request'; type: 'supply' | 'writeoff'; itemId?: string; sourceHolderId?: string }
  | { kind: 'decide'; requestId: string; decision: 'approve' | 'reject' }
  | { kind: 'fulfill'; requestId: string }
  | { kind: 'reset' }
  | null;

function load(): { state: DemoState | null; status: LoadStatus } {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return { state: createSeed(), status: { kind: 'unavailable', error: e instanceof Error ? e.message : 'localStorage недоступен' } };
  }
  if (raw === null) {
    const seed = createSeed();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    } catch (e) {
      return { state: seed, status: { kind: 'unavailable', error: e instanceof Error ? e.message : 'Запись запрещена' } };
    }
    return { state: seed, status: { kind: 'ok' } };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const err = validateState(parsed);
    if (err) return { state: null, status: { kind: 'corrupt', error: err } };
    return { state: parsed as DemoState, status: { kind: 'ok' } };
  } catch {
    return { state: null, status: { kind: 'corrupt', error: 'Сохранённые данные не являются корректным JSON' } };
  }
}

interface Ctx {
  state: DemoState | null;
  status: LoadStatus;
  saveError: string | null;
  run: (fn: (s: DemoState) => Result) => Result;
  resetDemo: () => void;
  role: Role;
  setRole: (r: Role) => void;
  actingEmployeeId: string;
  setActingEmployeeId: (id: string) => void;
  section: Section;
  go: (s: Section, opts?: { itemId?: string | null; employeeId?: string | null }) => void;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  focusEmployeeId: string | null;
  dialog: DialogState;
  setDialog: (d: DialogState) => void;
  guideOpen: boolean;
  setGuideOpen: (v: boolean) => void;
}

const DemoCtx = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [{ state, status }, setLoaded] = useState(load);
  const [saveError, setSaveError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [role, setRole] = useState<Role>('director');
  const [actingEmployeeId, setActingEmployeeId] = useState('EMP-02');
  const [section, setSection] = useState<Section>('overview');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [focusEmployeeId, setFocusEmployeeId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Other tabs: pick up their writes so selections never act on stale data.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLoaded(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const run = useCallback((fn: (s: DemoState) => Result): Result => {
    const cur = stateRef.current;
    if (!cur) return { ok: false, error: 'Данные демо недоступны' };
    const res = fn(cur);
    if (!res.ok) return res;
    stateRef.current = res.state;
    setLoaded((prev) => ({ ...prev, state: res.state }));
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(res.state));
      setSaveError(null);
    } catch (e) {
      setSaveError(`Изменение применено, но не сохранено в браузере: ${e instanceof Error ? e.message : 'ошибка записи'}`);
    }
    return res;
  }, []);

  const resetDemo = useCallback(() => {
    const seed = createSeed();
    stateRef.current = seed;
    let st: LoadStatus = { kind: 'ok' };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      setSaveError(null);
    } catch (e) {
      st = { kind: 'unavailable', error: e instanceof Error ? e.message : 'Запись запрещена' };
    }
    setLoaded({ state: seed, status: st });
    setSelectedItemId(null);
    setFocusEmployeeId(null);
  }, []);

  const go = useCallback((s: Section, opts?: { itemId?: string | null; employeeId?: string | null }) => {
    setSection(s);
    if (opts && 'itemId' in opts) setSelectedItemId(opts.itemId ?? null);
    if (opts && 'employeeId' in opts) setFocusEmployeeId(opts.employeeId ?? null);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <DemoCtx.Provider
      value={{
        state, status, saveError, run, resetDemo, role, setRole, actingEmployeeId, setActingEmployeeId,
        section, go, selectedItemId, setSelectedItemId, focusEmployeeId, dialog, setDialog, guideOpen, setGuideOpen,
      }}
    >
      {children}
    </DemoCtx.Provider>
  );
}

export function useDemo(): Ctx {
  const c = useContext(DemoCtx);
  if (!c) throw new Error('DemoProvider missing');
  return c;
}

/** Use inside components rendered only when state is loaded. */
export function useDemoState(): DemoState {
  const { state } = useDemo();
  if (!state) throw new Error('Demo state not loaded');
  return state;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const fmtKzt = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ₸';
export const fmtNum = (v: number) => new Intl.NumberFormat('ru-RU').format(v);
