/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CSSData, ICSSDataProvider } from 'vscode-css-languageservice';
import * as fs from 'fs';

export function getDataProviders(dataPaths: string[]): ICSSDataProvider[] {
	const providers = dataPaths.map(p => {
		if (fs.existsSync(p)) {
			const data = parseCSSData(fs.readFileSync(p, 'utf-8'));
			return {
				provideProperties: () => data.properties || [],
				provideAtDirectives: () => data.atDirectives || [],
				providePseudoClasses: () => data.pseudoClasses || [],
				providePseudoElements: () => data.pseudoElements || []
			};
		} else {
			return {
				provideProperties: () => [],
				provideAtDirectives: () => [],
				providePseudoClasses: () => [],
				providePseudoElements: () => []
			};
		}
	});

	return providers;
}

function parseCSSData(source: string): CSSData {
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
