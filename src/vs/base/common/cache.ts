/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';

export interface CacheResult<T> extends IDisposable {
	promise: Promise<T>;
}

export class Cache<T> {

	private result: CacheResult<T> | null = null;
	constructor(private task: (ct: CancellationToken) => Promise<T>) { }

	get(): CacheResult<T> {
		if (this.result) {
			return this.result;
		}

		const cts = new CancellationTokenSource();
		const promise = this.task(cts.token);

		this.result = {
			promise,
			dispose: () => {
				this.result = null;
				cts.cancel();
				cts.dispose();
			}
		};

		return this.result;
	}
}
