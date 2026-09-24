'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { copy } from '@/lib/copy';

export type FieldTone = 'customer' | 'staff';

const TONES: Record<FieldTone, { label: string; input: string; hint: string; toggle: string }> = {
  customer: {
    label: 'text-ink-200',
    input:
      'border-white/10 bg-ink-900 text-white placeholder:text-ink-600 focus:border-flame-500/60',
    hint: 'text-ink-400',
    toggle: 'text-ink-400 hover:text-ink-200',
  },
  staff: {
    label: 'text-slate-300',
    input:
      'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-600 focus:border-sky-500',
    hint: 'text-slate-500',
    toggle: 'text-slate-500 hover:text-slate-300',
  },
};

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  tone?: FieldTone;
  autoFocus?: boolean;
}

/**
 * One text input. Password fields get a reveal toggle — typing a password
 * blind on a phone keyboard is where most failed sign-ins come from.
 */
export default function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  hint,
  tone = 'customer',
  autoFocus,
}: Props) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const styles = TONES[tone];

  const isPassword = type === 'password';
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div>
      <label htmlFor={id} className={`block text-xs font-medium ${styles.label}`}>
        {label}
      </label>

      <div className="relative mt-1.5">
        <input
          id={id}
          type={inputType}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize={type === 'email' ? 'none' : undefined}
          spellCheck={type === 'email' ? false : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors ${styles.input} ${
            isPassword ? 'pr-12' : ''
          }`}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? copy.auth.hidePassword : copy.auth.showPassword}
            aria-pressed={revealed}
            className={`absolute inset-y-0 right-0 grid w-12 place-items-center transition-colors ${styles.toggle}`}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {hint && <p className={`mt-1.5 text-[10px] ${styles.hint}`}>{hint}</p>}
    </div>
  );
}
