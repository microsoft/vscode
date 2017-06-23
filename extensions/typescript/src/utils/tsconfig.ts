/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export function isImplicitProjectConfigFile(configFileName: string) {
	return configFileName.indexOf('/dev/null/') === 0;
}

export function openOrCreateConfigFile(
	isTypeScriptProject: boolean,
	rootPath: string
): Thenable<vscode.TextEditor | null> {
	const configFile = vscode.Uri.file(path.join(rootPath, isTypeScriptProject ? 'tsconfig.json' : 'jsconfig.json'));
	const col = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
	return vscode.workspace.openTextDocument(configFile)
		.then(doc => {
			return vscode.window.showTextDocument(doc, col);
		}, _ => {
			return vscode.workspace.openTextDocument(configFile.with({ scheme: 'untitled' }))
				.then(doc => vscode.window.showTextDocument(doc, col))
				.then(editor => {
					if (editor.document.getText().length === 0) {
						return editor.insertSnippet(new vscode.SnippetString('{\n\t$0\n}'))
							.then(_ => editor);
					}
					return editor;
				});
		});
}