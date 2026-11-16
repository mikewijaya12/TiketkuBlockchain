'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type Toast = { id: number; msg: string; type: 'info' | 'success' | 'error' };
const Ctx = createContext<{
  push: (msg: string, type?: Toast['type']) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((msg: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, msg, type }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.type === 'success' ? 'toast-success' : ''} ${
              t.type === 'error' ? 'toast-error' : ''
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast harus di dalam ToastProvider');
  return ctx.push;
}
