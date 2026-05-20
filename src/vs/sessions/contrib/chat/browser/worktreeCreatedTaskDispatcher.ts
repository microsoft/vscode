/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService } from './sessionsTasksService.js';

const LOG_PREFIX = '[WorktreeCreatedTaskDispatcher]';

/**
 * Workbench contribution that runs all tasks tagged with
 * `runOptions.runOn === 'worktreeCreated'` once per newly-created session,
 * when the session first reports an actual git worktree.
 *
 * Sessions whose runtime already runs these tasks server-side (signalled via
 * {@link ISessionCapabilities.runsWorktreeCreatedTasks}) are skipped to avoid
 * double-execution.
 *
 * We deliberately ignore sessions that predate this contribution so restored
 * sessions don't re-run setup tasks when the agents window opens.
 */
export class WorktreeCreatedTaskDispatcher extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.worktreeCreatedTaskDispatcher';

	// Track per-session disposables (one per in-flight session subscription) so
	// we tear them down when the session is removed.
	private readonly _sessionDisposables = this._register(new DisposableMap<string>());
	private readonly _dispatchedSessions = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsTasksService private readonly _sessionsTasksService: ISessionsTasksService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		for (const session of this._sessionsManagementService.getSessions()) {
			this._trackSession(session);
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(e => this._onDidChangeSessions(e)));
	}

	private _onDidChangeSessions(e: ISessionsChangeEvent): void {
		const removedTrackedSessions: ISession[] = [];
		for (const session of e.removed) {
			if (this._sessionDisposables.get(session.sessionId) && !this._dispatchedSessions.has(session.sessionId)) {
				removedTrackedSessions.push(session);
			}
			this._sessionDisposables.deleteAndDispose(session.sessionId);
			this._dispatchedSessions.delete(session.sessionId);
		}
		for (const session of e.added) {
			this._trackSession(session);
		}
		const replacement = e.added.length === 0 && e.changed.length === 1 && removedTrackedSessions.length === 1
			? removedTrackedSessions[0]
			: undefined;
		for (const session of e.changed) {
			this._trackSession(session, replacement?.providerId === session.providerId && replacement.sessionType === session.sessionType);
		}
	}

	private _trackSession(session: ISession, allowReadySession = false): void {
		if (session.capabilities.runsWorktreeCreatedTasks) {
			// The session's runtime already runs these tasks itself.
			return;
		}
		if (this._sessionDisposables.get(session.sessionId)) {
			return;
		}
		if (!allowReadySession && !this._isPendingWorktreeSession(session)) {
			return;
		}

		const store = new DisposableStore();
		this._sessionDisposables.set(session.sessionId, store);

		// Wait for the session to finish loading and report an actual worktree,
		// then dispatch any pending worktreeCreated tasks once. Set
		// `dispatched` synchronously before the await so any re-firing of the
		// autorun observes it and bails.
		let dispatched = false;
		store.add(autorun(reader => {
			if (session.loading.read(reader) || dispatched) {
				return;
			}
			if (session.status.read(reader) === SessionStatus.Untitled) {
				return;
			}
			if (!session.workspace.read(reader)?.folders.some(folder => !!folder.gitRepository?.workTreeUri)) {
				return;
			}
			dispatched = true;
			this._dispatchedSessions.add(session.sessionId);
			void this._dispatchWorktreeCreatedTasks(session);
		}));
	}

	private _isPendingWorktreeSession(session: ISession): boolean {
		return session.status.get() === SessionStatus.Untitled || session.loading.get() || !this._hasWorktree(session);
	}

	private _hasWorktree(session: ISession): boolean {
		return session.workspace.get()?.folders.some(folder => !!folder.gitRepository?.workTreeUri) ?? false;
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
