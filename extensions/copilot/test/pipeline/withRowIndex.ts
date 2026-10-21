/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A value paired with the `originalRowIndex` identifying its source row in the
 * input container it was read from.
 */
export type WithRowIndex<T> = {
	readonly originalRowIndex: number;
	readonly value: T;
};
