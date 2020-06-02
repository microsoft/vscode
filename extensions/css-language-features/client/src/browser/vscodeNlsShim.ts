/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Options {
	locale?: string;
	cacheLanguageResolution?: boolean;
}
export interface LocalizeInfo {
	key: string;
	comment: string[];
}
export interface LocalizeFunc {
	(info: LocalizeInfo, message: string, ...args: any[]): string;
	(key: string, message: string, ...args: any[]): string;
}
export interface LoadFunc {
	(file?: string): LocalizeFunc;
}

function format(message: string, args: any[]): string {
	let result: string;

	if (args.length === 0) {
		result = message;
	} else {
		result = message.replace(/\{(\d+)\}/g, (match, rest) => {
			let index = rest[0];
			return typeof args[index] !== 'undefined' ? args[index] : match;
		});
	}
	return result;
}

function localize(_key: string | LocalizeInfo, message: string, ...args: any[]): string {
	return format(message, args);
}

export function loadMessageBundle(_file?: string): LocalizeFunc {
	return localize;
}

export function config(_opt?: Options | string): LoadFunc {
	return loadMessageBundle;
}
