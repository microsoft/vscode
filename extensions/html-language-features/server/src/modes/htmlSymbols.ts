/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HTMLDocument, LanguageModes, Range, SymbolInformation, SymbolKind, TextDocument } from './languageModes.js';
import { pushAll } from '../utils/arrays.js';

function nodeToName(node: any): string {
	let name = node.tag;
	if (node.attributes) {
		const id = node.attributes.id;
		const classes = node.attributes.class;
		if (id) {
			name += `#${id.replace(/["']/g, '')}`;
		}
		if (classes) {
			name += classes.replace(/["']/g, '').split(/\s+/).map((className: string) => `.${className}`).join('');
		}
	}
	return name || '?';
}

export function findHTMLDocumentSymbols(document: TextDocument, htmlDocument: HTMLDocument, limit: number): SymbolInformation[] {
	const symbols: SymbolInformation[] = [];
	if (limit <= 0) {
		return symbols;
	}

	function walk(node: any, parentName: string | undefined): boolean {
		if (symbols.length >= limit) {
			return false;
		}
		const name = nodeToName(node);
		const range = Range.create(document.positionAt(node.start), document.positionAt(node.end));
		const symbol = SymbolInformation.create(name, SymbolKind.Field, range, document.uri, parentName);
		symbol.containerName ??= '';
		symbols.push(symbol);

		if (node.children) {
			for (const child of node.children) {
				if (!walk(child, name)) {
					return false;
				}
			}
		}
		return true;
	}

	for (const root of htmlDocument.roots) {
		if (!walk(root, undefined)) {
			break;
		}
	}
	return symbols;
}

export async function findDocumentSymbols(languageModes: LanguageModes, document: TextDocument, maxSymbols: number = 5000): Promise<SymbolInformation[]> {
	const symbols: SymbolInformation[] = [];
	if (maxSymbols <= 0) {
		return symbols;
	}
	for (const m of languageModes.getAllModesInDocument(document)) {
		if (m.findDocumentSymbols) {
			const remaining = maxSymbols - symbols.length;
			if (remaining <= 0) {
				break;
			}
			const modeSymbols = await m.findDocumentSymbols(document, remaining);
			if (modeSymbols) {
				if (modeSymbols.length > remaining) {
					for (let i = 0; i < remaining; i++) {
						symbols.push(modeSymbols[i]);
					}
					break;
				} else {
					pushAll(symbols, modeSymbols);
					if (symbols.length >= maxSymbols) {
						break;
					}
				}
			}
		}
	}
	return symbols;
}
