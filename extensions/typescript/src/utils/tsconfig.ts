/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

export function isImplicitProjectConfigFile(configFileName: string) {
	return configFileName.indexOf('/dev/null/') === 0;
}

const emptyConfig = new vscode.SnippetString(`{
	"compilerOptions": {
		"target": "ES6"$0
	},
	"exclude": [
		"node_modules",
		"**/node_modules/*"
	]
}`);

export function openOrCreateConfigFile(
	isTypeScriptProject: boolean,
	rootPath: string
): Thenable<vscode.TextEditor | null> {
	const configFile = vscode.Uri.file(path.join(rootPath, isTypeScriptProject ? 'tsconfig.json' : 'jsconfig.json'));
	const col = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
	return vscode.workspace.openTextDocument(configFile)
		.then(doc => {
			return vscode.window.showTextDocument(doc, col);
		}, async () => {
			const doc = await vscode.workspace.openTextDocument(configFile.with({ scheme: 'untitled' }));
			const editor = await vscode.window.showTextDocument(doc, col);
			if (editor.document.getText().length === 0) {
				await editor.insertSnippet(emptyConfig);
				return editor;
			}
			return editor;
		});
}