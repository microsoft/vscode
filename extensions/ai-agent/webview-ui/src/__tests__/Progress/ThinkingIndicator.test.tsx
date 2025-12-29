/**
 * ThinkingIndicator Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThinkingIndicator } from '../../components/Progress/ThinkingIndicator';

describe('ThinkingIndicator', () => {
    it('should render thinking indicator', () => {
        render(<ThinkingIndicator />);

        expect(screen.getByTestId('thinking-indicator')).toBeInTheDocument();
    });

    it('should render three animated dots', () => {
        render(<ThinkingIndicator />);

        const dots = screen.getByTestId('thinking-indicator').querySelectorAll('.thinking-indicator__dot');
        expect(dots).toHaveLength(3);
    });

    it('should render without message', () => {
        const { container } = render(<ThinkingIndicator />);

        const message = container.querySelector('.thinking-indicator__message');
        expect(message).toBeNull();
    });

    it('should render with message when provided', () => {
        render(<ThinkingIndicator message="Analyzing code..." />);

        expect(screen.getByText('Analyzing code...')).toBeInTheDocument();
    });

    it('should apply animation classes to dots', () => {
        render(<ThinkingIndicator />);

        const dots = screen.getByTestId('thinking-indicator').querySelectorAll('.thinking-indicator__dot');
        dots.forEach((dot) => {
            expect(dot.className).toContain('thinking-indicator__dot');
        });
    });
});
