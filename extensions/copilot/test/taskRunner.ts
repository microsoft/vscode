/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class CTask<T> {

	private resolve!: (value: T) => void;
	private reject!: (err: any) => void;
	public result: Promise<T>;

	constructor(private readonly _execute: () => Promise<T>) {
		this.result = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	async execute(): Promise<void> {
		try {
			const result = await this._execute();
			this.resolve(result);
		} catch (err) {
			this.reject(err);
		}
	}
}

export class TaskRunner {
	private readonly tasks: CTask<any>[] = [];
	private pendingTasks = 0;

	private waitResolve: (() => void) | undefined;
	// private waitPromise: Promise<void> | undefined;
	constructor(
		public readonly parallelism: number
	) { }

	run<T>(task: CTask<T> | (() => Promise<T>)): Promise<T> {
		if (!(task instanceof CTask)) {
			task = new CTask(task);
		}
		this.tasks.push(task);
		this.launchTaskIfPossible();
		return task.result;
	}

	private launchTaskIfPossible(): void {
		if (this.tasks.length === 0) {
			// all tasks completed
			return;
		}
		if (this.pendingTasks >= this.parallelism) {
			// too many tasks running
			return;
		}
		const task = this.tasks.shift()!;
		this.pendingTasks++;
		task.execute().then(() => this.onDidCompleteTask(), () => this.onDidCompleteTask());
	}

	private onDidCompleteTask(): void {
		this.pendingTasks--;
		this.launchTaskIfPossible();

		if (this.pendingTasks === 0) {
			// all tasks completed
			// this.waitPromise = undefined;
			this.waitResolve?.();
		}
	}

	async waitForCompletion(): Promise<void> {
		throw new Error('not implemented');
		// if (!this.waitPromise) {
		// 	this.waitPromise = new Promise<void>(resolve => this.waitResolve = resolve);
		// }
		// // for (let i = 0; i < this.parallelism; i++) {
		// // 	this.launchTaskIfPossible();
		// // }
		// return this.waitPromise;
	}
}
