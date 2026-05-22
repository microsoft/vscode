/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { QueryCapture } from 'web-tree-sitter';
import { uniqueFilter } from '../../../util/vs/base/common/arrays';
import { assertType } from '../../../util/vs/base/common/types';
import { Node, TreeSitterOffsetRange } from './nodes';
import { _parse } from './parserWithCaching';
import { runQueries } from './querying';
import { WASMLanguage } from './treeSitterLanguages';
import { testableNodeQueries, testInSuiteQueries } from './treeSitterQueries';

export type TestableNode = {
	identifier: {
		name: string;
		range: TreeSitterOffsetRange;
	};
	node: Node;
};


export async function _getTestableNode(
	language: WASMLanguage,
	source: string,
	range: TreeSitterOffsetRange
): Promise<TestableNode | null> {
	const treeRef = await _parse(language, source);

	try {
		const queryCaptures = runQueries(
			testableNodeQueries[language],
			treeRef.tree.rootNode
		).flatMap(({ captures }) => captures); // @ulugbekna: keep in mind: there's duplication of captures

		const symbolKindToIdents = new Map<string, QueryCapture[]>();

		for (const capture of queryCaptures) {
			const [symbolKind, name] = capture.name.split('.');
			if (name !== 'identifier') {
				continue;
			}

			const idents = symbolKindToIdents.get(symbolKind) || [];
			idents.push(capture);
			symbolKindToIdents.set(symbolKind, idents);
		}

		let minimalTestableNode: TestableNode | null = null;

		for (const capture of queryCaptures) {
			const [symbolKind, name] = capture.name.split('.');

			if (name !== undefined || // ensure we traverse only declarations (and child nodes such as `method.identifier` or `method.accessibility_modifier`)
				!TreeSitterOffsetRange.doesContain(capture.node, range) // ensure this declaration contains our range of interest
			) {
				continue;
			}

			// ensure we pick range-wise minimal testable node
			if (minimalTestableNode !== null &&
				TreeSitterOffsetRange.len(minimalTestableNode.node) < TreeSitterOffsetRange.len(capture.node)
			) {
				continue;
			}

			const idents = symbolKindToIdents.get(symbolKind);

			assertType(idents !== undefined, `must have seen identifier for symbol kind '${symbolKind}' (lang: ${language})`);

			const nodeIdent = idents.find(ident => TreeSitterOffsetRange.doesContain(capture.node, ident.node));

			assertType(nodeIdent !== undefined, `must have seen identifier for symbol '${symbolKind}' (lang: ${language})`);

			minimalTestableNode = {
				identifier: {
					name: nodeIdent.node.text,
					range: TreeSitterOffsetRange.ofSyntaxNode(nodeIdent.node),
				},
				node: Node.ofSyntaxNode(capture.node),
			};
		}

		return minimalTestableNode;

	} catch (e) {
		console.error('getTestableNode: Unexpected error', e);
		return null;
	} finally {
		treeRef.dispose();
	}
}

export async function _getTestableNodes(
	language: WASMLanguage,
	source: string,
): Promise<TestableNode[] | null> {
	const treeRef = await _parse(language, source);

	try {
		const queryCaptures = runQueries(
			testableNodeQueries[language],
			treeRef.tree.rootNode
		)
			.flatMap(({ captures }) => captures)
			.filter(uniqueFilter((c: QueryCapture) => [c.node.startIndex, c.node.endIndex].toString()));

		const symbolKindToIdents = new Map<string, QueryCapture[]>();

		for (const capture of queryCaptures) {
			const [symbolKind, name] = capture.name.split('.');
			if (name !== 'identifier') {
				continue;
			}

			const idents = symbolKindToIdents.get(symbolKind) || [];
			idents.push(capture);
			symbolKindToIdents.set(symbolKind, idents);
		}

		const testableNodes: TestableNode[] = [];

		for (const capture of queryCaptures) {
			if (capture.name.includes('.')) {
				continue;
			}

			const symbolKind = capture.name;

			const idents = symbolKindToIdents.get(symbolKind);

			assertType(idents !== undefined, `must have seen identifier for symbol kind '${symbolKind}' (lang: ${language})`);

			const nodeIdent = idents.find(ident => TreeSitterOffsetRange.doesContain(capture.node, ident.node));

			assertType(nodeIdent !== undefined, `must have seen identifier for symbol '${symbolKind}' (lang: ${language})`);

			testableNodes.push({
				identifier: {
					name: nodeIdent.node.text,
					range: TreeSitterOffsetRange.ofSyntaxNode(nodeIdent.node),
				},
				node: Node.ofSyntaxNode(capture.node),
			});
		}

		return testableNodes;

	} catch (e) {
		console.error('getTestableNodes: Unexpected error', e);
		return null;
	} finally {
		treeRef.dispose();
	}
}

export async function _findLastTest(lang: WASMLanguage, src: string): Promise<TreeSitterOffsetRange | null> {

	const treeRef = await _parse(lang, src);

	try {
		const queryResults = runQueries(testInSuiteQueries[lang], treeRef.tree.rootNode);

		const captures = queryResults
			.flatMap(e => e.captures).sort((a, b) => a.node.endIndex - b.node.endIndex)
			.filter(c => c.name === 'test');

		if (captures.length === 0) {
			return null;
		}

		const lastTest = captures[captures.length - 1].node;

		return {
			startIndex: lastTest.startIndex,
			endIndex: lastTest.endIndex
		};
	} finally {
		treeRef.dispose();
	}
}
