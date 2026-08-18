'use client';

import { useId, useState } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  /** 'new-password' when creating one, 'current-password' when signing in. */
  autoComplete?: 'new-password' | 'current-password';
  autoFocus?: boolean;
};

/**
 * Password input with a show/hide toggle.
 *
 * The value is never trimmed anywhere in this app -- leading and trailing
 * spaces are legal password characters, and silently stripping them makes a
 * password that worked at signup fail at sign-in.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  autoComplete = 'new-password',
  autoFocus = false,
}: Props) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>

      <div className="password-wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>

      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
