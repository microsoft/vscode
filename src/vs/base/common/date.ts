/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pad } from './strings';

const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;

// TODO[ECA]: Localize strings
export function fromNow(date: number | Date) {
	if (typeof date !== 'number') {
		date = date.getTime();
	}

	const seconds = Math.round((new Date().getTime() - date) / 1000);
	if (seconds < 30) {
		return 'now';
	}

	let value: number;
	let unit: string;
	if (seconds < minute) {
		value = seconds;
		unit = 'sec';
	} else if (seconds < hour) {
		value = Math.floor(seconds / minute);
		unit = 'min';
	} else if (seconds < day) {
		value = Math.floor(seconds / hour);
		unit = 'hr';
	} else if (seconds < week) {
		value = Math.floor(seconds / day);
		unit = 'day';
	} else if (seconds < month) {
		value = Math.floor(seconds / week);
		unit = 'wk';
	} else if (seconds < year) {
		value = Math.floor(seconds / month);
		unit = 'mo';
	} else {
		value = Math.floor(seconds / year);
		unit = 'yr';
	}

	return `${value} ${unit}${value === 1 ? '' : 's'}`;

}

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
