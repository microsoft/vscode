/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CancelablePromise } from 'vs/base/common/async';

export interface CacheResult<T> {
	promise: Thenable<T>;
	dispose(): void;
}

export default class Cache<T> {

	private result: CacheResult<T> = null;
	constructor(private task: () => CancelablePromise<T>) { }

	get(): CacheResult<T> {
		if (this.result) {
			return this.result;
		}

		const promise = this.task();

		this.result = {
			promise,
			dispose: () => {
				this.result = null;
				promise.cancel();
			}
		};

		return this.result;
	}
}
