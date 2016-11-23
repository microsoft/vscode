/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IRawSearch, ISerializedSearchComplete, ISerializedSearchProgressItem } from '../search';
import { SearchWorker } from './searchWorker'

// export interface ISearchWorkerChannel extends IChannel {
// 	call(command: 'initialize', args: any): TPromise<void>;
// 	call(command: 'ping'): TPromise<string>;
// 	call(command: 'search', absolutePath: string): PPromise<ISerializedSearchComplete, ISerializedSearchProgressItem>;
// 	call(command: string, arg: any): TPromise<any>;
// }

export class SearchWorkerChannel implements IChannel {
	private worker: SearchWorker;

	constructor() {
	}

	call(command: string, arg: any): TPromise<any> {
		if (command === 'initialize') {
			this.worker = new SearchWorker(arg);
			return TPromise.wrap(null);
		} else if (command === 'ping') {
			return TPromise.wrap('pong');
		} else if (command === 'search') {
			return this.worker.search(arg);
		}
	}
}
