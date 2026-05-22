/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findInsertionIndexInSortedArray } from '../../../util/common/arrays';
import { BlockNameDetail, DetailBlock, GenericDetail, MatchGroup, PythonDetail, QueryMatchTree } from './chunkGroupTypes';
import { Node, OverlayNode, TreeSitterChunkHeaderInfo, TreeSitterExpressionInfo, TreeSitterOffsetRange, TreeSitterPoint, TreeSitterPointRange } from './nodes';
import { _parse } from './parserWithCaching';
import { runQueries } from './querying';
import { _getNodeMatchingSelection } from './selectionParsing';
import { structureComputer } from './structure';
import { WASMLanguage } from './treeSitterLanguages';
import { _isFineScope, _isScope, _isStatement, callExpressionQuery, classDeclarationQuery, classReferenceQuery, coarseScopesQuery, functionQuery, semanticChunkingTargetQuery, symbolQueries, typeDeclarationQuery, typeReferenceQuery } from './treeSitterQueries';
import { extractIdentifier } from './util';
import Parser = require('web-tree-sitter');

export { _getDocumentableNodeIfOnIdentifier, _getNodeToDocument, NodeToDocumentContext } from './docGenParsing';
export { _dispose } from './parserWithCaching';
export { _getNodeMatchingSelection } from './selectionParsing';
export { _findLastTest, _getTestableNode, _getTestableNodes } from './testGenParsing';

function queryCoarseScopes(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = coarseScopesQuery[language];
	return runQueries(queries, root);
}

function queryFunctions(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = functionQuery[language];
	return runQueries(queries, root);
}

function queryCallExpressions(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = callExpressionQuery[language];
	if (!queries) {
		return [];
	}
	return runQueries(queries, root);
}

function queryClasses(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = classDeclarationQuery[language];
	if (!queries) {
		return [];
	}
	return runQueries(queries, root);
}

function queryTypeDeclarations(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = typeDeclarationQuery[language];
	if (!queries) {
		return [];
	}
	return runQueries(queries, root);
}

function queryTypeReferences(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = typeReferenceQuery[language];
	if (!queries) {
		return [];
	}
	return runQueries(queries, root);
}

function queryClassReferences(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = classReferenceQuery[language];
	if (!queries) {
		return [];
	}
	return runQueries(queries, root);
}

function querySemanticTargets(language: WASMLanguage, root: Parser.SyntaxNode): Parser.QueryMatch[] {
	const queries = semanticChunkingTargetQuery[language];
	return runQueries(queries, root);
}


/**
 * Get the positions of all function calls in the given piece of source code.
 */
export async function _getCallExpressions(language: WASMLanguage, source: string, selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryCallExpressions(language, treeRef.tree.rootNode);
		const positions = results.reduce<TreeSitterExpressionInfo[]>((acc, res) => {
			const fn = res.captures.find(c => c.name === 'call_expression')!.node;
			if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
				let identifier;
				let identifierNode;
				if (language === 'ruby') { // strip preceding : from any captured simple symbols
					identifierNode = res.captures.find(c => c.name === 'symbol')?.node;
					identifier = identifierNode?.text?.slice(1);
				}
				identifierNode ??= res.captures.find(c => c.name === 'identifier')?.node;
				identifier ??= identifierNode?.text;
				acc.push({
					identifier: identifier ?? '',
					text: fn.text,
					startIndex: (identifierNode ?? fn).startIndex,
					endIndex: (identifierNode ?? fn).endIndex,
				});
			}
			return acc;
		}, []);
		return positions;
	} finally {
		treeRef.dispose();
	}
}

/**
 * Get function definition info for all function definitions in the given piece of source code.
 */
export async function _getFunctionDefinitions(language: WASMLanguage, source: string): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryFunctions(language, treeRef.tree.rootNode);
		const positions = results.map(res => {
			const fn = res.captures.find(c => c.name === 'function')!.node;
			const identifier = res.captures.find(c => c.name === 'identifier')?.node.text;
			return {
				identifier: identifier ?? '',
				text: fn.text,
				startIndex: fn.startIndex,
				endIndex: fn.endIndex,
			};
		});
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getClassDeclarations(language: WASMLanguage, source: string): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryClasses(language, treeRef.tree.rootNode);
		const positions = results.map(res => {
			const fn = res.captures.find(c => c.name === 'class_declaration')!.node;
			const identifier = fn?.children.find(c =>
				c.type === 'type_identifier' // typescript
				|| c.type === 'identifier' // python
				|| c.type === 'constant' // ruby
			)?.text;
			return {
				identifier: identifier ?? '',
				text: fn.text,
				startIndex: fn.startIndex,
				endIndex: fn.endIndex,
			};
		});
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getTypeDeclarations(language: WASMLanguage, source: string): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryTypeDeclarations(language, treeRef.tree.rootNode);
		const positions = results.map(res => {
			const fn = res.captures.find(c => c.name === 'type_declaration')!.node;
			let identifier = res.captures.find(c => c.name === 'type_identifier')?.node.text;
			if (!identifier) { // TODO@joyceerhl debt: move this into query captures
				identifier = fn?.children.find(c => c.type === 'type_identifier')?.text;
			}
			return {
				identifier: identifier ?? '',
				text: fn.text,
				startIndex: fn.startIndex,
				endIndex: fn.endIndex,
			};
		});
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getTypeReferences(language: WASMLanguage, source: string, selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryTypeReferences(language, treeRef.tree.rootNode);
		const positions = results.reduce((acc: TreeSitterExpressionInfo[], res: Parser.QueryMatch) => {
			const typeIdentifier = res.captures.find(c => c.name === 'type_identifier')!.node;
			if (TreeSitterOffsetRange.doIntersect(selection, typeIdentifier)) {
				acc.push({
					identifier: typeIdentifier.text,
					text: typeIdentifier.text,
					startIndex: typeIdentifier.startIndex,
					endIndex: typeIdentifier.endIndex,
				});
			}
			return acc;
		}, []);
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getClassReferences(language: WASMLanguage, source: string, selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryClassReferences(language, treeRef.tree.rootNode);
		const positions = results.reduce((acc: TreeSitterExpressionInfo[], res: Parser.QueryMatch) => {
			const fn = res.captures.find(c => c.name === 'new_expression')!.node;
			if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
				acc.push({
					identifier: fn.text,
					text: fn.text,
					startIndex: fn.startIndex,
					endIndex: fn.endIndex,
				});
			}
			return acc;
		}, []);
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getSymbols(language: WASMLanguage, source: string, selection: TreeSitterOffsetRange): Promise<TreeSitterExpressionInfo[]> {
	const treeRef = await _parse(language, source);
	try {
		const queries = symbolQueries[language];
		const results = runQueries(queries, treeRef.tree.rootNode);
		const positions = results.reduce((acc: TreeSitterExpressionInfo[], res: Parser.QueryMatch) => {
			const fn = res.captures.find(c => c.name === 'symbol')!.node;
			if (TreeSitterOffsetRange.doIntersect(selection, fn)) {
				acc.push({
					identifier: fn.text,
					text: fn.text,
					startIndex: fn.startIndex,
					endIndex: fn.endIndex,
				});
			}
			return acc;
		}, []);
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getSemanticChunkTree(language: WASMLanguage, source: string): Promise<QueryMatchTree<DetailBlock>> {
	const treeRef = await _parse(language, source);
	try {
		const results = querySemanticTargets(language, treeRef.tree.rootNode);
		return getQueryMatchTree(language, results, treeRef.tree.rootNode);
	} finally {
		treeRef.dispose();
	}
}

export async function _getSemanticChunkNames(language: WASMLanguage, source: string): Promise<QueryMatchTree<BlockNameDetail>> {
	const treeRef = await _parse(language, source);
	try {
		const results = querySemanticTargets(language, treeRef.tree.rootNode);
		return getBlockNameTree(language, results, treeRef.tree.rootNode);
	} finally {
		treeRef.dispose();
	}
}


/**
 * Get the positions of all function bodies nodes in the given piece of source code.
 */
export async function _getFunctionBodies(language: WASMLanguage, source: string): Promise<TreeSitterOffsetRange[]> {
	const treeRef = await _parse(language, source);
	try {
		const results = queryFunctions(language, treeRef.tree.rootNode);
		const positions = results.map(res => {
			const fn = res.captures.find(c => c.name === 'body')!.node;
			return {
				startIndex: fn.startIndex,
				endIndex: fn.endIndex,
			};
		});
		return positions;
	} finally {
		treeRef.dispose();
	}
}

export async function _getCoarseParentScope(language: WASMLanguage, source: string, range: TreeSitterPointRange): Promise<TreeSitterPointRange> {
	const treeRef = await _parse(language, source);
	try {
		const scopes = queryCoarseScopes(language, treeRef.tree.rootNode);
		let parentNode: Parser.SyntaxNode | undefined;
		for (const scope of scopes) {
			const captureNode = scope.captures[0].node;
			const captureNodeRange = TreeSitterPointRange.ofSyntaxNode(captureNode);
			if (TreeSitterPointRange.doesContain(captureNodeRange, range)) {
				parentNode = captureNode;
			}
			if (TreeSitterPoint.isBefore(range.endPosition, captureNodeRange.startPosition)) {
				break;
			}
		}
		if (!parentNode) {
			throw new Error('No parent node found');
		} else {
			return TreeSitterPointRange.ofSyntaxNode(parentNode);
		}
	} finally {
		treeRef.dispose();
	}
}

/**
 * Find the selection of interest for the /fix command
 */
export async function _getFixSelectionOfInterest(language: WASMLanguage, source: string, range: TreeSitterPointRange, maxNumberOfLines: number): Promise<TreeSitterPointRange> {
	const treeRef = await _parse(language, source);
	try {
		const smallestNode = treeRef.tree.rootNode.descendantForPosition(range.startPosition, range.endPosition);
		const initialRange = { startPosition: smallestNode.startPosition, endPosition: smallestNode.endPosition };
		const biggestRange = _getBiggestRangeContainingNodeSmallerThan(language, smallestNode, maxNumberOfLines, range, true);
		if (TreeSitterPointRange.equals(initialRange, biggestRange)) {
			return _getSmallestRangeContainingNode(language, smallestNode);
		}
		return biggestRange;
	} finally {
		treeRef.dispose();
	}
}

/**
 * Find the smallest range containing the node
 */
function _getSmallestRangeContainingNode(language: WASMLanguage, node: Parser.SyntaxNode): TreeSitterPointRange {
	const parent = node.parent;
	const range = { startPosition: node.startPosition, endPosition: node.endPosition };
	if (_isScope(language, node) || !parent) {
		return range;
	}
	const { filteredRanges, indexOfInterest } = _findFilteredRangesAndIndexOfInterest(language, parent.children, range, false);
	if (indexOfInterest - 1 >= 0 && indexOfInterest + 1 <= filteredRanges.length - 1) {
		const siblingAbove = filteredRanges[indexOfInterest - 1];
		const siblingBelow = filteredRanges[indexOfInterest + 1];
		return { startPosition: siblingAbove.startPosition, endPosition: siblingBelow.endPosition };
	}
	return _getSmallestRangeContainingNode(language, parent);
}

/**
 * Get the biggest range containing the node of length smaller than the max number of lines
 */
function _getBiggestRangeContainingNodeSmallerThan(language: WASMLanguage, node: Parser.SyntaxNode, maxNumberOfLines: number, range: TreeSitterPointRange, firstCall: boolean): TreeSitterPointRange {
	const children = node.children;
	const lengthSpannedByNode = node.endPosition.row - node.startPosition.row + 1;
	if (lengthSpannedByNode <= maxNumberOfLines) {
		const newRange = _isScope(language, node) ?
			{ startPosition: node.startPosition, endPosition: node.endPosition } :
			_getBiggestRangeContainingNodeAmongNodesSmallerThan(language, children, maxNumberOfLines, range, firstCall);
		const parent = node.parent;
		return parent ? _getBiggestRangeContainingNodeSmallerThan(language, parent, maxNumberOfLines, newRange, false) : newRange;
	}
	return _getBiggestRangeContainingNodeAmongNodesSmallerThan(language, children, maxNumberOfLines, range, firstCall);
}

function _numberOfLinesSpannedByRanges(range1: TreeSitterPointRange, range2: TreeSitterPointRange) {
	return range2.endPosition.row - range1.startPosition.row + 1;
}

/**
 * Search the nodes and find the biggest range made of statements or scopes that surrounds the range
 */
function _getBiggestRangeContainingNodeAmongNodesSmallerThan(language: WASMLanguage, nodes: Parser.SyntaxNode[], maxNumberOfLines: number, lastRange: TreeSitterPointRange, firstCall: boolean): TreeSitterPointRange {
	if (nodes.length === 0) {
		return lastRange;
	}
	const { filteredRanges, indexOfInterest } = _findFilteredRangesAndIndexOfInterest(language, nodes, lastRange, firstCall);
	let siblingAboveIndex = 0;
	let siblingBelowIndex = filteredRanges.length - 1;
	let siblingAbove = filteredRanges[siblingAboveIndex];
	let siblingBelow = filteredRanges[siblingBelowIndex];

	while (_numberOfLinesSpannedByRanges(siblingAbove, siblingBelow) > maxNumberOfLines) {
		if (siblingAboveIndex === siblingBelowIndex) {
			// The two indices are equal to the insertion index
			break;
		} else if (indexOfInterest - siblingAboveIndex < siblingBelowIndex - indexOfInterest) {
			siblingBelowIndex--;
			siblingBelow = filteredRanges[siblingBelowIndex];
		} else {
			siblingAboveIndex++;
			siblingAbove = filteredRanges[siblingAboveIndex];
		}
	}
	if (_numberOfLinesSpannedByRanges(siblingAbove, siblingBelow) <= maxNumberOfLines) {
		return { startPosition: siblingAbove.startPosition, endPosition: siblingBelow.endPosition };
	}
	return lastRange;
}

/**
 * Filter the nodes that are scopes or statements and find the index of the node containing the given range, or append the range to the array
 */
function _findFilteredRangesAndIndexOfInterest(language: WASMLanguage, nodes: Parser.SyntaxNode[], range: TreeSitterPointRange, firstCall: boolean): { filteredRanges: TreeSitterPointRange[]; indexOfInterest: number } {
	let filteredRanges: TreeSitterPointRange[];
	let indexOfInterest: number;
	if (firstCall) {
		filteredRanges = nodes.filter((child) => _isScope(language, child) || _isStatement(language, child));
		indexOfInterest = findInsertionIndexInSortedArray(filteredRanges, range, (a, b) => TreeSitterPoint.isBefore(a.startPosition, b.startPosition));
		filteredRanges.splice(indexOfInterest, 0, range);
	} else {
		filteredRanges = nodes.filter((child) => TreeSitterPointRange.doesContain(child, range) || _isScope(language, child) || _isStatement(language, child));
		indexOfInterest = filteredRanges.findIndex(child => TreeSitterPointRange.doesContain(child, range));
	}
	if (indexOfInterest === -1) {
		throw new Error(`Valid index not found`);
	}
	return { filteredRanges, indexOfInterest };
}

export async function _getFineScopes(language: WASMLanguage, source: string, selection: TreeSitterOffsetRange): Promise<TreeSitterOffsetRange[]> {
	const blockScopes: TreeSitterOffsetRange[] = [];

	const treeRef = await _parse(language, source);
	const syntaxNode = treeRef.tree.rootNode.descendantForIndex(selection.startIndex, selection.endIndex);
	let currentNode: Parser.SyntaxNode | null = syntaxNode;

	// Ascend the parse tree until we reach the root node, collecting all block scopes that intersect with the provided selection
	while (currentNode !== null) {
		if (_isFineScope(language, currentNode)) {
			blockScopes.push({ startIndex: currentNode.startIndex, endIndex: currentNode.endIndex });
		}
		currentNode = currentNode.parent;
	}

	return blockScopes;
}

export type NodeToExplainContext = {

	/** is undefined when we couldn't determine the identifier */
	nodeIdentifier: string | undefined;

	nodeToExplain: Node;
};

/**
 *
 * Given a selection around an identifier, returns the definition node.
 */
export async function _getNodeToExplain(
	language: WASMLanguage,
	source: string,
	selection: TreeSitterOffsetRange
): Promise<NodeToExplainContext | undefined> {

	const treeRef = await _parse(language, source);

	try {
		const isSelectionEmpty = selection.startIndex === selection.endIndex;
		if (isSelectionEmpty) {
			return;
		}

		const identifier = isSelectionEmpty ? undefined : _getNodeMatchingSelection(treeRef.tree, selection, language);
		const fullDefinition = isSelectionEmpty ? undefined : _getNodeMatchingSelection(treeRef.tree, selection, language, isExplainableNode);

		if (fullDefinition && identifier) {
			const nodeIdentifier = extractIdentifier(identifier, language);
			return {
				nodeIdentifier,
				nodeToExplain: Node.ofSyntaxNode(fullDefinition),
			};
		}
	} finally {
		treeRef.dispose();
	}
}

function isExplainableNode(node: Parser.SyntaxNode, language: WASMLanguage) {
	return node.type.match(/definition/);
}

export function getBlockNameTree(language: WASMLanguage, queryMatches: Parser.QueryMatch[], root: Parser.SyntaxNode): QueryMatchTree<BlockNameDetail> {
	const matches: Map<number, MatchGroup<BlockNameDetail>> = new Map(); // map nodes to their starting position to ensure that we get rid of duplicates
	queryMatches.forEach(n => {
		const captures = n.captures;

		let definitionNode = captures.find(v => v.name === 'definition')?.node;

		let keyword;
		if (language === WASMLanguage.Cpp && definitionNode?.type === 'function_definition') {
			keyword = definitionNode?.childForFieldName('declarator')?.childForFieldName('declarator');
		} else if (language === WASMLanguage.Rust && definitionNode?.type === 'impl_item') {
			keyword = definitionNode?.childForFieldName('trait');
		} else {
			keyword = definitionNode?.childForFieldName('name');
		}
		const bodyNode = definitionNode?.childForFieldName('body');
		if (definitionNode && bodyNode) {

			switch (language) {
				case WASMLanguage.TypeScript:
				case WASMLanguage.JavaScript: {
					const { definition } = getCommentsAndDefFromTSJSDefinition(definitionNode);
					definitionNode = definition;
					break;
				}
			}
			const existingMatch = matches.get(definitionNode.id);
			if (!existingMatch) {
				matches.set(definitionNode.id, {
					mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
					detailBlocks: {
						body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode),
						name: keyword?.text,
					},
				});
			}
		}
	});
	const groups = Array.from(matches.values());

	return new QueryMatchTree(groups, TreeSitterChunkHeaderInfo.ofSyntaxNode(root));
}



/**
 * helper workspace chunker functions
 */

function getQueryMatchTree(language: WASMLanguage, queryMatches: Parser.QueryMatch[], root: Parser.SyntaxNode): QueryMatchTree<DetailBlock> {
	let groups: MatchGroup<DetailBlock>[];

	switch (language) {
		case WASMLanguage.Python:
			groups = queryCapturesToPythonSemanticGroup(queryMatches);
			break;
		case WASMLanguage.Ruby:
			groups = queryCapturesToRubySemanticGroup(queryMatches);
			break;
		default: {
			groups = queryCapturesToGenericSemanticGroup(queryMatches, language);
			break;
		}
	}

	const queryTree = new QueryMatchTree(groups, TreeSitterChunkHeaderInfo.ofSyntaxNode(root));

	return queryTree;
}

function queryCapturesToGenericSemanticGroup(queryMatches: Parser.QueryMatch[], wasmLang: WASMLanguage): MatchGroup<GenericDetail>[] {
	const matches: Map<number, MatchGroup<GenericDetail>> = new Map(); // map nodes to their starting position to ensure that we get rid of duplicates

	queryMatches
		.forEach(n => {
			const captures = n.captures;

			let definitionNode = captures.find(v => v.name === 'definition')?.node;

			const bodyNode = definitionNode?.childForFieldName('body');
			if (definitionNode && bodyNode) {

				let commentNodes;
				switch (wasmLang) {
					case WASMLanguage.TypeScript:
					case WASMLanguage.JavaScript: {
						const { definition, comments } = getCommentsAndDefFromTSJSDefinition(definitionNode);
						definitionNode = definition;
						commentNodes = comments;
						break;
					}
					case WASMLanguage.Java:
					case WASMLanguage.Rust:
						commentNodes = getCommentsFromJavaRustDefinition(definitionNode);
						break;
					default: {
						commentNodes = getCommentsFromDefinition(definitionNode);
						break;
					}
				}
				const existingMatch = matches.get(definitionNode.id);
				if (!existingMatch) {
					matches.set(definitionNode.id, {
						mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
						detailBlocks: {
							comments: commentNodes.map(e => TreeSitterChunkHeaderInfo.ofSyntaxNode(e)),
							body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode)
						},
					});
				}
			}
		});

	return Array.from(matches.values());
}

function getFirstBodyParamForRuby(namedNodes: Parser.SyntaxNode[]) {
	// the children must have at least 2 nodes. The second node is the first potential body node, since the first is the identifier.

	if (namedNodes.length < 2) {
		return undefined;
	}
	for (let i = 1; i < namedNodes.length; i++) {
		const node = namedNodes[i];
		if (!node.type.includes('parameters')) {
			return node;
		}
	}

	return undefined;
}

function queryCapturesToRubySemanticGroup(queryMatches: Parser.QueryMatch[]): MatchGroup<GenericDetail>[] {
	const matches: Map<number, MatchGroup<GenericDetail>> = new Map(); // map nodes to their starting position to ensure that we get rid of duplicates
	queryMatches
		.forEach(n => {
			const captures = n.captures;

			const definitionNode = captures.find(v => v.name === 'definition')?.node;
			if (definitionNode) {
				const defChildren = definitionNode.namedChildren;
				const startChild = getFirstBodyParamForRuby(defChildren);
				if (startChild) {
					const endChild = defChildren[defChildren.length - 1];
					const childText = definitionNode.text.substring(startChild.startIndex - definitionNode.startIndex, endChild.endIndex - definitionNode.startIndex);

					const commentNodes = getCommentsFromDefinition(definitionNode);
					const existingMatch = matches.get(definitionNode.id);
					if (!existingMatch) {
						matches.set(definitionNode.id, {
							mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
							detailBlocks: {
								comments: commentNodes.map(e => TreeSitterChunkHeaderInfo.ofSyntaxNode(e)),
								body: {
									range: <TreeSitterPointRange>{
										startPosition: { row: startChild.startPosition.row, column: startChild.startPosition.column },
										endPosition: { row: endChild.endPosition.row, column: endChild.endPosition.column }
									},
									startIndex: startChild.startIndex,
									text: childText,
									endIndex: endChild.endIndex,
								}
							},
						});
					}
				}
			}
		});

	return Array.from(matches.values());
}

function queryCapturesToPythonSemanticGroup(queryMatches: Parser.QueryMatch[]): MatchGroup<PythonDetail>[] {
	const matches: Map<number, MatchGroup<PythonDetail>> = new Map(); // map nodes to their starting position to ensure that we get rid of duplicates

	queryMatches
		.forEach(n => {
			const captures = n.captures;
			const definitionNode = captures.find(v => v.name === 'definition')?.node;
			const bodyNode = definitionNode?.childForFieldName('body');

			if (definitionNode && bodyNode) {
				const docstringNode = getDocstringFromBody(bodyNode);
				const decoratorNode = getDecoratorFromDefinition(definitionNode);
				matches.set(definitionNode.id, {
					mainBlock: TreeSitterChunkHeaderInfo.ofSyntaxNode(definitionNode),
					detailBlocks: {
						docstring: docstringNode ? TreeSitterChunkHeaderInfo.ofSyntaxNode(docstringNode) : undefined,
						decorator: decoratorNode ? TreeSitterChunkHeaderInfo.ofSyntaxNode(decoratorNode) : undefined,
						body: TreeSitterChunkHeaderInfo.ofSyntaxNode(bodyNode),
					},
				});
				return;
			}
		});

	return Array.from(matches.values());
}

/**
 * For Generic (Cpp/Cs/Go) workspace chunks
 */
function getCommentsFromDefinition(definition: Parser.SyntaxNode, commentNodeNames = ['comment']): Parser.SyntaxNode[] {

	// there is an issue where the query sometimes returns comments that are at the beginning of the file
	// instead of one that actually close to the declaration.
	// Therefore, we should programatically find comments for more reliability
	const ret: Parser.SyntaxNode[] = [];
	let prevSibling = definition.previousNamedSibling;
	while (prevSibling && commentNodeNames.some(e => e === prevSibling?.type)) {
		ret.push(prevSibling);
		prevSibling = prevSibling.previousNamedSibling;
	}
	return ret.reverse();
}

/**
 * For TS/JS workspace chunks
 */
function getCommentsAndDefFromTSJSDefinition(definition: Parser.SyntaxNode): {
	definition: Parser.SyntaxNode;
	comments: Parser.SyntaxNode[];
} {
	const parent = definition.parent;
	if (parent?.type === 'export_statement') {
		return {
			definition: parent,
			comments: getCommentsFromDefinition(parent)
		};
	}

	return {
		definition: definition,
		comments: getCommentsFromDefinition(definition)
	};
}

/**
 * For Java workspace chunks
 */
function getCommentsFromJavaRustDefinition(definition: Parser.SyntaxNode): Parser.SyntaxNode[] {
	return getCommentsFromDefinition(definition, ['block_comment', 'line_comment']);
}


/**
 * For Python workspace chunks
 */
function getDecoratorFromDefinition(definition: Parser.SyntaxNode) {
	const prevSibling = definition.previousNamedSibling;
	return prevSibling?.type === 'decorator' ? prevSibling : undefined;
}

function getDocstringFromBody(body: Parser.SyntaxNode) {
	const firstChild = body.firstChild;
	if (!firstChild || firstChild.type !== 'expression_statement') {
		return;
	}

	const potentialDocstring = firstChild.firstChild;
	return potentialDocstring?.type === 'string' ? potentialDocstring : undefined;
}

export function _getStructure(lang: WASMLanguage, source: string): Promise<OverlayNode | undefined> {
	return structureComputer.getStructure(lang, source);
}

export async function _getParseErrorCount(language: WASMLanguage, source: string): Promise<number> {
	const treeRef = await _parse(language, source);
	try {
		if (!treeRef.tree.rootNode.hasError) {
			return 0;
		}

		// Recursively count error nodes
		function countErrors(node: Parser.SyntaxNode): number {
			let count = node.type === 'ERROR' ? 1 : 0;
			for (const child of node.children) {
				count += countErrors(child);
			}
			return count;
		}

		return countErrors(treeRef.tree.rootNode);
	} finally {
		treeRef.dispose();
	}
}
