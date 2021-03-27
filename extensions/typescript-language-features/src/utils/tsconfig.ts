/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { TypeScriptServiceConfiguration } from './configuration';

export function isImplicitProjectConfigFile(configFileName: string) {
	return configFileName.startsWith('/dev/null/');
}

export function inferredProjectConfig(
	serviceConfig: TypeScriptServiceConfiguration,
): Proto.ExternalProjectCompilerOptions {
	const projectConfig: Proto.ExternalProjectCompilerOptions = {
		module: 'commonjs' as Proto.ModuleKind,
		target: 'es2016' as Proto.ScriptTarget,
		jsx: 'preserve' as Proto.JsxEmit,
	};

	if (serviceConfig.checkJs) {
		projectConfig.checkJs = true;
	}

	if (serviceConfig.experimentalDecorators) {
		projectConfig.experimentalDecorators = true;
	}

	return projectConfig;
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