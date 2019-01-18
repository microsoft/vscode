/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HTMLData } from 'vscode-html-languageservice';

export function parseHTMLData(source: string): HTMLData {
	return JSON.parse(source);
}