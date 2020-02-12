/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskSet } from 'vs/workbench/contrib/tasks/common/tasks';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { CancellationTokenSource } from 'vs/base/common/cancellation';

export class ProviderProgressMananger extends Disposable {
	private _onProviderComplete: Emitter<string> = new Emitter();
	private _stillProviding: Set<string> = new Set();
	private _totalProviders: number = 0;
	private _onDone: Emitter<void> = new Emitter();
	private _isDone: boolean = false;
	private _showProgress: ((remaining: string[], total: number) => void) | undefined;
	public canceled: CancellationTokenSource = new CancellationTokenSource();

	constructor() {
		super();
		this._register(this._onProviderComplete.event(taskType => {
			this._stillProviding.delete(taskType);
			if (this._stillProviding.size === 0) {
				this._isDone = true;
				this._onDone.fire();
			}
			if (this._showProgress) {
				this._showProgress(Array.from(this._stillProviding), this._totalProviders);
			}
		}));
	}

	public addProvider(taskType: string, provider: Promise<TaskSet>) {
		this._totalProviders++;
		this._stillProviding.add(taskType);
		provider.then(() => this._onProviderComplete.fire(taskType));
	}

	public addOnDoneListener(onDoneListener: () => void) {
		this._register(this._onDone.event(onDoneListener));
	}

	set showProgress(progressDisplayFunction: (remaining: string[], total: number) => void) {
		this._showProgress = progressDisplayFunction;
		this._showProgress(Array.from(this._stillProviding), this._totalProviders);
	}

	get isDone(): boolean {
		return this._isDone;
	}

	public cancel() {
		this._isDone = true;
		if (this._showProgress) {
			this._showProgress([], 0);
		}
		this._onDone.fire();
		this.canceled.cancel();
	}
}
