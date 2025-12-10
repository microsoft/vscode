/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { Node, Argument } from '@unified-latex/unified-latex-types';
import { getParserInstance } from '../outline/parser/unified';

/**
 * Position information structure from unified-latex AST
 */
interface PositionInfo {
	start: { line: number; column: number };
	end: { line: number; column: number };
}

/**
 * Get position from node if it exists
 */
function getPosition(node: Node): PositionInfo | undefined {
	const nodeRecord = node as unknown as Record<string, unknown>;
	const pos = nodeRecord['position'] as PositionInfo | undefined;
	if (pos && pos.start && pos.end) {
		return pos;
	}
	return undefined;
}

/**
 * Get content array from node if it exists
 */
function getContentArray(node: Node): Node[] | undefined {
	const nodeRecord = node as unknown as Record<string, unknown>;
	const content = nodeRecord['content'];
	if (Array.isArray(content)) {
		return content as Node[];
	}
	return undefined;
}

/**
 * Get args array from node if it exists
 */
function getArgs(node: Node): Argument[] | undefined {
	const nodeRecord = node as unknown as Record<string, unknown>;
	const args = nodeRecord['args'];
	if (Array.isArray(args)) {
		return args as Argument[];
	}
	return undefined;
}

/**
 * Check if a position is inside a node
 */
function inNode(position: vscode.Position, node: Node): boolean {
	const nodePos = getPosition(node);
	if (!nodePos) {
		return false;
	}

	// Check line bounds
	if (nodePos.start.line > position.line + 1 ||
		nodePos.end.line < position.line + 1) {
		return false;
	}

	// Check column on start line
	if (nodePos.start.line === position.line + 1 &&
		nodePos.start.column > position.character + 1) {
		return false;
	}

	// Check column on end line
	if (nodePos.end.line === position.line + 1 &&
		nodePos.end.column < position.character + 1) {
		return false;
	}

	return true;
}

/**
 * Find nodes in macro arguments
 */
function findArg(position: vscode.Position, node: Node, stack: Node[]): void {
	const args = getArgs(node);
	if (!args) {
		return;
	}

	for (const arg of args) {
		if (!arg.content) {
			continue;
		}
		for (const child of arg.content) {
			if (!inNode(position, child)) {
				continue;
			}
			stack.push(child);
			findNode(position, child, stack);
			break;
		}
	}
}

/**
 * Recursively find nodes containing the position
 */
function findNode(position: vscode.Position, node: Node, stack: Node[] = [node]): Node[] {
	const content = getContentArray(node);
	if (content) {
		for (const child of content) {
			if (inNode(position, child)) {
				stack.push(child);
				findNode(position, child, stack);
				break;
			} else {
				findArg(position, child, stack);
			}
		}
	}

	findArg(position, node, stack);
	return stack;
}

/**
 * Convert a stack of nodes to a SelectionRange chain
 */
function nodeStackToSelectionRange(stack: Node[]): vscode.SelectionRange {
	const last = stack[stack.length - 1];
	const parent = stack[stack.length - 2];

	let startLine = 0;
	let startCol = 0;
	let endLine = 0;
	let endCol = 0;

	const lastPos = getPosition(last);
	if (lastPos) {
		startLine = lastPos.start.line - 1;
		startCol = lastPos.start.column - 1;
		endLine = lastPos.end.line - 1;
		endCol = lastPos.end.column - 1;
	}

	return new vscode.SelectionRange(
		new vscode.Range(startLine, startCol, endLine, endCol),
		parent ? nodeStackToSelectionRange(stack.slice(0, -1)) : undefined
	);
}

/**
 * Selection Range Provider for LaTeX documents
 * Provides smart selection expansion based on AST structure
 */
export class LaTeXSelectionRangeProvider implements vscode.SelectionRangeProvider {

	/**
	 * Provide selection ranges for the given positions
	 */
	async provideSelectionRanges(
		document: vscode.TextDocument,
		positions: vscode.Position[],
		_token: vscode.CancellationToken
	): Promise<vscode.SelectionRange[]> {
		const parser = getParserInstance();
		const ast = parser.parse(document.getText());

		if (!ast) {
			return [];
		}

		const result: vscode.SelectionRange[] = [];

		for (const position of positions) {
			const nodeStack = findNode(position, ast);
			const selectionRange = nodeStackToSelectionRange(nodeStack);
			result.push(selectionRange);
		}

		return result;
	}
}

/**
 * Register the selection range provider
 */
export function registerSelectionRangeProvider(_context: vscode.ExtensionContext): vscode.Disposable {
	const selector: vscode.DocumentSelector = [
		{ language: 'latex', scheme: '*' },
		{ language: 'tex', scheme: '*' }
	];

	return vscode.languages.registerSelectionRangeProvider(selector, new LaTeXSelectionRangeProvider());
}

