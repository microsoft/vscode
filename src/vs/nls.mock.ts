/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

export interface ILocalizedString {
	original: string;
	value: string;
}

function _format(message: string, args: any[]): string {
	let result: string;
	if (args.length === 0) {
		result = message;
	} else {
		result = message.replace(/\{(\d+)\}/g, function (match, rest) {
			const index = rest[0];
			return typeof args[index] !== 'undefined' ? args[index] : match;
		});
	}
	return result;
}

export function localize(data: ILocalizeInfo | string, message: string, ...args: any[]): string {
	return _format(message, args);
}

export function localize2(data: ILocalizeInfo | string, message: string, ...args: any[]): ILocalizedString {
	const res = _format(message, args);
	return {
		original: res,
		value: res
	};
}

export function getConfiguredDefaultLocale(_: string) {
	return undefined;
}
