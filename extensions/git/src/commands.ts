/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { commands, Disposable } from 'vscode';

export function registerCommands(): Disposable {
	return commands.registerCommand('git.refresh', () => console.log('REFRESH'));
}