/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function localize2(key: string, message: string, ...formatArgs: any[]) {
	if (formatArgs.length > 0) {
		return message.replace(/\{(\d+)\}/g, function(match, rest) {
			var index = rest[0];
			return typeof formatArgs[index] !== 'undefined' ? formatArgs[index] : match;
		});
	}
	return message;
}