/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as Proto from '../protocol';

import { TypeScriptServiceConfiguration } from './configuration';

export function isImplicitProjectConfigFile(configFileName: string) {
	return configFileName.indexOf('/dev/null/') === 0;
}

export function inferredProjectConfig(
	config: TypeScriptServiceConfiguration
): Proto.ExternalProjectCompilerOptions {
	const base: Proto.ExternalProjectCompilerOptions = {
		module: 'commonjs' as Proto.ModuleKind,
		target: 'es2016' as Proto.ScriptTarget,
		jsx: 'preserve' as Proto.JsxEmit
	};

	if (config.checkJs) {
		base.checkJs = true;
	}

	if (config.experimentalDecorators) {
		base.experimentalDecorators = true;
	}

	return base;
}

function inferredProjectConfigSnippet(
	config: TypeScriptServiceConfiguration
) {
	const baseConfig = inferredProjectConfig(config);
	const compilerOptions = Object.keys(baseConfig).map(key => `"${key}": ${JSON.stringify(baseConfig[key])}`);
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
			await editor.insertSnippet(inferredProjectConfigSnippet(config));
		}
		return editor;
	}
}