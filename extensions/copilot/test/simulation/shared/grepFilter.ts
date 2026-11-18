/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { convertSimple2RegExpPattern } from '../../../src/util/vs/base/common/strings';

export function grepStrToRegex(grep: string): RegExp {
	const trimmedGrep = grep.trim();
	if (trimmedGrep.length > 2 && trimmedGrep[0] === '/' && trimmedGrep[trimmedGrep.length - 1] === '/') {
		try {
			return new RegExp(trimmedGrep.substring(1, trimmedGrep.length - 1), 'i');
		} catch {
			console.error(`Malformed grep regex: ${grep}`);
		}
	}
	return new RegExp(convertSimple2RegExpPattern(grep), 'i');
}
