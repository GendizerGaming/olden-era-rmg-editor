import React, { useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import type { TopologyKind } from '../services/topologyGenerator';
import { NumberField } from './shared/NumberField';
import { presetDisplayName } from './shared/presetNames';
import { Wand2, X } from 'lucide-react';

interface TopologyWizardProps {
  onClose: () => void;
}

const KINDS: TopologyKind[] = ['ring', 'chain', 'star', 'random'];

/**
 * The skeleton generator dialog: picks a topology pattern and presets, then
 * replaces the canvas with the generated zones and connections. Everything
 * it produces is ordinary editor state — fully editable and undoable.
 */
export const TopologyWizard: React.FC<TopologyWizardProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const presets = useEditorStore((state) => state.presets);
  const settings = useEditorStore((state) => state.settings);
  const zonesCount = useEditorStore((state) => state.zones.length);
  const actions = useEditorStore((state) => state.actions);

  const [kind, setKind] = useState<TopologyKind>('ring');
  const [players, setPlayers] = useState(Math.min(8, Math.max(2, settings.players)));
  const [neutralsPerSegment, setNeutralsPerSegment] = useState(1);
  const [extraNeutrals, setExtraNeutrals] = useState(8);
  const [centerZone, setCenterZone] = useState(true);
  const [isolatePlayers, setIsolatePlayers] = useState(true);
  const [citiesPerPlayer, setCitiesPerPlayer] = useState(1);
  const [citiesInCenter, setCitiesInCenter] = useState(0);
  const [spawnPresetId, setSpawnPresetId] = useState('spawn');
  const [nearPresetId, setNearPresetId] = useState('low');
  const [midPresetId, setMidPresetId] = useState('medium');
  const [farPresetId, setFarPresetId] = useState('high');
  const [centerPresetId, setCenterPresetId] = useState('high');

  const presetOptions = Object.values(presets);
  const showSegments = kind !== 'random';
  const showCenterToggle = kind === 'ring';
  const hasCenter = kind === 'star' || (kind === 'ring' && centerZone);

  const handleGenerate = () => {
    actions.generateTopology({
      kind,
      players,
      neutralsPerSegment,
      extraNeutrals,
      centerZone: kind === 'ring' ? centerZone : kind === 'star',
      isolatePlayers,
      spawnPresetId,
      nearPresetId,
      midPresetId,
      farPresetId,
      centerPresetId,
      extraCitiesPerPlayer: citiesPerPlayer,
      extraCitiesInCenter: hasCenter ? citiesInCenter : 0
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 16, 10, 0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={t('topologyWizardTitle')}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          padding: '16px',
          width: 'min(420px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          display: 'grid',
          gap: '10px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Wand2 size={15} style={{ color: 'var(--accent)' }} />
            {t('topologyWizardTitle')}
          </strong>
          <button type="button" className="compact-button" onClick={onClose} title={t('topologyClose')}>
            <X size={13} />
          </button>
        </div>

        <label>
          {t('topologyKind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as TopologyKind)}>
            {KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>{t(`topology_${candidate}`)}</option>
            ))}
          </select>
        </label>
        <p className="field-note" style={{ marginTop: 0 }}>{t(`topologyHelp_${kind}`)}</p>

        <div className="field-row" style={{ marginBottom: 0 }}>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologyPlayers')}</span>
            <NumberField
              min={2}
              max={8}
              step={1}
              value={players}
              onCommit={(v) => setPlayers(Math.min(8, Math.max(2, Math.trunc(v))))}
            />
          </label>
          {showSegments ? (
            <label style={{ marginBottom: 0 }}>
              <span>{t(kind === 'star' ? 'topologyNeutralsPerSpoke' : 'topologyNeutralsPerSegment')}</span>
              <NumberField
                min={0}
                max={6}
                step={1}
                value={neutralsPerSegment}
                onCommit={(v) => setNeutralsPerSegment(Math.min(6, Math.max(0, Math.trunc(v))))}
              />
            </label>
          ) : (
            <label style={{ marginBottom: 0 }}>
              <span>{t('topologyExtraNeutrals')}</span>
              <NumberField
                min={0}
                max={40}
                step={1}
                value={extraNeutrals}
                onCommit={(v) => setExtraNeutrals(Math.min(40, Math.max(0, Math.trunc(v))))}
              />
            </label>
          )}
        </div>

        {showCenterToggle && (
          <label className="toggle-line" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={centerZone}
              onChange={(e) => setCenterZone(e.target.checked)}
            />
            <span>{t('topologyCenterZone')}</span>
          </label>
        )}

        <label className="toggle-line" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={isolatePlayers}
            onChange={(e) => setIsolatePlayers(e.target.checked)}
          />
          <span>{t('topologyIsolate')}</span>
        </label>
        <p className="field-note" style={{ marginTop: 0 }}>{t('topologyIsolateHelp')}</p>

        <div className="field-row" style={{ marginBottom: 0 }}>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologyCitiesPerPlayer')}</span>
            <NumberField
              min={0}
              max={4}
              step={1}
              value={citiesPerPlayer}
              onCommit={(v) => setCitiesPerPlayer(Math.min(4, Math.max(0, Math.trunc(v))))}
            />
          </label>
          {hasCenter && (
            <label style={{ marginBottom: 0 }}>
              <span>{t('topologyCitiesInCenter')}</span>
              <NumberField
                min={0}
                max={4}
                step={1}
                value={citiesInCenter}
                onCommit={(v) => setCitiesInCenter(Math.min(4, Math.max(0, Math.trunc(v))))}
              />
            </label>
          )}
        </div>
        <p className="field-note" style={{ marginTop: 0 }}>{t('topologyCitiesHelp')}</p>

        <div className="field-row" style={{ marginBottom: 0 }}>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologySpawnPreset')}</span>
            <select value={spawnPresetId} onChange={(e) => setSpawnPresetId(e.target.value)}>
              {presetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>{presetDisplayName(preset, t)}</option>
              ))}
            </select>
          </label>
          {hasCenter && (
            <label style={{ marginBottom: 0 }}>
              <span>{t('topologyCenterPreset')}</span>
              <select value={centerPresetId} onChange={(e) => setCenterPresetId(e.target.value)}>
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>{presetDisplayName(preset, t)}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="control-label" style={{ marginBottom: 0 }}>{t('topologyNeutralPresets')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologyNearPreset')}</span>
            <select value={nearPresetId} onChange={(e) => setNearPresetId(e.target.value)}>
              {presetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>{presetDisplayName(preset, t)}</option>
              ))}
            </select>
          </label>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologyMidPreset')}</span>
            <select value={midPresetId} onChange={(e) => setMidPresetId(e.target.value)}>
              {presetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>{presetDisplayName(preset, t)}</option>
              ))}
            </select>
          </label>
          <label style={{ marginBottom: 0 }}>
            <span>{t('topologyFarPreset')}</span>
            <select value={farPresetId} onChange={(e) => setFarPresetId(e.target.value)}>
              {presetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>{presetDisplayName(preset, t)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="field-note" style={{ marginTop: 0 }}>{t('topologyGradientHelp')}</p>

        {zonesCount > 0 && (
          <p className="field-note" style={{ margin: 0, color: 'var(--accent-2)' }}>
            {t('topologyReplaceWarning', { count: zonesCount })}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button type="button" className="small-button" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            {t('topologyCancel')}
          </button>
          <button type="button" className="small-button primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleGenerate}>
            <Wand2 size={12} style={{ marginRight: '4px' }} />
            {t('topologyGenerate')}
          </button>
        </div>
      </div>
    </div>
  );
};
