/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainThreadSCMShape } from './extHost.protocol';

export class MainThreadSCM extends MainThreadSCMShape {

	private _toDispose: IDisposable;

	constructor(
		@IThreadService threadService: IThreadService
	) {
		super();
		// const proxy = threadService.get(ExtHostContext.ExtHostSCM);
	}

	dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}
}
