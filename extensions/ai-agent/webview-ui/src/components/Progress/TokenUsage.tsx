/**
 * Token Usage Component
 * Displays context window usage with i18n tooltip
 */

import { useTranslation } from '../../hooks/useLocale';
import './TokenUsage.css';

interface TokenUsageProps {
    used: number;
    limit: number;
}

/**
 * Get usage level for styling
 */
function getUsageLevel(percentage: number): 'low' | 'medium' | 'high' {
    if (percentage >= 80) return 'high';
    if (percentage >= 50) return 'medium';
    return 'low';
}

/**
 * Format number to K notation
 */
function formatK(value: number): string {
    if (value >= 1000) {
        return `${Math.round(value / 1000)}K`;
    }
    return String(value);
}

export function TokenUsage({ used, limit }: TokenUsageProps) {
    const { t } = useTranslation();
    const percentage = Math.min((used / limit) * 100, 100);
    const level = getUsageLevel(percentage);

    return (
        <div className="token-usage" data-testid="token-usage">
            <span className="token-usage__label">Context</span>
            <button
                type="button"
                className="token-usage__info"
                title={t('tokenUsageTooltip')}
                aria-label={t('tokenUsageTooltip')}
            >
                i
            </button>
            <div className="token-usage__bar">
                <div
                    className={`token-usage__fill token-usage__fill--${level}`}
                    style={{ width: `${percentage}%` }}
                    role="progressbar"
                    aria-valuenow={used}
                    aria-valuemin={0}
                    aria-valuemax={limit}
                />
            </div>
            <span className="token-usage__value">
                {formatK(used)} / {formatK(limit)}
            </span>
        </div>
    );
}
