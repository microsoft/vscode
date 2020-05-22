/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getNodeFSRequestService } from './nodeFs';
import { ExtensionContext } from 'vscode';
import { startClient } from '../cssClient';

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {
	startClient(context, { fs: getNodeFSRequestService() });
}
