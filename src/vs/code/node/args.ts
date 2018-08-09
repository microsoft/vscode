/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/**
 * Converts an argument into an array
 * @param arg a argument value. Can be undefined, en entry or an array
 */
export function asArray<T>(arg: T | T[] | undefined): T[] {
	if (arg) {
		if (Array.isArray(arg)) {
			return arg;
		}
		return [arg];
	}
	return [];
}

/**
 * Returns whether an argument is present.
 */
export function hasArgs<T>(arg: T | T[] | undefined): boolean {
	if (arg) {
		if (Array.isArray(arg)) {
			return !!arg.length;
		}
		return true;
	}
	return false;
}