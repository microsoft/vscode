/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLocation, JSONPath, parse, visit } from 'jsonc-parser';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { SettingsDocument } from './settingsDocumentHelper';
import { provideInstalledExtensionProposals } from './extensionsProposals';
const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext): void {
	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	//extensions suggestions
	context.subscriptions.push(...registerExtensionsCompletions());

	// launch.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/launch.json'));

	// task.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/tasks.json'));

	// keybindings.json/package.json context key suggestions
	context.subscriptions.push(registerContextKeyCompletions());
}

function registerSettingsCompletions(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

function registerVariableCompletions(pattern: string): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (!location.isAtPropertyKey && location.previousNode && location.previousNode.type === 'string') {
				const indexOf$ = document.lineAt(position.line).text.indexOf('$');
				const startPosition = indexOf$ >= 0 ? new vscode.Position(position.line, indexOf$) : position;

				return [
					{ label: 'workspaceFolder', detail: localize('workspaceFolder', "The path of the folder opened in VS Code") },
					{ label: 'workspaceFolderBasename', detail: localize('workspaceFolderBasename', "The name of the folder opened in VS Code without any slashes (/)") },
					{ label: 'relativeFile', detail: localize('relativeFile', "The current opened file relative to ${workspaceFolder}") },
					{ label: 'relativeFileDirname', detail: localize('relativeFileDirname', "The current opened file's dirname relative to ${workspaceFolder}") },
					{ label: 'file', detail: localize('file', "The current opened file") },
					{ label: 'cwd', detail: localize('cwd', "The task runner's current working directory on startup") },
					{ label: 'lineNumber', detail: localize('lineNumber', "The current selected line number in the active file") },
					{ label: 'selectedText', detail: localize('selectedText', "The current selected text in the active file") },
					{ label: 'fileDirname', detail: localize('fileDirname', "The current opened file's dirname") },
					{ label: 'fileExtname', detail: localize('fileExtname', "The current opened file's extension") },
					{ label: 'fileBasename', detail: localize('fileBasename', "The current opened file's basename") },
					{ label: 'fileBasenameNoExtension', detail: localize('fileBasenameNoExtension', "The current opened file's basename with no file extension") },
					{ label: 'defaultBuildTask', detail: localize('defaultBuildTask', "The name of the default build task. If there is not a single default build task then a quick pick is shown to choose the build task.") },
				].map(variable => ({
					label: '${' + variable.label + '}',
					range: new vscode.Range(startPosition, position),
					detail: variable.detail
				}));
			}

			return [];
		}
	});
}

interface IExtensionsContent {
	recommendations: string[];
}

function registerExtensionsCompletions(): vscode.Disposable[] {
	return [registerExtensionsCompletionsInExtensionsDocument(), registerExtensionsCompletionsInWorkspaceConfigurationDocument()];
}

function registerExtensionsCompletionsInExtensionsDocument(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ pattern: '**/extensions.json' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
			if (location.path[0] === 'recommendations') {
				const extensionsContent = <IExtensionsContent>parse(document.getText());
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

function registerExtensionsCompletionsInWorkspaceConfigurationDocument(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ pattern: '**/*.code-workspace' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
			if (location.path[0] === 'extensions' && location.path[1] === 'recommendations') {
				const extensionsContent = <IExtensionsContent>parse(document.getText())['extensions'];
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

vscode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
	provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const result: vscode.SymbolInformation[] = [];
		let name: string = '';
		let lastProperty = '';
		let startOffset = 0;
		let depthInObjects = 0;

		visit(document.getText(), {
			onObjectProperty: (property, _offset, _length) => {
				lastProperty = property;
			},
			onLiteralValue: (value: any, _offset: number, _length: number) => {
				if (lastProperty === 'name') {
					name = value;
				}
			},
			onObjectBegin: (offset: number, _length: number) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					startOffset = offset;
				}
			},
			onObjectEnd: (offset: number, _length: number) => {
				if (name && depthInObjects === 2) {
					result.push(new vscode.SymbolInformation(name, vscode.SymbolKind.Object, new vscode.Range(document.positionAt(startOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		return result;
	}
}, { label: 'Launch Targets' });

function registerContextKeyCompletions(): vscode.Disposable {
	type ContextKeyInfo = { key: string, type?: string, description?: string };

	const paths = new Map<vscode.DocumentFilter, JSONPath[]>([
		[{ language: 'jsonc', pattern: '**/keybindings.json' }, [
			['*', 'when']
		]],
		[{ language: 'json', pattern: '**/package.json' }, [
			['contributes', 'menus', '*', '*', 'when'],
			['contributes', 'views', '*', '*', 'when'],
			['contributes', 'viewsWelcome', '*', 'when'],
			['contributes', 'keybindings', '*', 'when'],
			['contributes', 'keybindings', 'when'],
		]]
	]);

	return vscode.languages.registerCompletionItemProvider(
		[...paths.keys()],
		{
			async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {

				const location = getLocation(document.getText(), document.offsetAt(position));

				if (location.isAtPropertyKey) {
					return;
				}

				let isValidLocation = false;
				for (const [key, value] of paths) {
					if (vscode.languages.match(key, document)) {
						if (value.some(location.matches.bind(location))) {
							isValidLocation = true;
							break;
						}
					}
				}

				if (!isValidLocation) {
					return;
				}

				// for JSON everything with quotes is a word
				const jsonWord = document.getWordRangeAtPosition(position);
				if (!jsonWord || jsonWord.start.isEqual(position) || jsonWord.end.isEqual(position)) {
					// we aren't inside a "JSON word" or on its quotes
					return;
				}

				let replacing: vscode.Range | undefined;
				if (jsonWord.end.character - jsonWord.start.character === 2 || document.getWordRangeAtPosition(position, /\s+/)) {
					// empty json word or on whitespace
					replacing = new vscode.Range(position, position);
				} else {
					replacing = document.getWordRangeAtPosition(position, /[a-zA-Z.]+/);
				}

				if (!replacing) {
					return;
				}
				const inserting = replacing.with(undefined, position);

				const data = await vscode.commands.executeCommand<ContextKeyInfo[]>('getContextKeyInfo');
				if (token.isCancellationRequested || !data) {
					return;
				}

				const result = new vscode.CompletionList();
				for (const item of data) {
					const completion = new vscode.CompletionItem(item.key, vscode.CompletionItemKind.Constant);
					completion.detail = item.type;
					completion.range = { replacing, inserting };
					completion.documentation = item.description;
					result.items.push(completion);
				}
				return result;
			}
		}
	);
}
