/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import {getLocation} from 'jsonc-parser';

export function activate(context) {

	const commands = vscode.commands.getCommands(true);

	//keybindings.json command-suggestions
	const disposable = vscode.languages.registerCompletionItemProvider({ pattern: '**/keybindings.json' }, {

		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[1] === 'command') {
				return commands.then(ids => ids.map(id => new vscode.CompletionItem(id, vscode.CompletionItemKind.Value)));
			}
		}
	});

	context.subscriptions.push(disposable);
}
