/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IProgressService2, IProgress } from 'vs/platform/progress/common/progress';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadProgressShape } from './extHost.protocol';

export class MainThreadProgress extends MainThreadProgressShape {

	private _progressService: IProgressService2;
	private progress = new Map<number, { resolve: Function, progress: IProgress<any> }>();

	constructor(
		@IProgressService2 progressService: IProgressService2
	) {
		super();
		this._progressService = progressService;
	}


	$startWindow(handle: number, title: string): void {
		const task = this._createTask(handle);
		this._progressService.withWindowProgress(title, task);
	}

	$startScm(handle: number): void {
		const task = this._createTask(handle);
		this._progressService.withViewletProgress('workbench.view.scm', task);
	}

	private _createTask(handle: number) {
		return (progress: IProgress<any>) => {
			return new TPromise<any>(resolve => {
				this.progress.set(handle, { resolve, progress });
			});
		};
	}

	$progressReport(handle: number, message: any): void {
		this.progress.get(handle).progress.report(message);
	}

	$progressEnd(handle: number): void {
		this.progress.get(handle).resolve();
		this.progress.delete(handle);
	}
}
