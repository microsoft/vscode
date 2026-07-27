/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyntaxNode, Tree } from 'web-tree-sitter';
import { max } from '../../../util/common/arrays';
import { TreeSitterOffsetRange } from './nodes';
import { WASMLanguage } from './treeSitterLanguages';
import { isDocumentableNode } from './util';

/**
 * This function is used to find the most relevant node to document in a parse tree.
 * It traverses the parse tree and keeps track of documentable nodes that could be used to generate documentation.
 * The relevance of a node is determined by its intersection with a given range (containerRange).
 * The function rewards nodes for which the overlap size constitutes a large part of the node and penalizes nodes for non-overlapping range.
 *
 * @remarks Exported for testing purposes only.
 *
 * @param parseTree - The parse tree to search for the most relevant node.
 * @param containerRange - The range to intersect with the nodes of the parse tree.
 * @param language - The language identifier used to determine if a node is documentable.
 * @returns The most relevant node to document or undefined if no such node is found.
 */
export function _getNodeMatchingSelection(parseTree: Tree, containerRange: TreeSitterOffsetRange, language: WASMLanguage, match: (node: SyntaxNode, language: WASMLanguage) => RegExpMatchArray | null = isDocumentableNode): SyntaxNode | undefined {

	// nodes to explore
	let frontier = [parseTree.rootNode];

	// keeps documentable nodes that could be used to generate documentation for
	const documentableNodes: [SyntaxNode, /* weight (higher better) */ number][] = [];

	while (true) {
		// nodes that intersect with `containerRange`
		const candidates = frontier
			.map((node): [SyntaxNode, number] => [node, TreeSitterOffsetRange.intersectionSize(node, containerRange)])
			.filter(([_, s]) => s > 0)
			.sort(([_, s0], [__, s1]) => s1 - s0);

		if (candidates.length === 0) {
			return documentableNodes.length === 0
				? undefined
				: max(documentableNodes, ([_, s0], [__, s1]) => s0 - s1)![0];
		} else {
			const reweighedCandidates = candidates
				.map(([n, overlapSize]): [SyntaxNode, number] => {
					const nLen = TreeSitterOffsetRange.len(n);
					const nonOverlappingSize = Math.abs(TreeSitterOffsetRange.len(containerRange) - overlapSize);
					// reward overlap size but penalize for non-overlapping range
					const penalizedWeigth = overlapSize - nonOverlappingSize;
					const normalizedPenalizedWeight = penalizedWeigth / nLen;
					return [n, normalizedPenalizedWeight];
				});

			documentableNodes.push(...reweighedCandidates.filter(([node, _]) => match(node, language)));

			frontier = [];
			frontier.push(...reweighedCandidates.flatMap(([n, s]) => n.children));
		}
	}
}
