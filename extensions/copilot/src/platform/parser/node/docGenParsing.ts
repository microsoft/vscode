/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SyntaxNode } from 'web-tree-sitter';
import { Node, TreeSitterOffsetRange } from './nodes';
import { _parse } from './parserWithCaching';
import { _getNodeMatchingSelection } from './selectionParsing';
import { WASMLanguage } from './treeSitterLanguages';
import { extractIdentifier, isDocumentableNode } from './util';


export type NodeToDocumentContext = {

	/** is undefined when we couldn't determine the identifier */
	nodeIdentifier: string | undefined;

	nodeToDocument: Node;

	/**
	 * 'expanding' - selection was expanded to a wrapping node
	 * 'matchingSelection' - node was picked by observing range overlap with the selection
	 */
	nodeSelectionBy: 'expanding' | 'matchingSelection';
};

/**
 * Starting from the smallest AST node that wraps `selection` and climbs up the AST until it sees a "documentable" node.
 * See {@link isDocumentableNode} for definition of a "documentable" node.
 *
 * @param language The language ID of the source code.
 * @param source The source code to parse.
 * @param selection The range to document.
 * @returns An object containing the smallest node containing the selection range, its parent node, the node to document, and the number of nodes climbed up to reach the documentable node.
 * 			Returns undefined if the language ID is not supported.
 */
export async function _getNodeToDocument(
	language: WASMLanguage,
	source: string,
	selection: TreeSitterOffsetRange
): Promise<NodeToDocumentContext> {

	const treeRef = await _parse(language, source);

	try {

		// if selection is non-empty, try identify a documentable AST node that most matches the selection
		// otherwise, try to find the smallest documentable AST node that wraps the selection

		const isSelectionEmpty = selection.startIndex === selection.endIndex;

		const selectionMatchedNode = isSelectionEmpty ? undefined : _getNodeMatchingSelection(treeRef.tree, selection, language);

		if (selectionMatchedNode) {
			const nodeIdentifier = extractIdentifier(selectionMatchedNode, language);
			return {
				nodeIdentifier,
				nodeToDocument: Node.ofSyntaxNode(selectionMatchedNode),
				nodeSelectionBy: 'matchingSelection'
			};
		}

		const nodeContainingCursor = treeRef.tree.rootNode.descendantForIndex(selection.startIndex, selection.endIndex);

		let nodeToDocument: SyntaxNode = nodeContainingCursor;
		let nNodesClimbedUp = 0;

		// ascend the parse tree until we find a declaration/definition (documentable) node or reach the root node
		while (!isDocumentableNode(nodeToDocument, language) && nodeToDocument.parent !== null) {
			nodeToDocument = nodeToDocument.parent;
			++nNodesClimbedUp;
		}

		const nodeIdentifier = extractIdentifier(nodeToDocument, language);
		return {
			nodeIdentifier,
			nodeToDocument: Node.ofSyntaxNode(nodeToDocument),
			nodeSelectionBy: 'expanding',
		};
	} finally {
		treeRef.dispose();
	}
}

export async function _getDocumentableNodeIfOnIdentifier(
	language: WASMLanguage,
	source: string,
	range: TreeSitterOffsetRange
): Promise<{ identifier: string; nodeRange?: TreeSitterOffsetRange } | undefined> {
	const treeRef = await _parse(language, source);
	try {

		const smallestNodeContainingRange = treeRef.tree.rootNode.descendantForIndex(range.startIndex, range.endIndex);

		if (smallestNodeContainingRange.type.match(/identifier/) &&
			(smallestNodeContainingRange.parent === null || isDocumentableNode(smallestNodeContainingRange.parent, language))
		) {
			const parent = smallestNodeContainingRange.parent;

			const parentNodeRange = parent === null
				? undefined
				: { startIndex: parent.startIndex, endIndex: parent.endIndex };

			return {
				identifier: smallestNodeContainingRange.text,
				nodeRange: parentNodeRange
			};
		}
	} finally {
		treeRef.dispose();
	}
}
