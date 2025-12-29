/**
 * ProgressIndicator Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressIndicator } from '../../components/Progress/ProgressIndicator';

describe('ProgressIndicator', () => {
    beforeEach(() => {
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return null for idle state', () => {
        const { container } = render(
            <ProgressIndicator progress={{ type: 'idle' }} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('should render thinking state with ThinkingIndicator', () => {
        render(
            <ProgressIndicator progress={{ type: 'thinking', message: 'Analyzing...' }} />
        );

        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
        expect(screen.getByTestId('thinking-indicator')).toBeInTheDocument();
        expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    });

    it('should render searching state with spinner', () => {
        render(
            <ProgressIndicator progress={{ type: 'searching', target: 'codebase' }} />
        );

        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
        expect(screen.getByText(/codebase/)).toBeInTheDocument();
    });

    it('should render reading state', () => {
        render(
            <ProgressIndicator progress={{ type: 'reading', files: ['file1.ts'] }} />
        );

        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
    });

    it('should render writing state', () => {
        render(
            <ProgressIndicator progress={{ type: 'writing', files: ['output.ts'] }} />
        );

        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
    });

    it('should render executing state', () => {
        render(
            <ProgressIndicator progress={{ type: 'executing', command: 'npm test' }} />
        );

        expect(screen.getByTestId('progress-indicator')).toBeInTheDocument();
    });

    it('should render error state with error styling', () => {
        render(
            <ProgressIndicator progress={{ type: 'error', message: 'Something failed' }} />
        );

        const indicator = screen.getByTestId('progress-indicator');
        expect(indicator).toBeInTheDocument();
        expect(indicator.className).toContain('progress-indicator--error');
        expect(screen.getByText('Something failed')).toBeInTheDocument();
    });

    describe('cancel button', () => {
        it('should render cancel button when onCancel is provided', () => {
            const onCancel = vi.fn();
            render(
                <ProgressIndicator
                    progress={{ type: 'thinking' }}
                    onCancel={onCancel}
                />
            );

            expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        });

        it('should call onCancel when cancel button is clicked', () => {
            const onCancel = vi.fn();
            render(
                <ProgressIndicator
                    progress={{ type: 'thinking' }}
                    onCancel={onCancel}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
            expect(onCancel).toHaveBeenCalledTimes(1);
        });

        it('should not show cancel button for error state', () => {
            const onCancel = vi.fn();
            render(
                <ProgressIndicator
                    progress={{ type: 'error', message: 'Failed' }}
                    onCancel={onCancel}
                />
            );

            expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
        });

        it('should not show cancel button when onCancel is not provided', () => {
            render(
                <ProgressIndicator progress={{ type: 'thinking' }} />
            );

            expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
        });
    });
});
