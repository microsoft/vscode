/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IntervalTree, IntervalNode, getNodeColor, NodeColor, SENTINEL, intervalCompare } from 'vs/editor/common/model/intervalTree';

const GENERATE_TESTS = false;
let TEST_COUNT = GENERATE_TESTS ? 10000 : 0;
let PRINT_TREE = false;
const MIN_INTERVAL_START = 1;
const MAX_INTERVAL_END = 100;
const MIN_INSERTS = 1;
const MAX_INSERTS = 30;
const MIN_CHANGE_CNT = 10;
const MAX_CHANGE_CNT = 20;

suite('IntervalTree', () => {

	class Interval {
		_intervalBrand: void;

		public start: number;
		public end: number;

		constructor(start: number, end: number) {
			this.start = start;
			this.end = end;
		}
	}

	class Oracle {
		public intervals: Interval[];

		constructor() {
			this.intervals = [];
		}

		public insert(interval: Interval): Interval {
			this.intervals.push(interval);
			this.intervals.sort((a, b) => {
				if (a.start === b.start) {
					return a.end - b.end;
				}
				return a.start - b.start;
			});
			return interval;
		}

		public delete(interval: Interval): void {
			for (let i = 0, len = this.intervals.length; i < len; i++) {
				if (this.intervals[i] === interval) {
					this.intervals.splice(i, 1);
					return;
				}
			}
		}

		public search(interval: Interval): Interval[] {
			let result: Interval[] = [];
			for (let i = 0, len = this.intervals.length; i < len; i++) {
				let int = this.intervals[i];
				if (int.start <= interval.end && int.end >= interval.start) {
					result.push(int);
				}
			}
			return result;
		}
	}

	class TestState {
		private _oracle: Oracle = new Oracle();
		private _tree: IntervalTree = new IntervalTree();
		private _lastNodeId = -1;
		private _treeNodes: IntervalNode[] = [];
		private _oracleNodes: Interval[] = [];

		public acceptOp(op: IOperation): void {

			if (op.type === 'insert') {
				if (PRINT_TREE) {
					console.log(`insert: {${JSON.stringify(new Interval(op.begin, op.end))}}`);
				}
				let nodeId = (++this._lastNodeId);
				this._treeNodes[nodeId] = new IntervalNode(null, op.begin, op.end);
				this._tree.insert(this._treeNodes[nodeId]);
				this._oracleNodes[nodeId] = this._oracle.insert(new Interval(op.begin, op.end));
			} else if (op.type === 'delete') {
				if (PRINT_TREE) {
					console.log(`delete: {${JSON.stringify(this._oracleNodes[op.id])}}`);
				}
				this._tree.delete(this._treeNodes[op.id]);
				this._oracle.delete(this._oracleNodes[op.id]);

				this._treeNodes[op.id] = null;
				this._oracleNodes[op.id] = null;
			} else if (op.type === 'change') {

				this._tree.delete(this._treeNodes[op.id]);
				this._treeNodes[op.id].reset(0, op.begin, op.end, null);
				this._tree.insert(this._treeNodes[op.id]);

				this._oracle.delete(this._oracleNodes[op.id]);
				this._oracleNodes[op.id].start = op.begin;
				this._oracleNodes[op.id].end = op.end;
				this._oracle.insert(this._oracleNodes[op.id]);

			} else {
				let actualNodes = this._tree.intervalSearch(op.begin, op.end, 0, false, 0);
				let actual = actualNodes.map(n => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
				let expected = this._oracle.search(new Interval(op.begin, op.end));
				assert.deepEqual(actual, expected);
				return;
			}

			if (PRINT_TREE) {
				printTree(this._tree);
			}

			assertTreeInvariants(this._tree);

			let actual = this._tree.getAllInOrder().map(n => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
			let expected = this._oracle.intervals;
			assert.deepEqual(actual, expected);
		}

		public getExistingNodeId(index: number): number {
			let currIndex = -1;
			for (let i = 0; i < this._treeNodes.length; i++) {
				if (this._treeNodes[i] === null) {
					continue;
				}
				currIndex++;
				if (currIndex === index) {
					return i;
				}
			}
			throw new Error('unexpected');
		}
	}

	interface IInsertOperation {
		type: 'insert';
		begin: number;
		end: number;
	}

	interface IDeleteOperation {
		type: 'delete';
		id: number;
	}

	interface IChangeOperation {
		type: 'change';
		id: number;
		begin: number;
		end: number;
	}

	interface ISearchOperation {
		type: 'search';
		begin: number;
		end: number;
	}

	type IOperation = IInsertOperation | IDeleteOperation | IChangeOperation | ISearchOperation;

	function testIntervalTree(ops: IOperation[]): void {
		let state = new TestState();
		for (let i = 0; i < ops.length; i++) {
			state.acceptOp(ops[i]);
		}
	}

	function getRandomInt(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	function getRandomRange(min: number, max: number): [number, number] {
		let begin = getRandomInt(min, max);
		let length: number;
		if (getRandomInt(1, 10) <= 2) {
			// large range
			length = getRandomInt(0, max - begin);
		} else {
			// small range
			length = getRandomInt(0, Math.min(max - begin, 10));
		}
		return [begin, begin + length];
	}

	class AutoTest {
		private _ops: IOperation[] = [];
		private _state: TestState = new TestState();
		private _insertCnt: number;
		private _deleteCnt: number;
		private _changeCnt: number;

		constructor() {
			this._insertCnt = getRandomInt(MIN_INSERTS, MAX_INSERTS);
			this._changeCnt = getRandomInt(MIN_CHANGE_CNT, MAX_CHANGE_CNT);
			this._deleteCnt = 0;
		}

		private _doRandomInsert(): void {
			let range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
			this._run({
				type: 'insert',
				begin: range[0],
				end: range[1]
			});
		}

		private _doRandomDelete(): void {
			let idx = getRandomInt(Math.floor(this._deleteCnt / 2), this._deleteCnt - 1);
			this._run({
				type: 'delete',
				id: this._state.getExistingNodeId(idx)
			});
		}

		private _doRandomChange(): void {
			let idx = getRandomInt(0, this._deleteCnt - 1);
			let range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
			this._run({
				type: 'change',
				id: this._state.getExistingNodeId(idx),
				begin: range[0],
				end: range[1]
			});
		}

		public run() {
			while (this._insertCnt > 0 || this._deleteCnt > 0 || this._changeCnt > 0) {
				if (this._insertCnt > 0) {
					this._doRandomInsert();
					this._insertCnt--;
					this._deleteCnt++;
				} else if (this._changeCnt > 0) {
					this._doRandomChange();
					this._changeCnt--;
				} else {
					this._doRandomDelete();
					this._deleteCnt--;
				}

				// Let's also search for something...
				let searchRange = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
				this._run({
					type: 'search',
					begin: searchRange[0],
					end: searchRange[1]
				});
			}
		}

		private _run(op: IOperation): void {
			this._ops.push(op);
			this._state.acceptOp(op);
		}

		public print(): void {
			console.log(`testIntervalTree(${JSON.stringify(this._ops)})`);
		}

	}

	suite('generated', () => {
		test('gen01', () => {
			testIntervalTree([
				{ type: 'insert', begin: 28, end: 35 },
				{ type: 'insert', begin: 52, end: 54 },
				{ type: 'insert', begin: 63, end: 69 }
			]);
		});

		test('gen02', () => {
			testIntervalTree([
				{ type: 'insert', begin: 80, end: 89 },
				{ type: 'insert', begin: 92, end: 100 },
				{ type: 'insert', begin: 99, end: 99 }
			]);
		});

		test('gen03', () => {
			testIntervalTree([
				{ type: 'insert', begin: 89, end: 96 },
				{ type: 'insert', begin: 71, end: 74 },
				{ type: 'delete', id: 1 }
			]);
		});

		test('gen04', () => {
			testIntervalTree([
				{ type: 'insert', begin: 44, end: 46 },
				{ type: 'insert', begin: 85, end: 88 },
				{ type: 'delete', id: 0 }
			]);
		});

		test('gen05', () => {
			testIntervalTree([
				{ type: 'insert', begin: 82, end: 90 },
				{ type: 'insert', begin: 69, end: 73 },
				{ type: 'delete', id: 0 },
				{ type: 'delete', id: 1 }
			]);
		});

		test('gen06', () => {
			testIntervalTree([
				{ type: 'insert', begin: 41, end: 63 },
				{ type: 'insert', begin: 98, end: 98 },
				{ type: 'insert', begin: 47, end: 51 },
				{ type: 'delete', id: 2 }
			]);
		});

		test('gen07', () => {
			testIntervalTree([
				{ type: 'insert', begin: 24, end: 26 },
				{ type: 'insert', begin: 11, end: 28 },
				{ type: 'insert', begin: 27, end: 30 },
				{ type: 'insert', begin: 80, end: 85 },
				{ type: 'delete', id: 1 }
			]);
		});

		test('gen08', () => {
			testIntervalTree([
				{ type: 'insert', begin: 100, end: 100 },
				{ type: 'insert', begin: 100, end: 100 }
			]);
		});

		test('gen09', () => {
			testIntervalTree([
				{ type: 'insert', begin: 58, end: 65 },
				{ type: 'insert', begin: 82, end: 96 },
				{ type: 'insert', begin: 58, end: 65 }
			]);
		});

		test('gen10', () => {
			testIntervalTree([
				{ type: 'insert', begin: 32, end: 40 },
				{ type: 'insert', begin: 25, end: 29 },
				{ type: 'insert', begin: 24, end: 32 }
			]);
		});

		test('gen11', () => {
			testIntervalTree([
				{ type: 'insert', begin: 25, end: 70 },
				{ type: 'insert', begin: 99, end: 100 },
				{ type: 'insert', begin: 46, end: 51 },
				{ type: 'insert', begin: 57, end: 57 },
				{ type: 'delete', id: 2 }
			]);
		});

		test('gen12', () => {
			testIntervalTree([
				{ type: 'insert', begin: 20, end: 26 },
				{ type: 'insert', begin: 10, end: 18 },
				{ type: 'insert', begin: 99, end: 99 },
				{ type: 'insert', begin: 37, end: 59 },
				{ type: 'delete', id: 2 }
			]);
		});

		test('gen13', () => {
			testIntervalTree([
				{ type: 'insert', begin: 3, end: 91 },
				{ type: 'insert', begin: 57, end: 57 },
				{ type: 'insert', begin: 35, end: 44 },
				{ type: 'insert', begin: 72, end: 81 },
				{ type: 'delete', id: 2 }
			]);
		});

		test('gen14', () => {
			testIntervalTree([
				{ type: 'insert', begin: 58, end: 61 },
				{ type: 'insert', begin: 34, end: 35 },
				{ type: 'insert', begin: 56, end: 62 },
				{ type: 'insert', begin: 69, end: 78 },
				{ type: 'delete', id: 0 }
			]);
		});

		test('gen15', () => {
			testIntervalTree([
				{ type: 'insert', begin: 63, end: 69 },
				{ type: 'insert', begin: 17, end: 24 },
				{ type: 'insert', begin: 3, end: 13 },
				{ type: 'insert', begin: 84, end: 94 },
				{ type: 'insert', begin: 18, end: 23 },
				{ type: 'insert', begin: 96, end: 98 },
				{ type: 'delete', id: 1 }
			]);
		});

		test('gen16', () => {
			testIntervalTree([
				{ type: 'insert', begin: 27, end: 27 },
				{ type: 'insert', begin: 42, end: 87 },
				{ type: 'insert', begin: 42, end: 49 },
				{ type: 'insert', begin: 69, end: 71 },
				{ type: 'insert', begin: 20, end: 27 },
				{ type: 'insert', begin: 8, end: 9 },
				{ type: 'insert', begin: 42, end: 49 },
				{ type: 'delete', id: 1 }
			]);
		});

		test('gen17', () => {
			testIntervalTree([
				{ type: 'insert', begin: 21, end: 23 },
				{ type: 'insert', begin: 83, end: 87 },
				{ type: 'insert', begin: 56, end: 58 },
				{ type: 'insert', begin: 1, end: 55 },
				{ type: 'insert', begin: 56, end: 59 },
				{ type: 'insert', begin: 58, end: 60 },
				{ type: 'insert', begin: 56, end: 65 },
				{ type: 'delete', id: 1 },
				{ type: 'delete', id: 0 },
				{ type: 'delete', id: 6 }
			]);
		});

		test('gen18', () => {
			testIntervalTree([
				{ type: 'insert', begin: 25, end: 25 },
				{ type: 'insert', begin: 67, end: 79 },
				{ type: 'delete', id: 0 },
				{ type: 'search', begin: 65, end: 75 }
			]);
		});

		test('force delta overflow', () => {
			// Search the IntervalNode ctor for FORCE_OVERFLOWING_TEST
			// to force that this test leads to a delta normalization
			testIntervalTree([
				{ type: 'insert', begin: 686081138593427, end: 733009856502260 },
				{ type: 'insert', begin: 591031326181669, end: 591031326181672 },
				{ type: 'insert', begin: 940037682731896, end: 940037682731903 },
				{ type: 'insert', begin: 598413641151120, end: 598413641151128 },
				{ type: 'insert', begin: 800564156553344, end: 800564156553351 },
				{ type: 'insert', begin: 894198957565481, end: 894198957565491 }
			]);
		});
	});

	// TEST_COUNT = 0;
	// PRINT_TREE = true;

	for (let i = 0; i < TEST_COUNT; i++) {
		if (i % 100 === 0) {
			console.log(`TEST ${i + 1}/${TEST_COUNT}`);
		}
		let test = new AutoTest();

		try {
			test.run();
		} catch (err) {
			console.log(err);
			test.print();
			return;
		}
	}

	suite('searching', () => {

		function createCormenTree(): IntervalTree {
			let r = new IntervalTree();
			let data: [number, number][] = [
				[16, 21],
				[8, 9],
				[25, 30],
				[5, 8],
				[15, 23],
				[17, 19],
				[26, 26],
				[0, 3],
				[6, 10],
				[19, 20]
			];
			data.forEach((int) => {
				let node = new IntervalNode(null, int[0], int[1]);
				r.insert(node);
			});
			return r;
		}

		const T = createCormenTree();

		function assertIntervalSearch(start: number, end: number, expected: [number, number][]): void {
			let actualNodes = T.intervalSearch(start, end, 0, false, 0);
			let actual = actualNodes.map((n) => <[number, number]>[n.cachedAbsoluteStart, n.cachedAbsoluteEnd]);
			assert.deepEqual(actual, expected);
		}

		test('cormen 1->2', () => {
			assertIntervalSearch(
				1, 2,
				[
					[0, 3],
				]
			);
		});

		test('cormen 4->8', () => {
			assertIntervalSearch(
				4, 8,
				[
					[5, 8],
					[6, 10],
					[8, 9],
				]
			);
		});

		test('cormen 10->15', () => {
			assertIntervalSearch(
				10, 15,
				[
					[6, 10],
					[15, 23],
				]
			);
		});

		test('cormen 21->25', () => {
			assertIntervalSearch(
				21, 25,
				[
					[15, 23],
					[16, 21],
					[25, 30],
				]
			);
		});

		test('cormen 24->24', () => {
			assertIntervalSearch(
				24, 24,
				[
				]
			);
		});
	});
});

function printTree(T: IntervalTree): void {
	if (T.root === SENTINEL) {
		console.log(`~~ empty`);
		return;
	}
	let out: string[] = [];
	_printTree(T, T.root, '', 0, out);
	console.log(out.join(''));
}

function _printTree(T: IntervalTree, n: IntervalNode, indent: string, delta: number, out: string[]): void {
	out.push(`${indent}[${getNodeColor(n) === NodeColor.Red ? 'R' : 'B'},${n.delta}, ${n.start}->${n.end}, ${n.maxEnd}] : {${delta + n.start}->${delta + n.end}}, maxEnd: ${n.maxEnd + delta}\n`);
	if (n.left !== SENTINEL) {
		_printTree(T, n.left, indent + '    ', delta, out);
	} else {
		out.push(`${indent}    NIL\n`);
	}
	if (n.right !== SENTINEL) {
		_printTree(T, n.right, indent + '    ', delta + n.delta, out);
	} else {
		out.push(`${indent}    NIL\n`);
	}
}

//#region Assertion

function assertTreeInvariants(T: IntervalTree): void {
	assert(getNodeColor(SENTINEL) === NodeColor.Black);
	assert(SENTINEL.parent === SENTINEL);
	assert(SENTINEL.left === SENTINEL);
	assert(SENTINEL.right === SENTINEL);
	assert(SENTINEL.start === 0);
	assert(SENTINEL.end === 0);
	assert(SENTINEL.delta === 0);
	assert(T.root.parent === SENTINEL);
	assertValidTree(T);
}

function depth(n: IntervalNode): number {
	if (n === SENTINEL) {
		// The leafs are black
		return 1;
	}
	assert(depth(n.left) === depth(n.right));
	return (getNodeColor(n) === NodeColor.Black ? 1 : 0) + depth(n.left);
}

function assertValidNode(n: IntervalNode, delta): void {
	if (n === SENTINEL) {
		return;
	}

	let l = n.left;
	let r = n.right;

	if (getNodeColor(n) === NodeColor.Red) {
		assert(getNodeColor(l) === NodeColor.Black);
		assert(getNodeColor(r) === NodeColor.Black);
	}

	let expectedMaxEnd = n.end;
	if (l !== SENTINEL) {
		assert(intervalCompare(l.start + delta, l.end + delta, n.start + delta, n.end + delta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, l.maxEnd);
	}
	if (r !== SENTINEL) {
		assert(intervalCompare(n.start + delta, n.end + delta, r.start + delta + n.delta, r.end + delta + n.delta) <= 0);
		expectedMaxEnd = Math.max(expectedMaxEnd, r.maxEnd + n.delta);
	}
	assert(n.maxEnd === expectedMaxEnd);

	assertValidNode(l, delta);
	assertValidNode(r, delta + n.delta);
}

function assertValidTree(T: IntervalTree): void {
	if (T.root === SENTINEL) {
		return;
	}
	assert(getNodeColor(T.root) === NodeColor.Black);
	assert(depth(T.root.left) === depth(T.root.right));
	assertValidNode(T.root, 0);
}

//#endregion
