/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { Node, Macro, Environment, String as StringNode, Group } from '@unified-latex/unified-latex-types';
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
	// Access position safely - unified-latex nodes have optional position
	const nodeRecord = node as unknown as Record<string, unknown>;
	const pos = nodeRecord['position'] as PositionInfo | undefined;
	if (pos && pos.start && pos.end) {
		return pos;
	}
	return undefined;
}

/**
 * Check if node is a string node
 */
function isStringNode(node: Node): node is StringNode {
	return node.type === 'string';
}

/**
 * Check if node is a group node
 */
function isGroupNode(node: Node): node is Group {
	return node.type === 'group';
}

/**
 * Get node content if it's an array
 */
function getNodeContent(node: Node): Node[] | undefined {
	const nodeRecord = node as unknown as Record<string, unknown>;
	const content = nodeRecord['content'];
	if (Array.isArray(content)) {
		return content as Node[];
	}
	return undefined;
}

/**
 * Types of LaTeX pairs that can be matched
 */
enum PairType {
	ENVIRONMENT = 0,
	DISPLAYMATH = 1,
	INLINEMATH = 2,
	MACRO = 3
}

/**
 * Delimiter patterns for different pair types
 */
const delimiters = [
	{ type: PairType.ENVIRONMENT, start: /\\begin\{([\w\d]+\*?)\}/, end: /\\end\{([\w\d]+\*?)/ },
	{ type: PairType.INLINEMATH, start: /\\\(/, end: /\\\)/ },
	{ type: PairType.INLINEMATH, start: /\$/, end: /\$/ },
	{ type: PairType.DISPLAYMATH, start: /\\\[/, end: /\\\]/ },
	{ type: PairType.DISPLAYMATH, start: /\$\$/, end: /\$\$/ },
	{ type: PairType.MACRO, start: /\\if\w*/, end: /\\fi/ },
	{ type: PairType.MACRO, start: /\\if\w*/, end: /\\else/ },
	{ type: PairType.MACRO, start: /\\else/, end: /\\fi/ }
];

/**
 * Represents a matched pair of LaTeX macros/environments
 */
class MacroPair {
	/** The list of contained pairs */
	children: MacroPair[] = [];
	/** The parent of top-level pairs must be undefined */
	parent: MacroPair | undefined = undefined;

	constructor(
		public type: PairType,
		/** The opening string. It contains the leading slash */
		public start: string,
		/** The starting position of `start` */
		public startPosition: vscode.Position,
		/** The closing string. It contains the leading slash */
		public end?: string,
		/** The ending position of `end` */
		public endPosition?: vscode.Position
	) { }

	/**
	 * Does the start statement contain `pos`
	 */
	startContains(pos: vscode.Position): boolean {
		const startRange = new vscode.Range(this.startPosition, this.startPosition.translate(0, this.start.length));
		return startRange.contains(pos);
	}

	/**
	 * Does the end statement contain `pos`
	 */
	endContains(pos: vscode.Position): boolean {
		if (this.end && this.endPosition) {
			const endRange = new vscode.Range(this.endPosition.translate(0, -this.end.length), this.endPosition);
			return endRange.contains(pos);
		}
		return false;
	}
}

/**
 * Helper function to convert argument content to string
 */
function argContentToStr(content: Node[] | undefined): string {
	if (!content) {
		return '';
	}
	return content.map(node => {
		if (isStringNode(node)) {
			return node.content || '';
		}
		return '';
	}).join('');
}

/**
 * Build a tree of macro pairs from the document AST
 */
async function buildMacroPairTree(document: vscode.TextDocument): Promise<MacroPair[]> {
	const parser = getParserInstance();
	const ast = parser.parse(document.getText());

	if (!ast) {
		return [];
	}

	const macroPairs: MacroPair[] = [];
	let parentPair: MacroPair | undefined = undefined;

	for (let index = 0; index < ast.content.length; index++) {
		const node = ast.content[index];
		const next = index === ast.content.length - 1 ? undefined : ast.content[index + 1];
		parentPair = buildMacroPairTreeFromNode(document, node, next, parentPair, macroPairs);
	}

	return macroPairs;
}

/**
 * Recursively build macro pair tree from AST node
 */
function buildMacroPairTreeFromNode(
	doc: vscode.TextDocument,
	node: Node,
	next: Node | undefined,
	parentMacroPair: MacroPair | undefined,
	macros: MacroPair[]
): MacroPair | undefined {
	const nodePos = getPosition(node);
	if (!nodePos) {
		return parentMacroPair;
	}

	if (node.type === 'environment' || node.type === 'mathenv') {
		const env = node as Environment;
		const envName = typeof env.env === 'string' ? env.env : argContentToStr([env.env]);
		let currentMacroPair: MacroPair | undefined;

		// If we encounter `\begin{document}`, clear macro pairs
		if (envName === 'document') {
			macros.length = 0;
			currentMacroPair = undefined;
			parentMacroPair = undefined;
		} else {
			const beginName = `\\begin{${envName}}`;
			const endName = `\\end{${envName}}`;
			const beginPos = new vscode.Position(nodePos.start.line - 1, nodePos.start.column - 1);
			const endPos = new vscode.Position(nodePos.end.line - 1, nodePos.end.column - 1);
			currentMacroPair = new MacroPair(PairType.ENVIRONMENT, beginName, beginPos, endName, endPos);

			if (parentMacroPair) {
				currentMacroPair.parent = parentMacroPair;
				parentMacroPair.children.push(currentMacroPair);
			} else {
				macros.push(currentMacroPair);
			}
			parentMacroPair = currentMacroPair;
		}

		// Process children
		const content = getNodeContent(node);
		if (content) {
			for (let index = 0; index < content.length; index++) {
				const subnode = content[index];
				const subnext = index === content.length - 1 ? undefined : content[index + 1];
				parentMacroPair = buildMacroPairTreeFromNode(doc, subnode, subnext, parentMacroPair, macros);
			}
		}
		parentMacroPair = currentMacroPair?.parent;

	} else if (node.type === 'displaymath') {
		const beginPos = new vscode.Position(nodePos.start.line - 1, nodePos.start.column - 1);
		const endPos = new vscode.Position(nodePos.end.line - 1, nodePos.end.column - 1);

		if (doc.getText(new vscode.Range(beginPos, beginPos.translate(0, 2))) === '$$') {
			const currentMacroPair = new MacroPair(PairType.DISPLAYMATH, '$$', beginPos, '$$', endPos);
			macros.push(currentMacroPair);
		} else {
			const currentMacroPair = new MacroPair(PairType.DISPLAYMATH, '\\[', beginPos, '\\]', endPos);
			macros.push(currentMacroPair);
		}

	} else if (node.type === 'inlinemath') {
		const beginPos = new vscode.Position(nodePos.start.line - 1, nodePos.start.column - 1);
		const endPos = new vscode.Position(nodePos.end.line - 1, nodePos.end.column - 1);

		if (doc.getText(new vscode.Range(beginPos, beginPos.translate(0, 1))) === '$') {
			const currentMacroPair = new MacroPair(PairType.INLINEMATH, '$', beginPos, '$', endPos);
			macros.push(currentMacroPair);
		} else {
			const currentMacroPair = new MacroPair(PairType.INLINEMATH, '\\(', beginPos, '\\)', endPos);
			macros.push(currentMacroPair);
		}

	} else if (node.type === 'macro') {
		const macro = node as Macro;

		// Handle unbalanced \begin
		if (macro.content === 'begin' && next && isGroupNode(next)) {
			const groupContent = next.content;
			if (groupContent.length > 0 && isStringNode(groupContent[0])) {
				const beginPos = new vscode.Position(nodePos.start.line - 1, nodePos.start.column - 1);
				const envName = groupContent[0].content;
				const envTeX = `\\begin{${envName}}`;
				const currentMacroPair = new MacroPair(PairType.ENVIRONMENT, envTeX, beginPos);

				if (parentMacroPair) {
					currentMacroPair.parent = parentMacroPair;
					parentMacroPair.children.push(currentMacroPair);
				} else {
					macros.push(currentMacroPair);
				}
				return currentMacroPair;
			}
		}

		const macroName = '\\' + macro.content;

		// Check for closing macros
		for (const macroPair of delimiters) {
			if (macroPair.type === PairType.MACRO && macroName.match(macroPair.end) && parentMacroPair && parentMacroPair.start.match(macroPair.start)) {
				parentMacroPair.end = macroName;
				parentMacroPair.endPosition = new vscode.Position(nodePos.end.line - 1, nodePos.end.column - 1);
				parentMacroPair = parentMacroPair.parent;
			}
		}

		// Check for opening macros
		for (const macroPair of delimiters) {
			if (macroPair.type === PairType.MACRO && macroName.match(macroPair.start)) {
				const beginPos = new vscode.Position(nodePos.start.line - 1, nodePos.start.column - 1);
				const currentMacroPair = new MacroPair(PairType.MACRO, macroName, beginPos);

				if (parentMacroPair) {
					currentMacroPair.parent = parentMacroPair;
					parentMacroPair.children.push(currentMacroPair);
				} else {
					macros.push(currentMacroPair);
				}
				return currentMacroPair;
			}
		}
	}

	return parentMacroPair;
}

/**
 * Find all pairs surrounding the given position
 */
function walkThruForSurroundingPairs(pos: vscode.Position, macroPairTree: MacroPair[]): MacroPair[] {
	const surroundingPairs: MacroPair[] = [];

	for (const macroPair of macroPairTree) {
		if (macroPair.startPosition.isBeforeOrEqual(pos)) {
			if (!macroPair.endPosition || macroPair.endPosition.isAfter(pos)) {
				surroundingPairs.push(macroPair);
				if (macroPair.children) {
					surroundingPairs.push(...walkThruForSurroundingPairs(pos, macroPair.children));
				}
			}
		}
	}

	return surroundingPairs;
}

/**
 * Find all pairs at the same depth as the position
 */
function walkThruForPairsNextToPosition(pos: vscode.Position, macroPairTree: MacroPair[]): MacroPair[] {
	const pairsAtPosition: MacroPair[] = [];

	if (macroPairTree.some((macroPair) => macroPair.startContains(pos) || macroPair.endContains(pos))) {
		return macroPairTree;
	}

	for (const macroPair of macroPairTree) {
		if (macroPair.startPosition.isBefore(pos)) {
			if (!macroPair.endPosition || macroPair.endPosition.isAfter(pos)) {
				if (macroPair.children) {
					pairsAtPosition.push(...walkThruForPairsNextToPosition(pos, macroPair.children));
				}
			}
		}
	}

	return pairsAtPosition;
}

/**
 * Locate all pairs surrounding the position
 */
async function locateSurroundingPair(pos: vscode.Position, doc: vscode.TextDocument): Promise<MacroPair[]> {
	return walkThruForSurroundingPairs(pos, await buildMacroPairTree(doc));
}

/**
 * Locate all pairs at the same depth as the position
 */
async function locatePairsAtDepth(pos: vscode.Position, doc: vscode.TextDocument): Promise<MacroPair[]> {
	return walkThruForPairsNextToPosition(pos, await buildMacroPairTree(doc));
}

/**
 * Go to matching pair command
 * If on \begin, goes to \end. If on \end, goes to \begin.
 */
export async function gotoMatchingPair(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const curPos = editor.selection.active;
	const document = editor.document;
	const macroPairs = await locatePairsAtDepth(curPos, document);

	// First, test if we are on an opening statement
	for (const macroPair of macroPairs) {
		if (macroPair.startContains(curPos) && macroPair.endPosition && macroPair.end) {
			const endStartPosition = macroPair.endPosition.translate(0, -macroPair.end.length);
			editor.selection = new vscode.Selection(endStartPosition, endStartPosition);
			editor.revealRange(new vscode.Range(endStartPosition, endStartPosition));
			return;
		}
	}

	// Second, test if we are on a closing statement
	for (const [index, macroPair] of macroPairs.entries()) {
		if (macroPair.endContains(curPos)) {
			editor.selection = new vscode.Selection(macroPair.startPosition, macroPair.startPosition);

			const contiguousPairs = [macroPair];
			let currentPos = macroPair.startPosition;

			// Locate the chain of contiguous pairs up to here
			for (const previousPair of macroPairs.slice(undefined, index).reverse()) {
				if (previousPair.endContains(currentPos)) {
					currentPos = previousPair.startPosition;
					contiguousPairs.push(previousPair);
				} else {
					break;
				}
			}

			const firstPair = contiguousPairs.pop()!;
			editor.selection = new vscode.Selection(firstPair.startPosition, firstPair.startPosition);
			editor.revealRange(new vscode.Range(firstPair.startPosition, firstPair.startPosition));
			return;
		}
	}
}

/**
 * Select the content or whole environment
 */
export async function selectEnvContent(mode: 'content' | 'whole'): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const startingPos = editor.selection.active;
	const document = editor.document;
	const matchedMacroPairs = await locateSurroundingPair(startingPos, document);

	for (const macroPair of matchedMacroPairs.reverse()) {
		if (macroPair.endPosition && macroPair.end) {
			let startEnvPos: vscode.Position;
			let endEnvPos: vscode.Position;

			if (mode === 'content') {
				startEnvPos = macroPair.startPosition.translate(0, macroPair.start.length);
				endEnvPos = macroPair.endPosition.translate(0, -macroPair.end.length);
			} else {
				startEnvPos = macroPair.startPosition;
				endEnvPos = macroPair.endPosition;
			}

			editor.selections = [new vscode.Selection(startEnvPos, endEnvPos)];
			if (editor.selections[0].contains(startingPos)) {
				return;
			}
		}
	}
}

/**
 * Close the current unclosed environment
 */
export async function closeEnv(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const cursorPos = editor.selection.active;
	const document = editor.document;
	const matchedPairs = (await locateSurroundingPair(cursorPos, document)).filter((macroPair) => !macroPair.endPosition);
	const matchedPair = matchedPairs.at(-1);

	if (!matchedPair) {
		vscode.window.showInformationMessage('No unclosed environment found');
		return;
	}

	const beginStartOfLine = matchedPair.startPosition.with(undefined, 0);
	const beginIndentRange = new vscode.Range(beginStartOfLine, matchedPair.startPosition);
	const beginIndent = editor.document.getText(beginIndentRange);

	const endStartOfLine = cursorPos.with(undefined, 0);
	const endIndentRange = new vscode.Range(endStartOfLine, cursorPos);
	const endIndent = editor.document.getText(endIndentRange);

	// If both \begin and the current position are preceded by
	// whitespace only in their respective lines, mimic the exact
	// kind of indentation of \begin when inserting \end.
	const endEnv = matchedPair.start.replace('\\begin', '\\end');

	if (/^\s*$/.test(beginIndent) && /^\s*$/.test(endIndent)) {
		await editor.edit(editBuilder => {
			editBuilder.replace(new vscode.Range(endStartOfLine, cursorPos), beginIndent + endEnv);
		});
	} else {
		await editor.edit(editBuilder => {
			editBuilder.insert(cursorPos, endEnv);
		});
	}
}

/**
 * Select or add multi-cursor to environment name
 */
export async function selectEnvName(action: 'cursor' | 'selection'): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		return;
	}

	const startingPos = editor.selection.active;
	const document = editor.document;

	// Only keep display math and environments
	const matchedPairs = (await locateSurroundingPair(startingPos, document)).filter((macroPair) => {
		return macroPair.end && macroPair.endPosition && [PairType.DISPLAYMATH, PairType.ENVIRONMENT].includes(macroPair.type);
	});

	const matchedPair = matchedPairs.at(-1);
	if (!matchedPair?.end || !matchedPair?.endPosition) {
		return;
	}

	const beginEnvStartPos = matchedPair.startPosition.translate(0, '\\begin{'.length);
	const endEnvStartPos = matchedPair.endPosition.translate(0, -matchedPair.end.length + '\\end{'.length);

	if (matchedPair.type === PairType.ENVIRONMENT) {
		const envNameLength = matchedPair.start.length - '\\begin{}'.length;

		if (action === 'cursor') {
			editor.selections = [
				new vscode.Selection(beginEnvStartPos, beginEnvStartPos),
				new vscode.Selection(endEnvStartPos, endEnvStartPos)
			];
		} else {
			const beginEnvStopPos = beginEnvStartPos.translate(0, envNameLength);
			const endEnvStopPos = endEnvStartPos.translate(0, envNameLength);
			editor.selections = [
				new vscode.Selection(beginEnvStartPos, beginEnvStopPos),
				new vscode.Selection(endEnvStartPos, endEnvStopPos)
			];
		}
	}
}

/**
 * Register all environment pair commands
 */
export function registerEnvPairCommands(_context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.gotoMatchingPair', gotoMatchingPair)
	);

	disposables.push(
		vscode.commands.registerCommand('latex.selectEnvContent', () => selectEnvContent('content'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.selectEnvWhole', () => selectEnvContent('whole'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.closeEnv', closeEnv)
	);

	disposables.push(
		vscode.commands.registerCommand('latex.selectEnvName', () => selectEnvName('selection'))
	);

	disposables.push(
		vscode.commands.registerCommand('latex.multiCursorEnvName', () => selectEnvName('cursor'))
	);

	return disposables;
}

