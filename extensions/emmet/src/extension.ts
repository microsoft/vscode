/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { EmmetCompletionItemProvider } from './emmetCompletionProvider';
import { expandAbbreviation, wrapWithAbbreviation } from './abbreviationActions';
import { removeTag } from './removeTag';
import { updateTag } from './updateTag';
import { matchTag } from './matchTag';
import { balanceOut, balanceIn } from './balance';
import { splitJoinTag } from './splitJoinTag';
import { mergeLines } from './mergeLines';
import { toggleComment } from './toggleComment';
import { fetchEditPoint } from './editPoint';
import { fetchSelectItem } from './selectItem';
import { updateExtensionsPath, LANGUAGE_MODES, getMappedModes } from './util';



export function activate(context: vscode.ExtensionContext) {
	let completionProvider = new EmmetCompletionItemProvider();
	Object.keys(LANGUAGE_MODES).forEach(language => {
		const provider = vscode.languages.registerCompletionItemProvider(language, completionProvider, ...LANGUAGE_MODES[language]);
		context.subscriptions.push(provider);
	});

	let completionProviderForMappedSyntax = new EmmetCompletionItemProvider(true);
	let mappedModes = getMappedModes();
	Object.keys(mappedModes).forEach(syntax => {
		const provider = vscode.languages.registerCompletionItemProvider(syntax, completionProviderForMappedSyntax, ...LANGUAGE_MODES[mappedModes[syntax]]);
		context.subscriptions.push(provider);
	});


	context.subscriptions.push(vscode.commands.registerCommand('emmet.wrapWithAbbreviation', () => {
		wrapWithAbbreviation();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.expandAbbreviation', () => {
		expandAbbreviation();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.removeTag', () => {
		removeTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.updateTag', () => {
		vscode.window.showInputBox({ prompt: 'Enter Tag' }).then(tagName => {
			updateTag(tagName);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.matchTag', () => {
		matchTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.balanceOut', () => {
		balanceOut();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.balanceIn', () => {
		balanceIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.splitJoinTag', () => {
		splitJoinTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.mergeLines', () => {
		mergeLines();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.toggleComment', () => {
		toggleComment();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.nextEditPoint', () => {
		fetchEditPoint('next');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.prevEditPoint', () => {
		fetchEditPoint('prev');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.selectNextItem', () => {
		fetchSelectItem('next');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.selectPrevItem', () => {
		fetchSelectItem('prev');
	}));

	updateExtensionsPath();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		updateExtensionsPath();
	}));
}

export function deactivate() {
}
