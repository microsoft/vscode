/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides document symbols for Typst documents using regex-based parsing.
 */
export class TypstDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

	provideDocumentSymbols(
		document: vscode.TextDocument,
		_token: vscode.CancellationToken
	): vscode.DocumentSymbol[] {
		const symbols: vscode.DocumentSymbol[] = [];
		const text = document.getText();
		const lines = text.split('\n');

		let currentOffset = 0;
		const headingStack: { level: number; symbol: vscode.DocumentSymbol }[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineStart = currentOffset;
			const lineEnd = currentOffset + line.length;

			// Detect headings (= Heading 1, == Heading 2, etc.)
			const headingMatch = line.match(/^(=+)\s+(.+)$/);
			if (headingMatch) {
				const level = headingMatch[1].length;
				const name = headingMatch[2].trim();
				const range = new vscode.Range(
					document.positionAt(lineStart),
					document.positionAt(lineEnd)
				);

				const symbolKind = this.getHeadingSymbolKind(level);
				const symbol = new vscode.DocumentSymbol(
					name,
					`Level ${level}`,
					symbolKind,
					range,
					range
				);

				// Manage heading hierarchy
				while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
					headingStack.pop();
				}

				if (headingStack.length > 0) {
					headingStack[headingStack.length - 1].symbol.children.push(symbol);
				} else {
					symbols.push(symbol);
				}

				headingStack.push({ level, symbol });
			}

			// Detect labels <label>
			const labelMatches = line.matchAll(/<([a-zA-Z][\w-]*)>/g);
			for (const match of labelMatches) {
				const labelStart = lineStart + (match.index ?? 0);
				const labelEnd = labelStart + match[0].length;
				const range = new vscode.Range(
					document.positionAt(labelStart),
					document.positionAt(labelEnd)
				);

				const symbol = new vscode.DocumentSymbol(
					match[1],
					'Label',
					vscode.SymbolKind.Key,
					range,
					range
				);

				if (headingStack.length > 0) {
					headingStack[headingStack.length - 1].symbol.children.push(symbol);
				} else {
					symbols.push(symbol);
				}
			}

			// Detect function definitions: #let name(...) =
			const funcMatch = line.match(/#let\s+([a-zA-Z][\w-]*)\s*\([^)]*\)\s*=/);
			if (funcMatch) {
				const funcStart = lineStart + line.indexOf(funcMatch[0]);
				const range = new vscode.Range(
					document.positionAt(funcStart),
					document.positionAt(lineEnd)
				);

				const symbol = new vscode.DocumentSymbol(
					funcMatch[1],
					'Function',
					vscode.SymbolKind.Function,
					range,
					range
				);

				if (headingStack.length > 0) {
					headingStack[headingStack.length - 1].symbol.children.push(symbol);
				} else {
					symbols.push(symbol);
				}
			}

			// Detect variable definitions: #let name =
			const varMatch = line.match(/#let\s+([a-zA-Z][\w-]*)\s*=(?!\s*\()/);
			if (varMatch && !funcMatch) {
				const varStart = lineStart + line.indexOf(varMatch[0]);
				const range = new vscode.Range(
					document.positionAt(varStart),
					document.positionAt(lineEnd)
				);

				const symbol = new vscode.DocumentSymbol(
					varMatch[1],
					'Variable',
					vscode.SymbolKind.Variable,
					range,
					range
				);

				if (headingStack.length > 0) {
					headingStack[headingStack.length - 1].symbol.children.push(symbol);
				} else {
					symbols.push(symbol);
				}
			}

			currentOffset = lineEnd + 1;
		}

		return symbols;
	}

	private getHeadingSymbolKind(level: number): vscode.SymbolKind {
		switch (level) {
			case 1: return vscode.SymbolKind.Class;
			case 2: return vscode.SymbolKind.Method;
			case 3: return vscode.SymbolKind.Property;
			default: return vscode.SymbolKind.Field;
		}
	}
}
