/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function isURL(value: string | null | undefined) {
	if (!value) { return false; }

	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}
