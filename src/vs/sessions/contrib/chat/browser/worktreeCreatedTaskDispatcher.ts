/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService } from './sessionsTasksService.js';

const LOG_PREFIX = '[WorktreeCreatedTaskDispatcher]';

/**
 * Workbench contribution that runs all tasks tagged with
 * `runOptions.runOn === 'worktreeCreated'` once per session, when the session
 * first appears and finishes loading.
 *
 * Sessions whose runtime already runs these tasks server-side (signalled via
 * {@link ISessionCapabilities.runsWorktreeCreatedTasks}) are skipped to avoid
 * double-execution.
 *
 * We deliberately don't persist any "already ran" marker across reloads:
 * worktree creation itself is a one-shot event, setup tasks are conventionally
 * idempotent (`npm install`, `pip install -r ...`), and the cost of running
 * them again on the rare case where the agents window reloads while the same
 * session is still attached is much smaller than the leak / state-management
 * cost of tracking them indefinitely.
 */
export class WorktreeCreatedTaskDispatcher extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.worktreeCreatedTaskDispatcher';

	// Track per-session disposables (one per in-flight session subscription) so
	// we tear them down when the session is removed.
	private readonly _sessionDisposables = this._register(new DisposableMap<string>());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsTasksService private readonly _sessionsTasksService: ISessionsTasksService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Bootstrap: handle sessions that are already known when we start up.
		for (const session of this._sessionsManagementService.getSessions()) {
			this._trackSession(session);
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(e => this._onDidChangeSessions(e)));
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		for (const session of e.added) {
			this._trackSession(session);
		}
		for (const session of e.removed) {
			this._sessionDisposables.deleteAndDispose(session.sessionId);
		}
	}

	private _trackSession(session: ISession): void {
		if (session.capabilities.runsWorktreeCreatedTasks) {
			// The session's runtime already runs these tasks itself.
			return;
		}
		if (this._sessionDisposables.get(session.sessionId)) {
			return;
		}

		const store = new DisposableStore();
		this._sessionDisposables.set(session.sessionId, store);

		// Wait for the session to finish loading, then dispatch any pending
		// worktreeCreated tasks once. Set `dispatched` synchronously before
		// the await so any re-firing of the autorun observes it and bails.
		let dispatched = false;
		store.add(autorun(reader => {
			if (session.loading.read(reader) || dispatched) {
				return;
			}
			dispatched = true;
			void this._dispatchWorktreeCreatedTasks(session);
		}));
	}

	private async _dispatchWorktreeCreatedTasks(session: ISession): Promise<void> {
		let tasks;
		try {
			tasks = await this._sessionsTasksService.getSessionTasksOnce(session);
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} Failed to read tasks for session '${session.sessionId}': ${err}`);
			return;
		}

		for (const { task } of tasks) {
			if (task.runOptions?.runOn !== 'worktreeCreated') {
				continue;
			}
			this._logService.trace(`${LOG_PREFIX} Running worktreeCreated task '${task.label}' for session '${session.sessionId}'`);
			try {
				await this._sessionsTasksService.runTask(task, session);
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Failed to run task '${task.label}' for session '${session.sessionId}': ${err}`);
			}
		}
	}
}
