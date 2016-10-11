/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ExtensionContext } from 'vscode';
import { DirtyDiff } from './dirtydiff';

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		new DirtyDiff()
	);
}

export function deactivate() {

}