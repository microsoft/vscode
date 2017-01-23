/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export function findAll(regex: RegExp, string: string): string[] {
	if (!regex.global) {
		throw new Error('not global regex');
	}

	const result: string[] = [];
	let match: RegExpMatchArray;

	while (match = regex.exec(string)) {
		result.push(match[0]);
	}

	return result;
}