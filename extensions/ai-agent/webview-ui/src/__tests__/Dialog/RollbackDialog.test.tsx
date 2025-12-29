/**
 * RollbackDialog Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RollbackDialog } from '../../components/Dialog/RollbackDialog';

describe('RollbackDialog', () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;

    const defaultProps = {
        isOpen: true,
        fromPhase: 'implementation' as const,
        toPhase: 'design' as const,
        onConfirm: vi.fn(),
        onCancel: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
            if (type === 'message') {
                messageHandler = handler as (event: MessageEvent) => void;
            }
        });
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        messageHandler = null;
    });

    it('should render rollback dialog when open', () => {
        render(<RollbackDialog {...defaultProps} />);

        expect(screen.getByTestId('rollback-dialog')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
        const { container } = render(<RollbackDialog {...defaultProps} isOpen={false} />);

        expect(container.firstChild).toBeNull();
    });

    describe('i18n - English (default)', () => {
        it('should display title in English', () => {
            render(<RollbackDialog {...defaultProps} />);

            expect(screen.getByText('Go back to this phase?')).toBeInTheDocument();
        });

        it('should display phase rollback message in English', () => {
            render(<RollbackDialog {...defaultProps} />);

            expect(screen.getByText(/Going back from Implementation to Design/)).toBeInTheDocument();
        });

        it('should display info list in English', () => {
            render(<RollbackDialog {...defaultProps} />);

            expect(screen.getByText('Chat history is preserved')).toBeInTheDocument();
            expect(screen.getByText('Current milestones will be collapsed')).toBeInTheDocument();
            expect(screen.getByText('You can start new work')).toBeInTheDocument();
        });

        it('should display button labels in English', () => {
            render(<RollbackDialog {...defaultProps} />);

            expect(screen.getByText('Cancel')).toBeInTheDocument();
            expect(screen.getByText('Go Back')).toBeInTheDocument();
        });
    });

    describe('i18n - Japanese', () => {
        it('should display title in Japanese when locale is ja', () => {
            render(<RollbackDialog {...defaultProps} />);

            // Simulate receiving Japanese locale
            act(() => {
                if (messageHandler) {
                    messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
                }
            });

            expect(screen.getByText('フェーズを戻しますか？')).toBeInTheDocument();
        });

        it('should display phase names in Japanese', () => {
            render(<RollbackDialog {...defaultProps} />);

            act(() => {
                if (messageHandler) {
                    messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
                }
            });

            expect(screen.getByText(/実装から設計に戻ります/)).toBeInTheDocument();
        });

        it('should display info list in Japanese', () => {
            render(<RollbackDialog {...defaultProps} />);

            act(() => {
                if (messageHandler) {
                    messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
                }
            });

            expect(screen.getByText('チャット履歴は保持されます')).toBeInTheDocument();
            expect(screen.getByText('現在のマイルストーンは折りたたまれます')).toBeInTheDocument();
            expect(screen.getByText('新しい作業を開始できます')).toBeInTheDocument();
        });

        it('should display button labels in Japanese', () => {
            render(<RollbackDialog {...defaultProps} />);

            act(() => {
                if (messageHandler) {
                    messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
                }
            });

            expect(screen.getByText('キャンセル')).toBeInTheDocument();
            expect(screen.getByText('戻る')).toBeInTheDocument();
        });
    });

    describe('button actions', () => {
        it('should call onConfirm when Go Back button is clicked', () => {
            const onConfirm = vi.fn();
            render(<RollbackDialog {...defaultProps} onConfirm={onConfirm} />);

            fireEvent.click(screen.getByText('Go Back'));

            expect(onConfirm).toHaveBeenCalledTimes(1);
        });

        it('should call onCancel when Cancel button is clicked', () => {
            const onCancel = vi.fn();
            render(<RollbackDialog {...defaultProps} onCancel={onCancel} />);

            fireEvent.click(screen.getByText('Cancel'));

            expect(onCancel).toHaveBeenCalledTimes(1);
        });

        it('should call onCancel when overlay is clicked', () => {
            const onCancel = vi.fn();
            render(<RollbackDialog {...defaultProps} onCancel={onCancel} />);

            fireEvent.click(screen.getByTestId('dialog-overlay'));

            expect(onCancel).toHaveBeenCalledTimes(1);
        });
    });

    describe('phase variations', () => {
        it('should handle design to review rollback', () => {
            render(
                <RollbackDialog
                    {...defaultProps}
                    fromPhase="review"
                    toPhase="design"
                />
            );

            expect(screen.getByText(/Going back from Review to Design/)).toBeInTheDocument();
        });

        it('should handle review to implementation rollback', () => {
            render(
                <RollbackDialog
                    {...defaultProps}
                    fromPhase="review"
                    toPhase="implementation"
                />
            );

            expect(screen.getByText(/Going back from Review to Implementation/)).toBeInTheDocument();
        });
    });
});
