/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import {getLocation} from 'jsonc-parser';

export function activate(context) {

	//keybindings.json command-suggestions
	context.subscriptions.push(registerKeybindingsCompletions());

	//settings.json command-suggestions
	context.subscriptions.push(registerSettingsCompletions());
}

function registerKeybindingsCompletions() : vscode.Disposable {
	const commands = vscode.commands.getCommands(true);

	return vscode.languages.registerCompletionItemProvider({ pattern: '**/keybindings.json' }, {

		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[1] === 'command') {

				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
				return commands.then(ids => ids.map(id => newCompletionItem(id, range)));
			}
		}
	});
}

function registerSettingsCompletions() : vscode.Disposable {
	console.log('registerSettingsCompletions');
	return vscode.languages.registerCompletionItemProvider({ pattern: '**/settings.json' }, {

		provideCompletionItems(document, position, token) {
			console.log('provideCompletionItems');
			const location = getLocation(document.getText(), document.offsetAt(position));
			console.log(location);
			if (!location.isAtPropertyKey && location.path[0] === 'files.iconTheme') {
				let result: vscode.CompletionItem[] = [];
				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);

				vscode.extensions.all.forEach(e => {
					let fileIconsContributions = e.packageJSON.contributes && e.packageJSON.contributes.fileIcons;
					if (Array.isArray(fileIconsContributions)) {
						fileIconsContributions.forEach(contribution => {
							result.push(newCompletionItem(contribution.id, range));
						});
					}
				});
				console.log(result);
				return result;
			}
		}
	});
}

function newCompletionItem(text: string, range: vscode.Range) {
	const item = new vscode.CompletionItem(JSON.stringify(text));
	item.kind = vscode.CompletionItemKind.Value;
	item.textEdit = {
		range,
		newText: item.label
	};
	return item;
}