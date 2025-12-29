/**
 * Dialog Component
 * Generic modal dialog with overlay
 */

import React, { useEffect, useCallback } from 'react';
import './Dialog.css';

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    showCloseButton?: boolean;
}

export function Dialog({
    isOpen,
    onClose,
    title,
    children,
    showCloseButton = true
}: DialogProps) {
    // Handle ESC key
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, handleKeyDown]);

    if (!isOpen) {
        return null;
    }

    const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="dialog-overlay"
            onClick={handleOverlayClick}
            data-testid="dialog-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'dialog-title' : undefined}
        >
            <div className="dialog" data-testid="dialog">
                {(title || showCloseButton) && (
                    <div className="dialog__header">
                        {title && (
                            <h2 id="dialog-title" className="dialog__title">
                                {title}
                            </h2>
                        )}
                        {showCloseButton && (
                            <button
                                type="button"
                                className="dialog__close"
                                onClick={onClose}
                                aria-label="Close dialog"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                )}
                <div className="dialog__content">{children}</div>
            </div>
        </div>
    );
}
