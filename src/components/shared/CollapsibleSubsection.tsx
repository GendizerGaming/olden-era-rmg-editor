import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InfoTip } from './primitives';

const STORAGE_PREFIX = 'rmg.ui.subsection.';

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + id);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

interface CollapsibleSubsectionProps {
  /** Stable key used to persist the open/closed state across sessions. */
  id: string;
  /** Header label (already translated). */
  title: string;
  /** Optional leading icon node. */
  icon?: React.ReactNode;
  /** Short help shown as an (i) tooltip next to the title. */
  tip?: string;
  /** Optional content shown on the right of the header (badges, counters). */
  actions?: React.ReactNode;
  /** Initial state when nothing is stored yet. Defaults to open. */
  defaultOpen?: boolean;
  /** Draw the expanded body as an inset card (panel background + border), so
   *  its content doesn't blend with the siblings below the subsection. */
  boxed?: boolean;
  children: React.ReactNode;
}

/**
 * A collapsible sub-section: a clickable header that expands/collapses its body,
 * remembering the choice in localStorage so the layout the user set up survives
 * navigation and reloads. Visual separators between sub-sections come from the
 * `.collapsible-subsection` CSS (the last one drops its border automatically).
 */
export const CollapsibleSubsection: React.FC<CollapsibleSubsectionProps> = ({
  id,
  title,
  icon,
  tip,
  actions,
  defaultOpen = true,
  boxed = false,
  children
}) => {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0');
      } catch {
        /* persistence is best-effort */
      }
      return next;
    });
  }, [id]);

  return (
    <div className="collapsible-subsection">
      <button
        type="button"
        className="collapsible-subsection-header"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="collapsible-subsection-title">
          {icon}
          <span>{title}</span>
          {tip && <span onClick={(e) => e.stopPropagation()}><InfoTip text={tip} /></span>}
        </span>
        <span className="collapsible-subsection-header-actions">
          {actions}
          {open
            ? <ChevronDown size={14} className="collapse-icon" />
            : <ChevronRight size={14} className="collapse-icon" />}
        </span>
      </button>
      {open && (
        <div className={`collapsible-subsection-body${boxed ? ' boxed' : ''}`}>{children}</div>
      )}
    </div>
  );
};
