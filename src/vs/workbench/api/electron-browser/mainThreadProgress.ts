/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IProgressService2, IProgress, IProgressOptions, IProgressStep } from 'vs/platform/progress/common/progress';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadProgressShape } from '../node/extHost.protocol';

export class MainThreadProgress extends MainThreadProgressShape {

	private _progressService: IProgressService2;
	private progress = new Map<number, { resolve: Function, progress: IProgress<IProgressStep> }>();

	constructor(
		@IProgressService2 progressService: IProgressService2
	) {
		super();
		this._progressService = progressService;
	}

	$startProgress(handle: number, options: IProgressOptions): void {
		const task = this._createTask(handle);
		this._progressService.withProgress(options, task);
	}

	$progressReport(handle: number, message: IProgressStep): void {
		this.progress.get(handle).progress.report(message);
	}

	$progressEnd(handle: number): void {
		this.progress.get(handle).resolve();
		this.progress.delete(handle);
	}

	private _createTask(handle: number) {
		return (progress: IProgress<IProgressStep>) => {
			return new TPromise<any>(resolve => {
				this.progress.set(handle, { resolve, progress });
			});
		};
	}
}
