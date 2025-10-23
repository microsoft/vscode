/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../base/common/actions.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { INotificationSource, NotificationPriority } from '../../notification/common/notification.js';

export const IProgressService = createDecorator<IProgressService>('progressService');

/**
 * A progress service that can be used to report progress to various locations of the UI.
 */
export interface IProgressService {

	readonly _serviceBrand: undefined;

	withProgress<R>(
		options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<R>,
		onDidCancel?: (choice?: number) => void
	): Promise<R>;
}

export interface IProgressIndicator {

	/**
	 * Show progress customized with the provided flags.
	 */
	show(infinite: true, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;

	/**
	 * Indicate progress for the duration of the provided promise. Progress will stop in
	 * any case of promise completion, error or cancellation.
	 */
	showWhile(promise: Promise<unknown>, delay?: number): Promise<void>;
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
	readonly location: ProgressLocation | string;
	readonly title?: string;
	readonly source?: string | INotificationSource;
	readonly total?: number;
	readonly cancellable?: boolean | string;
	readonly buttons?: string[];
}

export interface IProgressNotificationOptions extends IProgressOptions {
	readonly location: ProgressLocation.Notification;
	readonly primaryActions?: readonly IAction[];
	readonly secondaryActions?: readonly IAction[];
	readonly delay?: number;
	readonly priority?: NotificationPriority;
	readonly type?: 'loading' | 'syncing';
}

export interface IProgressDialogOptions extends IProgressOptions {
	readonly delay?: number;
	readonly detail?: string;
	readonly sticky?: boolean;
}

export interface IProgressWindowOptions extends IProgressOptions {
	readonly location: ProgressLocation.Window;
	readonly command?: string;
	readonly type?: 'loading' | 'syncing';
}

export interface IProgressCompositeOptions extends IProgressOptions {
	readonly location: ProgressLocation.Explorer | ProgressLocation.Extensions | ProgressLocation.Scm | string;
	readonly delay?: number;
}

export interface IProgressStep {
	message?: string;
	increment?: number;
	total?: number;
}

export interface IProgressRunner {
	total(value: number): void;
	worked(value: number): void;
	done(): void;
}

export const emptyProgressRunner = Object.freeze<IProgressRunner>({
	total() { },
	worked() { },
	done() { }
});

export interface IProgress<T> {
	report(item: T): void;
}

export class Progress<T> implements IProgress<T> {

	static readonly None = Object.freeze<IProgress<unknown>>({ report() { } });

	private _value?: T;
	get value(): T | undefined { return this._value; }

	constructor(private callback: (data: T) => unknown) {
	}

	report(item: T) {
		this._value = item;
		this.callback(this._value);
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

/**
 * RAII-style progress instance that allows imperative reporting and hides
 * once `dispose()` is called.
 */
export class UnmanagedProgress extends Disposable {
	private readonly deferred = new DeferredPromise<void>();
	private reporter?: IProgress<IProgressStep>;
	private lastStep?: IProgressStep;

	constructor(
		options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
		@IProgressService progressService: IProgressService,
	) {
		super();
		progressService.withProgress(options, reporter => {
			this.reporter = reporter;
			if (this.lastStep) {
				reporter.report(this.lastStep);
			}

			return this.deferred.p;
		});

		this._register(toDisposable(() => this.deferred.complete()));
	}

	report(step: IProgressStep) {
		if (this.reporter) {
			this.reporter.report(step);
		} else {
			this.lastStep = step;
		}
	}
}

export class LongRunningOperation extends Disposable {
	private currentOperationId = 0;
	private readonly currentOperationDisposables = this._register(new DisposableStore());
	private currentProgressRunner: IProgressRunner | undefined;
	private currentProgressTimeout: Timeout | undefined = undefined;

	constructor(
		private progressIndicator: IProgressIndicator
	) {
		super();
	}

	start(progressDelay: number): IOperation {

		// Stop any previous operation
		this.stop();

		// Start new
		const newOperationId = ++this.currentOperationId;
		const newOperationToken = new CancellationTokenSource();
		this.currentProgressTimeout = setTimeout(() => {
			if (newOperationId === this.currentOperationId) {
				this.currentProgressRunner = this.progressIndicator.show(true);
			}
		}, progressDelay);

		this.currentOperationDisposables.add(toDisposable(() => clearTimeout(this.currentProgressTimeout)));
		this.currentOperationDisposables.add(toDisposable(() => newOperationToken.cancel()));
		this.currentOperationDisposables.add(toDisposable(() => this.currentProgressRunner ? this.currentProgressRunner.done() : undefined));

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
			this.currentOperationDisposables.clear();
		}
	}
}

export const IEditorProgressService = createDecorator<IEditorProgressService>('editorProgressService');

/**
 * A progress service that will report progress local to the editor triggered from.
 */
export interface IEditorProgressService extends IProgressIndicator {

	readonly _serviceBrand: undefined;
}
