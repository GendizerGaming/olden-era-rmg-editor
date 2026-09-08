// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { TerrainProfileInspector } from '../src/components/right/TerrainProfileInspector';
import { useEditorStore } from '../src/store/useEditorStore';
import type { TerrainProfile } from '../src/types/editor';

/**
 * The elevation control has to carry every mode set a template can hold, not
 * just the named ones: shipped templates use fractions the presets don't cover,
 * and a zone pinned to high ground needs a constant 100% that no preset offered
 * before. "Custom" is a mode of the control rather than something the numbers
 * imply, so typed values landing back on a preset must keep the editor open.
 */

const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

const actions = () => useEditorStore.getState().actions;
const profiles = (): TerrainProfile[] => useEditorStore.getState().settings.terrainProfiles;

const addProfile = (): TerrainProfile => {
  const before = new Set(profiles().map((p) => p.name));
  actions().addTerrainProfile();
  return profiles().find((p) => !before.has(p.name))!;
};

const modesOf = (name: string) => profiles().find((p) => p.name === name)!.elevationModes;

const renderFor = (profile: TerrainProfile) =>
  render(<TerrainProfileInspector profile={profile} zones={[]} actions={actions()} t={t} />);

const elevationSelect = (utils: ReturnType<typeof render>): HTMLSelectElement => {
  const option = [...utils.container.querySelectorAll('option')]
    .find((o) => o.value === 'plateau')!;
  return option.closest('select') as HTMLSelectElement;
};

beforeEach(() => {
  actions().clearWorkspace();
});

afterEach(() => {
  cleanup();
});

describe('terrain elevation control', () => {
  it('offers a constant plateau and writes it as a full-fraction mode', () => {
    const profile = addProfile();
    const utils = renderFor(profile);

    fireEvent.change(elevationSelect(utils), { target: { value: 'plateau' } });

    expect(modesOf(profile.name)).toEqual([
      { weight: 1, minElevatedFraction: 1, maxElevatedFraction: 1 }
    ]);
  });

  it('spells out each variant as a percentage of the zone', () => {
    const profile = addProfile();
    const utils = renderFor(profile);
    fireEvent.change(elevationSelect(utils), { target: { value: 'hills' } });

    utils.rerender(
      <TerrainProfileInspector
        profile={profiles().find((p) => p.name === profile.name)!}
        zones={[]}
        actions={actions()}
        t={t}
      />
    );

    // Weights 2 and 1 read as two chances out of three, and the ranges are
    // shown in percent rather than as the raw 0..1 fractions.
    const text = utils.container.textContent ?? '';
    expect(text).toContain('"chance":67');
    expect(text).toContain('20%–40%');
    expect(text).toContain('"chance":33');
    expect(text).toContain('60%–80%');
  });

  it('states a single variant without a chance, and collapses an equal range', () => {
    const profile = addProfile();
    const utils = renderFor(profile);
    fireEvent.change(elevationSelect(utils), { target: { value: 'plateau' } });
    utils.rerender(
      <TerrainProfileInspector
        profile={profiles().find((p) => p.name === profile.name)!}
        zones={[]}
        actions={actions()}
        t={t}
      />
    );

    const text = utils.container.textContent ?? '';
    expect(text).toContain('terrainElevationModeSingle:{"range":"100%"}');
    expect(text).not.toContain('terrainElevationModeChance');
  });

  it('keeps the custom editor open when typed values land back on a preset', () => {
    const profile = addProfile();
    const utils = renderFor(profile);

    // A blank profile already carries the "flat" mode set, so switching to
    // custom leaves values that match a preset exactly.
    expect(elevationSelect(utils).value).toBe('flat');
    fireEvent.change(elevationSelect(utils), { target: { value: 'custom' } });

    expect(elevationSelect(utils).value).toBe('custom');
    expect(utils.queryByText('terrainElevationAddVariant')).not.toBeNull();
    // Nothing was rewritten just by opening the editor.
    expect(modesOf(profile.name)).toEqual([
      { weight: 1, minElevatedFraction: 0, maxElevatedFraction: 0 }
    ]);
  });

  it('adds and removes variants, and cannot remove the last one', () => {
    const profile = addProfile();
    let current = profile;
    const utils = renderFor(current);
    const rerender = () => {
      current = profiles().find((p) => p.name === profile.name)!;
      utils.rerender(<TerrainProfileInspector profile={current} zones={[]} actions={actions()} t={t} />);
    };

    fireEvent.change(elevationSelect(utils), { target: { value: 'custom' } });
    // One variant: the remove button is there but disabled.
    const removeFirst = utils.getByTitle('terrainElevationRemoveVariant') as HTMLButtonElement;
    expect(removeFirst.disabled).toBe(true);

    act(() => { fireEvent.click(utils.getByText('terrainElevationAddVariant')); });
    rerender();
    expect(modesOf(profile.name)).toHaveLength(2);

    const removes = utils.getAllByTitle('terrainElevationRemoveVariant') as HTMLButtonElement[];
    expect(removes.every((b) => b.disabled)).toBe(false);
    act(() => { fireEvent.click(removes[0]); });
    rerender();
    expect(modesOf(profile.name)).toHaveLength(1);
  });

  it('writes typed percentages back as fractions and keeps the range ordered', () => {
    const profile = addProfile();
    let current = profile;
    const utils = renderFor(current);
    const rerender = () => {
      current = profiles().find((p) => p.name === profile.name)!;
      utils.rerender(<TerrainProfileInspector profile={current} zones={[]} actions={actions()} t={t} />);
    };
    fireEvent.change(elevationSelect(utils), { target: { value: 'custom' } });

    const commit = (input: HTMLInputElement, value: string) => {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    };
    // Scope to the custom editor: the panel above it has its own number fields
    // for obstacles and lakes.
    const rowInputs = () => {
      const editor = utils.getByText('terrainElevationAddVariant').parentElement!;
      return [...editor.querySelectorAll('input')];
    };

    // 40% max, then a min of 70% must carry the max up with it rather than
    // leaving an inverted range the generator could not roll inside.
    const inputs = rowInputs();
    commit(inputs[2] as HTMLInputElement, '40');
    rerender();
    expect(modesOf(profile.name)![0].maxElevatedFraction).toBeCloseTo(0.4, 5);

    commit(rowInputs()[1] as HTMLInputElement, '70');
    rerender();
    expect(modesOf(profile.name)![0]).toEqual({
      weight: 1,
      minElevatedFraction: 0.7,
      maxElevatedFraction: 0.7
    });
  });
});
