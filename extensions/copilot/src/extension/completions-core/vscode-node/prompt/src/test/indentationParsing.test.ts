/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import dedent from 'ts-dedent';
import {
	blankNode,
	buildLabelRules,
	combineClosersAndOpeners,
	flattenVirtual,
	groupBlocks,
	IndentationSubTree,
	IndentationTree,
	isLine,
	isVirtual,
	labelLines,
	lineNode,
	parseRaw,
	parseTree,
	topNode,
	VirtualNode,
	virtualNode,
	visitTree,
} from '../indentation';
import { compareTreeWithSpec } from './testHelpers';

/**
 * Parse a tree according to indentation, where lines
 * with content "-> virtual" are translated into virtual nodes
 * E.g.
 * A
 *   -> virtual
 *      B
 *      C
 * Will be parsed as: A having a virtual child, whose children are B and C
 * @param sourceParsedAsIf
 * @returns
 */
function parseAsIfVirtual(sourceParsedAsIf: string) {
	const treeExpected = parseRaw(sourceParsedAsIf);
	visitTree(
		treeExpected,
		node => {
			if (isLine(node) && node.sourceLine.trim() === '-> virtual') {
				node = node as unknown as VirtualNode<never>;
				node.type = 'virtual';
			}
		},
		'topDown'
	);
	return treeExpected;
}

suite('Test core parsing elements', function () {
	test('flattenVirtual 1', function () {
		const before = topNode([virtualNode(0, []), virtualNode(0, [lineNode(0, 0, 'lonely node', [])])]);
		const after = topNode([lineNode(0, 0, 'lonely node', [])]);
		compareTreeWithSpec(flattenVirtual(before), after);
	});

	test('flattenVirtual 2', function () {
		const before = topNode([lineNode(0, 0, 'A', [virtualNode(2, [lineNode(2, 1, 'lonely node', [])])])]);
		const after = topNode([lineNode(0, 0, 'A', [lineNode(2, 1, 'lonely node', [])])]);
		compareTreeWithSpec(flattenVirtual(before), after);
	});

	test('groupBlocks basic cases', function () {
		const source = dedent`
A

B
C
D

E
F

G
H`;
		const tree = parseRaw(source);
		const blockTree = groupBlocks(tree);
		function assertChildrenAreTheFollowingLines(
			tree: IndentationTree<never>,
			children: (string | number)[],
			message: string = ''
		) {
			assert.deepStrictEqual(
				tree.subs.map((node: IndentationSubTree<string>) => (isVirtual(node) ? 'v' : node.lineNumber)),
				children,
				message
			);
		}
		assertChildrenAreTheFollowingLines(blockTree, ['v', 'v', 'v', 'v'], 'wrong topline blocks');
		assertChildrenAreTheFollowingLines(blockTree.subs[0], [0, 1], 'wrong zeroth block');
		assertChildrenAreTheFollowingLines(blockTree.subs[1], [2, 3, 4, 5], 'wrong first block');
		assertChildrenAreTheFollowingLines(blockTree.subs[2], [6, 7, 8], 'wrong second block');
		assertChildrenAreTheFollowingLines(blockTree.subs[3], [9, 10], 'wrong fourth block');
	});

	test('groupBlocks advanced cases', function () {
		// tests consecutive blank lines, first child blank lines,
		// blank lines after last child, lone blank lines,
		// consecutive lone blank lines, offside blocks
		let tree = parseRaw(dedent`
A

  B
  C
    D

  E


  F

G
    H
    I
  J

  K
`);
		tree = groupBlocks(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				virtualNode(0, [
					lineNode(0, 0, 'A', [
						blankNode(1),
						virtualNode(2, [
							lineNode(2, 2, 'B', []),
							lineNode(2, 3, 'C', [lineNode(4, 4, 'D', [])]),
							blankNode(5),
						]),
						virtualNode(2, [lineNode(2, 6, 'E', []), blankNode(7), blankNode(8)]),
						virtualNode(2, [lineNode(2, 9, 'F', [])]),
					]),
					blankNode(10),
				]),
				virtualNode(0, [
					lineNode(0, 11, 'G', [
						virtualNode(4, [
							lineNode(4, 12, 'H', []),
							lineNode(4, 13, 'I', []),
							lineNode(2, 14, 'J', []),
							blankNode(15),
						]),
						virtualNode(4, [lineNode(2, 16, 'K', [])]),
					]),
				]),
			])
		);
	});

	test('groupBlocks consecutive blanks as oldest children', function () {
		let tree = parseRaw(dedent`
A


    B1
    B2
C
`);
		tree = groupBlocks(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'A', [
					blankNode(1),
					blankNode(2),
					virtualNode(4, [lineNode(4, 3, 'B1', []), lineNode(4, 4, 'B2', [])]),
				]),
				lineNode(0, 5, 'C', []),
			])
		);
	});

	test('groupBlocks subs ending with a blank line', function () {
		const baseTree = topNode([
			lineNode(0, 0, 'A', [blankNode(1)]),
			lineNode(0, 2, 'B', [blankNode(3), blankNode(4)]),
			blankNode(5),
			lineNode(0, 6, 'C', []),
		]);
		const tree = groupBlocks(baseTree);
		compareTreeWithSpec(
			tree,
			topNode([
				virtualNode(0, [
					lineNode(0, 0, 'A', [blankNode(1)]),
					lineNode(0, 2, 'B', [blankNode(3), blankNode(4)]),
					blankNode(5),
				]),
				virtualNode(0, [lineNode(0, 6, 'C', [])]),
			])
		);
	});

	test('groupBlocks with different delimiter', function () {
		let tree = parseRaw(dedent`
A
B
C
D
E
`) as IndentationTree<string>;
		const isDelimiter = (node: IndentationTree<string>) =>
			isLine(node) && (node.sourceLine.trim() === 'B' || node.sourceLine.trim() === 'D');
		tree = groupBlocks(tree, isDelimiter);
		compareTreeWithSpec(
			tree,
			topNode([
				virtualNode(0, [lineNode(0, 0, 'A', []), lineNode(0, 1, 'B', [])]),
				virtualNode(0, [lineNode(0, 2, 'C', []), lineNode(0, 3, 'D', [])]),
				virtualNode(0, [lineNode(0, 4, 'E ', [])]),
			])
		);
	});
});

suite('Raw parsing', function () {
	test('parseRaw', function () {
		compareTreeWithSpec(
			parseRaw(dedent`
A
  a
B
  b1
  b2
C
    c1
    c2
  c3
D
  d1
    d2
`),
			topNode([
				lineNode(0, 0, 'A', [lineNode(2, 1, 'a', [])]),
				lineNode(0, 2, 'B', [lineNode(2, 3, 'b1', []), lineNode(2, 4, 'b2', [])]),
				lineNode(0, 5, 'C', [lineNode(4, 6, 'c1', []), lineNode(4, 7, 'c2', []), lineNode(2, 8, 'c3', [])]),
				lineNode(0, 9, 'D', [lineNode(2, 10, 'd1', [lineNode(4, 11, 'd2', [])])]),
			])
		);
	});

	test('parseRaw blanks', function () {
		compareTreeWithSpec(
			parseRaw(dedent`
E
  e1

  e2
F

  f1
G
  g1

H

`),
			topNode([
				lineNode(0, 0, 'E', [lineNode(2, 1, 'e1', []), blankNode(2), lineNode(2, 3, 'e2', [])]),
				lineNode(0, 4, 'F', [blankNode(5), lineNode(2, 6, 'f1', [])]),
				lineNode(0, 7, 'G', [lineNode(2, 8, 'g1', [])]),
				blankNode(9),
				lineNode(0, 10, 'H', []),
				blankNode(11),
			])
		);
	});

	test('combineBraces', function () {
		const tree = parseTree(dedent`
A {
}
B
  b1 {
    bb1
  }
  b2 {
    bb2

  }
}
C {
    c1
    c2
  c3
  c4
}
`);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'A {', [lineNode(0, 1, '}', [], 'closer')]),
				lineNode(0, 2, 'B', [
					lineNode(2, 3, 'b1 {', [lineNode(4, 4, 'bb1', []), lineNode(2, 5, '}', [], 'closer')]),
					lineNode(2, 6, 'b2 {', [
						lineNode(4, 7, 'bb2', []),
						blankNode(8),
						lineNode(2, 9, '}', [], 'closer'),
					]),
					lineNode(0, 10, '}', [], 'closer'),
				]),
				lineNode(0, 11, 'C {', [
					lineNode(4, 12, 'c1', []),
					lineNode(4, 13, 'c2', []),
					lineNode(2, 14, 'c3', []),
					lineNode(2, 15, 'c4', []),
					lineNode(0, 16, '}', [], 'closer'),
				]),
			])
		);
		// Running the optimisation twice doesn't change the result
		let newTree = <IndentationTree<string>>JSON.parse(JSON.stringify(tree));
		newTree = combineClosersAndOpeners(newTree);
		compareTreeWithSpec(newTree, tree);
	});
});

/**
 * Many examples in this suite are taken from
 * https://docs.google.com/document/d/1WxjTDzx8Qbf4Bklrp9KwiQsB4-kTOloAR5h86np3_OM/edit#
 */
suite('Test bracket indentation spec', function () {
	test('Opener merged to older sibling', function () {
		const source = dedent`
A
(
    B
    C`;
		const treeRaw = parseRaw(source);
		const treeCode = parseTree(source, '');

		// the raw indentation indicates line 1 is the parent of the following lines
		compareTreeWithSpec(
			treeRaw,
			topNode([lineNode(0, 0, 'A', []), lineNode(0, 1, '(', [lineNode(4, 2, 'B', []), lineNode(4, 3, 'C', [])])])
		);

		// the bracket parsing indicates line 0 is the parent
		compareTreeWithSpec(
			treeCode,
			topNode([
				lineNode(0, 0, 'A', [
					lineNode(0, 1, '(', [], 'opener'),
					lineNode(4, 2, 'B', []),
					lineNode(4, 3, 'C', []),
				]),
			])
		);
	});

	test('Closer merged, simplest case', function () {
		const source = dedent`
A
    B
)`;
		const treeRaw = parseRaw(source);
		const treeCode = parseTree(source, '');

		// the raw indentation indicates line 2 is the sibling of 0
		compareTreeWithSpec(
			treeRaw,
			topNode([lineNode(0, 0, 'A', [lineNode(4, 1, 'B', [])]), lineNode(0, 2, ')', [])])
		);

		// the bracket parsing indicates line 2 actually another child
		compareTreeWithSpec(
			treeCode,
			topNode([lineNode(0, 0, 'A', [lineNode(4, 1, 'B', []), lineNode(0, 2, ')', [], 'closer')])])
		);
	});

	test('Closer merged, multi-body case', function () {
		const source = dedent`
A
    B
    C
) + (
    D
    E
)`;
		const treeRaw = parseRaw(source);
		const treeCode = parseTree(source, '');

		// before bracket parsing, A had two children, B and C
		assert.strictEqual(
			treeRaw.subs[0].subs.map(x => (x.type === 'line' ? x.sourceLine.trim() : 'v')).join(),
			'B,C'
		);
		// after, it had three children, a virtual node, line node 3 and the closer 6
		assert.strictEqual(
			treeCode.subs[0].subs.map(x => (x.type === 'line' ? x.sourceLine.trim() : 'v')).join(),
			'v,) + (,)'
		);
	});

	test('closer starting their next subblock, ifelse', function () {
		const source = dedent`
            if (new) {
                print(“hello”)
                print(“world”)
            } else {
                print(“goodbye”)
            }`;
		const sourceParsedAsIf = dedent`
            if (new) {
                -> virtual
                    print(“hello”)
                    print(“world”)
                } else {
                    print(“goodbye”)
                }`;

		const treeRaw = parseRaw(source);
		const treeCode = parseTree(source, '');
		const treeExpected = parseAsIfVirtual(sourceParsedAsIf);

		compareTreeWithSpec(
			treeRaw,
			topNode([
				lineNode(0, 0, 'if (new) {', [
					lineNode(4, 1, 'print(“hello”)', []),
					lineNode(4, 2, 'print(“world”)', []),
				]),
				lineNode(0, 3, '} else {', [lineNode(4, 4, 'print(“goodbye”)', [])]),
				lineNode(0, 5, '}', []),
			])
		);
		compareTreeWithSpec(
			treeCode,
			topNode([
				lineNode(0, 0, 'if (new) {', [
					virtualNode(0, [lineNode(4, 1, 'print(“hello”)', []), lineNode(4, 2, 'print(“world”)', [])]),
					lineNode(0, 3, '} else {', [lineNode(4, 4, 'print(“goodbye”)', [])]),
					lineNode(0, 5, '}', []),
				]),
			])
		);
		compareTreeWithSpec(treeCode, treeExpected, 'structure');
	});
});

suite('Special indentation styles', function () {
	test('Allman style example (function)', function () {
		const source = dedent`
        function test()
        {
            print(“hello”)
            print(“world”)
        }`;

		const treeRaw = parseRaw(source);
		const treeCode = parseTree(source, '');

		// the bracket parsing indicates line 0 is the parent
		compareTreeWithSpec(
			treeCode,
			topNode([
				lineNode(0, 0, 'function test()', [
					lineNode(0, 1, '{', [], 'opener'),
					lineNode(4, 2, 'print(“hello”)', []),
					lineNode(4, 3, 'print(“world”)', []),
					lineNode(0, 4, '}', [], 'closer'),
				]),
			])
		);

		// the next line is also moved, but by the closing partof the spec, so not tested here
		compareTreeWithSpec(
			treeRaw,
			topNode([
				lineNode(0, 0, 'function test()', []),
				lineNode(0, 1, '{', [lineNode(4, 2, 'print(“hello”)', []), lineNode(4, 3, 'print(“world”)', [])]),
				lineNode(0, 4, '}', []),
			])
		);
	});

	/** This test is a case where our parsing isn't yet optimal */
	test('Allman style example (if-then-else)', function () {
		const source = dedent`
        if (condition)
        {
            print(“hello”)
            print(“world”)
        }
        else
        {
            print(“goodbye”)
            print(“phone”)
        }
        `;

		const treeCode = parseTree(source, '');

		// Currently, this is parsed the same as two consecutive if-statements,
		// Because generic languages do not understand `else` should continue.
		compareTreeWithSpec(
			treeCode,
			topNode([
				lineNode(0, 0, 'if (condition)', [
					lineNode(0, 1, '{', [], 'opener'),
					lineNode(4, 2, 'print(“hello”)', []),
					lineNode(4, 3, 'print(“world”)', []),
					lineNode(0, 4, '}', [], 'closer'),
				]),
				lineNode(0, 5, 'else ', [
					lineNode(0, 6, '{', [], 'opener'),
					lineNode(4, 7, 'print(“goodbye”)', []),
					lineNode(4, 8, 'print(“phone”)', []),
					lineNode(0, 9, '}', [], 'closer'),
				]),
			])
		);
	});

	test('K&R style example (if-then-else)', function () {
		const source = dedent`
        if (condition) {
            print(“hello”)
            print(“world”)
        } else {
            print(“goodbye”)
            print(“phone”)
        }
        `;

		const treeCode = parseTree(source, '');

		// Currently, this is parsed the same as two consecutive if-statements,
		// Because generic languages do not understand `else` should continue.
		compareTreeWithSpec(
			treeCode,
			topNode([
				lineNode(0, 0, 'if (condition) {', [
					virtualNode(0, [lineNode(4, 2, 'print(“hello”)', []), lineNode(4, 3, 'print(“world”)', [])]),
					lineNode(
						0,
						4,
						'} else {',
						[lineNode(4, 5, 'print(“goodbye”)', []), lineNode(4, 6, 'print(“phone”)', [])],
						'closer'
					),
					lineNode(0, 7, '}', [], 'closer'),
				]),
			])
		);
	});

	test('combineBraces GNU style indentation 1', function () {
		let tree: IndentationTree<string> = parseRaw(dedent`
A
  {
    stmt
  }
`);
		labelLines(tree, buildLabelRules({ opener: /^{$/, closer: /^}$/ }));
		tree = combineClosersAndOpeners(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'A', [
					lineNode(2, 1, '{', [lineNode(4, 2, 'stmt', []), lineNode(2, 3, '}', [], 'closer')], 'opener'),
				]),
			])
		);
	});

	test('combineBraces GNU style indentation 2', function () {
		let tree: IndentationTree<string> = parseRaw(dedent`
B
{
    stmt

}


end
`);
		labelLines(tree, buildLabelRules({ opener: /^{$/, closer: /^}$/ }));
		tree = combineClosersAndOpeners(tree);
		tree = flattenVirtual(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'B', [
					lineNode(0, 1, '{', [], 'opener'),
					lineNode(4, 2, 'stmt', []),
					blankNode(3),
					lineNode(0, 4, '}', [], 'closer'),
				]),
				blankNode(5),
				blankNode(6),
				lineNode(0, 7, 'end', []),
			])
		);
	});

	test('combineBraces GNU style indentation 3', function () {
		let tree: IndentationTree<string> = parseRaw(dedent`
C
{

}
`);
		labelLines(tree, buildLabelRules({ opener: /^{$/, closer: /^}$/ }));
		tree = combineClosersAndOpeners(tree);
		tree = flattenVirtual(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'C', [
					lineNode(0, 1, '{', [], 'opener'),
					blankNode(2),
					lineNode(0, 3, '}', [], 'closer'),
				]),
			])
		);
	});

	test('combineBraces GNU style indentation 4', function () {
		let tree: IndentationTree<string> = parseRaw(dedent`
D
{
    d
    {
        stmt

    }
}
`);
		labelLines(tree, buildLabelRules({ opener: /^{$/, closer: /^}$/ }));
		tree = combineClosersAndOpeners(tree);
		tree = flattenVirtual(tree);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'D', [
					lineNode(0, 1, '{', [], 'opener'),
					lineNode(4, 2, 'd', [
						lineNode(4, 3, '{', [], 'opener'),
						lineNode(8, 4, 'stmt', []),
						blankNode(5),
						lineNode(4, 6, '}', [], 'closer'),
					]),
					lineNode(0, 7, '}', [], 'closer'),
				]),
			])
		);
	});
});
