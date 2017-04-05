/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

export default class Cache<T> {

	private promise: TPromise<T> = null;
	constructor(private task: () => TPromise<T>) { }

	get(): TPromise<T> {
		if (this.promise) {
			return this.promise;
		}

		const promise = this.task();

		this.promise = new TPromise<T>((c, e) => promise.done(c, e), () => {
			this.promise = null;
			promise.cancel();
		});

		return this.promise;
	}
}
