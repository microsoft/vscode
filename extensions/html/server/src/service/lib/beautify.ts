/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*
 * Mock for the JS formatter. Ignore formatting of JS content in HTML.
 */
export function js_beautify(js_source_text: string, options: any) {
	// no formatting
	return js_source_text;
}