/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AH_META_ORCHESTRATION_DB_KEY, readSessionOrchestration, SessionStatus, type ISessionOrchestration, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionCoordinationService, transitionSessionCoordination } from '../../node/sessionCoordination.js';

suite('SessionCoordination', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const base: ISessionOrchestration = {
		parentSession: 'copilot:/parent',
		creatorSession: 'copilot:/creator',
		coordinateWithCreator: true,
		notifyOnIdle: 'once',
	};

	function createSummary(session: URI): SessionSummary {
		return {
			resource: session.toString(),
			provider: 'copilot',
			title: 'Child',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
		};
	}

	function createService(
		stateManager: AgentHostStateManager,
		persistSessionMetadata: (session: string, values: Readonly<Record<string, string>>) => Promise<void>,
	): SessionCoordinationService {
		return disposables.add(new SessionCoordinationService(stateManager, persistSessionMetadata, new NullLogService(), {
			getSessionMetadata: async () => undefined,
			restoreSession: async () => { },
			handleAction: () => { },
		}));
	}

	test('persists one orchestration mutation before publishing state', async () => {
		const session = URI.parse('agenthost-session://copilot/child');
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession(createSummary(session));
		const persistenceCalls: Array<{ session: string; values: Readonly<Record<string, string>> }> = [];
		let orchestrationAtPersistence: ISessionOrchestration | undefined;
		const service = createService(stateManager, async (persistedSession, values) => {
			orchestrationAtPersistence = readSessionOrchestration(stateManager.getSessionSummary(session.toString())?._meta);
			persistenceCalls.push({ session: persistedSession, values });
		});

		await service.setOrchestration(session.toString(), base);

		assert.deepStrictEqual({
			orchestrationAtPersistence,
			persistenceCalls,
			orchestrationAfterPersistence: readSessionOrchestration(stateManager.getSessionSummary(session.toString())?._meta),
		}, {
			orchestrationAtPersistence: undefined,
			persistenceCalls: [{
				session: session.toString(),
				values: { [AH_META_ORCHESTRATION_DB_KEY]: JSON.stringify(base) },
			}],
			orchestrationAfterPersistence: base,
		});
	});

	test('does not publish orchestration when coordinated persistence fails', async () => {
		const session = URI.parse('agenthost-session://copilot/child-failure');
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession(createSummary(session));
		const service = createService(stateManager, async () => {
			throw new Error('local transaction failed');
		});

		await assert.rejects(() => service.setOrchestration(session.toString(), base), /local transaction failed/);
		assert.strictEqual(readSessionOrchestration(stateManager.getSessionSummary(session.toString())?._meta), undefined);
	});

	test('waits for completion only after work starts', () => {
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Idle, base), { notify: false });
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, base), {
			orchestration: { ...base, creatorNotificationState: 'waitingForCompletion' },
			notify: false,
		});
	});

	test('notifies once after idle or error', () => {
		const waiting = { ...base, creatorNotificationState: 'waitingForCompletion' as const };
		const expected = {
			orchestration: { ...waiting, creatorNotificationState: 'notified' as const },
			notify: true,
		};
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Idle, waiting), expected);
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.Error, waiting), expected);
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, expected.orchestration), { notify: false });
	});

	test('notifies once when input is needed and deduplicates repeated status', () => {
		const waiting = { ...base, creatorNotificationState: 'waitingForCompletion' as const };
		const transition = transitionSessionCoordination(SessionStatus.InputNeeded, waiting);
		assert.deepStrictEqual(transition, {
			orchestration: { ...waiting, creatorNotificationState: 'notified' },
			notify: true,
		});
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InputNeeded, transition.orchestration!), { notify: false });
	});

	test('always waits for later work to complete', () => {
		const always: ISessionOrchestration = { ...base, notifyOnIdle: 'always', creatorNotificationState: 'notified' };
		assert.deepStrictEqual(transitionSessionCoordination(SessionStatus.InProgress, always), {
			orchestration: { ...always, creatorNotificationState: 'waitingForCompletion' },
			notify: false,
		});
	});

	test('always captures back-to-back work cycles', () => {
		let orchestration: ISessionOrchestration = { ...base, notifyOnIdle: 'always' };
		for (let cycle = 0; cycle < 2; cycle++) {
			const started = transitionSessionCoordination(SessionStatus.InProgress, orchestration);
			assert.strictEqual(started.notify, false);
			orchestration = started.orchestration!;
			const completed = transitionSessionCoordination(SessionStatus.Idle, orchestration);
			assert.strictEqual(completed.notify, true);
			orchestration = completed.orchestration!;
		}
	});
});
