/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { scm, ExtensionContext } from 'vscode';

export function activate(context: ExtensionContext): any {
	const provider = scm.createSCMProvider('git', null);
	context.subscriptions.push(provider);

	console.log(provider);
}