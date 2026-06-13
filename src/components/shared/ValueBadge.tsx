import React from 'react';
import { useTranslation } from '../../i18n/context';
import { valueTier } from '../../services/valueTiers';
import type { ValueTierKind } from '../../services/valueTiers';

/**
 * A tiny qualitative chip next to a raw template number ("rich", "weak"…),
 * so the value reads at a glance without knowing the official ranges.
 */
export const ValueBadge: React.FC<{ kind: ValueTierKind; value: number }> = ({ kind, value }) => {
  const { t } = useTranslation();
  const tier = valueTier(kind, value);
  if (!tier) return null;
  return (
    <span className={`value-badge value-badge-${tier.tone}`} title={t('valueBadgeTitle')}>
      {t(tier.labelKey)}
    </span>
  );
};
