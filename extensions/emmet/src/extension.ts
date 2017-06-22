/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DefaultCompletionItemProvider } from './defaultCompletionProvider';
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
import { evaluateMathExpression } from './evaluateMathExpression';
import { incrementDecrement } from './incrementDecrement';
import { LANGUAGE_MODES, getMappedModes, getExcludedModes } from './util';
import { updateExtensionsPath } from 'vscode-emmet-helper';

export function activate(context: vscode.ExtensionContext) {
	let completionProvider = new DefaultCompletionItemProvider();
	let exlcludedLanguages = getExcludedModes();
	Object.keys(LANGUAGE_MODES).forEach(language => {
		if (exlcludedLanguages.indexOf(language) > -1) {
			return;
		}
		const provider = vscode.languages.registerCompletionItemProvider(language, completionProvider, ...LANGUAGE_MODES[language]);
		context.subscriptions.push(provider);
	});

	let completionProviderForMappedSyntax = new DefaultCompletionItemProvider(true);
	let mappedModes = getMappedModes();
	Object.keys(mappedModes).forEach(syntax => {
		const provider = vscode.languages.registerCompletionItemProvider(syntax, completionProviderForMappedSyntax, ...LANGUAGE_MODES[mappedModes[syntax]]);
		context.subscriptions.push(provider);
	});


	context.subscriptions.push(vscode.commands.registerCommand('emmet.wrapWithAbbreviation', () => {
		wrapWithAbbreviation();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.expandAbbreviation', (args) => {
		expandAbbreviation(args);
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

	context.subscriptions.push(vscode.commands.registerCommand('emmet.evaluateMathExpression', () => {
		evaluateMathExpression();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.incrementNumberByOneTenth', () => {
		incrementDecrement(.1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.incrementNumberByOne', () => {
		incrementDecrement(1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.incrementNumberByTen', () => {
		incrementDecrement(10);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.decrementNumberByOneTenth', () => {
		incrementDecrement(-0.1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.decrementNumberByOne', () => {
		incrementDecrement(-1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.decrementNumberByTen', () => {
		incrementDecrement(-10);
	}));



	updateExtensionsPath();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
		updateExtensionsPath();
	}));
}

export function deactivate() {
}
