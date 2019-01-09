/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';

export const IProgressService = createDecorator<IProgressService>('progressService');

export interface IProgressService {
	_serviceBrand: any;

	/**
	 * Show progress customized with the provided flags.
	 */
	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;

	/**
	 * Indicate progress for the duration of the provided promise. Progress will stop in
	 * any case of promise completion, error or cancellation.
	 */
	showWhile(promise: Promise<any>, delay?: number): Promise<void>;
}

export const enum ProgressLocation {
	Explorer = 1,
	Scm = 3,
	Extensions = 5,
	Window = 10,
	Notification = 15
}

export interface IProgressOptions {
	location: ProgressLocation | string;
	title?: string;
	source?: string;
	total?: number;
	cancellable?: boolean;
}

export interface IProgressStep {
	message?: string;
	increment?: number;
}

export const IProgressService2 = createDecorator<IProgressService2>('progressService2');

export interface IProgressService2 {

	_serviceBrand: any;

	withProgress<P extends Promise<R>, R=any>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => P, onDidCancel?: () => void): P;
}

export interface IProgressRunner {
	total(value: number): void;
	worked(value: number): void;
	done(): void;
}

export const emptyProgressRunner: IProgressRunner = Object.freeze({
	total() { },
	worked() { },
	done() { }
});

export interface IProgress<T> {
	report(item: T): void;
}

export const emptyProgress: IProgress<any> = Object.freeze({ report() { } });

export class Progress<T> implements IProgress<T> {

	private _callback: (data: T) => void;
	private _value: T;

	constructor(callback: (data: T) => void) {
		this._callback = callback;
	}

	get value() {
		return this._value;
	}

	report(item: T) {
		this._value = item;
		this._callback(this._value);
	}
}

/**
 * A helper to show progress during a long running operation. If the operation
 * is started multiple times, only the last invocation will drive the progress.
 */
export interface IOperation {
	id: number;
	isCurrent: () => boolean;
	token: CancellationToken;
	stop(): void;
}

export class LongRunningOperation {
	private currentOperationId = 0;
	private currentOperationDisposables: IDisposable[] = [];
	private currentProgressRunner: IProgressRunner;
	private currentProgressTimeout: any;

	constructor(
		private progressService: IProgressService
	) { }

	start(progressDelay: number): IOperation {

		// Stop any previous operation
		this.stop();

		// Start new
		const newOperationId = ++this.currentOperationId;
		const newOperationToken = new CancellationTokenSource();
		this.currentProgressTimeout = setTimeout(() => {
			if (newOperationId === this.currentOperationId) {
				this.currentProgressRunner = this.progressService.show(true);
			}
		}, progressDelay);

		this.currentOperationDisposables.push(
			toDisposable(() => clearTimeout(this.currentProgressTimeout)),
			toDisposable(() => newOperationToken.cancel()),
			toDisposable(() => this.currentProgressRunner ? this.currentProgressRunner.done() : undefined)
		);

		return {
			id: newOperationId,
			token: newOperationToken.token,
			stop: () => this.doStop(newOperationId),
			isCurrent: () => this.currentOperationId === newOperationId
		};
	}

	stop(): void {
		this.doStop(this.currentOperationId);
	}

	private doStop(operationId: number): void {
		if (this.currentOperationId === operationId) {
			this.currentOperationDisposables = dispose(this.currentOperationDisposables);
		}
	}

	dispose(): void {
		this.currentOperationDisposables = dispose(this.currentOperationDisposables);
	}
}
