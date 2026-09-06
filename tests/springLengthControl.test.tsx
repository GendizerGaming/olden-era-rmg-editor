// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { EdgeInspector } from '../src/components/right/EdgeInspector';
import { useEditorStore } from '../src/store/useEditorStore';
import type { Edge, Zone } from '../src/types/editor';

/**
 * The spring distance control has to cover every length a shipped template can
 * carry: none at all, one of the presets, and any other number. "Exact value"
 * is a UI mode rather than something the number implies — a typed value that
 * happens to equal a preset must keep the box open, which is what broke when
 * the mode was derived from the data alone.
 */

const t = ((key: string) => key) as never;
const zones = [{ id: 'A' }, { id: 'B' }] as Zone[];

const spring = (length?: number): Edge => ({
  id: 'A__B', from: 'A', to: 'B', guardValue: 0, road: true,
  connectionType: 'Proximity', ...(length === undefined ? {} : { length })
});

function renderSpring(length?: number) {
  useEditorStore.setState({ uiMode: 'expert' });
  const edge = spring(length);
  const updates: Array<Partial<Edge>> = [];
  const actions = {
    updateEdgeField: (_id: string, u: Partial<Edge>) => updates.push(u)
  } as never;
  const utils = render(<EdgeInspector edge={edge} edges={[edge]} zones={zones} actions={actions} t={t} />);
  const radios = () => utils.container.querySelectorAll<HTMLInputElement>('input[name="proximity-length"]');
  const byLabel = (needle: string) =>
    [...radios()].find((r) => r.closest('label')?.textContent?.includes(needle))!;
  const box = () => utils.container.querySelector<HTMLInputElement>('input[type="number"][title="springDistCustom"]');
  return { utils, updates, byLabel, box };
}

beforeEach(() => useEditorStore.setState({ uiMode: 'expert' }));
afterEach(cleanup);

describe('spring distance control', () => {
  it('selects "not set" for a spring with no authored length', () => {
    const { byLabel, box } = renderSpring(undefined);
    expect(byLabel('springDistUnset').checked).toBe(true);
    expect(box()).toBeNull();
  });

  it('selects the matching preset', () => {
    const { byLabel } = renderSpring(0.5);
    expect(byLabel('springDistClose').checked).toBe(true);
    expect(byLabel('springDistUnset').checked).toBe(false);
  });

  it('falls back to the exact-value box for a length no preset covers', () => {
    const { byLabel, box } = renderSpring(0.94);
    expect(byLabel('springDistCustom').checked).toBe(true);
    expect(box()?.value).toBe('0.94');
  });

  it('switches into exact-value mode from a preset and keeps the number', () => {
    const { byLabel, box, updates } = renderSpring(0.1);
    expect(byLabel('springDistSnap').checked).toBe(true);

    fireEvent.click(byLabel('springDistCustom'));

    // the mode sticks even though 0.1 still matches a preset, and the value
    // is left alone so the box opens on the current number
    expect(byLabel('springDistCustom').checked).toBe(true);
    expect(box()?.value).toBe('0.1');
    expect(updates).toEqual([]);
  });

  it('clears the length when "not set" is picked', () => {
    const { byLabel, updates } = renderSpring(4);
    fireEvent.click(byLabel('springDistUnset'));
    expect(updates).toEqual([{ length: undefined }]);
  });

  it('seeds a number when entering exact-value mode from an unset spring', () => {
    const { byLabel, updates } = renderSpring(undefined);
    fireEvent.click(byLabel('springDistCustom'));
    expect(updates).toEqual([{ length: 1 }]);
  });
});
