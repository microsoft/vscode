/**
 * Progress Indicator Component
 * Shows current AI activity state with i18n support
 */

import { ProgressState } from '../../stores/chatStore';
import { useTranslation } from '../../hooks/useLocale';
import { ThinkingIndicator } from './ThinkingIndicator';
import './ProgressIndicator.css';

interface ProgressIndicatorProps {
    progress: ProgressState;
    onCancel?: () => void;
}

export function ProgressIndicator({ progress, onCancel }: ProgressIndicatorProps) {
    const { t } = useTranslation();

    if (progress.type === 'idle') {
        return null;
    }

    const getMessage = (): string => {
        switch (progress.type) {
            case 'thinking':
                return progress.message || t('thinking');
            case 'searching':
                return t('searching', { target: progress.target });
            case 'reading':
                return t('reading');
            case 'writing':
                return t('writing');
            case 'executing':
                return t('executing');
            case 'error':
                return progress.message;
            default:
                return '';
        }
    };

    const isError = progress.type === 'error';

    return (
        <div
            className={`progress-indicator ${isError ? 'progress-indicator--error' : ''}`}
            data-testid="progress-indicator"
        >
            {progress.type === 'thinking' ? (
                <ThinkingIndicator message={getMessage()} />
            ) : (
                <div className="progress-indicator__content">
                    {!isError && (
                        <div className="progress-indicator__spinner" />
                    )}
                    <span className="progress-indicator__message">
                        {getMessage()}
                    </span>
                </div>
            )}
            {onCancel && !isError && (
                <button
                    type="button"
                    className="progress-indicator__cancel"
                    onClick={onCancel}
                    aria-label={t('cancel')}
                >
                    {t('cancel')}
                </button>
            )}
        </div>
    );
}
