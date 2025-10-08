/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DefaultCompletionItemProvider } from './defaultCompletionProvider';
import { expandEmmetAbbreviation, wrapWithAbbreviation } from './abbreviationActions';
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
import { LANGUAGE_MODES, getMappingForIncludedLanguages, updateEmmetExtensionsPath, migrateEmmetExtensionsPath, getPathBaseName, getSyntaxes, getEmmetMode } from './util';
import { reflectCssValue } from './reflectCssValue';
import { addFileToParseCache, clearParseCache, removeFileFromParseCache } from './parseDocument';

export function activateEmmetExtension(context: vscode.ExtensionContext) {
	migrateEmmetExtensionsPath();
	refreshCompletionProviders(context);
	updateEmmetExtensionsPath();

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.wrapWithAbbreviation', (args) => {
		wrapWithAbbreviation(args);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('emmet.expandAbbreviation', (args) => {
		expandEmmetAbbreviation(args);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.removeTag', () => {
		return removeTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.updateTag', (inputTag) => {
		if (inputTag && typeof inputTag === 'string') {
			return updateTag(inputTag);
		}
		return updateTag(undefined);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.matchTag', () => {
		matchTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.balanceOut', () => {
		balanceOut();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.balanceIn', () => {
		balanceIn();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.splitJoinTag', () => {
		return splitJoinTag();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.mergeLines', () => {
		mergeLines();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.toggleComment', () => {
		toggleComment();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.nextEditPoint', () => {
		fetchEditPoint('next');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.prevEditPoint', () => {
		fetchEditPoint('prev');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.selectNextItem', () => {
		fetchSelectItem('next');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.selectPrevItem', () => {
		fetchSelectItem('prev');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.evaluateMathExpression', () => {
		evaluateMathExpression();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByOneTenth', () => {
		return incrementDecrement(0.1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByOne', () => {
		return incrementDecrement(1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByTen', () => {
		return incrementDecrement(10);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByOneTenth', () => {
		return incrementDecrement(-0.1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByOne', () => {
		return incrementDecrement(-1);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByTen', () => {
		return incrementDecrement(-10);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.reflectCSSValue', () => {
		return reflectCssValue();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('workbench.action.showEmmetCommands', () => {
		vscode.commands.executeCommand('workbench.action.quickOpen', '>Emmet: ');
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('emmet.includeLanguages') || e.affectsConfiguration('emmet.useInlineCompletions')) {
			refreshCompletionProviders(context);
		}
		if (e.affectsConfiguration('emmet.extensionsPath')) {
			updateEmmetExtensionsPath();
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
		const basefileName: string = getPathBaseName(e.fileName);
		if (basefileName.startsWith('snippets') && basefileName.endsWith('.json')) {
			updateEmmetExtensionsPath(true);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((e) => {
		const emmetMode = getEmmetMode(e.languageId, {}, []) ?? '';
		const syntaxes = getSyntaxes();
		if (syntaxes.markup.includes(emmetMode) || syntaxes.stylesheet.includes(emmetMode)) {
			addFileToParseCache(e);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((e) => {
		const emmetMode = getEmmetMode(e.languageId, {}, []) ?? '';
		const syntaxes = getSyntaxes();
		if (syntaxes.markup.includes(emmetMode) || syntaxes.stylesheet.includes(emmetMode)) {
			removeFileFromParseCache(e);
		}
	}));
}

/**
 * Holds any registered completion providers by their language strings
 */
const languageMappingForCompletionProviders: Map<string, string> = new Map<string, string>();
const completionProviderDisposables: vscode.Disposable[] = [];

function refreshCompletionProviders(_: vscode.ExtensionContext) {
	clearCompletionProviderInfo();

	const completionProvider = new DefaultCompletionItemProvider();
	const inlineCompletionProvider: vscode.InlineCompletionItemProvider = {
		async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, _: vscode.InlineCompletionContext, token: vscode.CancellationToken) {
			const items = await completionProvider.provideCompletionItems(document, position, token, { triggerCharacter: undefined, triggerKind: vscode.CompletionTriggerKind.Invoke });
			if (!items) {
				return undefined;
			}
			const item = items.items[0];
			if (!item || !item.insertText) {
				return undefined;
			}
			const range = item.range as vscode.Range;

			if (document.getText(range) !== item.label) {
				// We only want to show an inline completion if we are really sure the user meant emmet.
				// If the user types `d`, we don't want to suggest `<div></div>`.
				return undefined;
			}

			return [
				{
					insertText: item.insertText,
					filterText: item.label,
					range
				}
			];
		}
	};

	const useInlineCompletionProvider = vscode.workspace.getConfiguration('emmet').get<boolean>('useInlineCompletions');
	const includedLanguages = getMappingForIncludedLanguages();
	Object.keys(includedLanguages).forEach(language => {
		if (languageMappingForCompletionProviders.has(language) && languageMappingForCompletionProviders.get(language) === includedLanguages[language]) {
			return;
		}

		if (useInlineCompletionProvider) {
			const inlineCompletionsProvider = vscode.languages.registerInlineCompletionItemProvider({ language, scheme: '*' }, inlineCompletionProvider);
			completionProviderDisposables.push(inlineCompletionsProvider);
		}

		const explicitProvider = vscode.languages.registerCompletionItemProvider({ language, scheme: '*' }, completionProvider, ...LANGUAGE_MODES[includedLanguages[language]]);
		completionProviderDisposables.push(explicitProvider);

		languageMappingForCompletionProviders.set(language, includedLanguages[language]);
	});

	Object.keys(LANGUAGE_MODES).forEach(language => {
		if (!languageMappingForCompletionProviders.has(language)) {
			if (useInlineCompletionProvider) {
				const inlineCompletionsProvider = vscode.languages.registerInlineCompletionItemProvider({ language, scheme: '*' }, inlineCompletionProvider);
				completionProviderDisposables.push(inlineCompletionsProvider);
			}

			const explicitProvider = vscode.languages.registerCompletionItemProvider({ language, scheme: '*' }, completionProvider, ...LANGUAGE_MODES[language]);
			completionProviderDisposables.push(explicitProvider);

			languageMappingForCompletionProviders.set(language, language);
		}
	});
}

function clearCompletionProviderInfo() {
	languageMappingForCompletionProviders.clear();
	let disposable: vscode.Disposable | undefined;
	while (disposable = completionProviderDisposables.pop()) {
		disposable.dispose();
	}
}

export function deactivate() {
	clearCompletionProviderInfo();
	clearParseCache();
}
