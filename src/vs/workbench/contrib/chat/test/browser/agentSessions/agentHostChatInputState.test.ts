/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentPrepareChatResult } from '../../../../../../platform/agentHost/common/agent.js';
import { AgentHostChatInputState } from '../../../browser/agentSessions/agentHost/agentHostChatInputState.js';
import { type IChatInputNotification, type IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';

suite('AgentHostChatInputState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('agent-host-codex:/locked');
	const locked = { error: { errorType: 'CodexThreadInUse', message: 'thread locked already has an active writer' } };

	class Notifications extends mock<IChatInputNotificationService>() {
		readonly notices = new Map<string, IChatInputNotification>();
		override setNotification(notice: IChatInputNotification): void { this.notices.set(notice.id, notice); }
		override deleteNotification(id: string): void { this.notices.delete(id); }
	}

	test('retries only preparation, keeps one non-dismissible banner, and unblocks on success', async () => {
		const notices = new Notifications();
		let calls = 0;
		const retry = new DeferredPromise<IAgentPrepareChatResult>();
		const state = store.add(new AgentHostChatInputState(resource, async () => ++calls === 1 ? locked : retry.p, notices));
		const initial = state.prepare();
		const checking = state.isInputBlocked.get();
		await initial;
		const notice = [...notices.notices.values()][0];
		const retrying = state.prepare();
		const coalesced = state.prepare() === retrying;
		const retryBlocked = state.isInputBlocked.get();
		await retry.complete({});
		await retrying;
		assert.deepStrictEqual({
			checking, retryBlocked, coalesced, calls,
			dismissible: notice.dismissible,
			autoDismiss: notice.autoDismissOnMessage,
			targets: notice.sessionResources,
			actions: notice.actions.map(action => action.label),
			remaining: notices.notices.size,
			blocked: state.isInputBlocked.get(),
		}, {
			checking: true, retryBlocked: true, coalesced: true, calls: 2,
			dismissible: false, autoDismiss: false, targets: [resource], actions: ['Retry'], remaining: 0, blocked: false,
		});
	});

	test('repeated lock failures do not accumulate banners and disposal ignores late results', async () => {
		const notices = new Notifications();
		const pending = new DeferredPromise<IAgentPrepareChatResult>();
		let calls = 0;
		const state = store.add(new AgentHostChatInputState(resource, async () => ++calls < 3 ? locked : pending.p, notices));
		await state.prepare();
		await state.prepare();
		const before = { count: notices.notices.size, blocked: state.isInputBlocked.get() };
		const preparing = state.prepare();
		state.dispose();
		await pending.complete(locked);
		await preparing;
		assert.deepStrictEqual({ before, after: notices.notices.size }, { before: { count: 1, blocked: true }, after: 0 });
	});

	test('unrelated errors stay actionable without being described as writer contention', async () => {
		const notices = new Notifications();
		const state = store.add(new AgentHostChatInputState(resource, async () => { throw new Error('Connection unavailable'); }, notices));
		await state.prepare();
		const notice = [...notices.notices.values()][0];
		assert.deepStrictEqual({ blocked: state.isInputBlocked.get(), message: notice.message, description: notice.description }, {
			blocked: true,
			message: 'Conversation Unavailable',
			description: 'Couldn\'t prepare this conversation. Select Retry to try again. Connection unavailable',
		});
	});
});
