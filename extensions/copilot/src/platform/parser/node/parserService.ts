/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { Range } from '../../../vscodeTypes';
import { TextDocumentSnapshot } from '../../editing/common/textDocumentSnapshot';
import { BlockNameDetail, DetailBlock, QueryMatchTree } from './chunkGroupTypes';
import { OverlayNode, TreeSitterExpressionInfo, TreeSitterOffsetRange, TreeSitterPointRange } from './nodes';
import type * as parser from './parserImpl';
import { TestableNode } from './testGenParsing';
import { WASMLanguage } from './treeSitterLanguages';

export const IParserService = createServiceIdentifier<IParserService>('IParserService');

export interface TreeSitterAST {
	/**
	 * Get the positions of all function bodies nodes in the given piece of source code.
	 */
	getFunctionBodies(): Promise<TreeSitterOffsetRange[]>;
	/**
	 * Get the position of the parent scope in the given piece of source code.
	 */
	getCoarseParentScope(range: TreeSitterPointRange): Promise<TreeSitterPointRange>;
	/**
	 * Find the selection of interest for the /fix command
	 */
	getFixSelectionOfInterest(range: TreeSitterPointRange, maxNumberOfLines: number): Promise<TreeSitterPointRange>;
	/**
	 * Get call expression info for all function calls in the given piece of source code.
	 */
	getCallExpressions(selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get function definition info for all function definitions in the given piece of source code.
	 */
	getFunctionDefinitions(): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get the positions of all class references in the given piece of source code.
	 */
	getClassReferences(selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get class declaration info for all class declarations in the given piece of source code.
	 */
	getClassDeclarations(): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get type declaration info for all type declarations in the given piece of source code.
	 */
	getTypeDeclarations(): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get the positions of all type references in the given piece of source code.
	 */
	getTypeReferences(selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * Get all symbol names the appear in a given range. This includes variables, properties, and types.
	 */
	getSymbols(range: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]>;
	/**
	 * @param range The range to document.
	 */
	getDocumentableNodeIfOnIdentifier(range: TreeSitterOffsetRange): Promise<{ identifier: string; nodeRange?: TreeSitterOffsetRange } | undefined>;
	/**
	 * @param range The range to test.
	 */
	getTestableNode(range: TreeSitterOffsetRange): Promise<TestableNode | null>;
	getTestableNodes(): Promise<TestableNode[] | null>;
	/**
	 * Starting from the smallest AST node that wraps `selection` and climbs up the AST until it sees a "documentable" node.
	 * See {@link isDocumentableNode} for definition of a "documentable" node.
	 *
	 * @param range The range to document.
	 * @returns An object containing the smallest node containing the selection range, its parent node, the node to document, and the number of nodes climbed up to reach the documentable node.
	 */
	getNodeToDocument(range: TreeSitterOffsetRange): Promise<parser.NodeToDocumentContext>;
	/**
	 * @param range The range to explain.
	 */
	getNodeToExplain(range: TreeSitterOffsetRange): Promise<parser.NodeToExplainContext | undefined>;
	/**
	 * @param range The range of interest.
	 * @returns All enclosing fine scopes for the {@link range range of interest}.
	 */
	getFineScopes(range: TreeSitterOffsetRange): Promise<TreeSitterOffsetRange[] | undefined>;

	getStructure(): Promise<OverlayNode | undefined>;

	findLastTest(): Promise<TreeSitterOffsetRange | null>;

	/**
	 * Get the number of parse errors in the given piece of source code.
	 */
	getParseErrorCount(): Promise<number>;
}

export interface IParserService {

	readonly _serviceBrand: undefined;

	/**
	 * @returns an AST for the given document OR `undefined` if the document language is not supported
	 */
	getTreeSitterAST(document: { readonly languageId: string; getText(): string }): TreeSitterAST | undefined;

	/**
	 * @returns an AST parsing the source with the given language
	 */
	getTreeSitterASTForWASMLanguage(language: WASMLanguage, source: string): TreeSitterAST;

	/**
	 * Get a `QueryMatchTree` with all of the MatchGroups that semantic chunking needs for its header.
	 */
	getSemanticChunkTree(language: WASMLanguage, source: string): Promise<QueryMatchTree<DetailBlock>>;
	/**
	 * Get a `BlockNameNode` that is the root of a tree of semantic chunk names for a source
	 */
	getSemanticChunkNames(language: WASMLanguage, source: string): Promise<QueryMatchTree<BlockNameDetail>>;

}

export class ParserWorkerTimeoutError extends Error {
	constructor() {
		super('Parser worker call timed out');
		this.name = 'ParserWorkerTimeoutError';
	}
}

export function vscodeToTreeSitterRange(range: vscode.Range): TreeSitterPointRange {
	return {
		startPosition: { row: range.start.line, column: range.start.character },
		endPosition: { row: range.end.line, column: range.end.character }
	};
}

export function treeSitterToVSCodeRange(range: TreeSitterPointRange): Range {
	return new Range(
		range.startPosition.row, range.startPosition.column,
		range.endPosition.row, range.endPosition.column
	);
}

export function vscodeToTreeSitterOffsetRange(range: Range, document: TextDocumentSnapshot): TreeSitterOffsetRange {
	return {
		startIndex: document.offsetAt(range.start),
		endIndex: document.offsetAt(range.end)
	};
}

export function treeSitterOffsetRangeToVSCodeRange(document: TextDocumentSnapshot, range: TreeSitterOffsetRange): vscode.Range {
	return new Range(document.positionAt(range.startIndex), document.positionAt(range.endIndex));
}

export type NodeToDocumentContext = parser.NodeToDocumentContext;
