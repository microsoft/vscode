/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { FileSystemUtils } from '../utils/fileUtils';

/**
 * Information about a citation definition for "go to definition"
 */
export interface CitationDefinitionInfo {
	uri: vscode.Uri;
	position: vscode.Position;
	file: string;
}

interface CitationData {
	bibEntries: Map<string, vscode.CompletionItem>;
	/** Map of citation key to definition location for "go to definition" */
	definitions: Map<string, CitationDefinitionInfo>;
}

const data: CitationData = {
	bibEntries: new Map(),
	definitions: new Map()
};

export const provider: CompleterProvider = {
	from(_result: RegExpMatchArray, _args: CompletionArgs): vscode.CompletionItem[] {
		// Update citations asynchronously, but return current items immediately
		updateAll().catch(err => console.error('Error updating citations:', err));
		const items: vscode.CompletionItem[] = [];
		for (const [, item] of data.bibEntries.entries()) {
			items.push(item);
		}
		return items;
	}
};

function provide(_uri: vscode.Uri): vscode.CompletionItem[] {
	// Return current items, update happens asynchronously
	const items: vscode.CompletionItem[] = [];
	for (const [, item] of data.bibEntries.entries()) {
		items.push(item);
	}
	return items;
}

async function updateAll(): Promise<void> {
	data.bibEntries.clear();
	data.definitions.clear();

	// Find .bib files in workspace
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		return;
	}

	for (const folder of workspaceFolders) {
		await findBibFiles(folder.uri);
	}
}

async function findBibFiles(rootUri: vscode.Uri): Promise<void> {
	try {
		await findBibFilesRecursive(rootUri);
	} catch (error) {
		// Ignore errors when reading directory
	}
}

async function findBibFilesRecursive(dirUri: vscode.Uri): Promise<void> {
	try {
		const entries = await FileSystemUtils.readDirectory(dirUri);
		for (const [name, fileType] of entries) {
			const entryUri = FileSystemUtils.joinUri(dirUri, name);
			if (fileType === vscode.FileType.File && name.endsWith('.bib')) {
				await parseBibFile(entryUri);
			} else if (fileType === vscode.FileType.Directory && !name.startsWith('.')) {
				await findBibFilesRecursive(entryUri);
			}
		}
	} catch (error) {
		// Ignore errors
	}
}

async function parseBibFile(fileUri: vscode.Uri): Promise<void> {
	try {
		const content = await FileSystemUtils.readFile(fileUri);
		// Simple regex-based parsing for BibTeX entries
		// Format: @entryType{key, ...}
		const entryRegex = /@\s*(\w+)\s*\{\s*([^,}]+)/g;
		let match;
		while ((match = entryRegex.exec(content)) !== null) {
			const entryType = match[1].toLowerCase();
			const key = match[2].trim();
			if (key && !key.startsWith('@')) {
				// Calculate line number and column from match index
				const beforeMatch = content.substring(0, match.index);
				const lineNumber = beforeMatch.split('\n').length - 1;
				const lastNewline = beforeMatch.lastIndexOf('\n');
				const column = lastNewline === -1 ? match.index : match.index - lastNewline - 1;

				addCitation(key, entryType, fileUri, new vscode.Position(lineNumber, column));
			}
		}
	} catch (error) {
		// Ignore parsing errors
	}
}

function addCitation(key: string, entryType: string, fileUri: vscode.Uri, position: vscode.Position): void {
	if (data.bibEntries.has(key)) {
		return; // Already added
	}

	const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Reference);
	item.detail = `Citation: ${key} (${entryType})`;
	item.documentation = `BibTeX entry "${key}" of type ${entryType}`;
	item.insertText = key;
	item.sortText = key;

	data.bibEntries.set(key, item);

	// Store definition info for "go to definition"
	data.definitions.set(key, {
		uri: fileUri,
		position,
		file: fileUri.fsPath
	});
}

export function getItem(token: string): vscode.CompletionItem | undefined {
	return data.bibEntries.get(token);
}

/**
 * Get definition information for a citation (for "go to definition")
 */
export function getDefinitionItem(token: string): CitationDefinitionInfo | undefined {
	return data.definitions.get(token);
}

/**
 * Refresh citation data by scanning workspace for .bib files
 * Called by definition provider to ensure citations are loaded
 */
export async function refresh(): Promise<void> {
	await updateAll();
}

/**
 * Check if citation data has been loaded
 */
export function isLoaded(): boolean {
	return data.bibEntries.size > 0 || data.definitions.size > 0;
}

export const citation = {
	getItem,
	getDefinitionItem,
	parseBibFile,
	provide,
	refresh,
	isLoaded
};

