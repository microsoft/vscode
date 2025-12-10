/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TeXElement, TeXElementType } from './types';
import { construct, initializeStructure } from './structure';
import { initializeCache, refreshCache, refreshCacheFromDocument } from './cache';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Get a unique identifier for a document that works in both desktop and web
 * In web environments, document.fileName may be empty or unreliable
 */
function getDocumentId(document: vscode.TextDocument): string {
	// Use URI string as identifier - works for all schemes (file, vscode-vfs, etc.)
	return document.uri.toString();
}

/**
 * Document symbol provider for LaTeX files
 * Provides outline structure for LaTeX documents
 * Ported from latex-workshop with full functionality
 */
export class LaTeXDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	private logger?: OutputChannelLogger;

	constructor(log?: OutputChannelLogger) {
		this.logger = log;
		if (log) {
			initializeCache(log);
		}
	}

	async provideDocumentSymbols(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): Promise<vscode.DocumentSymbol[]> {
		try {
			const docId = getDocumentId(document);

			// Initialize if not already done
			if (this.logger) {
				initializeStructure(this.logger, docId);
			}

			// For web environments or non-file schemes, use document content directly
			// This avoids issues with file system APIs that don't work in web
			if (document.uri.scheme !== 'file') {
				await refreshCacheFromDocument(document);
			} else {
				// For file:// scheme, use traditional file-based caching
				await refreshCache(docId);
			}

			// Construct outline structure
			const elements = await construct(docId, false);
			this.logger?.info(`Generated ${elements.length} outline elements for ${docId}`);
			return this.elementsToSymbols(elements, document);
		} catch (error) {
			this.logger?.error(`Error providing document symbols: ${error}`);
			if (error instanceof Error) {
				this.logger?.error(`Stack: ${error.stack}`);
			}
			return [];
		}
	}

	private elementsToSymbols(
		elements: TeXElement[],
		document: vscode.TextDocument
	): vscode.DocumentSymbol[] {
		const symbols: vscode.DocumentSymbol[] = [];

		for (const element of elements) {
			const range = new vscode.Range(
				element.lineFr,
				0,
				element.lineTo,
				document.lineAt(Math.min(element.lineTo, document.lineCount - 1)).range.end.character
			);

			const symbol = new vscode.DocumentSymbol(
				element.label || 'empty',
				'',
				this.elementToKind(element),
				range,
				range
			);

			if (element.children.length > 0) {
				symbol.children = this.elementsToSymbols(element.children, document);
			}

			symbols.push(symbol);
		}

		return symbols;
	}

	private elementToKind(element: TeXElement): vscode.SymbolKind {
		switch (element.type) {
			case TeXElementType.Section:
			case TeXElementType.SectionAst:
				return vscode.SymbolKind.Struct;
			case TeXElementType.Environment:
				return vscode.SymbolKind.Package;
			case TeXElementType.Macro:
				return vscode.SymbolKind.Number;
			case TeXElementType.SubFile:
				return vscode.SymbolKind.File;
			case TeXElementType.BibItem:
				return vscode.SymbolKind.Class;
			case TeXElementType.BibField:
				return vscode.SymbolKind.Constant;
			default:
				return vscode.SymbolKind.String;
		}
	}
}

