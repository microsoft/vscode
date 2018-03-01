/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Progress, ProgressOptions, CancellationToken } from 'vscode';
import { MainThreadProgressShape } from './extHost.protocol';
import { ProgressLocation } from './extHostTypeConverters';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressStep } from 'vs/platform/progress/common/progress';

export class ExtHostProgress {

	private _proxy: MainThreadProgressShape;
	private _handles: number = 0;

	constructor(proxy: MainThreadProgressShape) {
		this._proxy = proxy;
	}

	withProgress<R>(extension: IExtensionDescription, options: ProgressOptions, task: (progress: Progress<IProgressStep>, token: CancellationToken) => Thenable<R>): Thenable<R> {
		const handle = this._handles++;
		const { title, location } = options;
		this._proxy.$startProgress(handle, { location: ProgressLocation.from(location), title, tooltip: extension.name });
		return this._withProgress(handle, task);
	}

	private _withProgress<R>(handle: number, task: (progress: Progress<IProgressStep>, token: CancellationToken) => Thenable<R>): Thenable<R> {

		const progress = {
			report: (p: IProgressStep) => {
				this._proxy.$progressReport(handle, p);
			}
		};

		let p: Thenable<R>;

		try {
			p = task(progress, null);
		} catch (err) {
			this._proxy.$progressEnd(handle);
			throw err;
		}

		p.then(result => this._proxy.$progressEnd(handle), err => this._proxy.$progressEnd(handle));
		return p;
	}
}

