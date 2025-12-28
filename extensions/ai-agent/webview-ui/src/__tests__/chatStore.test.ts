/**
 * Chat Store Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, createChatMessage, generateMessageId } from '../stores/chatStore';

describe('chatStore', () => {
    beforeEach(() => {
        // Reset store state before each test
        useChatStore.setState({
            messages: [],
            phase: 'implementation',
            isLoading: false,
            inputValue: '',
            error: null
        });
    });

    describe('initial state', () => {
        it('should have empty messages array', () => {
            expect(useChatStore.getState().messages).toEqual([]);
        });

        it('should have implementation as default phase', () => {
            expect(useChatStore.getState().phase).toBe('implementation');
        });

        it('should have isLoading as false', () => {
            expect(useChatStore.getState().isLoading).toBe(false);
        });

        it('should have empty input value', () => {
            expect(useChatStore.getState().inputValue).toBe('');
        });

        it('should have null error', () => {
            expect(useChatStore.getState().error).toBeNull();
        });
    });

    describe('addMessage', () => {
        it('should add a message to the store', () => {
            const message = createChatMessage('Hello', 'user');

            useChatStore.getState().addMessage(message);

            expect(useChatStore.getState().messages).toHaveLength(1);
            expect(useChatStore.getState().messages[0].content).toBe('Hello');
        });

        it('should append messages', () => {
            const msg1 = createChatMessage('First', 'user');
            const msg2 = createChatMessage('Second', 'assistant');

            useChatStore.getState().addMessage(msg1);
            useChatStore.getState().addMessage(msg2);

            expect(useChatStore.getState().messages).toHaveLength(2);
        });

        it('should clear error when adding message', () => {
            useChatStore.setState({ error: 'Some error' });

            useChatStore.getState().addMessage(createChatMessage('Test', 'user'));

            expect(useChatStore.getState().error).toBeNull();
        });
    });

    describe('setMessages', () => {
        it('should replace all messages', () => {
            useChatStore.getState().addMessage(createChatMessage('Old', 'user'));

            const newMessages = [
                createChatMessage('New 1', 'user'),
                createChatMessage('New 2', 'assistant')
            ];
            useChatStore.getState().setMessages(newMessages);

            expect(useChatStore.getState().messages).toHaveLength(2);
            expect(useChatStore.getState().messages[0].content).toBe('New 1');
        });

        it('should clear error when setting messages', () => {
            useChatStore.setState({ error: 'Some error' });

            useChatStore.getState().setMessages([]);

            expect(useChatStore.getState().error).toBeNull();
        });
    });

    describe('clearMessages', () => {
        it('should remove all messages', () => {
            useChatStore.getState().addMessage(createChatMessage('Test', 'user'));
            useChatStore.getState().addMessage(createChatMessage('Test 2', 'assistant'));

            useChatStore.getState().clearMessages();

            expect(useChatStore.getState().messages).toEqual([]);
        });

        it('should clear error when clearing messages', () => {
            useChatStore.setState({ error: 'Some error' });

            useChatStore.getState().clearMessages();

            expect(useChatStore.getState().error).toBeNull();
        });
    });

    describe('setPhase', () => {
        it('should update the phase', () => {
            useChatStore.getState().setPhase('design');

            expect(useChatStore.getState().phase).toBe('design');
        });

        it('should clear error when changing phase', () => {
            useChatStore.setState({ error: 'Some error' });

            useChatStore.getState().setPhase('review');

            expect(useChatStore.getState().error).toBeNull();
        });

        it('should allow all valid phases', () => {
            useChatStore.getState().setPhase('design');
            expect(useChatStore.getState().phase).toBe('design');

            useChatStore.getState().setPhase('implementation');
            expect(useChatStore.getState().phase).toBe('implementation');

            useChatStore.getState().setPhase('review');
            expect(useChatStore.getState().phase).toBe('review');
        });
    });

    describe('setLoading', () => {
        it('should update loading state to true', () => {
            useChatStore.getState().setLoading(true);

            expect(useChatStore.getState().isLoading).toBe(true);
        });

        it('should update loading state to false', () => {
            useChatStore.setState({ isLoading: true });

            useChatStore.getState().setLoading(false);

            expect(useChatStore.getState().isLoading).toBe(false);
        });
    });

    describe('setInputValue', () => {
        it('should update input value', () => {
            useChatStore.getState().setInputValue('Hello world');

            expect(useChatStore.getState().inputValue).toBe('Hello world');
        });

        it('should handle empty string', () => {
            useChatStore.setState({ inputValue: 'Some text' });

            useChatStore.getState().setInputValue('');

            expect(useChatStore.getState().inputValue).toBe('');
        });
    });

    describe('setError', () => {
        it('should set error message', () => {
            useChatStore.getState().setError('Something went wrong');

            expect(useChatStore.getState().error).toBe('Something went wrong');
        });

        it('should clear error with null', () => {
            useChatStore.setState({ error: 'Existing error' });

            useChatStore.getState().setError(null);

            expect(useChatStore.getState().error).toBeNull();
        });
    });
});

describe('generateMessageId', () => {
    it('should generate unique IDs', () => {
        const id1 = generateMessageId();
        const id2 = generateMessageId();

        expect(id1).not.toBe(id2);
    });

    it('should start with msg_ prefix', () => {
        const id = generateMessageId();

        expect(id.startsWith('msg_')).toBe(true);
    });
});

describe('createChatMessage', () => {
    it('should create a user message', () => {
        const message = createChatMessage('Hello', 'user');

        expect(message.content).toBe('Hello');
        expect(message.sender).toBe('user');
        expect(message.id).toBeDefined();
        expect(message.timestamp).toBeDefined();
    });

    it('should create an assistant message', () => {
        const message = createChatMessage('Response', 'assistant');

        expect(message.sender).toBe('assistant');
    });

    it('should create a system message', () => {
        const message = createChatMessage('System info', 'system');

        expect(message.sender).toBe('system');
    });

    it('should include source when provided', () => {
        const message = createChatMessage('Test', 'assistant', 'claude');

        expect(message.source).toBe('claude');
    });

    it('should have valid ISO timestamp', () => {
        const message = createChatMessage('Test', 'user');
        const date = new Date(message.timestamp);

        expect(date.toISOString()).toBe(message.timestamp);
    });
});
