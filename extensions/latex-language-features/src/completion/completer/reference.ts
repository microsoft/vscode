/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CompletionArgs, CompleterProvider } from '../types';
import { get as getCache } from '../../outline/cache';

/**
 * Information about a label definition for "go to definition"
 */
export interface LabelDefinitionInfo {
	uri: vscode.Uri;
	position: vscode.Position;
	file: string;
}

interface ReferenceData {
	suggestions: Map<string, vscode.CompletionItem>;
	/** Map of label name to definition location for "go to definition" */
	definitions: Map<string, LabelDefinitionInfo>;
}

const data: ReferenceData = {
	suggestions: new Map(),
	definitions: new Map()
};

export const provider: CompleterProvider = {
	from(_result: RegExpMatchArray, args: CompletionArgs): vscode.CompletionItem[] {
		return provide(args.uri, args.line, args.position);
	}
};

function provide(uri: vscode.Uri, _line: string, _position: vscode.Position): vscode.CompletionItem[] {
	updateAll(uri);
	const items: vscode.CompletionItem[] = [];
	for (const [, item] of data.suggestions.entries()) {
		items.push(item);
	}
	return items;
}

function updateAll(uri: vscode.Uri): void {
	data.suggestions.clear();
	data.definitions.clear();

	// Get cache for current file
	const fileCache = getCache(uri.fsPath);
	if (!fileCache) {
		return;
	}

	// Extract labels from AST if available
	if (fileCache.ast) {
		extractLabelsFromAST(fileCache.ast, uri);
	}

	// Also search in content for \label commands
	extractLabelsFromContent(fileCache.content, uri);
}

function extractLabelsFromAST(ast: any, uri: vscode.Uri): void {
	// Recursively search for label nodes in AST
	function searchLabels(node: any): void {
		if (!node || typeof node !== 'object') {
			return;
		}

		if (node.type === 'macro' && node.content === 'label') {
			// Found a \label command
			const labelArg = node.args?.[0];
			if (labelArg && labelArg.content) {
				const labelText = extractTextFromNode(labelArg.content);
				if (labelText) {
					// Get position from AST if available
					const line = node.position?.start?.line ? node.position.start.line - 1 : 0;
					const col = node.position?.start?.column ? node.position.start.column - 1 : 0;
					addLabel(labelText, uri, new vscode.Position(line, col));
				}
			}
		}

		// Recursively search in content
		if (Array.isArray(node.content)) {
			for (const child of node.content) {
				searchLabels(child);
			}
		}

		// Search in args
		if (Array.isArray(node.args)) {
			for (const arg of node.args) {
				searchLabels(arg);
			}
		}
	}

	if (ast.content) {
		for (const node of ast.content) {
			searchLabels(node);
		}
	}
}

function extractTextFromNode(content: any[]): string {
	if (!Array.isArray(content)) {
		return '';
	}

	return content
		.map(node => {
			if (typeof node === 'string') {
				return node;
			}
			if (node && typeof node === 'object') {
				if (node.type === 'string') {
					return node.content || '';
				}
				if (node.content && Array.isArray(node.content)) {
					return extractTextFromNode(node.content);
				}
			}
			return '';
		})
		.join('')
		.trim();
}

function extractLabelsFromContent(content: string, uri: vscode.Uri): void {
	// Simple regex to find \label{...} commands
	const labelRegex = /\\label\s*\{([^}]+)\}/g;
	let match;

	while ((match = labelRegex.exec(content)) !== null) {
		const labelText = match[1].trim();
		if (labelText) {
			// Calculate line number from match index
			const beforeMatch = content.substring(0, match.index);
			const lineNumber = beforeMatch.split('\n').length - 1;
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const column = lastNewline === -1 ? match.index : match.index - lastNewline - 1;

			addLabel(labelText, uri, new vscode.Position(lineNumber, column));
		}
	}
}

function addLabel(labelText: string, uri: vscode.Uri, position: vscode.Position): void {
	if (data.suggestions.has(labelText)) {
		return; // Already added
	}

	const item = new vscode.CompletionItem(labelText, vscode.CompletionItemKind.Reference);
	item.detail = `Label: ${labelText}`;
	item.documentation = `Reference to label "${labelText}"`;
	item.insertText = labelText;
	item.sortText = labelText;

	data.suggestions.set(labelText, item);

	// Store definition info for "go to definition"
	data.definitions.set(labelText, {
		uri,
		position,
		file: uri.fsPath
	});
}

export function getItem(token: string): vscode.CompletionItem | undefined {
	return data.suggestions.get(token);
}

/**
 * Get definition information for a label (for "go to definition")
 */
export function getDefinitionItem(token: string): LabelDefinitionInfo | undefined {
	return data.definitions.get(token);
}

/**
 * Refresh labels from a document (for "go to definition")
 * This extracts labels directly from the document content
 */
export function refreshFromDocument(document: vscode.TextDocument): void {
	// Clear and re-extract labels from the document
	data.suggestions.clear();
	data.definitions.clear();

	const uri = document.uri;
	const content = document.getText();

	// Extract labels from content
	extractLabelsFromContent(content, uri);
}

/**
 * Refresh labels for a URI (uses cache if available)
 */
export function refresh(uri: vscode.Uri): void {
	updateAll(uri);
}

/**
 * Check if any labels have been loaded
 */
export function isLoaded(): boolean {
	return data.definitions.size > 0;
}

export const reference = {
	getItem,
	getDefinitionItem,
	provide,
	refresh,
	refreshFromDocument,
	isLoaded
};

