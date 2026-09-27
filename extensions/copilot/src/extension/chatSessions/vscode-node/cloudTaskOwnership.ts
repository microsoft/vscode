/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Memento } from 'vscode';

const OWNED_CLOUD_TASKS_STORAGE_KEY = 'github.copilot.cloudAgent.ownedTasks';
const MAX_OWNED_CLOUD_TASKS = 1000;

/**
 * Cloud tasks that were started or adopted from VS Code.
 *
 * The Task API does not report which client started a task, so VS Code records every task it
 * creates and every task the user sends a message to. A task without a record is external: it
 * was started from another client (for example github.com, GitHub Mobile, or the Copilot CLI).
 * Each task keeps the time it was last recorded so that the record stays bounded by evicting
 * the tasks that were least recently used from VS Code.
 */
export class CloudTaskOwnership {

	constructor(
		private readonly _globalState: Memento,
		private readonly _maxTasks = MAX_OWNED_CLOUD_TASKS,
	) { }

	getOwnedTaskIds(): ReadonlySet<string> {
		return new Set(this._read().keys());
	}

	/**
	 * Records that the task was started or adopted from VS Code.
	 * @returns whether the task was external before this call.
	 */
	async record(taskId: string, now = Date.now()): Promise<boolean> {
		const owned = this._read();
		const wasExternal = !owned.has(taskId);
		owned.set(taskId, now);
		const retained = [...owned]
			.sort(([, a], [, b]) => b - a)
			.slice(0, this._maxTasks);
		await this._globalState.update(OWNED_CLOUD_TASKS_STORAGE_KEY, Object.fromEntries(retained));
		return wasExternal;
	}

	private _read(): Map<string, number> {
		const stored = this._globalState.get<unknown>(OWNED_CLOUD_TASKS_STORAGE_KEY);
		const owned = new Map<string, number>();
		if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
			return owned;
		}
		for (const [taskId, recordedAt] of Object.entries(stored)) {
			if (typeof recordedAt === 'number' && Number.isFinite(recordedAt)) {
				owned.set(taskId, recordedAt);
			}
		}
		return owned;
	}
}
