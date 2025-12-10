/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { CmdEnvSuggestion, filterNonLetterSuggestions } from '../completerUtils';
import { FileSystemUtils } from '../utils/fileUtils';

interface MacroData {
	definedCmds: Map<string, { filePath: string; location: vscode.Location }>;
	defaultCmds: CmdEnvSuggestion[];
	defaultSymbols: CmdEnvSuggestion[];
	packageCmds: Map<string, CmdEnvSuggestion[]>;
}

const data: MacroData = {
	definedCmds: new Map(),
	defaultCmds: [],
	defaultSymbols: [],
	packageCmds: new Map()
};

let extensionRoot: vscode.Uri | undefined;

export async function initializeMacroCompleter(root: string | vscode.Uri): Promise<void> {
	if (typeof root === 'string') {
		extensionRoot = vscode.Uri.file(root);
	} else {
		extensionRoot = root;
	}

	await loadDefaultMacros();
}

async function loadDefaultMacros(): Promise<void> {
	if (!extensionRoot) {
		return;
	}

	try {
		// Try multiple possible paths for data files
		// In web (browser), files are in dist/browser/data after webpack copy
		// In production deployment, files may be in data/ directly (relative to extensionUri)
		// In desktop, files are in the extension root/data
		// Check if we're in browser by looking at extensionRoot scheme
		const isBrowser = extensionRoot.scheme !== 'file';
		const possiblePaths = isBrowser
			? [
				// In production web deployment, data/ is at extension root
				['data', 'unimathsymbols.json'],
				// In development, files are in dist/browser/data after webpack copy
				['dist', 'browser', 'data', 'unimathsymbols.json']
			]
			: [
				['data', 'unimathsymbols.json'],
				['extension', 'data', 'unimathsymbols.json'],
				['out', 'data', 'unimathsymbols.json']
			];

		let unimathUri: vscode.Uri | undefined;
		for (const pathParts of possiblePaths) {
			const testUri = FileSystemUtils.joinUri(extensionRoot, ...pathParts);
			if (await FileSystemUtils.exists(testUri)) {
				unimathUri = testUri;
				break;
			}
		}

		if (unimathUri) {
			const content = await FileSystemUtils.readFile(unimathUri);
			const symbols = JSON.parse(content);
			Object.values(symbols).forEach((symbol: any) => {
				data.defaultSymbols.push(
					entryCmdToCompletion(
						{ name: symbol.command, doc: symbol.documentation, detail: symbol.detail },
						'latex'
					)
				);
			});
		}

		// Try multiple possible paths for macros
		const macroPaths = isBrowser
			? [
				// In production web deployment, data/ is at extension root
				['data', 'macros.json'],
				// In development, files are in dist/browser/data after webpack copy
				['dist', 'browser', 'data', 'macros.json']
			]
			: [
				['data', 'macros.json'],
				['extension', 'data', 'macros.json'],
				['out', 'data', 'macros.json']
			];

		let macrosUri: vscode.Uri | undefined;
		for (const pathParts of macroPaths) {
			const testUri = FileSystemUtils.joinUri(extensionRoot, ...pathParts);
			if (await FileSystemUtils.exists(testUri)) {
				macrosUri = testUri;
				break;
			}
		}

		if (macrosUri) {
			const content = await FileSystemUtils.readFile(macrosUri);
			const macros = JSON.parse(content);
			const all = macros.map((m: any) => ({
				...m,
				package: 'latex'
			}));

			data.defaultCmds = [];
			all.forEach((m: any) => {
				data.defaultCmds.push(entryCmdToCompletion(m, m.package, m.action));
			});
		}
	} catch (error) {
		// Error loading macro data - silently fail
	}
}

function entryCmdToCompletion(item: any, packageName: string, postAction?: string): CmdEnvSuggestion {
	const suggestion = new CmdEnvSuggestion(
		`\\${item.name}${item.arg?.format ?? ''}`,
		packageName || 'latex',
		item.arg?.keys ?? [],
		item.arg?.keyPos ?? -1,
		{ name: item.name, args: item.arg?.format ?? '' },
		vscode.CompletionItemKind.Function,
		item.if,
		item.unusual
	);

	if (item.arg?.snippet) {
		// Wrap the selected text when there is a single placeholder
		if (!(item.arg.snippet.match(/\$\{?2/) || (item.arg.snippet.match(/\$\{?0/) && item.arg.snippet.match(/\$\{?1/)))) {
			item.arg.snippet = item.arg.snippet
				.replace(/\$1|\$\{1\}/, '${1:${TM_SELECTED_TEXT}}')
				.replace(/\$\{1:([^$}]+)\}/, '${1:${TM_SELECTED_TEXT:$1}}');
		}
		item.arg.snippet = item.arg.snippet
			.replace(/%:translatable/g, '')
			.replace(/%\w+/g, '');
		suggestion.insertText = new vscode.SnippetString(item.arg.snippet);
	} else {
		suggestion.insertText = item.name;
	}

	suggestion.filterText = item.name + (item.arg?.format ?? '') + (item.detail ?? '');
	suggestion.detail = item.detail ?? (item.arg?.snippet ? `\\${item.arg?.snippet?.replace(/\$\{\d+:([^$}]*)\}/g, '$1')}` : `\\${item.name}`);
	suggestion.documentation = item.doc ?? `Macro \\${item.name}${item.arg?.format ?? ''}.`;
	if (packageName) {
		suggestion.documentation += ` From package: ${packageName}.`;
	}

	suggestion.sortText = (item.name + (item.arg?.format ?? ''))
		.replace(/([a-z])/g, '$10')
		.toLowerCase()
		.replaceAll('{', '0')
		.replaceAll('[', '1')
		.replace(/^(.+?)\(/g, '$12')
		.replaceAll('|', '3')
		.replaceAll('*', '9');

	if (postAction) {
		suggestion.command = { title: 'Post-Action', command: postAction };
	} else if (isTriggerSuggestNeeded(item.name)) {
		suggestion.command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' };
	}

	return suggestion;
}

function isTriggerSuggestNeeded(name: string): boolean {
	const reg = /^(?:[a-z]*(cite|ref|input)[a-z]*|begin|bibitem|(sub)?(import|includefrom|inputfrom)|gls(?:pl|text|first|plural|firstplural|name|symbol|desc|user(?:i|ii|iii|iv|v|vi))?|Acr(?:long|full|short)?(?:pl)?|ac[slf]?p?)/i;
	return reg.test(name);
}

export const provider: CompleterProvider = {
	from(result: RegExpMatchArray, args: CompletionArgs): vscode.CompletionItem[] {
		const suggestions = provide(args.langId, args.line, args.position);
		// Macros ending with (, { or [ are not filtered properly by vscode intellisense. So we do it by hand.
		if (result[0].match(/[({[]$/)) {
			const exactSuggestion = suggestions.filter(entry => entry.label === result[0]);
			if (exactSuggestion.length > 0) {
				return exactSuggestion;
			}
		}
		// Macros starting with a non letter character are not filtered properly because of wordPattern definition.
		const filtered = filterNonLetterSuggestions(suggestions, result[1], args.position);
		return filtered;
	}
};

function provide(_langId: string, line: string, position: vscode.Position): vscode.CompletionItem[] {
	const configuration = vscode.workspace.getConfiguration('latex');
	const useOptionalArgsEntries = configuration.get<boolean>('intellisense.optionalArgsEntries.enabled', true);

	let range: vscode.Range | undefined = undefined;
	if (line && position) {
		const startPos = line.lastIndexOf('\\', position.character - 1);
		if (startPos >= 0) {
			range = new vscode.Range(position.line, startPos + 1, position.line, position.character);
		}
	}

	const suggestions: vscode.CompletionItem[] = [];
	const defined = new Set<string>();

	// Insert default macros
	data.defaultCmds.forEach(cmd => {
		if (!useOptionalArgsEntries && cmd.hasOptionalArgs()) {
			return;
		}
		cmd.range = range;
		suggestions.push(cmd);
		defined.add(cmd.signatureAsString());
	});

	// Insert unimathsymbols
	if (configuration.get<boolean>('intellisense.unimathsymbols.enabled', true)) {
		data.defaultSymbols.forEach(symbol => {
			symbol.range = range;
			suggestions.push(symbol);
			defined.add(symbol.signatureAsString());
		});
	}

	return suggestions;
}

export const macro = {
	getData: () => data,
	provide
};

