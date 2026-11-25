/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILine, RenderedLinesCollection } from '../../../browser/view/viewLayer.js';

class TestLine implements ILine {

	_pinged = false;
	constructor(public id: string) {
	}

	onContentChanged(): void {
		this._pinged = true;
	}
	onTokensChanged(): void {
		this._pinged = true;
	}
}

interface ILinesCollectionState {
	startLineNumber: number;
	lines: string[];
	pinged: boolean[];
}

function assertState(col: RenderedLinesCollection<TestLine>, state: ILinesCollectionState): void {
	const actualState: ILinesCollectionState = {
		startLineNumber: col.getStartLineNumber(),
		lines: [],
		pinged: []
	};
	for (let lineNumber = col.getStartLineNumber(); lineNumber <= col.getEndLineNumber(); lineNumber++) {
		actualState.lines.push(col.getLine(lineNumber).id);
		actualState.pinged.push(col.getLine(lineNumber)._pinged);
	}
	assert.deepStrictEqual(actualState, state);
}

suite('RenderedLinesCollection onLinesDeleted', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testOnModelLinesDeleted(deleteFromLineNumber: number, deleteToLineNumber: number, expectedDeleted: string[], expectedState: ILinesCollectionState): void {
		const col = new RenderedLinesCollection<TestLine>({ createLine: () => new TestLine('new') });
		col._set(6, [
			new TestLine('old6'),
			new TestLine('old7'),
			new TestLine('old8'),
			new TestLine('old9')
		]);
		const actualDeleted1 = col.onLinesDeleted(deleteFromLineNumber, deleteToLineNumber);
		let actualDeleted: string[] = [];
		if (actualDeleted1) {
			actualDeleted = actualDeleted1.map(line => line.id);
		}
		assert.deepStrictEqual(actualDeleted, expectedDeleted);
		assertState(col, expectedState);
	}

	const cases: [name: string, deleteFromLineNumber: number, deleteToLineNumber: number, expectedDeleted: string[], expectedState: ILinesCollectionState][] = [
		['A1', 3, 3, [], { startLineNumber: 5, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A2', 3, 4, [], { startLineNumber: 4, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A3', 3, 5, [], { startLineNumber: 3, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A4', 3, 6, ['old6'], { startLineNumber: 3, lines: ['old7', 'old8', 'old9'], pinged: [false, false, false] }],
		['A5', 3, 7, ['old6', 'old7'], { startLineNumber: 3, lines: ['old8', 'old9'], pinged: [false, false] }],
		['A6', 3, 8, ['old6', 'old7', 'old8'], { startLineNumber: 3, lines: ['old9'], pinged: [false] }],
		['A7', 3, 9, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 3, lines: [], pinged: [] }],
		['A8', 3, 10, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 3, lines: [], pinged: [] }],
		['B1', 5, 5, [], { startLineNumber: 5, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B2', 5, 6, ['old6'], { startLineNumber: 5, lines: ['old7', 'old8', 'old9'], pinged: [false, false, false] }],
		['B3', 5, 7, ['old6', 'old7'], { startLineNumber: 5, lines: ['old8', 'old9'], pinged: [false, false] }],
		['B4', 5, 8, ['old6', 'old7', 'old8'], { startLineNumber: 5, lines: ['old9'], pinged: [false] }],
		['B5', 5, 9, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 5, lines: [], pinged: [] }],
		['B6', 5, 10, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 5, lines: [], pinged: [] }],
		['C1', 6, 6, ['old6'], { startLineNumber: 6, lines: ['old7', 'old8', 'old9'], pinged: [false, false, false] }],
		['C2', 6, 7, ['old6', 'old7'], { startLineNumber: 6, lines: ['old8', 'old9'], pinged: [false, false] }],
		['C3', 6, 8, ['old6', 'old7', 'old8'], { startLineNumber: 6, lines: ['old9'], pinged: [false] }],
		['C4', 6, 9, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 6, lines: [], pinged: [] }],
		['C5', 6, 10, ['old6', 'old7', 'old8', 'old9'], { startLineNumber: 6, lines: [], pinged: [] }],
		['D1', 7, 7, ['old7'], { startLineNumber: 6, lines: ['old6', 'old8', 'old9'], pinged: [false, false, false] }],
		['D2', 7, 8, ['old7', 'old8'], { startLineNumber: 6, lines: ['old6', 'old9'], pinged: [false, false] }],
		['D3', 7, 9, ['old7', 'old8', 'old9'], { startLineNumber: 6, lines: ['old6'], pinged: [false] }],
		['D4', 7, 10, ['old7', 'old8', 'old9'], { startLineNumber: 6, lines: ['old6'], pinged: [false] }],
		['E1', 8, 8, ['old8'], { startLineNumber: 6, lines: ['old6', 'old7', 'old9'], pinged: [false, false, false] }],
		['E2', 8, 9, ['old8', 'old9'], { startLineNumber: 6, lines: ['old6', 'old7'], pinged: [false, false] }],
		['E3', 8, 10, ['old8', 'old9'], { startLineNumber: 6, lines: ['old6', 'old7'], pinged: [false, false] }],
		['F1', 9, 9, ['old9'], { startLineNumber: 6, lines: ['old6', 'old7', 'old8'], pinged: [false, false, false] }],
		['F2', 9, 10, ['old9'], { startLineNumber: 6, lines: ['old6', 'old7', 'old8'], pinged: [false, false, false] }],
		['G1', 10, 10, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['G2', 10, 11, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['H1', 11, 13, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
	];

	for (const [name, deleteFromLineNumber, deleteToLineNumber, expectedDeleted, expectedState] of cases) {
		test(name, () => {
			testOnModelLinesDeleted(deleteFromLineNumber, deleteToLineNumber, expectedDeleted, expectedState);
		});
	}
});

suite('RenderedLinesCollection onLineChanged', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testOnModelLineChanged(changedLineNumber: number, expectedPinged: boolean, expectedState: ILinesCollectionState): void {
		const col = new RenderedLinesCollection<TestLine>({ createLine: () => new TestLine('new') });
		col._set(6, [
			new TestLine('old6'),
			new TestLine('old7'),
			new TestLine('old8'),
			new TestLine('old9')
		]);
		const actualPinged = col.onLinesChanged(changedLineNumber, 1);
		assert.deepStrictEqual(actualPinged, expectedPinged);
		assertState(col, expectedState);
	}

	const cases: [name: string, changedLineNumber: number, expectedPinged: boolean, pinged: boolean[]][] = [
		['3', 3, false, [false, false, false, false]],
		['4', 4, false, [false, false, false, false]],
		['5', 5, false, [false, false, false, false]],
		['6', 6, true, [true, false, false, false]],
		['7', 7, true, [false, true, false, false]],
		['8', 8, true, [false, false, true, false]],
		['9', 9, true, [false, false, false, true]],
		['10', 10, false, [false, false, false, false]],
		['11', 11, false, [false, false, false, false]],
	];

	for (const [name, changedLineNumber, expectedPinged, pinged] of cases) {
		test(name, () => {
			testOnModelLineChanged(changedLineNumber, expectedPinged, {
				startLineNumber: 6,
				lines: ['old6', 'old7', 'old8', 'old9'],
				pinged
			});
		});
	}

});

suite('RenderedLinesCollection onLinesInserted', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testOnModelLinesInserted(insertFromLineNumber: number, insertToLineNumber: number, expectedDeleted: string[], expectedState: ILinesCollectionState): void {
		const col = new RenderedLinesCollection<TestLine>({ createLine: () => new TestLine('new') });
		col._set(6, [
			new TestLine('old6'),
			new TestLine('old7'),
			new TestLine('old8'),
			new TestLine('old9')
		]);
		const actualDeleted1 = col.onLinesInserted(insertFromLineNumber, insertToLineNumber);
		let actualDeleted: string[] = [];
		if (actualDeleted1) {
			actualDeleted = actualDeleted1.map(line => line.id);
		}
		assert.deepStrictEqual(actualDeleted, expectedDeleted);
		assertState(col, expectedState);
	}

	const cases: [name: string, insertFromLineNumber: number, insertToLineNumber: number, expectedDeleted: string[], expectedState: ILinesCollectionState][] = [
		['A1', 3, 3, [], { startLineNumber: 7, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A2', 3, 4, [], { startLineNumber: 8, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A3', 3, 5, [], { startLineNumber: 9, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A4', 3, 6, [], { startLineNumber: 10, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A5', 3, 7, [], { startLineNumber: 11, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A6', 3, 8, [], { startLineNumber: 12, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A7', 3, 9, [], { startLineNumber: 13, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['A8', 3, 10, [], { startLineNumber: 14, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B1', 5, 5, [], { startLineNumber: 7, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B2', 5, 6, [], { startLineNumber: 8, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B3', 5, 7, [], { startLineNumber: 9, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B4', 5, 8, [], { startLineNumber: 10, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B5', 5, 9, [], { startLineNumber: 11, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['B6', 5, 10, [], { startLineNumber: 12, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['C1', 6, 6, [], { startLineNumber: 7, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['C2', 6, 7, [], { startLineNumber: 8, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['C3', 6, 8, [], { startLineNumber: 9, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['C4', 6, 9, [], { startLineNumber: 10, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['C5', 6, 10, [], { startLineNumber: 11, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['D1', 7, 7, ['old9'], { startLineNumber: 6, lines: ['old6', 'new', 'old7', 'old8'], pinged: [false, false, false, false] }],
		['D2', 7, 8, ['old8', 'old9'], { startLineNumber: 6, lines: ['old6', 'new', 'new', 'old7'], pinged: [false, false, false, false] }],
		['D3', 7, 9, ['old7', 'old8', 'old9'], { startLineNumber: 6, lines: ['old6'], pinged: [false] }],
		['D4', 7, 10, ['old7', 'old8', 'old9'], { startLineNumber: 6, lines: ['old6'], pinged: [false] }],
		['E1', 8, 8, ['old9'], { startLineNumber: 6, lines: ['old6', 'old7', 'new', 'old8'], pinged: [false, false, false, false] }],
		['E2', 8, 9, ['old8', 'old9'], { startLineNumber: 6, lines: ['old6', 'old7'], pinged: [false, false] }],
		['E3', 8, 10, ['old8', 'old9'], { startLineNumber: 6, lines: ['old6', 'old7'], pinged: [false, false] }],
		['F1', 9, 9, ['old9'], { startLineNumber: 6, lines: ['old6', 'old7', 'old8'], pinged: [false, false, false] }],
		['F2', 9, 10, ['old9'], { startLineNumber: 6, lines: ['old6', 'old7', 'old8'], pinged: [false, false, false] }],
		['G1', 10, 10, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['G2', 10, 11, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
		['H1', 11, 13, [], { startLineNumber: 6, lines: ['old6', 'old7', 'old8', 'old9'], pinged: [false, false, false, false] }],
	];

	for (const [name, insertFromLineNumber, insertToLineNumber, expectedDeleted, expectedState] of cases) {
		test(name, () => {
			testOnModelLinesInserted(insertFromLineNumber, insertToLineNumber, expectedDeleted, expectedState);
		});
	}
});


suite('RenderedLinesCollection onTokensChanged', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function testOnModelTokensChanged(changedFromLineNumber: number, changedToLineNumber: number, expectedPinged: boolean, expectedState: ILinesCollectionState): void {
		const col = new RenderedLinesCollection<TestLine>({ createLine: () => new TestLine('new') });
		col._set(6, [
			new TestLine('old6'),
			new TestLine('old7'),
			new TestLine('old8'),
			new TestLine('old9')
		]);
		const actualPinged = col.onTokensChanged([{ fromLineNumber: changedFromLineNumber, toLineNumber: changedToLineNumber }]);
		assert.deepStrictEqual(actualPinged, expectedPinged);
		assertState(col, expectedState);
	}

	const cases: [name: string, changedFromLineNumber: number, changedToLineNumber: number, expectedPinged: boolean, pinged: boolean[]][] = [
		['A', 3, 3, false, [false, false, false, false]],
		['B', 3, 5, false, [false, false, false, false]],
		['C', 3, 6, true, [true, false, false, false]],
		['D', 6, 6, true, [true, false, false, false]],
		['E', 5, 10, true, [true, true, true, true]],
		['F', 8, 9, true, [false, false, true, true]],
		['G', 8, 11, true, [false, false, true, true]],
		['H', 10, 10, false, [false, false, false, false]],
		['I', 10, 11, false, [false, false, false, false]],
	];

	for (const [name, changedFromLineNumber, changedToLineNumber, expectedPinged, pinged] of cases) {
		test(name, () => {
			testOnModelTokensChanged(changedFromLineNumber, changedToLineNumber, expectedPinged, {
				startLineNumber: 6,
				lines: ['old6', 'old7', 'old8', 'old9'],
				pinged
			});
		});
	}
});
