# Design system — primitives & tokens

Single source of truth for the editor's UI. **Build from these, not from
ad-hoc inline styles.** Tokens live in `src/index.css` (`:root` + `body.light`);
primitives in `src/components/shared/primitives.tsx` and
`CollapsibleSubsection.tsx`.

> Rule of thumb: if you're typing a raw `fontSize`, `borderRadius`, hex colour,
> or rebuilding a `<label>` / chip / collapsible by hand — stop and use a token
> or a primitive instead.

---

## Tokens (CSS variables)

### Sizes (theme-independent, `:root`)
| Axis | Tokens |
|------|--------|
| Typography | `--fz-caption: 11` · `--fz-base: 12` · `--fz-emph: 14` · `--fz-title: 16` |
| Radius | `--radius-sm: 6` · `--radius-md: 8` · `--radius-lg: 12` |
| Spacing | `--space-1: 4` · `--space-2: 8` · `--space-3: 12` · `--space-4: 16` · `--space-6: 24` |

Do **not** introduce 9/10/13px font sizes or 4/10/20px radii — snap to the scale.

### Colours (themed — dark in `:root`, light in `body.light`)
`--bg` · `--panel` · `--panel-2` · `--ink` · `--muted` · `--muted-soft` ·
`--line` · `--line-dark` · `--accent` · `--accent-light` · `--accent-dim` ·
`--accent-2` · `--danger` · `--ok` · `--road` · `--json-bg` (editable-field surface).

Never hardcode a hex in a component — always `var(--…)`, so both themes work.

### Visual hierarchy (elevation ladder)
`section header` = `--panel` → `subsection header` = `--panel-2` strip →
`editable field` = `--json-bg`. Differentiate by **shade/elevation**, never by
per-category hue.

---

## Primitives

### `Field` — label + control (+ help)
```tsx
<Field label={t('players')} tip={t('playersHelp')}>
  <NumberField … />
</Field>
```
Props: `label` (ReactNode) · `hint?` (inline help below) · `tip?` (string → `(i)`
tooltip by the label) · `children` (the control). Renders a `<label>` so the
control is associated for a11y. Prefer `tip` over `hint` to avoid walls of text.

### `FieldRow` — two fields side by side
```tsx
<FieldRow hint={t('playersHelp')}>
  <Field label={t('players')}>…</Field>
  <Field label={t('heroMax')}>…</Field>
</FieldRow>
```
Props: `hint?` (full-width help below the row) · `children` (two `Field`s).
Controls stay bottom-aligned even when one label wraps.

### `Toggle` — checkbox row
```tsx
<Toggle checked={x} onChange={(v) => set(v)} label={t('singleHeroMode')} tip={t('…Help')} />
```
Props: `checked` · `onChange(value)` · `label` (ReactNode — may contain a Badge) ·
`hint?` · `tip?` · `disabled?` (dims + blocks the row) · `title?` (native row
tooltip, e.g. why it's disabled). For mutually-exclusive **radio** rows the
component doesn't fit (it renders a checkbox) — reuse the `ui-toggle` /
`ui-toggle-text` classes on your own `<label><input type="radio">` instead.

### `Badge` — pill (qualitative / quantitative)
```tsx
<Badge tone="warning" title={t('betaNote')}>{t('beta')}</Badge>
```
Props: `tone?: 'neutral' | 'accent' | 'ok' | 'warning' | 'danger'` (default
`neutral`) · `title?` · `children`. Use for status pills and card meta.

### `InfoTip` — `(i)` tooltip
```tsx
<span>{t('label')} <InfoTip text={t('labelHelp')} /></span>
```
Props: `text` (string). Use to move informational paragraphs into a hover hint.

### `Card` — collapsible entity chip
```tsx
<Card id={`zoneobj.${zone.id}.${obj.key}`} title={label}
      icon={<Building2 size={13} style={{ color: 'var(--accent)' }} />}
      meta={<><Badge tone="neutral">×{count}</Badge></>}
      actions={<button onClick={remove}>×</button>} defaultOpen>
  …editor fields…
</Card>
```
For **repeating entities**: zone objects, castles, connections, preset objects.
Props: `id?` (persist open/closed) · `title` · `icon?` · `meta?` (right-side
pills) · `actions?` (controls; clicks here don't toggle) · `defaultOpen?`
(default `false`) · `children`. Collapsed = one scannable row.

### `ListRow` — compact entry in a picker / list
```tsx
<ListRow
  active={isBanned}
  leading={!isBanned && <button onClick={add}><Plus size={10} /></button>}
  title={entry.label}
  subtitle={entry.detail}
  trailing={isBanned && <button onClick={remove}><Trash2 size={10} /></button>}
/>
```
For **non-collapsible list/picker rows** (bans, value overrides, variants,
content-pool/limit pickers). Props: `active?` (highlight, e.g. selected/banned)
· `title` · `titleTooltip?` · `subtitle?` · `subtitleTooltip?` · `leading?`
(control before the text) · `trailing?` (controls at the end — their clicks
don't fire the row) · `onClick?` (whole row clickable). Replaces the bespoke
`rowStyle` objects that used to be copy-pasted per section.

### `CollapsibleSubsection` — sticky collapsible group
```tsx
<CollapsibleSubsection id={`zone.guard.${zone.id}`} title={t('zoneGuardSection')}
    icon={<Shield size={12} style={{ color: 'var(--accent)' }} />}
    tip={t('zoneGuardMainHelp')} defaultOpen={false}>
  …fields…
</CollapsibleSubsection>
```
For **setting groups**. Header is sticky (iOS-style active-pair stacking),
state persists. Props: `id` (persist) · `title` (string) · `icon?` · `tip?`
(string → `(i)` by the title) · `actions?` · `defaultOpen?` (default `true`) ·
`children`.

---

## Helper classes (when a component primitive doesn't fit)
- `ui-field-hint` — muted help paragraph (when not using `tip`).
- `ui-indent` — accent-left-bordered indented block (conditional sub-fields).
- `ui-group-label` — small uppercase divider label inside a subsection.
- `ui-badge`, `ui-card`, `collapsible-subsection` — underlying classes of the
  primitives; reference, don't reinvent.

---

## Migration checklist (per file)
When converting an old view onto the system:

- [ ] `<label><span>X</span>{ctrl}</label>` → `<Field label={X}>{ctrl}</Field>`
- [ ] two `<label>`s in `.field-row` → `<FieldRow>` of two `<Field>`s
- [ ] `<label className="toggle-line">…checkbox…</label>` → `<Toggle … />`
- [ ] `<p className="field-note">` → `tip` on the field/subsection, else `ui-field-hint`
- [ ] `LazyDetails` / `object-chip` `<details>` for an entity → `<Card>`
- [ ] bespoke `rowStyle` list/picker row → `<ListRow>`
- [ ] `SectionHeader` (static) for a group → `<CollapsibleSubsection>`
- [ ] inline `borderLeft: 2px accent…` indent → `className="ui-indent"`
- [ ] inline `fontSize: 9/10/13px` → drop / `var(--fz-caption)`
- [ ] inline `borderRadius: 4/10/20px` → `var(--radius-sm|md|lg)`
- [ ] hardcoded hex colour → `var(--…)`
- [ ] verify: `tsc -b` green, control counts unchanged, both themes, live check
