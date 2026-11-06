/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';

/** Reads a customization's position in the contributing client's plugin directory or bundle. */
export function readCustomizationSourceUri(customization: { readonly _meta?: Record<string, unknown> }): URI | undefined {
	const value = customization._meta?.['vscode.sourceUri'];
	if (typeof value !== 'string') {
		return undefined;
	}
	try {
		return URI.parse(value, true);
	} catch {
		return undefined;
	}
}

export function toCustomizationSourceMeta(uri: URI): Record<string, unknown> {
	return { 'vscode.sourceUri': uri.toString() };
}
