/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ExtHostContext} from './extHost.protocol';
import {onDidGarbageCollectSignals, consumeSignals, trackGarbageCollection} from 'gc-signals';

export class MainThreadHeapMonitor {

	private _subscription: IDisposable;
	private _consumeHandle: number;

	constructor( @IThreadService threadService: IThreadService) {
		const proxy = threadService.get(ExtHostContext.ExtHostHeapMonitor);

		this._subscription = onDidGarbageCollectSignals(ids => {
			proxy.$onGarbageCollection(ids);
		});

		this._consumeHandle = setInterval(consumeSignals, 15 * 1000);
	}

	dispose() {
		clearInterval(this._consumeHandle);
		this._subscription.dispose();
	}

	trackObject(obj: any) {
		if (typeof obj.$heap_ident === 'number') {
			trackGarbageCollection(obj, obj.$heap_ident);
		}
	}
}