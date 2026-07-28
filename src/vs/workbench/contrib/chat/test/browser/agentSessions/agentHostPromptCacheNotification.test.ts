/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { createSessionState, SessionStatus, withSessionPromptCacheState, type SessionState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { type IAssignmentFilter, type IWorkbenchAssignmentService } from '../../../../../services/assignment/common/assignmentService.js';
import { AgentHostPromptCacheNotification } from '../../../browser/agentSessions/agentHost/agentHostPromptCacheNotification.js';
import { type IChatInputNotification, type IChatInputNotificationService } from '../../../browser/widget/input/chatInputNotificationService.js';

suite('AgentHostPromptCacheNotification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('shows an experiment-gated notification for the expired session resource', async () => {
		const clock = sinon.useFakeTimers({ now: new Date('2026-07-24T12:00:00.000Z') });
		const notificationService = new TestNotificationService();
		const storageService = store.add(new InMemoryStorageService());
		const contribution = store.add(new AgentHostPromptCacheNotification(
			notificationService,
			createAssignmentService(true),
			storageService,
			new NullLogService(),
		));
		const sessionResource = URI.parse('vscode-chat-session://agent-host-copilotcli/session-1');
		const subscription = new TestSessionSubscription(createState('2026-07-24T11:49:59.999Z'));
		store.add(contribution.trackSession(sessionResource, subscription));

		await Promise.resolve();

		assert.deepStrictEqual([...notificationService.notifications.values()].map(notification => ({
			message: notification.message,
			actions: notification.actions.map(action => action.label),
			sessionResources: notification.sessionResources?.map(resource => resource.toString()),
		})), [{
			message: 'This chat\'s prompt cache is stale',
			actions: ['Don\'t Show Again', 'Learn More', 'Start New Chat'],
			sessionResources: [sessionResource.toString()],
		}]);
		clock.restore();
	});

	test('does not show before ten minutes after expiration', async () => {
		const clock = sinon.useFakeTimers({ now: new Date('2026-07-24T12:00:00.000Z') });
		const notificationService = new TestNotificationService();
		const contribution = store.add(new AgentHostPromptCacheNotification(
			notificationService,
			createAssignmentService(true),
			store.add(new InMemoryStorageService()),
			new NullLogService(),
		));
		const sessionResource = URI.parse('vscode-chat-session://agent-host-copilotcli/session-1');
		const subscription = new TestSessionSubscription(createState('2026-07-24T12:01:00.000Z'));
		store.add(contribution.trackSession(sessionResource, subscription));
		await Promise.resolve();

		assert.strictEqual(notificationService.notifications.size, 0);
		subscription.setValue(createState('2026-07-24T11:49:59.999Z'));
		assert.strictEqual(notificationService.notifications.size, 1);
		clock.restore();
	});

	test('shows immediately after the ten-minute boundary', async () => {
		const clock = sinon.useFakeTimers({ now: new Date('2026-07-24T12:00:00.000Z') });
		const notificationService = new TestNotificationService();
		const contribution = store.add(new AgentHostPromptCacheNotification(
			notificationService,
			createAssignmentService(true),
			store.add(new InMemoryStorageService()),
			new NullLogService(),
		));
		const sessionResource = URI.parse('vscode-chat-session://agent-host-copilotcli/session-1');
		const subscription = new TestSessionSubscription(createState('2026-07-24T12:01:00.000Z'));
		store.add(contribution.trackSession(sessionResource, subscription));
		await Promise.resolve();

		await clock.tickAsync(11 * 60 * 1000);
		assert.strictEqual(notificationService.notifications.size, 0);
		await clock.tickAsync(1);
		assert.strictEqual(notificationService.notifications.size, 1);
		clock.restore();
	});

	test('preserves dismissal until the cache expiration changes', async () => {
		const clock = sinon.useFakeTimers({ now: new Date('2026-07-24T12:00:00.000Z') });
		const notificationService = new TestNotificationService();
		const contribution = store.add(new AgentHostPromptCacheNotification(
			notificationService,
			createAssignmentService(true),
			store.add(new InMemoryStorageService()),
			new NullLogService(),
		));
		const sessionResource = URI.parse('vscode-chat-session://agent-host-copilotcli/session-1');
		const subscription = new TestSessionSubscription(createState('2026-07-24T11:49:59.999Z'));
		store.add(contribution.trackSession(sessionResource, subscription));
		await Promise.resolve();

		const notificationId = notificationService.notifications.keys().next().value;
		assert.ok(notificationId);
		notificationService.dismissNotification(notificationId);
		subscription.setValue(createState('2026-07-24T11:49:59.999Z'));
		assert.strictEqual(notificationService.getActiveNotification(), undefined);
		subscription.setValue(createState('2026-07-24T11:49:59.998Z'));
		assert.ok(notificationService.getActiveNotification());
		clock.restore();
	});
});

class TestNotificationService implements IChatInputNotificationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _onDidDismiss = new Emitter<string>();
	readonly onDidDismiss = this._onDidDismiss.event;
	readonly notifications = new Map<string, IChatInputNotification>();
	private readonly dismissed = new Set<string>();
	setNotification(notification: IChatInputNotification): void {
		this.notifications.set(notification.id, notification);
		this.dismissed.delete(notification.id);
	}
	deleteNotification(id: string): void {
		this.notifications.delete(id);
		this.dismissed.delete(id);
	}
	dismissNotification(id: string): void {
		if (this.notifications.has(id)) {
			this.dismissed.add(id);
			this._onDidDismiss.fire(id);
		}
	}
	getActiveNotification(): IChatInputNotification | undefined {
		return [...this.notifications.values()].find(notification => !this.dismissed.has(notification.id));
	}
	handleMessageSent(): void { }
	announceRendered(): void { }
}

class TestSessionSubscription implements IAgentSubscription<SessionState> {
	private readonly _onDidChange = new Emitter<SessionState>();
	readonly onDidChange = this._onDidChange.event;
	readonly onDidError = Event.None;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;
	private _value: SessionState;
	get value(): SessionState { return this._value; }
	get verifiedValue(): SessionState { return this._value; }
	constructor(value: SessionState) { this._value = value; }
	setValue(value: SessionState): void {
		this._value = value;
		this._onDidChange.fire(value);
	}
}

function createState(cacheExpiresAt: string): SessionState {
	return {
		...createSessionState({
			resource: 'ahp-session://copilotcli/session-1',
			provider: 'copilotcli',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		}),
		_meta: withSessionPromptCacheState(undefined, { modelId: 'claude-opus-4.8', cacheExpiresAt }),
	};
}

function createAssignmentService(enabled: boolean): IWorkbenchAssignmentService {
	return {
		_serviceBrand: undefined,
		onDidRefetchAssignments: Event.None,
		getCurrentExperiments: async () => [],
		addTelemetryAssignmentFilter(_filter: IAssignmentFilter): void { },
		getTreatment: async <T extends string | number | boolean>() => enabled as T,
	};
}
