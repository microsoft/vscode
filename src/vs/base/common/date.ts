/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

function pad(number: number): string {
	if (number < 10) {
		return '0' + number;
	}

	return String(number);
}

export function toLocalISOString(date: Date): string {
	return date.getFullYear() +
		'-' + pad(date.getMonth() + 1) +
		'-' + pad(date.getDate()) +
		'T' + pad(date.getHours()) +
		':' + pad(date.getMinutes()) +
		':' + pad(date.getSeconds()) +
		'.' + (date.getMilliseconds() / 1000).toFixed(3).slice(2, 5) +
		'Z';
}