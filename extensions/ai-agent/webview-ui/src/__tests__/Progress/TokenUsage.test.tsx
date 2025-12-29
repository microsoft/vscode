/**
 * TokenUsage Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenUsage } from '../../components/Progress/TokenUsage';

describe('TokenUsage', () => {
    beforeEach(() => {
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render token usage display', () => {
        render(<TokenUsage used={28000} limit={80000} />);

        expect(screen.getByTestId('token-usage')).toBeInTheDocument();
        expect(screen.getByText('Context')).toBeInTheDocument();
        expect(screen.getByText('28K / 80K')).toBeInTheDocument();
    });

    it('should render info button with tooltip', () => {
        render(<TokenUsage used={28000} limit={80000} />);

        const infoButton = screen.getByRole('button');
        expect(infoButton).toBeInTheDocument();
        expect(infoButton).toHaveAttribute('title');
    });

    it('should render progressbar with correct values', () => {
        render(<TokenUsage used={40000} limit={80000} />);

        const progressbar = screen.getByRole('progressbar');
        expect(progressbar).toHaveAttribute('aria-valuenow', '40000');
        expect(progressbar).toHaveAttribute('aria-valuemin', '0');
        expect(progressbar).toHaveAttribute('aria-valuemax', '80000');
    });

    describe('usage levels', () => {
        it('should show low level for usage < 50%', () => {
            render(<TokenUsage used={30000} limit={80000} />);

            const fill = screen.getByRole('progressbar');
            expect(fill.className).toContain('token-usage__fill--low');
        });

        it('should show medium level for usage >= 50% and < 80%', () => {
            render(<TokenUsage used={50000} limit={80000} />);

            const fill = screen.getByRole('progressbar');
            expect(fill.className).toContain('token-usage__fill--medium');
        });

        it('should show high level for usage >= 80%', () => {
            render(<TokenUsage used={70000} limit={80000} />);

            const fill = screen.getByRole('progressbar');
            expect(fill.className).toContain('token-usage__fill--high');
        });
    });

    it('should format values in K notation', () => {
        render(<TokenUsage used={45000} limit={80000} />);
        expect(screen.getByText('45K / 80K')).toBeInTheDocument();
    });

    it('should handle small values without K notation', () => {
        render(<TokenUsage used={500} limit={1000} />);
        expect(screen.getByText('500 / 1K')).toBeInTheDocument();
    });

    it('should cap percentage at 100%', () => {
        render(<TokenUsage used={100000} limit={80000} />);

        const progressbar = screen.getByRole('progressbar');
        // Width should be capped at 100%
        expect(progressbar.style.width).toBe('100%');
    });
});
