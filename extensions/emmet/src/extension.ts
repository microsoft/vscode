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

interface ISupportedLanguageMode {
	id: string;
	triggerCharacters: string[];
}

const LANGUAGE_MODES: ISupportedLanguageMode[] = [
	{ id: 'html', triggerCharacters: ['!', '.', '}'] },
	{ id: 'jade', triggerCharacters: ['!', '.', '}'] },
	{ id: 'slim', triggerCharacters: ['!', '.', '}'] },
	{ id: 'haml', triggerCharacters: ['!', '.', '}'] },
	{ id: 'xml', triggerCharacters: ['.', '}'] },
	{ id: 'xsl', triggerCharacters: ['.', '}'] },

	{ id: 'javascriptreact', triggerCharacters: ['.'] },
	{ id: 'typescriptreact', triggerCharacters: ['.'] },

	{ id: 'css', triggerCharacters: [':'] },
	{ id: 'scss', triggerCharacters: [':'] },
	{ id: 'sass', triggerCharacters: [':'] },
	{ id: 'less', triggerCharacters: [':'] },
	{ id: 'stylus', triggerCharacters: [':'] }
];

export function activate(context: vscode.ExtensionContext) {
	let completionProvider = new EmmetCompletionItemProvider();
	for (let language of LANGUAGE_MODES) {
		const provider = vscode.languages.registerCompletionItemProvider({ language: language.id }, completionProvider, ...language.triggerCharacters);
		context.subscriptions.push(provider);
	}

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

}

export function deactivate() {
}
