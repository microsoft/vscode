/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';

export const IProgressService = createDecorator<IProgressService>('progressService');

/**
 * A progress service that can be used to report progress to various locations of the UI.
 */
export interface IProgressService {

	_serviceBrand: ServiceIdentifier<IProgressService>;

	withProgress<R = any>(options: IProgressOptions | IProgressNotificationOptions | IProgressCompositeOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R>;
}

export const ILocalProgressService = createDecorator<ILocalProgressService>('localProgressService');

/**
 * A progress service that will report progress local to the UI piece triggered from. E.g.
 * if used from an action of a viewlet, the progress will be reported in that viewlet.
 */
export interface ILocalProgressService {

	_serviceBrand: ServiceIdentifier<ILocalProgressService>;

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
	Notification = 15,
	Dialog = 20
}

export interface IProgressOptions {
	location: ProgressLocation | string;
	title?: string;
	source?: string;
	total?: number;
	cancellable?: boolean;
}

export interface IProgressNotificationOptions extends IProgressOptions {
	location: ProgressLocation.Notification;
	primaryActions?: IAction[];
	secondaryActions?: IAction[];
}

export interface IProgressCompositeOptions extends IProgressOptions {
	location: ProgressLocation.Explorer | ProgressLocation.Extensions | ProgressLocation.Scm | string;
	delay?: number;
}

export interface IProgressStep {
	message?: string;
	increment?: number;
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
		private localProgressService: ILocalProgressService
	) { }

	start(progressDelay: number): IOperation {

		// Stop any previous operation
		this.stop();

		// Start new
		const newOperationId = ++this.currentOperationId;
		const newOperationToken = new CancellationTokenSource();
		this.currentProgressTimeout = setTimeout(() => {
			if (newOperationId === this.currentOperationId) {
				this.currentProgressRunner = this.localProgressService.show(true);
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
