/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export function memoize(target: any, key: string, descriptor: any) {
	const fn = descriptor.value;

	if (typeof fn !== 'function') {
		throw new Error('memoize works in methods only');
	}

	const memoizeKey = `$memoize$${ key }`;

	descriptor.value = function (...args) {
		if (!this.hasOwnProperty(memoizeKey)) {
			this[memoizeKey] = fn.apply(this, args);
		}

		return this[memoizeKey];
	};
}