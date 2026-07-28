/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { Emitter } from '../../../util/vs/base/common/event';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { ConversationStore } from './conversationStore';

function createConversation(sessionId: string): Conversation {
	return new Conversation(sessionId, [new Turn('turn-1', { message: 'test', type: 'user' })]);
}

describe('ConversationStore', () => {
	let disposeChatSession: Emitter<string>;
	let store: ConversationStore;

	beforeEach(() => {
		vi.useFakeTimers();
		disposeChatSession = new Emitter<string>();
		const chatSessionService: IChatSessionService = {
			_serviceBrand: undefined,
			onDidDisposeChatSession: disposeChatSession.event,
		};
		store = new ConversationStore(chatSessionService);
	});

	afterEach(() => {
		store.dispose();
		disposeChatSession.dispose();
		vi.useRealTimers();
	});

	test('basic add and get', () => {
		const conv = createConversation('session-1');
		store.addConversation('resp-1', conv);
		expect(store.getConversation('resp-1')).toBe(conv);
		expect(store.lastConversation).toBe(conv);
	});

	test('cleans up session conversations after timeout', () => {
		const conv = createConversation('session-1');
		store.addConversation('resp-1', conv);

		disposeChatSession.fire('session-1');

		vi.advanceTimersByTime(10 * 60 * 1000);
		expect(store.getConversation('resp-1')).toBeUndefined();
	});

	test('accessing conversation cancels cleanup', () => {
		const conv = createConversation('session-1');
		store.addConversation('resp-1', conv);

		disposeChatSession.fire('session-1');

		// Access before timeout — cancels cleanup entirely
		vi.advanceTimersByTime(7 * 60 * 1000);
		expect(store.getConversation('resp-1')).toBe(conv);

		// Advance well past the original timeout — should still exist
		vi.advanceTimersByTime(30 * 60 * 1000);
		expect(store.getConversation('resp-1')).toBe(conv);
	});

	test('accessing lastConversation cancels cleanup', () => {
		const conv = createConversation('session-1');
		store.addConversation('resp-1', conv);

		disposeChatSession.fire('session-1');

		vi.advanceTimersByTime(7 * 60 * 1000);
		expect(store.lastConversation).toBe(conv);

		vi.advanceTimersByTime(30 * 60 * 1000);
		expect(store.lastConversation).toBe(conv);
	});

	test('adding conversation for pending-cleanup session cancels cleanup', () => {
		const conv1 = createConversation('session-1');
		store.addConversation('resp-1', conv1);

		disposeChatSession.fire('session-1');
		vi.advanceTimersByTime(7 * 60 * 1000);

		// Late write for the same session — cancels cleanup
		const conv2 = createConversation('session-1');
		store.addConversation('resp-2', conv2);

		// Advance well past the original timeout — both should survive
		vi.advanceTimersByTime(30 * 60 * 1000);
		expect(store.getConversation('resp-1')).toBe(conv1);
		expect(store.getConversation('resp-2')).toBe(conv2);
	});

	test('does not clean up sessions that were not disposed', () => {
		const conv = createConversation('session-1');
		store.addConversation('resp-1', conv);

		vi.advanceTimersByTime(30 * 60 * 1000);
		expect(store.getConversation('resp-1')).toBe(conv);
	});

	test('only cleans up the disposed session, not others', () => {
		const conv1 = createConversation('session-1');
		const conv2 = createConversation('session-2');
		store.addConversation('resp-1', conv1);
		store.addConversation('resp-2', conv2);

		disposeChatSession.fire('session-1');
		vi.advanceTimersByTime(10 * 60 * 1000);

		expect(store.getConversation('resp-1')).toBeUndefined();
		expect(store.getConversation('resp-2')).toBe(conv2);
	});
});
