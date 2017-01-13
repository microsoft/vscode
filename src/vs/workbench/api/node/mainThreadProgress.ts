/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IProgressService2 } from 'vs/platform/progress/common/progress';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadProgressShape } from './extHost.protocol';

export class MainThreadProgress extends MainThreadProgressShape {

	private _progressService: IProgressService2;
	private progress = new Map<number, { resolve: Function, reject: Function, progress: { report(m: string) } }>();

	constructor(
		@IProgressService2 progressService: IProgressService2
	) {
		super();
		this._progressService = progressService;
	}


	$progressStart(handle: number): void {
		this._progressService.withWindowProgress(progress => {
			return new TPromise<any>((resolve, reject) => {
				this.progress.set(handle, { resolve, reject, progress });
			});
		});
	}

	$progressReport(handle: number, message: string): void {
		this.progress.get(handle).progress.report(message);
	}

	$progressEnd(handle: number, err: any): void {
		if (err) {
			this.progress.get(handle).reject(err);
		} else {
			this.progress.get(handle).resolve();
		}
		this.progress.delete(handle);
	}
}
