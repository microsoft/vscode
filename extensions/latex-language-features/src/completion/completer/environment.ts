/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { CmdEnvSuggestion, filterNonLetterSuggestions } from '../completerUtils';
import { FileSystemUtils } from '../utils/fileUtils';

export enum EnvSnippetType {
	AsName = 'AsName',
	AsMacro = 'AsMacro',
	ForBegin = 'ForBegin'
}

interface EnvironmentData {
	defaultEnvsAsName: CmdEnvSuggestion[];
	defaultEnvsAsMacro: CmdEnvSuggestion[];
	defaultEnvsForBegin: CmdEnvSuggestion[];
	packageEnvs: Map<string, CmdEnvSuggestion[]>;
}

const data: EnvironmentData = {
	defaultEnvsAsName: [],
	defaultEnvsAsMacro: [],
	defaultEnvsForBegin: [],
	packageEnvs: new Map()
};

let extensionRoot: vscode.Uri | undefined;

export async function initializeEnvironmentCompleter(root: string | vscode.Uri): Promise<void> {
	if (typeof root === 'string') {
		extensionRoot = vscode.Uri.file(root);
	} else {
		extensionRoot = root;
	}
	await loadDefaultEnvironments();
}

async function loadDefaultEnvironments(): Promise<void> {
	if (!extensionRoot) {
		return;
	}

	try {
		// Try multiple possible paths for data files
		// In production web deployment, data/ is at extension root
		// In development, files are in dist/browser/data after webpack copy
		const isBrowser = extensionRoot.scheme !== 'file';
		const possiblePaths = isBrowser
			? [
				// In production web deployment, data/ is at extension root
				['data', 'environments.json'],
				// In development, files are in dist/browser/data after webpack copy
				['dist', 'browser', 'data', 'environments.json']
			]
			: [
				['data', 'environments.json'],
				['extension', 'data', 'environments.json'],
				['out', 'data', 'environments.json']
			];

		let envsUri: vscode.Uri | undefined;
		for (const pathParts of possiblePaths) {
			const testUri = FileSystemUtils.joinUri(extensionRoot, ...pathParts);
			if (await FileSystemUtils.exists(testUri)) {
				envsUri = testUri;
				break;
			}
		}

		if (envsUri) {
			const content = await FileSystemUtils.readFile(envsUri);
			const envs = JSON.parse(content);
			data.defaultEnvsAsMacro = [];
			data.defaultEnvsForBegin = [];
			data.defaultEnvsAsName = [];

			envs.forEach((env: any) => {
				const envInfo = envRawToInfo('latex', env);
				data.defaultEnvsAsMacro.push(entryEnvToCompletion(envInfo, EnvSnippetType.AsMacro));
				data.defaultEnvsForBegin.push(entryEnvToCompletion(envInfo, EnvSnippetType.ForBegin));
				data.defaultEnvsAsName.push(entryEnvToCompletion(envInfo, EnvSnippetType.AsName));
			});
		} else {
			console.warn('[Environment Completer] Could not find environments.json in any expected location');
		}
	} catch (error) {
		console.error('[Environment Completer] Error loading environment data:', error);
		if (error instanceof Error) {
			console.error('[Environment Completer] Error message:', error.message);
			console.error('[Environment Completer] Error stack:', error.stack);
		}
	}
}

function envRawToInfo(packageName: string, env: any): any {
	return {
		name: env.name,
		package: packageName,
		arg: env.arg,
		if: env.if,
		unusual: env.unusual
	};
}

function entryEnvToCompletion(item: any, type: EnvSnippetType): CmdEnvSuggestion {
	let label: string;
	let insertText: string | vscode.SnippetString;
	let detail: string;

	switch (type) {
		case EnvSnippetType.AsName:
			label = item.name;
			insertText = item.name;
			detail = `Environment: ${item.name}`;
			break;
		case EnvSnippetType.AsMacro:
			label = `\\${item.name}`;
			insertText = item.name;
			detail = `\\${item.name}`;
			break;
		case EnvSnippetType.ForBegin:
			label = item.name;
			insertText = new vscode.SnippetString(`${item.name}}\n\t$0\n\\end{${item.name}}`);
			detail = `\\begin{${item.name}}...\\end{${item.name}}`;
			break;
	}

	const suggestion = new CmdEnvSuggestion(
		label,
		item.package || 'latex',
		item.arg?.keys ?? [],
		item.arg?.keyPos ?? -1,
		{ name: item.name, args: item.arg?.format ?? '' },
		vscode.CompletionItemKind.Module,
		item.if,
		item.unusual
	);

	suggestion.insertText = insertText;
	suggestion.detail = detail;
	suggestion.documentation = `LaTeX environment: ${item.name}`;
	if (item.package) {
		suggestion.documentation += ` (from package: ${item.package})`;
	}

	return suggestion;
}

export function getDefaultEnvs(type: EnvSnippetType): CmdEnvSuggestion[] {
	switch (type) {
		case EnvSnippetType.AsName:
			return data.defaultEnvsAsName;
		case EnvSnippetType.AsMacro:
			return data.defaultEnvsAsMacro;
		case EnvSnippetType.ForBegin:
			return data.defaultEnvsForBegin;
		default:
			return [];
	}
}

export const provider: CompleterProvider = {
	from(result: RegExpMatchArray, args: CompletionArgs): vscode.CompletionItem[] {
		const suggestions = provide(args.langId, args.line, args.position);
		return filterNonLetterSuggestions(suggestions, result[1], args.position);
	}
};

function provide(_langId: string, line: string, position: vscode.Position): vscode.CompletionItem[] {
	let snippetType = EnvSnippetType.AsName;
	if (
		vscode.window.activeTextEditor &&
		vscode.window.activeTextEditor.selections.length === 1 &&
		line.indexOf('\\begin') > line.indexOf('\\end') &&
		line.slice(position.character).match(/[a-zA-Z*]*}/) === null
	) {
		snippetType = EnvSnippetType.ForBegin;
	}

	const suggestions = Array.from(getDefaultEnvs(snippetType));

	// TODO: Add package environments and cached environments from AST
	// This would require integration with the cache system

	return suggestions;
}

export const environment = {
	getDefaultEnvs,
	provide
};

