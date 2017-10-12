/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IntervalTree, Interval, IntervalNode } from 'vs/editor/common/model/intervalTree';

const GENERATE_TESTS = false;
let TEST_COUNT = GENERATE_TESTS ? 10000 : 0;
let PRINT_TREE = false;
const MIN_INTERVAL_START = 1;
const MAX_INTERVAL_END = 100;
const MIN_INSERTS = 1;
const MAX_INSERTS = 30;

suite('IntervalTree', () => {

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
				this._treeNodes[nodeId] = this._tree.insert(new Interval(op.begin, op.end));
				this._oracleNodes[nodeId] = this._oracle.insert(new Interval(op.begin, op.end));
			} else if (op.type === 'delete') {
				if (PRINT_TREE) {
					console.log(`delete: {${JSON.stringify(this._oracleNodes[op.id])}}`);
				}
				this._tree.delete(this._treeNodes[op.id]);
				this._oracle.delete(this._oracleNodes[op.id]);

				this._treeNodes[op.id] = null;
				this._oracleNodes[op.id] = null;
			} else {
				let actualNodes = this._tree.intervalSearch(new Interval(op.begin, op.end));
				let actual = actualNodes.map(n => n.resultInterval);
				let expected = this._oracle.search(new Interval(op.begin, op.end));
				assert.deepEqual(actual, expected);
				return;
			}

			if (PRINT_TREE) {
				this._tree.print();
			}

			this._tree.assertInvariants();

			let actual = this._tree.getAllInOrder();
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

	interface ISearchOperation {
		type: 'search';
		begin: number;
		end: number;
	}

	type IOperation = IInsertOperation | IDeleteOperation | ISearchOperation;

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

		constructor() {
			this._insertCnt = getRandomInt(MIN_INSERTS, MAX_INSERTS);
			this._deleteCnt = 0;
		}

		public run() {
			while (this._insertCnt > 0 || this._deleteCnt > 0) {
				let type: 'insert' | 'delete';
				if (this._insertCnt > 0) {
					type = 'insert';
				} else {
					type = 'delete';
				}
				if (type === 'insert') {
					let range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
					this._run({
						type: 'insert',
						begin: range[0],
						end: range[1]
					});
					this._insertCnt--;
					this._deleteCnt++;
				} else {
					let idx = getRandomInt(0, this._deleteCnt - 1);
					this._run({
						type: 'delete',
						id: this._state.getExistingNodeId(idx)
					});
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
				r.insert(new Interval(int[0], int[1]));
			});
			return r;
		}

		const T = createCormenTree();

		function assertIntervalSearch(start: number, end: number, expected: [number, number][]): void {
			let actualNodes = T.intervalSearch(new Interval(start, end));
			let actual = actualNodes.map((n) => <[number, number]>[n.resultInterval.start, n.resultInterval.end]);
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
