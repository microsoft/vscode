/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as array from './arrays';

/**
 * Deep equality check for two objects or arrays
 * @param one First object to compare
 * @param other Second object to compare
 * @returns True if the objects are deeply equal, false otherwise
 */
export function equals(one: unknown, other: unknown): boolean {
	if (one === other) {
		return true;
	}
	if (one === null || one === undefined || other === null || other === undefined) {
		return false;
	}
	if (typeof one !== typeof other) {
		return false;
	}
	if (typeof one !== 'object') {
		return false;
	}
	if (Array.isArray(one) !== Array.isArray(other)) {
		return false;
	}

	if (Array.isArray(one)) {
		return array.equals(one, other, equals);
	} else {
		const oneKeys: string[] = [];
		for (const key in one) {
			oneKeys.push(key);
		}
		oneKeys.sort();
		const otherKeys: string[] = [];
		for (const key in other) {
			otherKeys.push(key);
		}
		otherKeys.sort();
		if (!array.equals(oneKeys, otherKeys)) {
			return false;
		}
		return oneKeys.every(key => equals(one[key], other[key]));
	}
}
