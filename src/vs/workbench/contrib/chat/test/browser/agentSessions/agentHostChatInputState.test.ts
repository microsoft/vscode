/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import type { AgentChatInputState } from '../../../../../../platform/agentHost/common/meta/agentHostChatInputState.js';
import { AgentHostChatInputState } from '../../../browser/agentSessions/agentHost/agentHostChatInputState.js';
import { ChatInputNotificationSeverity, type IChatInputNotification, type IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';

suite('AgentHostChatInputState', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('agent-host-codex:/locked');
	const locked: AgentChatInputState = { kind: 'blocked', error: { errorType: 'CodexThreadInUse', message: 'thread locked already has an active writer' } };

	class Notifications extends mock<IChatInputNotificationService>() {
		readonly notices = new Map<string, IChatInputNotification>();
		updates = 0;
		override setNotification(notice: IChatInputNotification): void { this.updates++; this.notices.set(notice.id, notice); }
		override deleteNotification(id: string): void { this.notices.delete(id); }
	}

	test('renders host state and refreshes without accumulating banners', async () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		let calls = 0;
		const barrier = new DeferredPromise<void>();
		const state = store.add(new AgentHostChatInputState(resource, input, async () => { calls++; await barrier.p; input.set(undefined, undefined); }, notices));
		const before = [...notices.notices.values()][0];
		const retry = state.retry();
		const coalesced = state.retry() === retry;
		const whileChecking = state.isInputBlocked.get();
		await barrier.complete();
		await retry;
		assert.deepStrictEqual({ calls, coalesced, whileChecking, blocked: state.isInputBlocked.get(), notices: notices.notices.size, dismissible: before.dismissible, actions: before.actions.map(action => action.label) }, {
			calls: 1, coalesced: true, whileChecking: true, blocked: false, notices: 0, dismissible: false, actions: ['Retry'],
		});
	});

	test('remote lock updates clear a banner in every view without local retry', () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const state = store.add(new AgentHostChatInputState(resource, input, async () => { assert.fail('No request expected'); }, notices));
		const blocked = state.isInputBlocked.get();
		input.set(undefined, undefined);
		assert.deepStrictEqual({ blocked, after: state.isInputBlocked.get(), notices: notices.notices.size }, { blocked: true, after: false, notices: 0 });
	});

	test('keeps the lock notification stable while retrying an unavailable conversation', async () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const pending = new DeferredPromise<void>();
		const state = store.add(new AgentHostChatInputState(resource, input, async () => {
			input.set({ kind: 'checking' }, undefined);
			await pending.p;
			input.set({ ...locked }, undefined);
		}, notices));
		const before = [...notices.notices.values()][0];
		const retry = state.retry();
		const immediately = [...notices.notices.values()];
		await Promise.resolve();
		const checking = [...notices.notices.values()];
		await pending.complete();
		await retry;
		assert.deepStrictEqual({ immediately, checking, after: [...notices.notices.values()], blocked: state.isInputBlocked.get(), updates: notices.updates, severity: before.severity }, {
			immediately: [before], checking: [before], after: [before], blocked: true, updates: 1, severity: ChatInputNotificationSeverity.Error,
		});
	});

	test('announces each started retry without repeating announcements for coalesced retries', async () => {
		const ariaHost = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => ariaHost.remove()));
		setARIAContainer(ariaHost);
		const announcements = () => [...ariaHost.querySelectorAll('.monaco-status')].map(element => element.textContent);
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const pending = new DeferredPromise<void>();
		const state = store.add(new AgentHostChatInputState(resource, input, () => pending.p, notices));
		const retry = state.retry();
		await Promise.resolve();
		const started = announcements();
		const coalesced = state.retry() === retry;
		await Promise.resolve();
		const whilePending = announcements();
		await pending.complete();
		await retry;
		await state.retry();
		assert.deepStrictEqual({ started, coalesced, whilePending, nextRetry: announcements(), updates: notices.updates }, {
			started: ['Checking whether this conversation is available…', ''],
			coalesced: true,
			whilePending: ['Checking whether this conversation is available…', ''],
			nextRetry: ['', 'Checking whether this conversation is available…'],
			updates: 1,
		});
	});

	test('keeps the lock notification stable during a shared-state check', () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		store.add(new AgentHostChatInputState(resource, input, async () => { assert.fail('No request expected'); }, notices));
		const before = [...notices.notices.values()][0];
		input.set({ kind: 'checking' }, undefined);
		const checking = [...notices.notices.values()];
		input.set({ ...locked }, undefined);
		assert.deepStrictEqual({ checking, after: [...notices.notices.values()], updates: notices.updates }, {
			checking: [before], after: [before], updates: 1,
		});
	});

	test('keeps error severity for the initial check and a lock', () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', { kind: 'checking' });
		const state = store.add(new AgentHostChatInputState(resource, input, async () => { assert.fail('No request expected'); }, notices));
		const snapshot = () => {
			const notice = [...notices.notices.values()][0];
			return { message: notice.message, severity: notice.severity, actions: notice.actions.map(action => action.label), blocked: state.isInputBlocked.get() };
		};
		const checking = snapshot();
		input.set(locked, undefined);
		assert.deepStrictEqual({ checking, locked: snapshot() }, {
			checking: { message: 'Checking Conversation', severity: ChatInputNotificationSeverity.Error, actions: [], blocked: true },
			locked: { message: 'This chat is open in another app', severity: ChatInputNotificationSeverity.Error, actions: ['Retry'], blocked: true },
		});
	});

	test('failed refresh keeps input blocked and remains retryable without claiming a writer conflict', async () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const state = store.add(new AgentHostChatInputState(resource, input, async () => { throw new Error('Connection unavailable'); }, notices));
		await state.retry();
		const notice = [...notices.notices.values()][0];
		assert.deepStrictEqual({ blocked: state.isInputBlocked.get(), message: notice.message, description: notice.description, severity: notice.severity }, {
			blocked: true, message: 'Conversation Unavailable', description: 'Couldn\'t prepare this conversation. Select Retry to try again. Connection unavailable', severity: ChatInputNotificationSeverity.Error,
		});
	});

	test('a shared-state update clears a failed local Retry', async () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const state = store.add(new AgentHostChatInputState(resource, input, async () => { throw new Error('Connection unavailable'); }, notices));
		await state.retry();
		input.set(undefined, undefined);
		assert.deepStrictEqual({ blocked: state.isInputBlocked.get(), notices: notices.notices.size }, { blocked: false, notices: 0 });
	});

	test('disposal prevents a late refresh from recreating the banner', async () => {
		const notices = new Notifications();
		const input = observableValue<AgentChatInputState | undefined>('input', locked);
		const pending = new DeferredPromise<void>();
		const state = store.add(new AgentHostChatInputState(resource, input, () => pending.p, notices));
		const retry = state.retry();
		await Promise.resolve();
		state.dispose();
		await pending.error(new Error('Connection unavailable'));
		await retry;
		assert.strictEqual(notices.notices.size, 0);
	});
});
