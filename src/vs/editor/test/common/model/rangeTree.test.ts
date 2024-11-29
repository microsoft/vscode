/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { _tokenizeToString } from '../../../common/languages/textToHtmlTokenizer.js';
import { ITextModel } from '../../../common/model.js';
import { Position } from '../../../common/core/position.js';
import { isLeaf, RangeTreeLeafNode, TokenRangeTree } from '../../../common/model/rangeTree.js';
import { StorableToken } from '../../../common/model/treeSitterTokenStore.js';

class MockTokenRangeTextModel {
	constructor(private valueLength: number) {
	}
	getLineCount(): number {
		return 10;
	}
	getLineMaxColumn(lineNumber: number): number {
		return 10;
	}
	getOffsetAt(position: Position): number {
		if (position.lineNumber === 1) {
			return 0;
		}

		return this.valueLength;
	}
	updateLength(newLength: number) {
		this.valueLength = newLength;
	}
}

function insertRange(tree: TokenRangeTree<number>, range: RangeTreeLeafNode<number>) {
	tree.insert([new StorableToken(range.startInclusive, range.endExclusive, range.data)]);
}

suite('Range Tree', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Insert', () => {
		const expectedTree =
			`(9)
├── (4)
│   ├── [0, 7]
│   └── (6)
│       └── (7)
│           ├── [7, 8]
│           └── [8, 11]
└── (13)
    ├── (11)
    │   ├── [11, 12]
    │   └── [12, 15]
    └── (15)
        ├── [15, 16]
        └── (16)
            ├── [16, 17]
            └── [17, 18]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 7, endExclusive: 8, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 11, data: 0, parent: undefined },
			{ startInclusive: 11, endExclusive: 12, data: 0, parent: undefined },
			{ startInclusive: 12, endExclusive: 15, data: 0, parent: undefined },
			{ startInclusive: 15, endExclusive: 16, data: 0, parent: undefined },
			{ startInclusive: 16, endExclusive: 17, data: 0, parent: undefined },
			{ startInclusive: 17, endExclusive: 18, data: 0, parent: undefined }
		];

		const treeA = new TokenRangeTree<number>(new MockTokenRangeTextModel(18) as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(treeA, range);
		}
		assert.strictEqual(treeA.printTree(), expectedTree);

		const treeB = new TokenRangeTree<number>(new MockTokenRangeTextModel(18) as unknown as ITextModel, 0);
		for (let i = ranges.length - 1; i >= 0; i--) {
			insertRange(treeB, ranges[i]);
		}
		assert.strictEqual(treeB.printTree(), expectedTree);

		const treeC = new TokenRangeTree<number>(new MockTokenRangeTextModel(18) as unknown as ITextModel, 0);
		insertRange(treeC, ranges[4]);
		insertRange(treeC, ranges[0]);
		insertRange(treeC, ranges[7]);
		insertRange(treeC, ranges[2]);
		insertRange(treeC, ranges[5]);
		insertRange(treeC, ranges[1]);
		insertRange(treeC, ranges[6]);
		insertRange(treeC, ranges[3]);
		assert.strictEqual(treeC.printTree(), expectedTree);
	});

	test('Small modify', () => {
		const expectedTree =
			`(9)
├── (4)
│   ├── [0, 7]
│   └── (6)
│       └── (7)
│           ├── [7, 8]
│           └── [8, 11]
└── (13)
    ├── (11)
    │   ├── [11, 12]
    │   └── [12, 15]
    └── (15)
        ├── [15, 16]
        └── (16)
            ├── [16, 17]
            └── [17, 18]`;

		const expectedModifiedTree =
			`(10)
├── (5)
│   ├── [0, 7]
│   └── (7)
│       └── (8)
│           ├── [7, 8]
│           └── [8, 11]
└── (15)
    ├── (12)
    │   ├── [11, 12]
    │   └── (13)
    │       ├── [12, 15]
    │       └── [15, 18]
    └── (17)
        └── (18)
            ├── [18, 19]
            └── [19, 20]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 7, endExclusive: 8, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 11, data: 0, parent: undefined },
			{ startInclusive: 11, endExclusive: 12, data: 0, parent: undefined },
			{ startInclusive: 12, endExclusive: 15, data: 0, parent: undefined },
			{ startInclusive: 15, endExclusive: 16, data: 0, parent: undefined },
			{ startInclusive: 16, endExclusive: 17, data: 0, parent: undefined },
			{ startInclusive: 17, endExclusive: 18, data: 0, parent: undefined }
		];

		const mockTextModel = new MockTokenRangeTextModel(18);
		const tree = new TokenRangeTree<number>(mockTextModel as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(tree, range);
		}
		assert.strictEqual(tree.printTree(), expectedTree);

		mockTextModel.updateLength(20);
		const newRanges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 15, endExclusive: 18, data: 0, parent: undefined },
			{ startInclusive: 18, endExclusive: 19, data: 0, parent: undefined },
			{ startInclusive: 19, endExclusive: 20, data: 0, parent: undefined }
		];

		for (const range of newRanges) {
			insertRange(tree, range);
		}

		assert.strictEqual(tree.printTree(), expectedModifiedTree);
	});

	test('Modify Tree', () => {
		const initialTree =
			`(18)
├── (9)
│   ├── (4)
│   │   ├── (2)
│   │   │   ├── [0, 2]
│   │   │   └── [3, 7]
│   │   └── [8, 14]
│   └── [14, 21]
└── (27)
    ├── (22)
    │   ├── (20)
    │   │   └── (21)
    │   │       ├── [21, 22]
    │   │       └── [22, 25]
    │   └── (24)
    │       └── (25)
    │           ├── [25, 26]
    │           └── [26, 29]
    └── (31)
        ├── (29)
        │   ├── [29, 30]
        │   └── (30)
        │       ├── [30, 31]
        │       └── [31, 32]
        └── [32, 36]`;

		const treeWithBModifications =
			`(18)
├── (9)
│   ├── (4)
│   │   ├── (2)
│   │   │   ├── [0, 2]
│   │   │   └── [3, 7]
│   │   └── [8, 15]
│   └── [15, 21]
└── (27)
    ├── (22)
    │   ├── (20)
    │   │   └── (21)
    │   │       ├── [21, 22]
    │   │       └── [22, 25]
    │   └── (24)
    │       └── (25)
    │           ├── [25, 26]
    │           └── [26, 29]
    └── (31)
        ├── (29)
        │   ├── [29, 30]
        │   └── (30)
        │       ├── [30, 31]
        │       └── [31, 32]
        └── [32, 36]`;

		const treeWithCModifications =
			`(19)
├── (9)
│   ├── (4)
│   │   ├── (2)
│   │   │   ├── [0, 2]
│   │   │   └── [3, 7]
│   │   └── [8, 15]
│   └── [15, 24]
└── (29)
    ├── (24)
    │   ├── [24, 28]
    │   └── (26)
    │       └── (27)
    │           └── (28)
    │               ├── [28, 29]
    │               └── [29, 32]
    └── (34)
        ├── (31)
        │   └── (32)
        │       ├── [32, 33]
        │       └── (33)
        │           ├── [33, 34]
        │           └── [34, 35]
        └── [35, 39]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 2, data: 0, parent: undefined },
			{ startInclusive: 3, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 14, data: 0, parent: undefined },
			{ startInclusive: 14, endExclusive: 21, data: 0, parent: undefined },
			{ startInclusive: 21, endExclusive: 22, data: 0, parent: undefined },
			{ startInclusive: 22, endExclusive: 25, data: 0, parent: undefined },
			{ startInclusive: 25, endExclusive: 26, data: 0, parent: undefined },
			{ startInclusive: 26, endExclusive: 29, data: 0, parent: undefined },
			{ startInclusive: 29, endExclusive: 30, data: 0, parent: undefined },
			{ startInclusive: 30, endExclusive: 31, data: 0, parent: undefined },
			{ startInclusive: 31, endExclusive: 32, data: 0, parent: undefined },
			{ startInclusive: 32, endExclusive: 36, data: 0, parent: undefined },
		];

		const mockTextModel = new MockTokenRangeTextModel(36);
		const tree = new TokenRangeTree<number>(mockTextModel as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(tree, range);
		}

		assert.strictEqual(tree.printTree(), initialTree);

		// Insert a token with an identical range
		const a: RangeTreeLeafNode<number> = { startInclusive: 3, endExclusive: 7, data: 0, parent: undefined };
		insertRange(tree, a);
		assert.strictEqual(tree.printTree(), initialTree);

		// Change the range of some of the tokens
		const b: RangeTreeLeafNode<number> = { startInclusive: 8, endExclusive: 15, data: 0, parent: undefined };
		const b2: RangeTreeLeafNode<number> = { startInclusive: 15, endExclusive: 21, data: 0, parent: undefined };
		insertRange(tree, b);
		insertRange(tree, b2);
		assert.strictEqual(tree.printTree(), treeWithBModifications);

		// Change tokens and change the document length
		mockTextModel.updateLength(39);
		const cRanges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 15, endExclusive: 24, data: 0, parent: undefined },
			{ startInclusive: 24, endExclusive: 28, data: 0, parent: undefined },
			{ startInclusive: 28, endExclusive: 29, data: 0, parent: undefined },
			{ startInclusive: 29, endExclusive: 32, data: 0, parent: undefined },
			{ startInclusive: 32, endExclusive: 33, data: 0, parent: undefined },
			{ startInclusive: 33, endExclusive: 34, data: 0, parent: undefined },
			{ startInclusive: 34, endExclusive: 35, data: 0, parent: undefined },
			{ startInclusive: 35, endExclusive: 39, data: 0, parent: undefined }
		];
		for (const range of cRanges) {
			insertRange(tree, range);
		}
		assert.strictEqual(tree.printTree(), treeWithCModifications);
	});

	test('Document size decreases', () => {
		const expectedTree =
			`(9)
├── (4)
│   ├── [0, 7]
│   └── (6)
│       └── (7)
│           ├── [7, 8]
│           └── [8, 11]
└── (13)
    ├── (11)
    │   ├── [11, 12]
    │   └── [12, 15]
    └── (15)
        ├── [15, 16]
        └── (16)
            ├── [16, 17]
            └── [17, 18]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 7, endExclusive: 8, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 11, data: 0, parent: undefined },
			{ startInclusive: 11, endExclusive: 12, data: 0, parent: undefined },
			{ startInclusive: 12, endExclusive: 15, data: 0, parent: undefined },
			{ startInclusive: 15, endExclusive: 16, data: 0, parent: undefined },
			{ startInclusive: 16, endExclusive: 17, data: 0, parent: undefined },
			{ startInclusive: 17, endExclusive: 18, data: 0, parent: undefined }
		];

		const mockTextModel = new MockTokenRangeTextModel(18);
		const treeA = new TokenRangeTree<number>(mockTextModel as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(treeA, range);
		}
		assert.strictEqual(treeA.printTree(), expectedTree);
		mockTextModel.updateLength(5);
		insertRange(treeA, { startInclusive: 0, endExclusive: 3, data: 0, parent: undefined });
		insertRange(treeA, { startInclusive: 3, endExclusive: 5, data: 0, parent: undefined });

		const expectedModifiedTree =
			`(2)
├── [0, 3]
└── [3, 5]`;
		assert.strictEqual(treeA.printTree(), expectedModifiedTree);
	});

	test('Document size increases', () => {
		const initialTree =
			`(9)
├── (4)
│   ├── [0, 7]
│   └── (6)
│       └── (7)
│           ├── [7, 8]
│           └── [8, 11]
└── (13)
    ├── (11)
    │   ├── [11, 12]
    │   └── [12, 15]
    └── (15)
        ├── [15, 16]
        └── (16)
            ├── [16, 17]
            └── [17, 18]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 7, endExclusive: 8, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 11, data: 0, parent: undefined },
			{ startInclusive: 11, endExclusive: 12, data: 0, parent: undefined },
			{ startInclusive: 12, endExclusive: 15, data: 0, parent: undefined },
			{ startInclusive: 15, endExclusive: 16, data: 0, parent: undefined },
			{ startInclusive: 16, endExclusive: 17, data: 0, parent: undefined },
			{ startInclusive: 17, endExclusive: 18, data: 0, parent: undefined }
		];

		const mockTextModel = new MockTokenRangeTextModel(18);
		const tree = new TokenRangeTree<number>(mockTextModel as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(tree, range);
		}
		assert.strictEqual(tree.printTree(), initialTree);

		mockTextModel.updateLength(22);
		const newRanges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 18, endExclusive: 19, data: 0, parent: undefined },
			{ startInclusive: 19, endExclusive: 20, data: 0, parent: undefined },
			{ startInclusive: 20, endExclusive: 22, data: 0, parent: undefined }
		];

		for (const range of newRanges) {
			insertRange(tree, range);
		}

		const expectedModifiedTree =
			`(11)
├── (5)
│   ├── [0, 7]
│   └── (8)
│       ├── (6)
│       │   └── (7)
│       │       ├── [7, 8]
│       │       └── [8, 11]
└── (16)
    ├── (13)
    │   ├── (12)
    │   │   ├── (11)
    │   │   │   ├── [11, 12]
    │   │   │   └── [12, 15]
    │   └── (14)
    │       └── (15)
    │           ├── [15, 16]
    │           └── [16, 17]
    └── (19)
        ├── (17)
        │   ├── [17, 18]
        │   └── (18)
        │       ├── [18, 19]
        │       └── [19, 20]
        └── [20, 22]`;

		assert.strictEqual(tree.printTree(), expectedModifiedTree);
	});

	test('Replace with one large token', () => {
		const expectedTree =
			`(9)
├── (4)
│   ├── [0, 7]
│   └── (6)
│       └── (7)
│           ├── [7, 8]
│           └── [8, 11]
└── (13)
    ├── (11)
    │   ├── [11, 12]
    │   └── [12, 15]
    └── (15)
        ├── [15, 16]
        └── (16)
            ├── [16, 17]
            └── [17, 18]`;

		const ranges: RangeTreeLeafNode<number>[] = [
			{ startInclusive: 0, endExclusive: 7, data: 0, parent: undefined },
			{ startInclusive: 7, endExclusive: 8, data: 0, parent: undefined },
			{ startInclusive: 8, endExclusive: 11, data: 0, parent: undefined },
			{ startInclusive: 11, endExclusive: 12, data: 0, parent: undefined },
			{ startInclusive: 12, endExclusive: 15, data: 0, parent: undefined },
			{ startInclusive: 15, endExclusive: 16, data: 0, parent: undefined },
			{ startInclusive: 16, endExclusive: 17, data: 0, parent: undefined },
			{ startInclusive: 17, endExclusive: 18, data: 0, parent: undefined }
		];

		const mockTextModel = new MockTokenRangeTextModel(18);
		const tree = new TokenRangeTree<number>(mockTextModel as unknown as ITextModel, 0);
		for (const range of ranges) {
			insertRange(tree, range);
		}
		assert.strictEqual(tree.printTree(), expectedTree);

		mockTextModel.updateLength(5);
		insertRange(tree, { startInclusive: 0, endExclusive: 23, data: 0, parent: undefined });
		const expectedModifiedTree =
		`(2)
├── [0, 23]`;
		assert.strictEqual(tree.printTree(), expectedModifiedTree);
	});

	test('traversePostOrderFromNode', () => {
		const textModel = new MockTokenRangeTextModel(15);
		const tree =  new TokenRangeTree<number>(textModel as unknown as ITextModel, 0);

		// Insert nodes into the tree
		tree.insert([new StorableToken(0, 5, 1)]);
		tree.insert([new StorableToken(5, 10, 2)]);
		tree.insert([new StorableToken(10, 15, 3)]);

		let visited = '';

		tree.traversePostOrder((node, segmentRange) => {
			if (isLeaf(node)) {
				visited += `[${node.startInclusive}, ${node.endExclusive}]`;
			} else {
				visited += `(${node.maxLeftStartInclusive})`;
			}
		});

		// Verify the nodes are visited in post-order
		assert.deepStrictEqual(visited, '[0, 5][5, 10](3)[10, 15](7)');
	});
});
