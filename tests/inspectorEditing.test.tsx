// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { TranslationProvider } from '../src/i18n';
import { ZoneInspector } from '../src/components/right/ZoneInspector';
import { PresetInspector } from '../src/components/right/PresetInspector';
import { EdgeInspector } from '../src/components/right/EdgeInspector';
import { ListRow, Toggle } from '../src/components/shared/primitives';
import { useEditorStore } from '../src/store/useEditorStore';
import { importTemplateForRoundTrip } from './helpers/gameTemplateRoundTrip.ts';
import type { RmgTemplate } from '../src/types/rmg.ts';

/**
 * Interaction tests for the redesigned inspector controls: the migration swapped
 * <input>/<label>/<select> for the Field/Toggle/Card primitives and rewrote the
 * onChange/onCommit callbacks. These render the real component, drive a control,
 * and assert the resulting store action + value — i.e. they verify the
 * "control -> store" wiring the redesign touched. The "store -> .rmg.json" half
 * is already covered by the 207 import/round-trip tests, so together they cover
 * the full edit-to-JSON path. Expected values come from the .rmg.json format
 * (e.g. guarded: false = "unguarded"), not from current output.
 */

// Mock translator passed as the `t` prop, so control labels equal their i18n
// keys — stable selectors regardless of the actual translations.
const t = ((key: string) => key) as never;

function template(content: unknown[]): RmgTemplate {
  return {
    name: 'T', gameMode: 'Classic', sizeX: 128, sizeZ: 128,
    mandatoryContent: [{ name: 'mc', content }],
    variants: [{ zones: [{ name: 'A', size: 1, mandatoryContent: ['mc'] }], connections: [] }]
  } as unknown as RmgTemplate;
}

/** Any action accessed becomes its own vi.fn() spy. */
function spyActions() {
  const cache: Record<string, ReturnType<typeof vi.fn>> = {};
  return new Proxy({}, { get: (_t, prop: string) => (cache[prop] ??= vi.fn()) }) as never;
}

function renderZone(objectContent: unknown[]) {
  const doc = importTemplateForRoundTrip(template(objectContent));
  const zone = doc.zones[0];
  const actions = spyActions();
  useEditorStore.setState({ uiMode: 'expert' });
  const utils = render(
    <TranslationProvider>
      <ZoneInspector zone={zone} zones={[zone]} factions={[]} actions={actions} t={t} language="ru" />
    </TranslationProvider>
  );
  return { ...utils, zone, obj: zone.objects[0], actions };
}

/** The object Card renders collapsed; click its header (titled by the label) to open. */
function openObjectCard(utils: ReturnType<typeof renderZone>) {
  const label = utils.obj.label || utils.obj.sid || utils.obj.id || '';
  fireEvent.click(utils.getByText(label));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => cleanup());

describe('ZoneInspector object controls -> store', () => {
  it('tri-state guarded select writes false / true / undefined per the format', () => {
    const u = renderZone([{ sid: 'mana_well' }]);
    openObjectCard(u);
    const select = u.getByLabelText('objectGuardLabel') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'unguarded' } });
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { guarded: false });

    fireEvent.change(select, { target: { value: 'guarded' } });
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { guarded: true });

    fireEvent.change(select, { target: { value: 'default' } });
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { guarded: undefined });
  });

  it('tri-state designatedEncounter select writes explicit false (must not be dropped)', () => {
    const u = renderZone([{ sid: 'mana_well' }]);
    openObjectCard(u);
    const select = u.getByLabelText('objectDesignatedEncounter') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'off' } });
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { designatedEncounter: false });

    fireEvent.change(select, { target: { value: 'default' } });
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { designatedEncounter: undefined });
  });

  it('soloEncounter Toggle writes a boolean', () => {
    const u = renderZone([{ sid: 'mana_well' }]);
    openObjectCard(u);
    fireEvent.click(u.getByLabelText('objectSoloEncounter'));
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { soloEncounter: true });
  });

  it('count NumberField commits the typed number', () => {
    const u = renderZone([{ sid: 'mana_well' }]);
    openObjectCard(u);
    const input = u.getByLabelText('objectCount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(u.actions.updateObjectField).toHaveBeenLastCalledWith(u.zone.id, u.obj.key, { count: 5 });
  });

  it('holes Toggle writes the zone-level encounterHolesSettings', () => {
    const u = renderZone([{ sid: 'mana_well' }]);
    fireEvent.click(u.getByText('zoneGuardSection')); // open the Guards subsection
    fireEvent.click(u.getByLabelText('zoneHolesToggle'));
    expect(u.actions.updateZoneField).toHaveBeenLastCalledWith(u.zone.id, {
      encounterHolesSettings: { affectedEncounters: 0.66, twoHoleEncounters: 0.66 }
    });
  });
});

describe('PresetInspector object controls -> store', () => {
  function renderPreset(objGuarded: boolean | undefined) {
    const base = Object.values(useEditorStore.getState().presets)[0];
    const preset = {
      ...base, id: 'p1', label: 'P', isCustom: true,
      objects: [{ key: 'po1', kind: 'sid', sid: 'x', count: 1, guarded: objGuarded, soloEncounter: false, roadDistance: 'any', townDistance: 'any' }]
    } as never;
    const actions = spyActions();
    useEditorStore.setState({ uiMode: 'expert' });
    const utils = render(
      <TranslationProvider>
        <PresetInspector presetId="p1" presets={{ p1: preset }} actions={actions} t={t} language="ru" />
      </TranslationProvider>
    );
    return { ...utils, actions };
  }

  it('guarded Toggle coerces tri-state to a boolean (Boolean(obj.guarded) path)', () => {
    const u = renderPreset(undefined);   // starts as the engine default (undefined)
    fireEvent.click(u.getByText('x'));   // expand the object Card
    fireEvent.click(u.getByLabelText('objectGuarded'));
    // undefined -> checkbox reads false -> clicking turns it on -> guarded: true
    expect(u.actions.updatePresetObjectField).toHaveBeenLastCalledWith('p1', 'po1', { guarded: true });
  });
});

describe('EdgeInspector controls -> store', () => {
  function renderEdge() {
    const edge = { id: 'e1', from: 'A', to: 'B', guardValue: 5000, road: false, connectionType: 'Default' } as never;
    const actions = spyActions();
    useEditorStore.setState({ uiMode: 'expert' });
    const utils = render(
      <TranslationProvider>
        <EdgeInspector edge={edge} edges={[edge]} actions={actions} t={t} />
      </TranslationProvider>
    );
    return { ...utils, actions };
  }

  it('guardEscape Toggle writes a boolean', () => {
    const u = renderEdge();
    fireEvent.click(u.getByLabelText('guardEscape')); // default-true -> off
    expect(u.actions.updateEdgeField).toHaveBeenLastCalledWith('e1', { guardEscape: false });
  });

  it('guardZone select (advanced subsection) writes the value, empty -> undefined', () => {
    const u = renderEdge();
    fireEvent.click(u.getByText('edgeAdvancedSection')); // open the advanced subsection
    const select = u.getByLabelText('edgeGuardZone') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Center' } });
    expect(u.actions.updateEdgeField).toHaveBeenLastCalledWith('e1', { guardZone: 'Center' });
    fireEvent.change(select, { target: { value: '' } });
    expect(u.actions.updateEdgeField).toHaveBeenLastCalledWith('e1', { guardZone: undefined });
  });
});

describe('ListRow / Toggle primitive interaction contract', () => {
  it('ListRow: row click fires onClick; a trailing-control click does not (stopPropagation)', () => {
    const onRow = vi.fn();
    const onTrailing = vi.fn();
    const { getByText } = render(
      <ListRow title="Row" onClick={onRow} trailing={<button onClick={onTrailing}>Del</button>} />
    );
    fireEvent.click(getByText('Row'));
    expect(onRow).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('Del'));
    expect(onTrailing).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenCalledTimes(1); // unchanged: trailing click did not bubble to the row
  });

  it('Toggle: forwards disabled + title (the attribute is what blocks the click in a browser)', () => {
    // jsdom still dispatches change on a disabled checkbox, unlike a real browser,
    // so assert the wiring (disabled attribute + row title/class) rather than the
    // click suppression itself.
    const { getByLabelText, container } = render(
      <Toggle checked disabled onChange={vi.fn()} label="L" title="why" />
    );
    expect((getByLabelText('L') as HTMLInputElement).disabled).toBe(true);
    const row = container.querySelector('.ui-toggle')!;
    expect(row.classList.contains('ui-toggle--disabled')).toBe(true);
    expect(row.getAttribute('title')).toBe('why');
  });
});
