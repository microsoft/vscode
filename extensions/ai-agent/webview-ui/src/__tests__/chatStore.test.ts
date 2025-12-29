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
            error: null,
            progress: { type: 'idle' },
            tokenUsage: null,
            phaseHistory: [],
            expandedPhases: []
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

    describe('initial state - extended', () => {
        it('should have idle progress state', () => {
            expect(useChatStore.getState().progress).toEqual({ type: 'idle' });
        });

        it('should have null tokenUsage', () => {
            expect(useChatStore.getState().tokenUsage).toBeNull();
        });

        it('should have empty phaseHistory', () => {
            expect(useChatStore.getState().phaseHistory).toEqual([]);
        });

        it('should have empty expandedPhases', () => {
            expect(useChatStore.getState().expandedPhases).toEqual([]);
        });
    });

    describe('setProgress', () => {
        it('should update progress to thinking state', () => {
            useChatStore.getState().setProgress({ type: 'thinking', message: 'Analyzing...' });

            expect(useChatStore.getState().progress).toEqual({
                type: 'thinking',
                message: 'Analyzing...'
            });
        });

        it('should update progress to searching state', () => {
            useChatStore.getState().setProgress({ type: 'searching', target: 'codebase' });

            expect(useChatStore.getState().progress).toEqual({
                type: 'searching',
                target: 'codebase'
            });
        });

        it('should update progress to reading state with files', () => {
            useChatStore.getState().setProgress({ type: 'reading', files: ['file1.ts', 'file2.ts'] });

            expect(useChatStore.getState().progress).toEqual({
                type: 'reading',
                files: ['file1.ts', 'file2.ts']
            });
        });

        it('should update progress to idle state', () => {
            useChatStore.setState({ progress: { type: 'thinking' } });

            useChatStore.getState().setProgress({ type: 'idle' });

            expect(useChatStore.getState().progress).toEqual({ type: 'idle' });
        });

        it('should update progress to error state', () => {
            useChatStore.getState().setProgress({ type: 'error', message: 'Something failed' });

            expect(useChatStore.getState().progress).toEqual({
                type: 'error',
                message: 'Something failed'
            });
        });
    });

    describe('setTokenUsage', () => {
        it('should set token usage', () => {
            useChatStore.getState().setTokenUsage({ used: 28000, limit: 80000 });

            expect(useChatStore.getState().tokenUsage).toEqual({
                used: 28000,
                limit: 80000
            });
        });

        it('should clear token usage with null', () => {
            useChatStore.setState({ tokenUsage: { used: 1000, limit: 80000 } });

            useChatStore.getState().setTokenUsage(null);

            expect(useChatStore.getState().tokenUsage).toBeNull();
        });
    });

    describe('updatePhaseHistory', () => {
        it('should add new phase history entry', () => {
            const entry = {
                phase: 'design' as const,
                milestones: [],
                startedAt: '2024-01-01T00:00:00Z'
            };

            useChatStore.getState().updatePhaseHistory(entry);

            expect(useChatStore.getState().phaseHistory).toHaveLength(1);
            expect(useChatStore.getState().phaseHistory[0].phase).toBe('design');
        });

        it('should update existing phase history entry', () => {
            useChatStore.setState({
                phaseHistory: [{
                    phase: 'design',
                    milestones: [],
                    startedAt: '2024-01-01T00:00:00Z'
                }]
            });

            useChatStore.getState().updatePhaseHistory({
                phase: 'design',
                milestones: [{ id: 'm1', label: 'Test', status: 'complete' }],
                startedAt: '2024-01-01T00:00:00Z',
                completedAt: '2024-01-01T01:00:00Z'
            });

            expect(useChatStore.getState().phaseHistory).toHaveLength(1);
            expect(useChatStore.getState().phaseHistory[0].milestones).toHaveLength(1);
            expect(useChatStore.getState().phaseHistory[0].completedAt).toBe('2024-01-01T01:00:00Z');
        });
    });

    describe('addMilestone', () => {
        it('should add milestone to current phase', () => {
            useChatStore.setState({ phase: 'implementation' });

            useChatStore.getState().addMilestone({
                id: 'm1',
                label: 'Analyze code',
                status: 'complete'
            });

            const history = useChatStore.getState().phaseHistory;
            expect(history).toHaveLength(1);
            expect(history[0].phase).toBe('implementation');
            expect(history[0].milestones).toHaveLength(1);
        });

        it('should append milestone to existing phase', () => {
            useChatStore.setState({
                phase: 'design',
                phaseHistory: [{
                    phase: 'design',
                    milestones: [{ id: 'm1', label: 'First', status: 'complete' }],
                    startedAt: '2024-01-01T00:00:00Z'
                }]
            });

            useChatStore.getState().addMilestone({
                id: 'm2',
                label: 'Second',
                status: 'active'
            });

            expect(useChatStore.getState().phaseHistory[0].milestones).toHaveLength(2);
        });
    });

    describe('updateMilestoneStatus', () => {
        it('should update milestone status', () => {
            useChatStore.setState({
                phaseHistory: [{
                    phase: 'implementation',
                    milestones: [
                        { id: 'm1', label: 'Task 1', status: 'active' },
                        { id: 'm2', label: 'Task 2', status: 'pending' }
                    ],
                    startedAt: '2024-01-01T00:00:00Z'
                }]
            });

            useChatStore.getState().updateMilestoneStatus('m1', 'complete');

            expect(useChatStore.getState().phaseHistory[0].milestones[0].status).toBe('complete');
            expect(useChatStore.getState().phaseHistory[0].milestones[1].status).toBe('pending');
        });
    });

    describe('togglePhaseExpanded', () => {
        it('should expand a phase', () => {
            useChatStore.getState().togglePhaseExpanded('design');

            expect(useChatStore.getState().expandedPhases).toContain('design');
        });

        it('should collapse an expanded phase', () => {
            useChatStore.setState({ expandedPhases: ['design', 'implementation'] });

            useChatStore.getState().togglePhaseExpanded('design');

            expect(useChatStore.getState().expandedPhases).not.toContain('design');
            expect(useChatStore.getState().expandedPhases).toContain('implementation');
        });

        it('should toggle multiple phases independently', () => {
            useChatStore.getState().togglePhaseExpanded('design');
            useChatStore.getState().togglePhaseExpanded('implementation');

            expect(useChatStore.getState().expandedPhases).toContain('design');
            expect(useChatStore.getState().expandedPhases).toContain('implementation');

            useChatStore.getState().togglePhaseExpanded('design');

            expect(useChatStore.getState().expandedPhases).not.toContain('design');
            expect(useChatStore.getState().expandedPhases).toContain('implementation');
        });
    });

    describe('setExpandedPhases', () => {
        it('should set expanded phases', () => {
            useChatStore.getState().setExpandedPhases(['design', 'review']);

            expect(useChatStore.getState().expandedPhases).toEqual(['design', 'review']);
        });

        it('should replace existing expanded phases', () => {
            useChatStore.setState({ expandedPhases: ['design', 'implementation'] });

            useChatStore.getState().setExpandedPhases(['review']);

            expect(useChatStore.getState().expandedPhases).toEqual(['review']);
        });

        it('should allow empty array', () => {
            useChatStore.setState({ expandedPhases: ['design'] });

            useChatStore.getState().setExpandedPhases([]);

            expect(useChatStore.getState().expandedPhases).toEqual([]);
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
