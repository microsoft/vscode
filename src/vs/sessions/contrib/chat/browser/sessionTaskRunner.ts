/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ITaskEntry } from './sessionsTasksService.js';

/**
 * Pluggable runner that knows how to execute a session task in the runtime
 * associated with a given session.
 *
 * Implementations are registered via {@link ISessionTaskRunnerRegistry.register}
 * and consulted by {@link ISessionsTasksService.runTask}, which dispatches to
 * the highest-priority runner whose {@link canRun} returns `true`.
 */
export interface ISessionTaskRunner {
	/** Stable identifier for the runner (used for logging and diagnostics). */
	readonly id: string;
	/**
	 * Priority; higher values are preferred when multiple runners claim a
	 * session. The built-in workbench runner uses priority `0`; agent-host
	 * runners typically use a higher value (e.g. `100`).
	 */
	readonly priority: number;
	/** Returns `true` if this runner can execute tasks for the given session. */
	canRun(session: ISession): boolean;
	/**
	 * Executes the given task in the session's runtime. The returned promise
	 * resolves once the task has been launched (not when it has finished).
	 */
	runTask(task: ITaskEntry, session: ISession): Promise<void>;
}

/**
 * Registry of {@link ISessionTaskRunner} implementations. Consumed by
 * {@link ISessionsTasksService.runTask} to dispatch task execution to the
 * runtime that owns a session.
 */
export interface ISessionTaskRunnerRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a runner with the registry. The returned disposable removes
	 * the runner. If multiple runners claim the same session, the one with
	 * the higher {@link ISessionTaskRunner.priority} wins; ties are broken
	 * in registration order (later registrations win).
	 */
	register(runner: ISessionTaskRunner): IDisposable;

	/**
	 * Returns the highest-priority runner that claims the given session, or
	 * `undefined` if no registered runner can run tasks for it.
	 */
	getRunner(session: ISession): ISessionTaskRunner | undefined;
}

export const ISessionTaskRunnerRegistry = createDecorator<ISessionTaskRunnerRegistry>('sessionTaskRunnerRegistry');

export class SessionTaskRunnerRegistry implements ISessionTaskRunnerRegistry {

	declare readonly _serviceBrand: undefined;

	private readonly _runners: ISessionTaskRunner[] = [];

	register(runner: ISessionTaskRunner): IDisposable {
		this._runners.push(runner);
		return toDisposable(() => {
			const idx = this._runners.indexOf(runner);
			if (idx >= 0) {
				this._runners.splice(idx, 1);
			}
		});
	}

	getRunner(session: ISession): ISessionTaskRunner | undefined {
		let best: ISessionTaskRunner | undefined;
		// Iterate forward so later registrations beat earlier ones at equal priority.
		for (const runner of this._runners) {
			if (!runner.canRun(session)) {
				continue;
			}
			if (!best || runner.priority >= best.priority) {
				best = runner;
			}
		}
		return best;
	}
}
