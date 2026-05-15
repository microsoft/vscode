/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, commands } from 'vscode';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';

export function create(accessor: ServicesAccessor): IDisposable {
	const disposables = new DisposableStore();
	disposables.add(registerContextCommands(accessor));

	return disposables;
}

// These commands are historic and forward to core commands in VS Code.
// To preserve muscle memory, they are kept around for now with their
// command identifier, so that users with associated keybindings can
// still use them.

function registerContextCommands(accessor: ServicesAccessor) {
	return Disposable.from(
		commands.registerCommand('github.copilot.chat.attachFile', () => {
			return commands.executeCommand('workbench.action.chat.attachFile');
		}),
		commands.registerCommand('github.copilot.chat.attachSelection', () => {
			return commands.executeCommand('workbench.action.chat.attachSelection');
		}),
	);
}
