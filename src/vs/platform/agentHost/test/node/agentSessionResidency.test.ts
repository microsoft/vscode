/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { AgentSession } from '../../common/agent.js';
import { IAgentHostSubscriptionService } from '../../common/agentHostSubscriptionService.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { MessageKind, SessionStatus, buildDefaultChatUri, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostSubscriptionService } from '../../node/agentHostSubscriptionService.js';
import { AgentSessionResidency, type IAgentSessionReleaseDelegate } from '../../node/agentSessionResidency.js';

suite('AgentSessionResidency', () => {
	const disposables = new DisposableStore();
	const logService = new NullLogService();
	let stateManager: AgentHostStateManager;
	let releaseHold: Emitter<string>;
	let released: string[];
	let evicted: string[];
	let residency: AgentSessionResidency;
	let delegate: IAgentSessionReleaseDelegate;
	let subscriptions: AgentHostSubscriptionService;

	setup(() => {
		stateManager = disposables.add(new AgentHostStateManager(logService));
		releaseHold = disposables.add(new Emitter<string>());
		released = [];
		evicted = [];
		subscriptions = new AgentHostSubscriptionService();
		delegate = {
			isReleaseBlocked: () => false,
			whenSessionDataIdle: async () => { },
			getSessionChats: session => [URI.parse(buildDefaultChatUri(session))],
			createRelease: session => ({
				canRelease: async () => true,
				release: async () => { released.push(session.toString()); },
			}),
			evictSessionState: session => {
				evicted.push(session.toString());
				stateManager.removeSession(session.toString());
			},
		};
		residency = createResidency(10);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createResidency(limit: number, releaseRetryMs = 30_000): AgentSessionResidency {
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostSubscriptionService, subscriptions],
		)));
		return disposables.add(instantiationService.createInstance(
			AgentSessionResidency,
			stateManager,
			delegate,
			{
				limit,
				releaseRetryMs,
				holdsSession: () => false,
				onDidReleaseHold: releaseHold.event,
			},
		));
	}

	function createUsedSession(id: string, complete = true): URI {
		const session = AgentSession.uri('copilot', id);
		const summary: SessionSummary = {
			resource: session.toString(),
			provider: 'copilot',
			title: id,
			status: SessionStatus.Idle,
			createdAt: '2025-01-01T00:00:00.000Z',
			modifiedAt: '2025-01-01T00:00:00.000Z',
		};
		stateManager.createSession(summary);
		const chat = buildDefaultChatUri(session);
		stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: `turn-${id}`, startedAt: '2025-01-01T00:00:00.000Z', message: { text: id, origin: { kind: MessageKind.User } } });
		if (complete) {
			stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: `turn-${id}`, duration: 1 });
		}
		residency.touch(session);
		return session;
	}

	async function waitFor(predicate: () => boolean, message: string): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) {
				return;
			}
			await timeout(0);
		}
		assert.fail(message);
	}

	test('keeps the most-recently-used sessions within the soft limit', async () => {
		residency.dispose();
		residency = createResidency(3);
		const first = createUsedSession('first');
		const second = createUsedSession('second');
		const third = createUsedSession('third');
		residency.touch(first);
		const fourth = createUsedSession('fourth');

		await residency.reconcile();

		assert.deepStrictEqual({
			resident: [first, second, third, fourth].map(session => stateManager.getSessionState(session.toString()) !== undefined),
			released,
			evicted,
		}, {
			resident: [true, false, true, true],
			released: [second.toString()],
			evicted: [second.toString()],
		});
	});

	test('allows pinned sessions to exceed the limit and trims when one becomes idle', async () => {
		residency.dispose();
		residency = createResidency(2);
		const first = createUsedSession('first', false);
		const second = createUsedSession('second', false);
		const third = createUsedSession('third', false);

		await residency.reconcile();
		const residentWhileRunning = [first, second, third].map(session => stateManager.getSessionState(session.toString()) !== undefined);
		stateManager.dispatchServerAction(buildDefaultChatUri(first), { type: ActionType.ChatTurnComplete, turnId: 'turn-first', duration: 1 });
		await waitFor(() => stateManager.getSessionState(first.toString()) === undefined, 'completed excess session was not released');

		assert.deepStrictEqual({
			residentWhileRunning,
			residentAfterCompletion: [first, second, third].map(session => stateManager.getSessionState(session.toString()) !== undefined),
		}, {
			residentWhileRunning: [true, true, true],
			residentAfterCompletion: [false, true, true],
		});
	});

	test('releases archived sessions below the limit', async () => {
		const session = createUsedSession('archived');
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		await residency.reconcile();

		assert.deepStrictEqual({
			resident: stateManager.getSessionState(session.toString()) !== undefined,
			released,
		}, {
			resident: false,
			released: [session.toString()],
		});
	});

	test('normalizes annotations subscriptions to their owning session', async () => {
		residency.dispose();
		residency = createResidency(0);
		const session = createUsedSession('annotations');
		const annotations = URI.parse(buildAnnotationsUri(session.toString()));
		subscriptions.addSubscriber(annotations, 'client');

		await residency.reconcile();
		const residentForSubscriber = stateManager.getSessionState(session.toString()) !== undefined;
		const removedLastSubscriber = subscriptions.removeSubscriber(annotations, 'client');
		const hasSubscribersAfterRemoval = subscriptions.hasSessionSubscribers(session);

		assert.deepStrictEqual({
			removedLastSubscriber,
			hasSubscribersAfterRemoval,
			residentForSubscriber,
		}, {
			removedLastSubscriber: true,
			hasSubscribersAfterRemoval: false,
			residentForSubscriber: true,
		});
	});

	test('keeps state after a failed release and retries', async () => {
		residency.dispose();
		let attempts = 0;
		delegate.createRelease = session => ({
			canRelease: async () => true,
			release: async () => {
				attempts++;
				if (attempts === 1) {
					throw new Error('transient');
				}
				released.push(session.toString());
			},
		});
		residency = createResidency(10, 10);
		const session = createUsedSession('retry');
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		await residency.reconcile();
		const residentAfterFailure = stateManager.getSessionState(session.toString()) !== undefined;
		await timeout(15);
		await waitFor(() => stateManager.getSessionState(session.toString()) === undefined, 'release retry did not complete');

		assert.deepStrictEqual({
			attempts,
			residentAfterFailure,
		}, {
			attempts: 2,
			residentAfterFailure: true,
		});
	});

	test('restores MRU tracking when disposal fails', async () => {
		residency.dispose();
		residency = createResidency(0);
		const session = createUsedSession('dispose-failure');

		await assert.rejects(
			() => residency.runDisposal(session, async () => { throw new Error('transient disposal failure'); }),
			/transient disposal failure/,
		);
		await waitFor(() => stateManager.getSessionState(session.toString()) === undefined, 'failed disposal did not restore residency tracking');

		assert.deepStrictEqual(released, [session.toString()]);
	});

	test('revalidates recency after asynchronous provider preflight', async () => {
		residency.dispose();
		const canRelease = new DeferredPromise<void>();
		let createReleaseCalls = 0;
		delegate.createRelease = session => {
			createReleaseCalls++;
			return {
				canRelease: async () => {
					await canRelease.p;
					return true;
				},
				release: async () => { released.push(session.toString()); },
			};
		};
		residency = createResidency(1);
		const first = createUsedSession('first');
		const second = createUsedSession('second');
		const reconcile = residency.reconcile();
		await timeout(0);

		residency.touch(first);
		canRelease.complete();
		await reconcile;
		await residency.reconcile();

		assert.deepStrictEqual({
			createReleaseCalls,
			resident: [first, second].map(session => stateManager.getSessionState(session.toString()) !== undefined),
		}, {
			createReleaseCalls: 2,
			resident: [true, false],
		});
	});
});
