/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

window.addEventListener('message', event => {
	const message = event.data; // The json data that the extension sent
	switch (message.command) {
		case 'refactor':
			console.log('hahah');
			break;
		default:
			break;
	}
});