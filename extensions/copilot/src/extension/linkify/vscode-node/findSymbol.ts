/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

type FoundSymbol = {
	symbol: vscode.SymbolInformation | vscode.DocumentSymbol;
	matchCount: number;
};

function findBestSymbol(
	symbols: ReadonlyArray<vscode.SymbolInformation | vscode.DocumentSymbol>,
	symbolParts: readonly string[]
): FoundSymbol | undefined {
	if (!symbolParts.length) {
		return;
	}

	let bestMatch: FoundSymbol | undefined;
	for (const symbol of symbols) {
		// TODO: vscode.executeDocumentSymbolProvider doesn't return a real instance of
		// vscode.DocumentSymbol so use cast to check for children
		if ((symbol as vscode.DocumentSymbol).children) {
			let partMatch = symbol.name === symbolParts[0] ? { symbol, matchCount: 1 } : undefined;
			if (partMatch) {
				const remainingPartMatch = findBestSymbol((symbol as vscode.DocumentSymbol).children, symbolParts.slice(1));
				if (remainingPartMatch) {
					partMatch = { symbol: remainingPartMatch.symbol, matchCount: partMatch.matchCount + remainingPartMatch.matchCount };
				}
			}

			const restMatch = findBestSymbol((symbol as vscode.DocumentSymbol).children, symbolParts);
			let match: FoundSymbol | undefined;
			if (partMatch && restMatch) {
				match = partMatch.matchCount >= restMatch.matchCount ? partMatch : restMatch;
			} else {
				match = partMatch ?? restMatch;
			}

			if (match && (!bestMatch || match.matchCount > bestMatch?.matchCount)) {
				bestMatch = match;
			}
		} else { // Is a vscode.SymbolInformation
			// For flat symbol information, try to match against symbol parts
			// Prefer symbols that appear more to the right (higher index) in the qualified name
			// This prioritizes members over classes (e.g., in `TextModel.undo()`, prefer `undo`)
			const matchIndex = symbolParts.indexOf(symbol.name);
			if (matchIndex !== -1) {
				// Higher index = more to the right = higher priority
				const match = { symbol, matchCount: matchIndex + 1 };
				if (!bestMatch || match.matchCount > bestMatch.matchCount) {
					bestMatch = match;
				}
			}
		}
	}

	return bestMatch;
}

/**
 * Try to find a symbol in a symbol tree.
 *
 * This does a fuzzy search of the symbol tree. This means that the symbol parts must appear in order,
 * but there can be separated by layers. For example: `a, c` could match on a symbol tree `a -> b -> c`.
 * We also always make a best effort to find the symbol even if not all parts match.
 * For example with `a, c`, this means we would match on `a -> x -> z` because `a` matched.
 */
export function findBestSymbolByPath(
	symbols: ReadonlyArray<vscode.SymbolInformation | vscode.DocumentSymbol>,
	symbolPath: string
): vscode.SymbolInformation | vscode.DocumentSymbol | undefined {

	// Prefer an exact match but fallback to breaking up the symbol into parts
	return (
		findBestSymbol(symbols, [symbolPath]) ?? findBestSymbol(symbols, extractSymbolNamesInCode(symbolPath))
	)?.symbol;
}

/**
 * The symbol path may be take a few different forms:
 * - Exact name: `foo`, `some symbol name`
 * - Name plus signature: `foo()`
 * - Qualified name: `foo.bar`
 *
 * We want just the names without any of the extra punctuation because `symbols` does not include these
 */
function extractSymbolNamesInCode(inlineCode: string): string[] {
	// TODO: this assumes the language is JS like.
	// It won't handle symbol parts that include spaces or special characters
	return Array.from(inlineCode.matchAll(/[#\w$][\w\d$]*/g), x => x[0]);
}
