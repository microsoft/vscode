/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pad } from './strings';

export function toLocalISOString(date: Date): string {
	return date.getFullYear() +
		'-' + pad(date.getMonth() + 1, 2) +
		'-' + pad(date.getDate(), 2) +
		'T' + pad(date.getHours(), 2) +
		':' + pad(date.getMinutes(), 2) +
		':' + pad(date.getSeconds(), 2) +
		'.' + (date.getMilliseconds() / 1000).toFixed(3).slice(2, 5) +
		'Z';
}
