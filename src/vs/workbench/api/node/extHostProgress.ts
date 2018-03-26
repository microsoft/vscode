/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Progress, ProgressOptions } from 'vscode';
import { MainThreadProgressShape, ExtHostProgressShape } from './extHost.protocol';
import { ProgressLocation } from './extHostTypeConverters';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressStep } from 'vs/platform/progress/common/progress';
import { localize } from 'vs/nls';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';

export class ExtHostProgress implements ExtHostProgressShape {

	private _proxy: MainThreadProgressShape;
	private _handles: number = 0;
	private _mapHandleToCancellationSource: Map<number, CancellationTokenSource> = new Map();

	constructor(proxy: MainThreadProgressShape) {
		this._proxy = proxy;
	}

	withProgress<R>(extension: IExtensionDescription, options: ProgressOptions, task: (progress: Progress<IProgressStep>, token: CancellationToken) => Thenable<R>): Thenable<R> {
		const handle = this._handles++;
		const { title, location, cancellable } = options;
		const source = localize('extensionSource', "{0} (Extension)", extension.displayName || extension.name);
		this._proxy.$startProgress(handle, { location: ProgressLocation.from(location), title, source, cancellable });
		return this._withProgress(handle, task, cancellable);
	}

	private _withProgress<R>(handle: number, task: (progress: Progress<IProgressStep>, token: CancellationToken) => Thenable<R>, cancellable: boolean): Thenable<R> {
		let source: CancellationTokenSource;
		if (cancellable) {
			source = new CancellationTokenSource();
			this._mapHandleToCancellationSource.set(handle, source);
		}

		const progress = {
			report: (p: IProgressStep) => {
				this._proxy.$progressReport(handle, p);
			}
		};

		const progressEnd = (handle: number): void => {
			this._proxy.$progressEnd(handle);
			this._mapHandleToCancellationSource.delete(handle);
			if (source) {
				source.dispose();
			}
		};

		let p: Thenable<R>;

		try {
			p = task(progress, cancellable ? source.token : CancellationToken.None);
		} catch (err) {
			progressEnd(handle);
			throw err;
		}

		p.then(result => progressEnd(handle), err => progressEnd(handle));
		return p;
	}

	public $acceptProgressCanceled(handle: number): void {
		const source = this._mapHandleToCancellationSource.get(handle);
		if (source) {
			source.cancel();
			this._mapHandleToCancellationSource.delete(handle);
		}
	}
}

