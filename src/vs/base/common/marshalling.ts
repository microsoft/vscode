/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';

export function stringify(obj: any): string {
	return JSON.stringify(obj, replacer);
}

export function parse(text: string): any {
	return JSON.parse(text, reviver);
}

interface MarshalledObject {
	$mid: number;
}

function replacer(key: string, value: any): any {
	// URI is done via toJSON-member
	if (value instanceof RegExp) {
		return {
			$mid: 2,
			source: (<RegExp>value).source,
			flags: ((<RegExp>value).global ? 'g' : '') + ((<RegExp>value).ignoreCase ? 'i' : '') + ((<RegExp>value).multiline ? 'm' : ''),
		};
	}
	return value;
}

function reviver(key: string, value: any): any {
	let marshallingConst: number;
	if (value !== void 0 && value !== null) {
		marshallingConst = (<MarshalledObject>value).$mid;
	}

	switch (marshallingConst) {
		case 1: return URI.revive(value);
		case 2: return new RegExp(value.source, value.flags);
		default: return value;
	}
}
