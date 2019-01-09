/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CSSData } from 'vscode-css-languageservice';

export function parseCSSData(source: string): CSSData {
	let rawData: any;

	try {
		rawData = JSON.parse(source);
	} catch (err) {
		return {};
	}

	return {
		properties: rawData.properties || [],
		atDirectives: rawData.atdirectives || [],
		pseudoClasses: rawData.pseudoclasses || [],
		pseudoElements: rawData.pseudoelements || []
	};
}
