/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { agentSandboxDiagnosticsMetaKey } from '../../../../../../platform/agentHost/common/meta/agentSandboxDiagnostics.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { createSessionState, SessionState, SessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostSandboxNotification } from '../../../browser/agentSessions/agentHost/agentHostSandboxNotification.js';
import { ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';

suite('AgentHostSandboxNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('vscode-chat-session://remote-provider/session-a');

	class TestSubscription extends Disposable implements IAgentSubscription<SessionState> {
		private readonly _onDidChange = this._register(new Emitter<SessionState>());
		private readonly _onDidError = this._register(new Emitter<Error>());
		readonly onDidChange = this._onDidChange.event;
		readonly onDidError = this._onDidError.event;
		readonly onWillApplyAction = Event.None;
		readonly onDidApplyAction = Event.None;
		value: SessionState | Error | undefined;
		get verifiedValue(): SessionState {
			assert.ok(this.value && !(this.value instanceof Error));
			return this.value;
		}
		setValue(reasons?: readonly string[]): void {
			this.value = createSessionState({
				resource: 'custom-host://opaque/session',
				provider: 'custom-provider',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: '2026-09-25T00:00:00.000Z',
				modifiedAt: '2026-09-25T00:00:00.000Z',
				_meta: { [agentSandboxDiagnosticsMetaKey]: reasons },
			});
			this._onDidChange.fire(this.value);
		}
		setError(): void {
			this.value = new Error('Disconnected');
			this._onDidError.fire(this.value);
		}
	}

	class NotificationService extends mock<IChatInputNotificationService>() {
		readonly notifications = new Map<string, IChatInputNotification>();
		updates = 0;
		override setNotification(notification: IChatInputNotification): void {
			this.updates++;
			this.notifications.set(notification.id, notification);
		}
		override deleteNotification(id: string): void {
			this.notifications.delete(id);
		}
		override dismissNotification(id: string): void {
			this.notifications.delete(id);
		}
	}

	test('shows the SDK reason as plain text in a dismissible session-scoped warning without settings actions', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Install bubblewrap.', '[not a command](command:evil)']);
		const service = new NotificationService();
		store.add(new AgentHostSandboxNotification(resource, subscription, service));

		assert.deepStrictEqual([...service.notifications.values()], [{
			id: `agentHost.sandboxUnsupported.${resource.toString()}`,
			severity: ChatInputNotificationSeverity.Warning,
			message: 'Sandboxing is unavailable in this environment',
			description: 'Install bubblewrap.\n[not a command](command:evil)',
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
			sessionResources: [resource],
		}]);
	});

	test('updates and removes the notice as host diagnostics change', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue();
		const service = new NotificationService();
		store.add(new AgentHostSandboxNotification(resource, subscription, service));
		const snapshots = [service.notifications.size];
		subscription.setValue(['Install bubblewrap.']);
		snapshots.push(service.notifications.size);
		subscription.setValue();
		snapshots.push(service.notifications.size);
		assert.deepStrictEqual(snapshots, [0, 1, 0]);
	});

	test('disposal removes only this session notification and stops tracking', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		const notification = store.add(new AgentHostSandboxNotification(resource, subscription, service));
		const otherResource = URI.parse('vscode-chat-session://another-host/session-b');
		store.add(new AgentHostSandboxNotification(otherResource, subscription, service));
		notification.dispose();
		subscription.setValue(['Still unsupported.']);
		assert.deepStrictEqual([...service.notifications.values()].map(value => value.sessionResources), [[otherResource]]);
	});

	test('unrelated session updates do not republish the notice', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		store.add(new AgentHostSandboxNotification(resource, subscription, service));
		subscription.setValue(['Unsupported.']);
		assert.strictEqual(service.updates, 1);
	});

	test('dismissed warnings stay hidden until the diagnostic changes', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Install bubblewrap.']);
		const service = new NotificationService();
		store.add(new AgentHostSandboxNotification(resource, subscription, service));
		service.dismissNotification(`agentHost.sandboxUnsupported.${resource.toString()}`);
		subscription.setValue(['Install bubblewrap.']);
		const unchanged = service.notifications.size;
		subscription.setValue(['Bubblewrap cannot create a namespace.']);
		assert.deepStrictEqual({
			unchanged,
			descriptions: [...service.notifications.values()].map(notification => notification.description),
		}, {
			unchanged: 0,
			descriptions: ['Bubblewrap cannot create a namespace.'],
		});
	});

	test('clears the notice on subscription failure and restores it after reconnect', () => {
		const subscription = store.add(new TestSubscription());
		subscription.setValue(['Unsupported.']);
		const service = new NotificationService();
		store.add(new AgentHostSandboxNotification(resource, subscription, service));
		subscription.setError();
		const afterError = service.notifications.size;
		subscription.setValue(['Unsupported.']);
		assert.deepStrictEqual([afterError, service.notifications.size], [0, 1]);
	});
});
