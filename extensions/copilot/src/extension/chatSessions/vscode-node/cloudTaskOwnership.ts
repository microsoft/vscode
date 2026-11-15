/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Memento } from 'vscode';

const OWNED_CLOUD_TASKS_STORAGE_KEY = 'github.copilot.cloudAgent.ownedTasks';
const MAX_OWNED_CLOUD_TASKS = 1000;

interface IOwnedCloudTask {
	readonly recordedAt: number;
	readonly application?: string;
}

/** Bounded ownership records, retaining creation provenance when an external task is adopted. */
export class CloudTaskOwnership {

	constructor(
		private readonly _globalState: Memento,
		private readonly _maxTasks = MAX_OWNED_CLOUD_TASKS,
	) { }

	getOwnedTaskIds(): ReadonlySet<string> {
		return new Set(this._read().keys());
	}

	getApplication(taskId: string): string | undefined {
		return this._read().get(taskId)?.application;
	}

	/**
	 * Records that the task was started or adopted from VS Code.
	 * @returns whether the task was external before this call.
	 */
	async record(taskId: string, now = Date.now(), application?: string): Promise<boolean> {
		const owned = this._read();
		const wasExternal = !owned.has(taskId);
		owned.set(taskId, { recordedAt: now, application: owned.get(taskId)?.application ?? application });
		const retained = [...owned]
			.sort(([, a], [, b]) => b.recordedAt - a.recordedAt)
			.slice(0, this._maxTasks);
		await this._globalState.update(OWNED_CLOUD_TASKS_STORAGE_KEY, Object.fromEntries(retained));
		return wasExternal;
	}

	private _read(): Map<string, IOwnedCloudTask> {
		const stored = this._globalState.get<unknown>(OWNED_CLOUD_TASKS_STORAGE_KEY);
		const owned = new Map<string, IOwnedCloudTask>();
		if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
			return owned;
		}
		for (const [taskId, value] of Object.entries(stored)) {
			if (typeof value === 'number' && Number.isFinite(value)) {
				owned.set(taskId, { recordedAt: value });
			} else if (typeof value === 'object' && value !== null && 'recordedAt' in value
				&& typeof value.recordedAt === 'number' && Number.isFinite(value.recordedAt)) {
				owned.set(taskId, {
					recordedAt: value.recordedAt,
					application: 'application' in value && typeof value.application === 'string' ? value.application : undefined,
				});
			}
		}
		return owned;
	}
}
