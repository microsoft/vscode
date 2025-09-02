/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generates Excel-style column letters (A, B, C, ..., Z, AA, AB, ...)
 */
export function getColumnLetter(index: number): string {
	let result = '';
	let num = index;
	
	while (num >= 0) {
		result = String.fromCharCode(65 + (num % 26)) + result;
		num = Math.floor(num / 26) - 1;
	}
	
	return result;
}

