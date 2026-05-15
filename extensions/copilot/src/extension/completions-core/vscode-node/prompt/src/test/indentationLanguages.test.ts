/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import dedent from 'ts-dedent';
import { blankNode, isLine, lineNode, parseTree, topNode, virtualNode, visitTree } from '../indentation';
import { compareTreeWithSpec } from './testHelpers';

/** Test some language specific parsing techniques */
suite('Java', function () {
	test('method detection in Java', function () {
		const source = dedent`
		// first an import
		import java.util.List;

		@Override
		public class Test {
			public static void main(String[] args) {
				System.out.println("Hello World!");

			}

			@Override
			private List<String> list;
		}`;
		const javaParsedTree = parseTree(source, 'java');

		// we should have picked up the correct labels
		const lineLabels: string[] = [];
		visitTree(
			javaParsedTree,
			node => {
				if (isLine(node) && node.label) {
					lineLabels.push(node.label);
				}
			},
			'topDown'
		);
		assert.deepStrictEqual(lineLabels, [
			'comment_single',
			'import',
			// blank
			'annotation',
			'class',
			'member',
			// not labelled
			'closer',
			// blank
			'member', // as per explicit comment, the annotations within a class are relabeled 'member,
			'member',
			'closer',
		]);
	});

	test('labelLines java', function () {
		const tree = parseTree(
			dedent`
package com.example;
import java.awt.*;
@annotation
final public class A {
    /** A javadoc
     *  Second line
     */
    public static void main(String[] args) {
        // single-line comment
        /* Multiline
         * comment
         */
        System.out.println("Hello, world!");
    }
}
public interface I { }
`,
			'java'
		);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(0, 0, 'pa...', [], 'package'),
				lineNode(0, 1, 'imp..', [], 'import'),
				lineNode(0, 2, '@ann...', [], 'annotation'),
				lineNode(
					0,
					3,
					'cla...',
					[
						lineNode(4, 4, '/**...', [lineNode(5, 5, '* ...', []), lineNode(5, 6, '* ...', [])], 'javadoc'),
						lineNode(4, 7, 'public...', [
							lineNode(8, 8, '//...', [], 'comment_single'),
							lineNode(
								8,
								9,
								'/*...',
								[lineNode(9, 10, '* ...', []), lineNode(9, 11, '*/', [])],
								'comment_multi'
							),
							lineNode(8, 12, 'System ...', []),
							lineNode(4, 13, '}', [], 'closer'),
						]),
						lineNode(0, 14, '}', [], 'closer'),
					],
					'class'
				),
				lineNode(0, 15, 'public...', [], 'interface'),
			])
		);
	});

	test('parse Java fields', function () {
		//TODO: Add a field with annotation on separate line
		const tree = parseTree(
			dedent`
class A {
    int a;
    /** Javadoc */
    int b;
    // Comment
    @Native int c;
}
`,
			'java'
		);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(
					0,
					0,
					'class...',
					[
						lineNode(4, 1, 'int a;', [], 'member'),
						lineNode(4, 2, '/**...', [], 'javadoc'),
						lineNode(4, 3, 'int b;', [], 'member'),
						lineNode(4, 4, '//...', [], 'comment_single'),
						lineNode(4, 5, '@Native int c;', [], 'member'),
						lineNode(0, 6, '}', [], 'closer'),
					],
					'class'
				),
			])
		);
	});

	test('parse Java inner class', function () {
		const tree = parseTree(
			dedent`
class A {
    int a;

    class Inner {
        int b;
    }

    interface InnerInterface {
        int myMethod();
    }
}
`,
			'java'
		);
		compareTreeWithSpec(
			tree,
			topNode([
				lineNode(
					0,
					0,
					'class A {',
					[
						lineNode(4, 1, 'int a;', [], 'member'),
						blankNode(2),
						lineNode(
							4,
							3,
							'class Inner ...',
							[lineNode(8, 4, 'int b;', [], 'member'), lineNode(4, 5, '}', [], 'closer')],
							'class'
						),
						blankNode(6),
						lineNode(
							4,
							7,
							'interface InnerInterface ...',
							[lineNode(8, 8, 'int myMethod();', [], 'member'), lineNode(4, 9, '}', [], 'closer')],
							'interface'
						),
						lineNode(0, 10, '}', [], 'closer'),
					],
					'class'
				),
			])
		);
	});
});

suite('Markdown', function () {
	test('header processing in markdown', function () {
		const source = dedent`
A

# B
C
D

## E
F
G

# H
I

### J
K

L
M
`;
		const mdParsedTree = parseTree(source, 'markdown');

		compareTreeWithSpec(
			mdParsedTree,
			topNode([
				virtualNode(0, [lineNode(0, 0, 'A', []), blankNode(1)]),
				virtualNode(0, [
					lineNode(
						0,
						2,
						'# B',
						[
							virtualNode(0, [lineNode(0, 3, 'C', []), lineNode(0, 4, 'D', []), blankNode(5)]),
							lineNode(
								0,
								6,
								'## E',
								[lineNode(0, 7, 'F', []), lineNode(0, 8, 'G', []), blankNode(9)],
								'subheading'
							),
						],
						'heading'
					),
					lineNode(
						0,
						10,
						'# H',
						[
							virtualNode(0, [lineNode(0, 11, 'I', []), blankNode(12)]),
							lineNode(
								0,
								13,
								'### J',
								[
									virtualNode(0, [lineNode(0, 14, 'K', []), blankNode(15)]),
									virtualNode(0, [lineNode(0, 16, 'L', []), lineNode(0, 17, 'M', [])]),
								],
								'subsubheading'
							),
						],
						'heading'
					),
				]),
			])
		);
	});
});
