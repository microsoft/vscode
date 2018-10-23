/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getStrings(): { [key: string]: string } {
	const store = document.getElementById('vscode-markdown-preview-data');
	if (store) {
		const data = store.getAttribute('data-strings');
		if (data) {
			return JSON.parse(data);
		}
	}
	throw new Error('Could not load strings');
}
