/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileAccess } from '../common/network.js';
import { URI } from '../common/uri.js';

export function asCssValueWithDefault(cssPropertyValue: string | undefined, dflt: string): string {
	if (cssPropertyValue !== undefined) {
		const variableMatch = cssPropertyValue.match(/^\s*var\((.+)\)$/);
		if (variableMatch) {
			const varArguments = variableMatch[1].split(',', 2);
			if (varArguments.length === 2) {
				dflt = asCssValueWithDefault(varArguments[1].trim(), dflt);
			}
			return `var(${varArguments[0]}, ${dflt})`;
		}
		return cssPropertyValue;
	}
	return dflt;
}

export function asCSSPropertyValue(value: string) {
	return `'${value.replace(/'/g, '%27')}'`;
}

/**
 * returns url('...')
 */
export function asCSSUrl(uri: URI | null | undefined): string {
	if (!uri) {
		return `url('')`;
	}
	return `url('${FileAccess.uriToBrowserUri(uri).toString(true).replace(/'/g, '%27')}')`;
}
