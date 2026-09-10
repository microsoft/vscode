/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentsDashboardHistoryService } from '../../browser/agentsDashboardHistoryService.js';
import { AgentsDashboardHistoryEventType } from '../../common/agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService, WorktreeEntryStatus } from '../../common/worktreeDashboard.js';

suite('AgentsDashboardHistoryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('records deltas and restores bounded numeric history', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSessions(): ISession[] { return []; }
		}();
		const worktreeDashboardService = new class extends mock<IWorktreeDashboardService>() {
			override readonly entries = constObservable<IWorktreeDashboardEntry[]>([]);
			override readonly hasRefreshed = constObservable(false);
		}();
		const service = disposables.add(new AgentsDashboardHistoryService(storageService, sessionsManagementService, worktreeDashboardService));
		const status = observableValue('status', SessionStatus.InProgress);
		const lastTurnEnd = observableValue<Date | undefined>('lastTurnEnd', undefined);
		const now = Date.now();
		const session = new class extends mock<ISession>() {
			override readonly sessionId = 'session';
			override readonly createdAt = new Date(now);
			override readonly status = status;
			override readonly updatedAt = constObservable(new Date(now));
			override readonly workspace = constObservable(undefined);
			override readonly lastTurnEnd = lastTurnEnd;
		}();
		const worktree: IWorktreeDashboardEntry = {
			repositoryRoot: URI.file('/repo'),
			worktreePath: URI.file('/repo.worktrees/session'),
			name: 'session',
			branchName: 'agents/session',
			status: WorktreeEntryStatus.SessionActive,
			session,
			hasUncommittedChanges: false,
			sizeBytes: 1024,
		};

		service.record([session], [worktree]);
		status.set(SessionStatus.Completed, undefined);
		lastTurnEnd.set(new Date(), undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);
		status.set(SessionStatus.InProgress, undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);
		status.set(SessionStatus.Completed, undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);

		assert.deepStrictEqual(service.events.get().map(event => ({
			type: event.type,
			value: event.type === AgentsDashboardHistoryEventType.DiskUsage ? event.value : undefined,
			median: event.type === AgentsDashboardHistoryEventType.DiskUsage ? event.medianSessionBytes : undefined,
			largest: event.type === AgentsDashboardHistoryEventType.DiskUsage ? event.largestSessionBytes : undefined,
		})), [
			{ type: AgentsDashboardHistoryEventType.SessionStarted, value: undefined, median: undefined, largest: undefined },
			{ type: AgentsDashboardHistoryEventType.DiskUsage, value: 1024, median: 1024, largest: 1024 },
			{ type: AgentsDashboardHistoryEventType.SessionDone, value: undefined, median: undefined, largest: undefined },
			{ type: AgentsDashboardHistoryEventType.DiskUsage, value: 2048, median: 2048, largest: 2048 },
		]);

		await timeout(250);
		service.setDevelopmentEvents([{
			id: 'development-only',
			type: AgentsDashboardHistoryEventType.PullRequestCreated,
			timestamp: Date.now(),
		}]);
		assert.deepStrictEqual(service.events.get().map(event => event.id), ['development-only']);
		const restored = disposables.add(new AgentsDashboardHistoryService(storageService, sessionsManagementService, worktreeDashboardService));
		assert.deepStrictEqual(restored.events.get().map(event => event.type), [
			AgentsDashboardHistoryEventType.SessionStarted,
			AgentsDashboardHistoryEventType.DiskUsage,
			AgentsDashboardHistoryEventType.SessionDone,
			AgentsDashboardHistoryEventType.DiskUsage,
		]);
	});
});
