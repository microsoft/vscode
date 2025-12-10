/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { FileSystemUtils } from '../utils/fileUtils';

// Cache for file suggestions to avoid async issues
const fileSuggestionsCache = new Map<string, { suggestions: vscode.CompletionItem[]; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

export const inputProvider: CompleterProvider = {
	from(result: RegExpMatchArray, args: CompletionArgs): Promise<vscode.CompletionItem[]> {
		const macro = result[1];
		const payload = [...result.slice(2).reverse()];
		const cacheKey = `${args.uri.toString()}:${payload[0] || ''}`;

		// Check cache first
		const cached = fileSuggestionsCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return Promise.resolve(cached.suggestions);
		}

		// Load asynchronously and cache
		return provide(args.uri, args.line, args.position, macro, payload).then(suggestions => {
			fileSuggestionsCache.set(cacheKey, { suggestions, timestamp: Date.now() });
			return suggestions;
		}).catch(() => {
			// Return empty array on error
			return [];
		});
	}
};

async function provide(
	uri: vscode.Uri,
	line: string,
	position: vscode.Position,
	_macro: string,
	payload: string[]
): Promise<vscode.CompletionItem[]> {
	const typedFolder = payload[0] || '';
	const startPos = Math.max(line.lastIndexOf('{', position.character), line.lastIndexOf('/', position.character));
	const range = startPos >= 0 ? new vscode.Range(position.line, startPos + 1, position.line, position.character) : undefined;

	const baseDir = FileSystemUtils.dirname(uri);
	const suggestions: vscode.CompletionItem[] = [];

	let searchDir = baseDir;
	if (typedFolder) {
		if (!typedFolder.endsWith('/')) {
			const folderParts = typedFolder.split('/').filter(p => p);
			searchDir = FileSystemUtils.joinUri(baseDir, ...folderParts.slice(0, -1));
		} else {
			const folderParts = typedFolder.split('/').filter(p => p);
			searchDir = FileSystemUtils.joinUri(baseDir, ...folderParts);
		}
	}

	try {
		if (!(await FileSystemUtils.exists(searchDir))) {
			return suggestions;
		}

		const entries = await FileSystemUtils.readDirectory(searchDir);
		for (const [name, fileType] of entries) {
			// Filter out hidden files and common ignore patterns
			if (name.startsWith('.') || name.includes('node_modules')) {
				continue;
			}

			if (fileType === vscode.FileType.Directory) {
				const item = new vscode.CompletionItem(`${name}/`, vscode.CompletionItemKind.Folder);
				item.range = range;
				item.command = { title: 'Post-Action', command: 'editor.action.triggerSuggest' };
				suggestions.push(item);
			} else if (name.match(/\.(tex|pdf|png|jpg|jpeg|gif|eps|svg)$/i)) {
				const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.File);
				item.range = range;
				const fileUri = FileSystemUtils.joinUri(searchDir, name);
				item.detail = fileUri.toString();
				suggestions.push(item);
			}
		}
	} catch (error) {
		// Ignore errors
	}

	return suggestions;
}

export const importProvider: CompleterProvider = inputProvider;
export const subimportProvider: CompleterProvider = inputProvider;

export const input = {
	provide: (uri: vscode.Uri, line: string, position: vscode.Position, macro: string, payload: string[]) => {
		return provide(uri, line, position, macro, payload);
	}
};

