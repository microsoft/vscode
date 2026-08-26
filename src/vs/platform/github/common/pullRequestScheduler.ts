/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IGitHubScheduler } from './githubScheduler.js';

interface IScheduledPullRequestTask {
	readonly key: string;
	readonly dueAt: number;
	readonly sequence: number;
	readonly run: () => void;
}

export class PullRequestScheduler extends Disposable {

	private readonly _tasks = new Map<string, IScheduledPullRequestTask>();
	private readonly _timer = this._register(new MutableDisposable());
	private _sequence = 0;

	constructor(
		private readonly _scheduler: IGitHubScheduler,
	) {
		super();
	}

	schedule(key: string, dueAt: number, run: () => void): void {
		this._tasks.set(key, { key, dueAt, sequence: this._sequence++, run });
		this._updateTimer();
	}

	cancel(key: string): void {
		if (this._tasks.delete(key)) {
			this._updateTimer();
		}
	}

	cancelPrefix(prefix: string): void {
		let changed = false;
		for (const key of this._tasks.keys()) {
			if (key.startsWith(prefix)) {
				this._tasks.delete(key);
				changed = true;
			}
		}
		if (changed) {
			this._updateTimer();
		}
	}

	clear(): void {
		this._tasks.clear();
		this._timer.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private _updateTimer(): void {
		this._timer.clear();
		let next: IScheduledPullRequestTask | undefined;
		for (const task of this._tasks.values()) {
			if (!next || task.dueAt < next.dueAt || task.dueAt === next.dueAt && task.sequence < next.sequence) {
				next = task;
			}
		}
		if (!next) {
			return;
		}
		this._timer.value = this._scheduler.schedule(() => {
			this._timer.clear();
			const due = [...this._tasks.values()]
				.filter(task => task.dueAt <= this._scheduler.now())
				.sort((left, right) => left.dueAt - right.dueAt || left.sequence - right.sequence);
			for (const task of due) {
				if (this._tasks.get(task.key) !== task) {
					continue;
				}
				this._tasks.delete(task.key);
				task.run();
			}
			this._updateTimer();
		}, Math.max(0, next.dueAt - this._scheduler.now()));
	}
}
