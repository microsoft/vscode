/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from './types';
import { provider as macroProvider } from './completer/macro';
import { provider as citationProvider } from './completer/citation';
import { provider as referenceProvider } from './completer/reference';
import { provider as environmentProvider } from './completer/environment';
import { provider as packageProvider } from './completer/package';
import { inputProvider, importProvider, subimportProvider } from './completer/input';

export class LaTeXCompletionProvider implements vscode.CompletionItemProvider {
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken,
		_context: vscode.CompletionContext
	): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
		const currentLine = document.lineAt(position.line).text;
		// Don't provide completion after double backslash
		if (position.character > 1 && currentLine[position.character - 1] === '\\' && currentLine[position.character - 2] === '\\') {
			return [];
		}

		const args: CompletionArgs = {
			uri: document.uri,
			langId: document.languageId,
			line: currentLine,
			position
		};

		// Try different completion types in order
		// Note: 'macro' must be at the last because it matches any macros
		const types: Array<{ regex: RegExp; provider: CompleterProvider }> = [
			// Citation
			{
				regex: /(?:\\[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?(?:\([^[)]*\)){0,2}(?:<[^<>]*>|\[[^[\]]*\]|{[^{}]*})*{([^}]*)$)|(?:\\[a-zA-Z]*cquote*\*?(?:\[[^[\]]*\]){0,2}{([^}]*)$)|(?:\\bibentry{([^}]*)$)/,
				provider: citationProvider
			},
			// Reference
			{
				regex: /(?:\\hyperref\[([^\]]*)(?!\])$)|(?:(?:\\(?!hyper)[a-zA-Z]*ref[a-zA-Z]*\*?(?:\[[^[\]]*\])?){([^}]*)$)|(?:\\[Cc][a-z]*refrange\*?{[^{}]*}{([^}]*)$)/,
				provider: referenceProvider
			},
			// Environment
			{
				regex: /(?:\\begin|\\end){([^}]*)$/,
				provider: environmentProvider
			},
			// Package
			{
				regex: /(?:\\usepackage|\\RequirePackage|\\RequirePackageWithOptions)(?:\[[^[\]]*\])*{([^}]*)$/,
				provider: packageProvider
			},
			// Document class
			{
				regex: /(?:\\documentclass(?:\[[^[\]]*\])*){([^}]*)$/,
				provider: packageProvider
			},
			// Input/Include
			{
				regex: /\\(input|include|subfile|subfileinclude|(?:adj)?includegraphics|includesvg|lstinputlisting|adjustimage|(?:fg|bg)?imagebox|verbatiminput|loadglsentries|markdownInput)\*?(?:\[[^[\]]*\])*{([^}]*)$/,
				provider: inputProvider
			},
			// Includeonly
			{
				regex: /\\(includeonly|excludeonly){(?:{[^}]*},)*(?:[^,]*,)*{?([^},]*)$/,
				provider: inputProvider
			},
			// Import
			{
				regex: /\\(import|includefrom|inputfrom)\*?(?:{([^}]*)})?{([^}]*)$/,
				provider: importProvider
			},
			// Subimport
			{
				regex: /\\(sub(?:import|includefrom|inputfrom))\*?(?:{([^}]*)})?{([^}]*)$/,
				provider: subimportProvider
			},
			// Macro (must be last)
			{
				regex: args.langId === 'latex-expl3' ? /\\([a-zA-Z_@]*(?::[a-zA-Z]*)?)$/ : /\\(\+?[a-zA-Z]*|(?:left|[Bb]ig{1,2}l)?[({[]?)$/,
				provider: macroProvider
			}
		];

		for (const { regex, provider } of types) {
			let lineToPos = args.line.substring(0, args.position.character);
			// Special handling for argument completion
			if (lineToPos.includes('\\documentclass') || lineToPos.includes('\\usepackage')) {
				// Remove braced values from documentclass and usepackage
				lineToPos = lineToPos.replace(/{[^[\]{}]*}/g, '').replace(/\[[^[\]{}]*\]/g, '');
			}
			const result = lineToPos.match(regex);
			if (result) {
				const suggestions = provider.from(result, args);
				// If suggestions is a Promise, await it
				if (suggestions instanceof Promise) {
					const resolved = await suggestions;
					if (resolved.length > 0) {
						return resolved;
					}
				} else {
					if (suggestions.length > 0) {
						return suggestions;
					}
				}
			}
		}

		return [];
	}

	async resolveCompletionItem(
		item: vscode.CompletionItem,
		_token: vscode.CancellationToken
	): Promise<vscode.CompletionItem> {
		// Resolve additional details if needed
		return item;
	}
}

