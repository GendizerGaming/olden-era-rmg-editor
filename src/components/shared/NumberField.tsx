import React, { useState } from 'react';

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
            onCommit(clamp(parsed));
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
