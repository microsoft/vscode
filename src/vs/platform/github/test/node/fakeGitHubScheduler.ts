/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IGitHubScheduler } from '../../common/githubScheduler.js';

interface IFakeGitHubSchedulerTask {
	readonly id: number;
	readonly dueTime: number;
	readonly callback: () => void;
	cancelled: boolean;
}

export interface IFakeGitHubSchedulerOptions {
	readonly now?: number;
	readonly jitterValues?: readonly number[];
}

/**
 * A deterministic {@link IGitHubScheduler} for unit tests.
 */
export class FakeGitHubScheduler implements IGitHubScheduler, IDisposable {

	private readonly _jitterValues: readonly number[];
	private readonly _tasks: IFakeGitHubSchedulerTask[] = [];
	private _now: number;
	private _nextTaskId = 0;
	private _jitterIndex = 0;
	private _isDisposed = false;

	constructor(options: IFakeGitHubSchedulerOptions = {}) {
		this._now = options.now ?? 0;
		this._jitterValues = options.jitterValues ?? [];
	}

	get pendingCount(): number {
		return this._tasks.length;
	}

	get nextDueTime(): number | undefined {
		return this._tasks[0]?.dueTime;
	}

	now(): number {
		return this._now;
	}

	schedule(callback: () => void, delay: number): IDisposable {
		if (this._isDisposed) {
			throw new Error('FakeGitHubScheduler has been disposed');
		}

		const task: IFakeGitHubSchedulerTask = {
			id: this._nextTaskId++,
			dueTime: this._now + Math.max(0, delay),
			callback,
			cancelled: false,
		};
		this._tasks.push(task);
		this._sortTasks();

		return toDisposable(() => {
			task.cancelled = true;
			const index = this._tasks.findIndex(candidate => candidate.id === task.id);
			if (index >= 0) {
				this._tasks.splice(index, 1);
			}
		});
	}

	jitter(maximum: number): number {
		const normalizedMaximum = Math.max(0, Math.floor(maximum));
		if (normalizedMaximum === 0) {
			return 0;
		}

		const configured = this._jitterValues[this._jitterIndex++];
		if (typeof configured === 'number' && Number.isFinite(configured)) {
			return Math.min(normalizedMaximum, Math.max(1, Math.floor(configured)));
		}

		return ((this._jitterIndex - 1) % normalizedMaximum) + 1;
	}

	advanceBy(delay: number): void {
		if (delay < 0) {
			throw new Error('FakeGitHubScheduler cannot advance by a negative delay');
		}
		this.advanceTo(this._now + delay);
	}

	advanceTo(targetTime: number): void {
		if (targetTime < this._now) {
			throw new Error('FakeGitHubScheduler cannot move backwards in time');
		}

		while (true) {
			const next = this._tasks[0];
			if (!next || next.dueTime > targetTime) {
				break;
			}

			this._tasks.shift();
			if (next.cancelled) {
				continue;
			}

			this._now = next.dueTime;
			next.callback();
			this._sortTasks();
		}

		this._now = targetTime;
	}

	flushDue(): void {
		this.advanceTo(this._now);
	}

	flushAll(): void {
		while (this._tasks.length > 0) {
			this.advanceTo(this._tasks[0].dueTime);
		}
	}

	dispose(): void {
		this._isDisposed = true;
		this._tasks.length = 0;
	}

	private _sortTasks(): void {
		this._tasks.sort((left, right) => left.dueTime - right.dueTime || left.id - right.id);
	}
}
