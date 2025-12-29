/**
 * Component Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhaseSelector } from '../components/PhaseSelector';
import { InputArea } from '../components/InputArea';
import { MessageList } from '../components/MessageList';
import type { ChatMessage } from '../stores/chatStore';

describe('PhaseSelector', () => {
    const mockOnPhaseChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render all phase buttons', () => {
        render(
            <PhaseSelector
                currentPhase="implementation"
                onPhaseChange={mockOnPhaseChange}
            />
        );

        expect(screen.getByText('Design')).toBeInTheDocument();
        expect(screen.getByText('Implementation')).toBeInTheDocument();
        expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('should highlight current phase', () => {
        render(
            <PhaseSelector
                currentPhase="design"
                onPhaseChange={mockOnPhaseChange}
            />
        );

        const designButton = screen.getByRole('tab', { selected: true });
        expect(designButton).toHaveTextContent('Design');
    });

    it('should call onPhaseChange when clicking a phase', () => {
        render(
            <PhaseSelector
                currentPhase="implementation"
                onPhaseChange={mockOnPhaseChange}
            />
        );

        fireEvent.click(screen.getByText('Design'));

        expect(mockOnPhaseChange).toHaveBeenCalledWith('design');
    });

    it('should not call onPhaseChange when disabled', () => {
        render(
            <PhaseSelector
                currentPhase="implementation"
                onPhaseChange={mockOnPhaseChange}
                disabled
            />
        );

        fireEvent.click(screen.getByText('Design'));

        expect(mockOnPhaseChange).not.toHaveBeenCalled();
    });

    it('should have proper accessibility attributes', () => {
        render(
            <PhaseSelector
                currentPhase="implementation"
                onPhaseChange={mockOnPhaseChange}
            />
        );

        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(3);
    });
});

describe('InputArea', () => {
    const mockOnChange = vi.fn();
    const mockOnSubmit = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render textarea and send button', () => {
        render(
            <InputArea
                value=""
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        expect(screen.getByRole('textbox')).toBeInTheDocument();
        expect(screen.getByText('Send')).toBeInTheDocument();
    });

    it('should display current value', () => {
        render(
            <InputArea
                value="Hello world"
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        expect(screen.getByRole('textbox')).toHaveValue('Hello world');
    });

    it('should call onChange when typing', () => {
        render(
            <InputArea
                value=""
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'New text' }
        });

        expect(mockOnChange).toHaveBeenCalledWith('New text');
    });

    it('should call onSubmit when clicking send', () => {
        render(
            <InputArea
                value="Test message"
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        fireEvent.click(screen.getByText('Send'));

        expect(mockOnSubmit).toHaveBeenCalledWith('Test message');
    });

    it('should not submit empty messages', () => {
        render(
            <InputArea
                value="   "
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        fireEvent.click(screen.getByText('Send'));

        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should show cancel button when loading', () => {
        render(
            <InputArea
                value=""
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
                isLoading
            />
        );

        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should call onCancel when clicking cancel', () => {
        render(
            <InputArea
                value=""
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                onCancel={mockOnCancel}
                isLoading
            />
        );

        fireEvent.click(screen.getByText('Cancel'));

        expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should disable input when disabled prop is true', () => {
        render(
            <InputArea
                value=""
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
                disabled
            />
        );

        expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('should submit on Ctrl+Enter', () => {
        render(
            <InputArea
                value="Test"
                onChange={mockOnChange}
                onSubmit={mockOnSubmit}
            />
        );

        fireEvent.keyDown(screen.getByRole('textbox'), {
            key: 'Enter',
            ctrlKey: true
        });

        expect(mockOnSubmit).toHaveBeenCalledWith('Test');
    });
});

describe('MessageList', () => {
    const messages: ChatMessage[] = [
        {
            id: '1',
            content: 'Hello',
            sender: 'user',
            timestamp: new Date().toISOString()
        },
        {
            id: '2',
            content: 'Hi there!',
            sender: 'assistant',
            timestamp: new Date().toISOString(),
            source: 'claude'
        }
    ];

    it('should render messages', () => {
        render(<MessageList messages={messages} />);

        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('should show source for assistant messages', () => {
        render(<MessageList messages={messages} />);

        expect(screen.getByText('claude')).toBeInTheDocument();
    });

    it('should show loading indicator when isLoading', () => {
        render(<MessageList messages={[]} isLoading />);

        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should show empty state when no messages', () => {
        render(<MessageList messages={[]} />);

        expect(screen.getByText(/Start a conversation/)).toBeInTheDocument();
    });

    it('should have proper accessibility attributes', () => {
        render(<MessageList messages={messages} />);

        expect(screen.getByRole('log')).toBeInTheDocument();
        expect(screen.getAllByRole('article')).toHaveLength(2);
    });

    it('should render system messages', () => {
        const systemMessages: ChatMessage[] = [
            {
                id: '1',
                content: 'System notification',
                sender: 'system',
                timestamp: new Date().toISOString()
            }
        ];

        render(<MessageList messages={systemMessages} />);

        expect(screen.getByText('System notification')).toBeInTheDocument();
    });
});
