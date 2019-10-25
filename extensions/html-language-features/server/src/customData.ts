/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHTMLDataProvider, newHTMLDataProvider } from 'vscode-html-languageservice';
import * as fs from 'fs';

export function getDataProviders(dataPaths?: string[]): IHTMLDataProvider[] {
	if (!dataPaths) {
		return [];
	}

	const providers: IHTMLDataProvider[] = [];

	dataPaths.forEach((path, i) => {
		try {
			if (fs.existsSync(path)) {
				const htmlData = JSON.parse(fs.readFileSync(path, 'utf-8'));

				providers.push(newHTMLDataProvider(`customProvider${i}`, htmlData));
			}
		} catch (err) {
			console.log(`Failed to load tag from ${path}`);
		}
	});

	return providers;
}