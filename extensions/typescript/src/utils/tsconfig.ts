/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { TypeScriptServiceConfiguration } from './configuration';

export function isImplicitProjectConfigFile(configFileName: string) {
	return configFileName.indexOf('/dev/null/') === 0;
}

function getEmptyConfig(
	isTypeScriptProject: boolean,
	config: TypeScriptServiceConfiguration
) {
	const compilerOptions = [
		'"target": "ES6"',
		'"module": "commonjs"'
	];
	if (!isTypeScriptProject && config.checkJs) {
		compilerOptions.push('"checkJs": true');
	}
	if (!isTypeScriptProject && config.experimentalDecorators) {
		compilerOptions.push('"experimentalDecorators": true');
	}
	return new vscode.SnippetString(`{
	"compilerOptions": {
		${compilerOptions.join(',\n\t\t')}$0
	},
	"exclude": [
		"node_modules",
		"**/node_modules/*"
	]
}`);
}

export async function openOrCreateConfigFile(
	isTypeScriptProject: boolean,
	rootPath: string,
	config: TypeScriptServiceConfiguration
): Promise<vscode.TextEditor | null> {
	const configFile = vscode.Uri.file(path.join(rootPath, isTypeScriptProject ? 'tsconfig.json' : 'jsconfig.json'));
	const col = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
	try {
		const doc = await vscode.workspace.openTextDocument(configFile);
		return vscode.window.showTextDocument(doc, col);
	} catch {
		const doc = await vscode.workspace.openTextDocument(configFile.with({ scheme: 'untitled' }));
		const editor = await vscode.window.showTextDocument(doc, col);
		if (editor.document.getText().length === 0) {
			await editor.insertSnippet(getEmptyConfig(isTypeScriptProject, config));
		}
		return editor;
	}
}