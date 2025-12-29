/**
 * Dialog Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '../../components/Dialog/Dialog';

describe('Dialog', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        children: <p>Dialog content</p>
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return null when isOpen is false', () => {
        const { container } = render(
            <Dialog {...defaultProps} isOpen={false} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('should render dialog when isOpen is true', () => {
        render(<Dialog {...defaultProps} />);

        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByText('Dialog content')).toBeInTheDocument();
    });

    it('should render title when provided', () => {
        render(<Dialog {...defaultProps} title="Test Title" />);

        expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should render close button by default', () => {
        render(<Dialog {...defaultProps} title="Test" />);

        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should not render close button when showCloseButton is false', () => {
        render(<Dialog {...defaultProps} title="Test" showCloseButton={false} />);

        expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    });

    it('should call onClose when close button is clicked', () => {
        const onClose = vi.fn();
        render(<Dialog {...defaultProps} title="Test" onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: /close/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when overlay is clicked', () => {
        const onClose = vi.fn();
        render(<Dialog {...defaultProps} onClose={onClose} />);

        fireEvent.click(screen.getByTestId('dialog-overlay'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when dialog content is clicked', () => {
        const onClose = vi.fn();
        render(<Dialog {...defaultProps} onClose={onClose} />);

        fireEvent.click(screen.getByTestId('dialog'));

        expect(onClose).not.toHaveBeenCalled();
    });

    it('should call onClose when ESC key is pressed', () => {
        const onClose = vi.fn();
        render(<Dialog {...defaultProps} onClose={onClose} />);

        fireEvent.keyDown(document, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose for other keys', () => {
        const onClose = vi.fn();
        render(<Dialog {...defaultProps} onClose={onClose} />);

        fireEvent.keyDown(document, { key: 'Enter' });

        expect(onClose).not.toHaveBeenCalled();
    });

    it('should have correct aria attributes', () => {
        render(<Dialog {...defaultProps} title="Test Title" />);

        const overlay = screen.getByTestId('dialog-overlay');
        expect(overlay).toHaveAttribute('role', 'dialog');
        expect(overlay).toHaveAttribute('aria-modal', 'true');
        expect(overlay).toHaveAttribute('aria-labelledby', 'dialog-title');
    });

    it('should remove event listener on unmount', () => {
        const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
        const { unmount } = render(<Dialog {...defaultProps} />);

        unmount();

        expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
});
