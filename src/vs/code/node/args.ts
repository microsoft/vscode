/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/**
 * Converts an arument into to an array
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