/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function decodeProductUrl(value: string): string {
	try {
		if (typeof atob === 'function') {
			return atob(value);
		}
		if (typeof Buffer !== 'undefined') {
			return Buffer.from(value, 'base64').toString('utf-8');
		}
	} catch {
		// ignore decode errors
	}
	return value;
}
