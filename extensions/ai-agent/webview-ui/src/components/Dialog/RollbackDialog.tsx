/**
 * Rollback Dialog Component
 * Confirmation dialog for phase rollback with i18n support
 */

import { Dialog } from './Dialog';
import { Phase } from '../../stores/chatStore';
import { useTranslation } from '../../hooks/useLocale';
import './RollbackDialog.css';

interface RollbackDialogProps {
    isOpen: boolean;
    fromPhase: Phase;
    toPhase: Phase;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Get phase display name
 */
function getPhaseName(phase: Phase, t: (key: string) => string): string {
    switch (phase) {
        case 'design':
            return t('phaseDesign');
        case 'implementation':
            return t('phaseImplementation');
        case 'review':
            return t('phaseReview');
    }
}

export function RollbackDialog({
    isOpen,
    fromPhase,
    toPhase,
    onConfirm,
    onCancel
}: RollbackDialogProps) {
    const { t } = useTranslation();

    const fromName = getPhaseName(fromPhase, t);
    const toName = getPhaseName(toPhase, t);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onCancel}
            title={t('phaseRollbackTitle')}
            showCloseButton={false}
        >
            <div className="rollback-dialog" data-testid="rollback-dialog">
                <p className="rollback-dialog__message">
                    {t('phaseRollbackMessage', { from: fromName, to: toName })}
                </p>
                <ul className="rollback-dialog__list">
                    <li>{t('historyPreserved')}</li>
                    <li>{t('milestonesCollapsed')}</li>
                    <li>{t('newWorkStart')}</li>
                </ul>
                <div className="rollback-dialog__actions">
                    <button
                        type="button"
                        className="rollback-dialog__button rollback-dialog__button--secondary"
                        onClick={onCancel}
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="button"
                        className="rollback-dialog__button rollback-dialog__button--primary"
                        onClick={onConfirm}
                    >
                        {t('goBack')}
                    </button>
                </div>
            </div>
        </Dialog>
    );
}
