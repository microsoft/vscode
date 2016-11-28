/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { commands, Disposable } from 'vscode';

function refresh(): void {
	console.log('refresh');
}

function openChange(...args: any[]): void {
	console.log('openChange', args);
}

export function registerCommands(): Disposable {
	const disposables = [
		commands.registerCommand('git.refresh', refresh),
		commands.registerCommand('git.open-change', openChange)
	];

	return Disposable.from(...disposables);
}