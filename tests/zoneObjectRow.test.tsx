// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { ZoneInspector } from '../src/components/right/ZoneInspector';
import { TranslationProvider } from '../src/i18n';
import { useEditorStore } from '../src/store/useEditorStore';
import type { CatalogItem, Zone } from '../src/types/editor';

/**
 * Removing a zone object used to mean expanding its card and scrolling past
 * every field to a button at the bottom. The row carries a delete button of its
 * own now, as the last thing on the line, and it works without opening the card.
 */

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

const item = (id: string): CatalogItem => ({
  id, sid: id, kind: 'sid', label: id, description: '', guarded: false
});

/** A zone preset seeds its own objects, so the marker is what we track. */
const MARKER = 'dragon_utopia';

const setup = (): string => {
  actions().clearWorkspace();
  actions().addZone('neutral');
  const zoneId = state().zones[0].id;
  actions().addObjectToZone(zoneId, item(MARKER));
  return zoneId;
};

const zoneOf = (id: string): Zone => state().zones.find((z) => z.id === id)!;
const sids = (id: string): string[] => zoneOf(id).objects.map((o) => o.sid ?? o.id);

const renderFor = (zoneId: string) =>
  render(
    <TranslationProvider>
      <ZoneInspector
        zone={zoneOf(zoneId)}
        zones={state().zones}
        factions={[]}
        actions={actions()}
        t={t}
        language="en"
      />
    </TranslationProvider>
  );

/** The delete button on the row of the object with this label, if it is there. */
const removeButtonFor = (utils: ReturnType<typeof render>, label: string): HTMLButtonElement | null => {
  const card = [...utils.container.querySelectorAll('.ui-card')].find((el) =>
    el.querySelector('.ui-card-title')?.textContent?.includes(label)
  );
  return card?.querySelector('.ui-card-meta button[title="removeObject"]') ?? null;
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('zone object row', () => {
  it('removes the object from the collapsed row, without opening the card', () => {
    const zoneId = setup();
    const before = sids(zoneId);
    expect(before).toContain(MARKER);

    const utils = renderFor(zoneId);
    const button = removeButtonFor(utils, MARKER)!;
    expect(button).not.toBeNull();
    // Cards start collapsed, so the row is all there is to click.
    expect(button.closest('.ui-card-head')!.getAttribute('aria-expanded')).toBe('false');

    act(() => { fireEvent.click(button); });

    const after = sids(zoneId);
    expect(after).not.toContain(MARKER);
    expect(after).toHaveLength(before.length - 1);
  });

  it('puts the button last on the row, after the count and guard badges', () => {
    const zoneId = setup();
    const utils = renderFor(zoneId);

    const button = removeButtonFor(utils, MARKER)!;
    const meta = button.closest('.ui-card-meta')!;
    expect(meta.lastElementChild!.contains(button)).toBe(true);
    expect(meta.textContent).toContain('×1');
  });

  it('removes without expanding the card', () => {
    const zoneId = setup();
    const utils = renderFor(zoneId);

    const button = removeButtonFor(utils, MARKER)!;
    const head = button.closest('.ui-card-head')!;
    expect(head.getAttribute('aria-expanded')).toBe('false');

    act(() => { fireEvent.click(button); });

    // The row's own toggle must not have fired alongside the removal, and the
    // card goes away with its object once the panel sees the new zone.
    expect(sids(zoneId)).not.toContain(MARKER);
    utils.rerender(
      <TranslationProvider>
        <ZoneInspector
          zone={zoneOf(zoneId)}
          zones={state().zones}
          factions={[]}
          actions={actions()}
          t={t}
          language="en"
        />
      </TranslationProvider>
    );
    expect(removeButtonFor(utils, MARKER)).toBeNull();
  });
});
