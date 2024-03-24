/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function ensureNonNullable<T>(value: T | null): T {
	if (!value) {
		throw new Error(`Value "${value}" cannot be null`);
	}
	return value;
}
