import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';

/**
 * Design-system primitives. They consume the size/colour tokens from
 * index.css, so they render correctly in both the dark and light themes
 * without per-call styling. Use these instead of bespoke inline styles.
 */

export const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <span className="ui-tip" title={text} tabIndex={0} role="img" aria-label={text}>
    <Info size={12} />
  </span>
);

interface FieldProps {
  /** Label text (already translated). */
  label: React.ReactNode;
  /** Help text shown below the control. */
  hint?: React.ReactNode;
  /** Short help shown as an (i) tooltip next to the label. */
  tip?: string;
  /** The control: input / select / textarea / NumberField. */
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, tip, children }) => (
  <label className="ui-field">
    <span className="ui-field-label">
      {label}
      {tip && <InfoTip text={tip} />}
    </span>
    {children}
    {hint != null && hint !== '' && <span className="ui-field-hint">{hint}</span>}
  </label>
);

interface FieldRowProps {
  /** Full-width help text shown below the row. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}

export const FieldRow: React.FC<FieldRowProps> = ({ hint, children }) => (
  <>
    <div className="ui-field-row">{children}</div>
    {hint != null && hint !== '' && <p className="ui-field-hint ui-field-hint--row">{hint}</p>}
  </>
);

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: React.ReactNode;
  /** Help text shown below the toggle. */
  hint?: React.ReactNode;
  /** Short help shown as an (i) tooltip next to the label. */
  tip?: string;
  /** Disables the checkbox and dims the row. */
  disabled?: boolean;
  /** Native tooltip on the whole row (e.g. why it's disabled). */
  title?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, hint, tip, disabled, title }) => (
  <>
    <label className={`ui-toggle${disabled ? ' ui-toggle--disabled' : ''}`} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle-text">
        {label}
        {tip && <InfoTip text={tip} />}
      </span>
    </label>
    {hint != null && hint !== '' && <p className="ui-field-hint ui-field-hint--toggle">{hint}</p>}
  </>
);

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warning' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', title, children }) => (
  <span className={`ui-badge ui-badge--${tone}`} title={title}>{children}</span>
);

const CARD_STORAGE_PREFIX = 'rmg.ui.card.';

function readCardOpen(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback;
  try {
    const stored = localStorage.getItem(CARD_STORAGE_PREFIX + id);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

interface CardProps {
  /** Optional stable key to persist the open/closed state across sessions. */
  id?: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned summary (pills/badges) shown in the header. */
  meta?: React.ReactNode;
  /** Right-aligned controls (e.g. a remove button); clicks here don't toggle. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A collapsible card/chip for a repeating entity (zone object, castle,
 * connection, preset…). Collapsed it shows just a header row — title + meta —
 * so a list of them stays scannable; expanded it reveals the editor body.
 */
export const Card: React.FC<CardProps> = ({ id, title, icon, meta, actions, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(() => readCardOpen(id, defaultOpen));
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (id) {
        try { localStorage.setItem(CARD_STORAGE_PREFIX + id, next ? '1' : '0'); } catch { /* best-effort */ }
      }
      return next;
    });
  }, [id]);

  return (
    <div className={`ui-card${open ? '' : ' ui-card--collapsed'}`}>
      <div
        className="ui-card-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <span className="ui-card-chev">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="ui-card-title">{icon}{title}</span>
        <span className="ui-card-meta">
          {meta}
          {actions && <span className="ui-card-actions" onClick={(e) => e.stopPropagation()}>{actions}</span>}
        </span>
      </div>
      {open && <div className="ui-card-body">{children}</div>}
    </div>
  );
};
