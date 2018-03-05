/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getStrings(): { [key: string]: string } {
	return JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-strings'));
}
