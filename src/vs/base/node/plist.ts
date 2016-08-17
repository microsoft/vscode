/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as plist from 'fast-plist';

interface PListObject {
	parent: PListObject;
	value: any;
	lastKey?: string;
}

export function parse<T>(content: string) : { value: T; errors: string[]; } {
	try {
		let value = plist.parse(content);
		return {
			value: value,
			errors: []
		};
	} catch (err) {
		return {
			value: null,
			errors: [err.message]
		};
	}
}
