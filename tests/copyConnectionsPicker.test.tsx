// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { CopyConnectionsControl } from '../src/components/right/CopyConnectionsControl';
import { useEditorStore } from '../src/store/useEditorStore';
import { edgePairKey } from '../src/store/zones';
import type { Edge } from '../src/types/editor';

/**
 * The canvas zone picker applies the copy right away on the second pick —
 * the same click-click rhythm as the connect tool, no extra confirm. These
 * render the real control against the real store and drive the picking
 * session through the store, exactly like canvas clicks do.
 */

const t = ((key: string) => key) as never;

const actions = () => useEditorStore.getState().actions;
const state = () => useEditorStore.getState();

const addZone = (type: string): string => {
  const before = new Set(state().zones.map((z) => z.id));
  actions().addZone(type);
  return state().zones.find((z) => !before.has(z.id))!.id;
};

const pairEdges = (x: string, y: string): Edge[] =>
  state().edges.filter((e) => edgePairKey(e.from, e.to) === edgePairKey(x, y));

beforeEach(() => {
  actions().clearWorkspace();
});

afterEach(() => {
  cleanup();
});

describe('CopyConnectionsControl canvas picking', () => {
  it('applies the copy right after the second pick, no confirm click', () => {
    const a = addZone('spawn');
    const b = addZone('neutral');
    const c = addZone('spawn');
    actions().connectZones(a, b);
    const [source] = pairEdges(a, b);
    actions().updateEdgeField(source.id, { guardValue: 66666 });

    const utils = render(
      <CopyConnectionsControl sourceEdges={[source]} zones={state().zones} actions={actions()} t={t} />
    );
    fireEvent.click(utils.getByText('copyConnectionButton'));
    fireEvent.click(utils.getByText('copyConnectionsPick'));
    expect(state().zonePick).toEqual([]);

    act(() => actions().pickZone(c));
    expect(state().zonePick).toEqual([c]);
    expect(pairEdges(c, b)).toHaveLength(0);

    act(() => actions().pickZone(b));

    // Second pick: session over, clone added between the picked pair.
    expect(state().zonePick).toBeNull();
    const clones = pairEdges(c, b);
    expect(clones).toHaveLength(1);
    expect(clones[0].guardValue).toBe(66666);
  });

  it('publishes the dropdown pair as copy targets for the canvas preview', () => {
    const a = addZone('spawn');
    const b = addZone('neutral');
    actions().connectZones(a, b);
    const [source] = pairEdges(a, b);

    const utils = render(
      <CopyConnectionsControl sourceEdges={[source]} zones={state().zones} actions={actions()} t={t} />
    );
    expect(state().copyTargets).toBeNull();

    // Opening the panel publishes the current pair; closing drops it.
    fireEvent.click(utils.getByText('copyConnectionButton'));
    expect(state().copyTargets).toEqual({ a: source.from, b: source.to });
    fireEvent.click(utils.getByText('copyConnectionButton'));
    expect(state().copyTargets).toBeNull();
  });
});
