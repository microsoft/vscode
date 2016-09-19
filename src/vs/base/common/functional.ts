/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export function not<A>(fn: (a: A) => boolean): (a: A) => boolean;
export function not(fn: Function): Function {
	return (...args) => !fn(...args);
}