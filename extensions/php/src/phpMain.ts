/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';

import PHPCompletionItemProvider from './features/completionItemProvider';
import PHPHoverProvider from './features/hoverProvider';
import PHPSignatureHelpProvider from './features/signatureHelpProvider';
import PHPValidationProvider from './features/validationProvider';
import * as vscode from 'vscode';

import * as nls from 'vscode-nls';
nls.config({ locale: vscode.env.language });
let localize = nls.loadMessageBundle();

const MigratedKey = 'php.validate.executablePaht.migrated';
const PathKey = 'php.validate.executablePath';

namespace is {
	const toString = Object.prototype.toString;

	export function string(value: any): value is string {
		return toString.call(value) === '[object String]';
	}
}

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): any {

	let workspaceExecutablePath = context.workspaceState.get<string>(PathKey, undefined);
	let migrated = context.workspaceState.get<boolean>(MigratedKey, false);
	let validator = new PHPValidationProvider(workspaceExecutablePath);
	context.subscriptions.push(vscode.commands.registerCommand('_php.onPathClicked', () => {
		onPathClicked(context, validator);
	}));

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	statusBarItem.text = localize('php.path', 'Path');
	statusBarItem.color = 'white';
	statusBarItem.command = '_php.onPathClicked';
	vscode.workspace.onDidChangeConfiguration(() => updateStatusBarItem(context));
	vscode.window.onDidChangeActiveTextEditor((editor) => {
		updateStatusBarItem(context, editor);
	});
	updateStatusBarItem(context, vscode.window.activeTextEditor);

	if (workspaceExecutablePath === void 0 && !migrated) {
		let settingsExecutablePath = readLocalExecutableSetting();
		if (settingsExecutablePath) {
			migrateExecutablePath(settingsExecutablePath).then((value) => {
				// User has pressed escape;
				if (!value) {
					// activate the validator with the current settings.
					validator.activate(context.subscriptions);
					return;
				}
				context.workspaceState.update(MigratedKey, true);
				context.workspaceState.update(PathKey, value);
				validator.updateWorkspaceExecutablePath(value, false);
				validator.activate(context.subscriptions);
				updateStatusBarItem(context);
			});
		} else {
			context.workspaceState.update(MigratedKey, true);
			validator.activate(context.subscriptions);
		}
	} else {
		validator.activate(context.subscriptions);
	}

	// add providers
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('php', new PHPCompletionItemProvider(), '.', '$'));
	context.subscriptions.push(vscode.languages.registerHoverProvider('php', new PHPHoverProvider()));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('php', new PHPSignatureHelpProvider(), '(', ','));


	// need to set in the extension host as well as the completion provider uses it.
	vscode.languages.setLanguageConfiguration('php', {
		wordPattern: /(-?\d*\.\d\w*)|([^\-\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g
	});
}

function updateStatusBarItem(context: vscode.ExtensionContext, editor: vscode.TextEditor = vscode.window.activeTextEditor): void {
	statusBarItem.tooltip = getExecutablePath(context);
	if (editor && editor.document && editor.document.languageId === 'php') {
		statusBarItem.show();
	} else {
		statusBarItem.hide();
	}
}

function onPathClicked(context: vscode.ExtensionContext, validator: PHPValidationProvider) {
	let value = getExecutablePath(context);
	vscode.window.showInputBox({ prompt: localize('php.enterPath', 'The path to the PHP executable'), value: value || '' }).then(value => {
		if (!value) {
			// User pressed Escape
			return;
		}
		context.workspaceState.update(PathKey, value);
		validator.updateWorkspaceExecutablePath(value, true);
		updateStatusBarItem(context);
	}, (error) => {
	});
}

function getExecutablePath(context: vscode.ExtensionContext): string {
	let result = context.workspaceState.get<string>(PathKey, undefined);
	if (result) {
		return result;
	}
	let section = vscode.workspace.getConfiguration('php.validate');
	if (section) {
		return section.get('executablePath', undefined);
	}
	return undefined;
}

function migrateExecutablePath(settingsExecutablePath: string): Thenable<string> {
	return vscode.window.showInputBox(
		{
			prompt: localize('php.migrateExecutablePath', 'Use the above path as the PHP executable path?'),
			value: settingsExecutablePath
		}
	);
}

function readLocalExecutableSetting(): string {
	function stripComments(content: string): string {
		/**
		* First capturing group matches double quoted string
		* Second matches single quotes string
		* Third matches block comments
		* Fourth matches line comments
		*/
		var regexp: RegExp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
		let result = content.replace(regexp, (match, m1, m2, m3, m4) => {
			// Only one of m1, m2, m3, m4 matches
			if (m3) {
				// A block comment. Replace with nothing
				return '';
			} else if (m4) {
				// A line comment. If it ends in \r?\n then keep it.
				let length = m4.length;
				if (length > 2 && m4[length - 1] === '\n') {
					return m4[length - 2] === '\r' ? '\r\n' : '\n';
				} else {
					return '';
				}
			} else {
				// We match a string
				return match;
			}
		});
		return result;
	};

	try {
		let rootPath = vscode.workspace.rootPath;
		if (!rootPath) {
			return undefined;
		}
		let settingsFile = path.join(rootPath, '.vscode', 'settings.json');
		if (!fs.existsSync(settingsFile)) {
			return undefined;
		}
		let content = fs.readFileSync(settingsFile, 'utf8');
		if (!content || content.length === 0) {
			return undefined;
		}
		content = stripComments(content);
		let json = JSON.parse(content);
		let value = json['php.validate.executablePath'];
		return is.string(value) ? value : undefined;
	} catch (error) {
	}
	return undefined;
}