/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, registerAutorunSelfDisposable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService } from './sessionsTasksService.js';

const LOG_PREFIX = '[WorktreeCreatedTaskDispatcher]';

/**
 * Setting that controls whether `runOptions.runOn === 'worktreeCreated'`
 * tasks are auto-dispatched for agent host sessions when a new worktree is
 * created. Defaults to `true`. Manual `Run Task` invocations are unaffected.
 */
export const AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING = 'chat.agentHost.runWorktreeCreatedTasks';

/**
 * Workbench contribution that runs all tasks tagged with
 * `runOptions.runOn === 'worktreeCreated'` once per newly-created session,
 * when the session first reports an actual git worktree.
 *
 * Sessions whose runtime already runs these tasks server-side (signalled via
 * {@link ISessionCapabilities.runsWorktreeCreatedTasks}) are skipped to avoid
 * double-execution.
 *
 * The stop handles returned by the dispatched tasks are tracked per session and
 * disposed when the session is marked done (archived) or removed, so the
 * long-running setup/build processes don't leak. See #321021.
 *
 * We deliberately ignore sessions that predate this contribution so restored
 * sessions don't re-run setup tasks when the agents window opens.
 */
export class WorktreeCreatedTaskDispatcher extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.worktreeCreatedTaskDispatcher';

	// Track per-session disposables (one per in-flight session subscription) so
	// we tear them down when the session is removed.
	private readonly _sessionDisposables = this._register(new DisposableMap<string>());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsTasksService private readonly _sessionsTasksService: ISessionsTasksService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._sessionsManagementService.onDidStartSession(session => this._trackSession(session)));
		this._register(this._sessionsManagementService.onDidChangeSessions(e => this._onDidRemoveSessions(e.removed)));
	}

	private _onDidRemoveSessions(removed: readonly ISession[]): void {
		for (const session of removed) {
			this._sessionDisposables.deleteAndDispose(session.sessionId);
		}
	}

	private _trackSession(session: ISession): void {
		if (session.capabilities.get().runsWorktreeCreatedTasks) {
			// The session's runtime already runs these tasks itself.
			return;
		}
		if (this._sessionDisposables.get(session.sessionId)) {
			return;
		}

		const store = new DisposableStore();
		this._sessionDisposables.set(session.sessionId, store);

		const taskHandles = store.add(new DisposableStore());

		registerAutorunSelfDisposable(store, reader => {
			if (session.loading.read(reader)) {
				return;
			}
			if (session.status.read(reader) === SessionStatus.Untitled) {
				return;
			}
			if (!session.workspace.read(reader)?.folders.some(folder => !!folder.gitRepository?.workTreeUri)) {
				return;
			}
			reader.dispose();
			this._dispatchWorktreeCreatedTasks(session, taskHandles);
		});

		store.add(autorun(reader => {
			if (session.isArchived.read(reader)) {
				taskHandles.clear();
			}
		}));
	}

	private async _dispatchWorktreeCreatedTasks(session: ISession, taskHandles: DisposableStore): Promise<void> {
		if (isAgentHostProviderId(session.providerId) && !this._configurationService.getValue<boolean>(AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING)) {
			this._logService.trace(`${LOG_PREFIX} Skipping worktreeCreated tasks for agent host session '${session.sessionId}' — '${AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING}' is disabled.`);
			return;
		}

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
				const handle = await this._sessionsTasksService.runTask(task, session);
				if (handle) {
					if (session.isArchived.get()) {
						handle.dispose();
					} else {
						taskHandles.add(handle);
					}
				}
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Failed to run task '${task.label}' for session '${session.sessionId}': ${err}`);
			}
		}
	}
}
