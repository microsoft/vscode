/**
 * Review Dialog Component
 * AI Review confirmation dialog for file save/commit interception
 * Phase 3.2: Command Interception Integration
 */

import { Dialog } from './Dialog';
import { useTranslation } from '../../hooks/useLocale';
import './ReviewDialog.css';

interface ReviewDialogProps {
    isOpen: boolean;
    files: string[];
    changeType: 'save' | 'commit' | 'other';
    message?: string;
    onProceed: () => void;
    onReview: () => void;
    onCancel: () => void;
}

/**
 * Get change type display text
 */
function getChangeTypeText(changeType: 'save' | 'commit' | 'other', t: (key: string) => string): string {
    switch (changeType) {
        case 'save':
            return t('reviewFileSave');
        case 'commit':
            return t('reviewGitCommit');
        case 'other':
        default:
            return t('reviewOperation');
    }
}

/**
 * Get change type icon
 */
function getChangeTypeIcon(changeType: 'save' | 'commit' | 'other'): string {
    switch (changeType) {
        case 'save':
            return '$(save)';
        case 'commit':
            return '$(git-commit)';
        case 'other':
        default:
            return '$(question)';
    }
}

export function ReviewDialog({
    isOpen,
    files,
    changeType,
    message,
    onProceed,
    onReview,
    onCancel
}: ReviewDialogProps) {
    const { t } = useTranslation();

    const changeTypeText = getChangeTypeText(changeType, t);
    const icon = getChangeTypeIcon(changeType);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onCancel}
            title={t('reviewTitle')}
            showCloseButton={false}
        >
            <div className="review-dialog" data-testid="review-dialog">
                <div className="review-dialog__header">
                    <span className="review-dialog__icon codicon">{icon}</span>
                    <span className="review-dialog__type">{changeTypeText}</span>
                </div>

                {message && (
                    <p className="review-dialog__message">{message}</p>
                )}

                <div className="review-dialog__files">
                    <p className="review-dialog__files-label">{t('reviewFilesAffected')}:</p>
                    <ul className="review-dialog__files-list">
                        {files.map((file, index) => (
                            <li key={index} className="review-dialog__file-item">
                                <span className="codicon codicon-file"></span>
                                {file}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="review-dialog__prompt">{t('reviewPrompt')}</p>

                <div className="review-dialog__actions">
                    <button
                        type="button"
                        className="review-dialog__button review-dialog__button--secondary"
                        onClick={onCancel}
                        data-testid="review-cancel-button"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="button"
                        className="review-dialog__button review-dialog__button--secondary"
                        onClick={onReview}
                        data-testid="review-button"
                    >
                        {t('reviewFirst')}
                    </button>
                    <button
                        type="button"
                        className="review-dialog__button review-dialog__button--primary"
                        onClick={onProceed}
                        data-testid="proceed-button"
                    >
                        {changeType === 'save' ? t('saveAnyway') : t('proceedAnyway')}
                    </button>
                </div>
            </div>
        </Dialog>
    );
}
