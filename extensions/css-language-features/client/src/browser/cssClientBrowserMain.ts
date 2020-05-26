/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, window } from 'vscode';
//import { startClient } from '../cssClient';

// this method is called when vs code is activated
export function activate(_context: ExtensionContext) {

	window.showInformationMessage('cssClientBrowserMain.ts running');

	//startClient(context, {});
}
