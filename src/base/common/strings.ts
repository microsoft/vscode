/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isFalsyOrWhitespace(str: string | undefined): boolean {
	if (!str || typeof str !== 'string') {
		return true;
	}
	return str.trim().length === 0;
}