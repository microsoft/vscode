/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function generateRandomNumber() {
	try {
		return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
	} catch (e) {
		console.error('Error generating random number:', e);
		throw e;
	}
}
