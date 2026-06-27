import React, { useEffect, useRef, useState } from 'react';

type NumberFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number;
  onCommit: (value: number) => void;
};

/**
 * Controlled number input that keeps a local text draft while focused, so
 * the field can be temporarily empty or hold a partial value (e.g. "-")
 * during editing. Every valid number is committed as the user types; on
 * blur the draft is dropped and the field shows the last committed value.
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onCommit,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  // The value we last committed ourselves. Lets us tell our own edit from an
  // outside change (e.g. the inspector switching to another zone).
  const syncedValue = useRef(value);

  // Drop a stale draft when `value` changes from outside our own commit.
  // Without this, after editing a field and clicking another zone (the canvas
  // keeps the input focused) the field would keep showing the previous value.
  useEffect(() => {
    if (value !== syncedValue.current) {
      syncedValue.current = value;
      setDraft(null);
    }
  }, [value]);

  // Typed values are clamped to the min/max props on commit, so the bounds
  // hold for keyboard input as well as for the spinner buttons.
  const clamp = (parsed: number): number => {
    let result = parsed;
    if (rest.min !== undefined) result = Math.max(Number(rest.min), result);
    if (rest.max !== undefined) result = Math.min(Number(rest.max), result);
    return result;
  };

  return (
    <input
      {...rest}
      type="number"
      value={draft ?? value}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (text !== '') {
          const parsed = Number(text);
          if (!Number.isNaN(parsed)) {
            const next = clamp(parsed);
            syncedValue.current = next;
            onCommit(next);
          }
        }
      }}
      onFocus={(e) => {
        setDraft(e.target.value);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
};
