/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { WordCharacterClassifier } from '../../../../common/core/wordCharacterClassifier.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { DefaultEndOfLine, ITextSnapshot, SearchData } from '../../../../common/model.js';
import { PieceTreeBase } from '../../../../common/model/pieceTreeTextBuffer/pieceTreeBase.js';
import { PieceTreeTextBuffer } from '../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.js';
import { PieceTreeTextBufferBuilder } from '../../../../common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { NodeColor, SENTINEL, TreeNode } from '../../../../common/model/pieceTreeTextBuffer/rbTreeBase.js';
import { createTextModel } from '../../testTextModel.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n';

function randomChar() {
	return alphabet[randomInt(alphabet.length)];
}

function randomInt(bound: number) {
	return Math.floor(Math.random() * bound);
}

function randomStr(len: number) {
	if (len === null) {
		len = 10;
	}
	return (function () {
		let j, ref;
		const results = [];
		for (
			j = 1, ref = len;
			1 <= ref ? j < ref : j > ref;
			1 <= ref ? j++ : j--
		) {
			results.push(randomChar());
		}
		return results;
	})().join('');
}

function trimLineFeed(text: string): string {
	if (text.length === 0) {
		return text;
	}

	if (text.length === 1) {
		if (
			text.charCodeAt(text.length - 1) === 10 ||
			text.charCodeAt(text.length - 1) === 13
		) {
			return '';
		}
		return text;
	}

	if (text.charCodeAt(text.length - 1) === 10) {
		if (text.charCodeAt(text.length - 2) === 13) {
			return text.slice(0, -2);
		}
		return text.slice(0, -1);
	}

	if (text.charCodeAt(text.length - 1) === 13) {
		return text.slice(0, -1);
	}

	return text;
}

//#region Assertion

function testLinesContent(str: string, pieceTable: PieceTreeBase) {
	const lines = splitLines(str);
	assert.strictEqual(pieceTable.getLineCount(), lines.length);
	assert.strictEqual(pieceTable.getLinesRawContent(), str);
	for (let i = 0; i < lines.length; i++) {
		assert.strictEqual(pieceTable.getLineContent(i + 1), lines[i]);
		assert.strictEqual(
			trimLineFeed(
				pieceTable.getValueInRange(
					new Range(
						i + 1,
						1,
						i + 1,
						lines[i].length + (i === lines.length - 1 ? 1 : 2)
					)
				)
			),
			lines[i]
		);
	}
}

function testLineStarts(str: string, pieceTable: PieceTreeBase) {
	const lineStarts = [0];

	// Reset regex to search from the beginning
	const _regex = new RegExp(/\r\n|\r|\n/g);
	_regex.lastIndex = 0;
	let prevMatchStartIndex = -1;
	let prevMatchLength = 0;

	let m: RegExpExecArray | null;
	do {
		if (prevMatchStartIndex + prevMatchLength === str.length) {
			// Reached the end of the line
			break;
		}

		m = _regex.exec(str);
		if (!m) {
			break;
		}

		const matchStartIndex = m.index;
		const matchLength = m[0].length;

		if (
			matchStartIndex === prevMatchStartIndex &&
			matchLength === prevMatchLength
		) {
			// Exit early if the regex matches the same range twice
			break;
		}

		prevMatchStartIndex = matchStartIndex;
		prevMatchLength = matchLength;

		lineStarts.push(matchStartIndex + matchLength);
	} while (m);

	for (let i = 0; i < lineStarts.length; i++) {
		assert.deepStrictEqual(
			pieceTable.getPositionAt(lineStarts[i]),
			new Position(i + 1, 1)
		);
		assert.strictEqual(pieceTable.getOffsetAt(i + 1, 1), lineStarts[i]);
	}

	for (let i = 1; i < lineStarts.length; i++) {
		const pos = pieceTable.getPositionAt(lineStarts[i] - 1);
		assert.strictEqual(
			pieceTable.getOffsetAt(pos.lineNumber, pos.column),
			lineStarts[i] - 1
		);
	}
}

function createTextBuffer(val: string[], normalizeEOL: boolean = true): PieceTreeTextBuffer {
	const bufferBuilder = new PieceTreeTextBufferBuilder();
	for (const chunk of val) {
		bufferBuilder.acceptChunk(chunk);
	}
	const factory = bufferBuilder.finish(normalizeEOL);
	return (<PieceTreeTextBuffer>factory.create(DefaultEndOfLine.LF).textBuffer);
}

function assertTreeInvariants(T: PieceTreeBase): void {
	assert(SENTINEL.color === NodeColor.Black);
	assert(SENTINEL.parent === SENTINEL);
	assert(SENTINEL.left === SENTINEL);
	assert(SENTINEL.right === SENTINEL);
	assert(SENTINEL.size_left === 0);
	assert(SENTINEL.lf_left === 0);
	assertValidTree(T);
}

function depth(n: TreeNode): number {
	if (n === SENTINEL) {
		// The leafs are black
		return 1;
	}
	assert(depth(n.left) === depth(n.right));
	return (n.color === NodeColor.Black ? 1 : 0) + depth(n.left);
}

function assertValidNode(n: TreeNode): { size: number; lf_cnt: number } {
	if (n === SENTINEL) {
		return { size: 0, lf_cnt: 0 };
	}

	const l = n.left;
	const r = n.right;

	if (n.color === NodeColor.Red) {
		assert(l.color === NodeColor.Black);
		assert(r.color === NodeColor.Black);
	}

	const actualLeft = assertValidNode(l);
	assert(actualLeft.lf_cnt === n.lf_left);
	assert(actualLeft.size === n.size_left);
	const actualRight = assertValidNode(r);

	return { size: n.size_left + n.piece.length + actualRight.size, lf_cnt: n.lf_left + n.piece.lineFeedCnt + actualRight.lf_cnt };
}

function assertValidTree(T: PieceTreeBase): void {
	if (T.root === SENTINEL) {
		return;
	}
	assert(T.root.color === NodeColor.Black);
	assert(depth(T.root.left) === depth(T.root.right));
	assertValidNode(T.root);
}

//#endregion

suite('inserts and deletes', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('basic insert/delete', () => {
		const pieceTree = createTextBuffer([
			'This is a document with some text.'
		]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(34, 'This is some more text to insert at offset 34.');
		assert.strictEqual(
			pieceTable.getLinesRawContent(),
			'This is a document with some text.This is some more text to insert at offset 34.'
		);
		pieceTable.delete(42, 5);
		assert.strictEqual(
			pieceTable.getLinesRawContent(),
			'This is a document with some text.This is more text to insert at offset 34.'
		);
		assertTreeInvariants(pieceTable);
	});

	test('more inserts', () => {
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pt = pieceTree.getPieceTree();
		pt.insert(0, 'AAA');
		assert.strictEqual(pt.getLinesRawContent(), 'AAA');
		pt.insert(0, 'BBB');
		assert.strictEqual(pt.getLinesRawContent(), 'BBBAAA');
		pt.insert(6, 'CCC');
		assert.strictEqual(pt.getLinesRawContent(), 'BBBAAACCC');
		pt.insert(5, 'DDD');
		assert.strictEqual(pt.getLinesRawContent(), 'BBBAADDDACCC');
		assertTreeInvariants(pt);
	});

	test('more deletes', () => {
		const pieceTree = createTextBuffer(['012345678']);
		ds.add(pieceTree);
		const pt = pieceTree.getPieceTree();

		pt.delete(8, 1);
		assert.strictEqual(pt.getLinesRawContent(), '01234567');
		pt.delete(0, 1);
		assert.strictEqual(pt.getLinesRawContent(), '1234567');
		pt.delete(5, 1);
		assert.strictEqual(pt.getLinesRawContent(), '123457');
		pt.delete(5, 1);
		assert.strictEqual(pt.getLinesRawContent(), '12345');
		pt.delete(0, 5);
		assert.strictEqual(pt.getLinesRawContent(), '');
		assertTreeInvariants(pt);
	});

	test('random test 1', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'ceLPHmFzvCtFeHkCBej ');
		str = str.substring(0, 0) + 'ceLPHmFzvCtFeHkCBej ' + str.substring(0);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		pieceTable.insert(8, 'gDCEfNYiBUNkSwtvB K ');
		str = str.substring(0, 8) + 'gDCEfNYiBUNkSwtvB K ' + str.substring(8);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		pieceTable.insert(38, 'cyNcHxjNPPoehBJldLS ');
		str = str.substring(0, 38) + 'cyNcHxjNPPoehBJldLS ' + str.substring(38);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		pieceTable.insert(59, 'ejMx\nOTgWlbpeDExjOk ');
		str = str.substring(0, 59) + 'ejMx\nOTgWlbpeDExjOk ' + str.substring(59);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random test 2', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'VgPG ');
		str = str.substring(0, 0) + 'VgPG ' + str.substring(0);
		pieceTable.insert(2, 'DdWF ');
		str = str.substring(0, 2) + 'DdWF ' + str.substring(2);
		pieceTable.insert(0, 'hUJc ');
		str = str.substring(0, 0) + 'hUJc ' + str.substring(0);
		pieceTable.insert(8, 'lQEq ');
		str = str.substring(0, 8) + 'lQEq ' + str.substring(8);
		pieceTable.insert(10, 'Gbtp ');
		str = str.substring(0, 10) + 'Gbtp ' + str.substring(10);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random test 3', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'gYSz');
		str = str.substring(0, 0) + 'gYSz' + str.substring(0);
		pieceTable.insert(1, 'mDQe');
		str = str.substring(0, 1) + 'mDQe' + str.substring(1);
		pieceTable.insert(1, 'DTMQ');
		str = str.substring(0, 1) + 'DTMQ' + str.substring(1);
		pieceTable.insert(2, 'GGZB');
		str = str.substring(0, 2) + 'GGZB' + str.substring(2);
		pieceTable.insert(12, 'wXpq');
		str = str.substring(0, 12) + 'wXpq' + str.substring(12);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
	});

	test('random delete 1', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'vfb');
		str = str.substring(0, 0) + 'vfb' + str.substring(0);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		pieceTable.insert(0, 'zRq');
		str = str.substring(0, 0) + 'zRq' + str.substring(0);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		pieceTable.delete(5, 1);
		str = str.substring(0, 5) + str.substring(5 + 1);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		pieceTable.insert(1, 'UNw');
		str = str.substring(0, 1) + 'UNw' + str.substring(1);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		pieceTable.delete(4, 3);
		str = str.substring(0, 4) + str.substring(4 + 3);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		pieceTable.delete(1, 4);
		str = str.substring(0, 1) + str.substring(1 + 4);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		pieceTable.delete(0, 1);
		str = str.substring(0, 0) + str.substring(0 + 1);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random delete 2', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'IDT');
		str = str.substring(0, 0) + 'IDT' + str.substring(0);
		pieceTable.insert(3, 'wwA');
		str = str.substring(0, 3) + 'wwA' + str.substring(3);
		pieceTable.insert(3, 'Gnr');
		str = str.substring(0, 3) + 'Gnr' + str.substring(3);
		pieceTable.delete(6, 3);
		str = str.substring(0, 6) + str.substring(6 + 3);
		pieceTable.insert(4, 'eHp');
		str = str.substring(0, 4) + 'eHp' + str.substring(4);
		pieceTable.insert(1, 'UAi');
		str = str.substring(0, 1) + 'UAi' + str.substring(1);
		pieceTable.insert(2, 'FrR');
		str = str.substring(0, 2) + 'FrR' + str.substring(2);
		pieceTable.delete(6, 7);
		str = str.substring(0, 6) + str.substring(6 + 7);
		pieceTable.delete(3, 5);
		str = str.substring(0, 3) + str.substring(3 + 5);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random delete 3', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'PqM');
		str = str.substring(0, 0) + 'PqM' + str.substring(0);
		pieceTable.delete(1, 2);
		str = str.substring(0, 1) + str.substring(1 + 2);
		pieceTable.insert(1, 'zLc');
		str = str.substring(0, 1) + 'zLc' + str.substring(1);
		pieceTable.insert(0, 'MEX');
		str = str.substring(0, 0) + 'MEX' + str.substring(0);
		pieceTable.insert(0, 'jZh');
		str = str.substring(0, 0) + 'jZh' + str.substring(0);
		pieceTable.insert(8, 'GwQ');
		str = str.substring(0, 8) + 'GwQ' + str.substring(8);
		pieceTable.delete(5, 6);
		str = str.substring(0, 5) + str.substring(5 + 6);
		pieceTable.insert(4, 'ktw');
		str = str.substring(0, 4) + 'ktw' + str.substring(4);
		pieceTable.insert(5, 'GVu');
		str = str.substring(0, 5) + 'GVu' + str.substring(5);
		pieceTable.insert(9, 'jdm');
		str = str.substring(0, 9) + 'jdm' + str.substring(9);
		pieceTable.insert(15, 'na\n');
		str = str.substring(0, 15) + 'na\n' + str.substring(15);
		pieceTable.delete(5, 8);
		str = str.substring(0, 5) + str.substring(5 + 8);
		pieceTable.delete(3, 4);
		str = str.substring(0, 3) + str.substring(3 + 4);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random insert/delete \\r bug 1', () => {
		let str = 'a';
		const pieceTree = createTextBuffer(['a']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.delete(0, 1);
		str = str.substring(0, 0) + str.substring(0 + 1);
		pieceTable.insert(0, '\r\r\n\n');
		str = str.substring(0, 0) + '\r\r\n\n' + str.substring(0);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.insert(2, '\n\n\ra');
		str = str.substring(0, 2) + '\n\n\ra' + str.substring(2);
		pieceTable.delete(4, 3);
		str = str.substring(0, 4) + str.substring(4 + 3);
		pieceTable.insert(2, '\na\r\r');
		str = str.substring(0, 2) + '\na\r\r' + str.substring(2);
		pieceTable.insert(6, '\ra\n\n');
		str = str.substring(0, 6) + '\ra\n\n' + str.substring(6);
		pieceTable.insert(0, 'aa\n\n');
		str = str.substring(0, 0) + 'aa\n\n' + str.substring(0);
		pieceTable.insert(5, '\n\na\r');
		str = str.substring(0, 5) + '\n\na\r' + str.substring(5);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random insert/delete \\r bug 2', () => {
		let str = 'a';
		const pieceTree = createTextBuffer(['a']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(1, '\naa\r');
		str = str.substring(0, 1) + '\naa\r' + str.substring(1);
		pieceTable.delete(0, 4);
		str = str.substring(0, 0) + str.substring(0 + 4);
		pieceTable.insert(1, '\r\r\na');
		str = str.substring(0, 1) + '\r\r\na' + str.substring(1);
		pieceTable.insert(2, '\n\r\ra');
		str = str.substring(0, 2) + '\n\r\ra' + str.substring(2);
		pieceTable.delete(4, 1);
		str = str.substring(0, 4) + str.substring(4 + 1);
		pieceTable.insert(8, '\r\n\r\r');
		str = str.substring(0, 8) + '\r\n\r\r' + str.substring(8);
		pieceTable.insert(7, '\n\n\na');
		str = str.substring(0, 7) + '\n\n\na' + str.substring(7);
		pieceTable.insert(13, 'a\n\na');
		str = str.substring(0, 13) + 'a\n\na' + str.substring(13);
		pieceTable.delete(17, 3);
		str = str.substring(0, 17) + str.substring(17 + 3);
		pieceTable.insert(2, 'a\ra\n');
		str = str.substring(0, 2) + 'a\ra\n' + str.substring(2);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random insert/delete \\r bug 3', () => {
		let str = 'a';
		const pieceTree = createTextBuffer(['a']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, '\r\na\r');
		str = str.substring(0, 0) + '\r\na\r' + str.substring(0);
		pieceTable.delete(2, 3);
		str = str.substring(0, 2) + str.substring(2 + 3);
		pieceTable.insert(2, 'a\r\n\r');
		str = str.substring(0, 2) + 'a\r\n\r' + str.substring(2);
		pieceTable.delete(4, 2);
		str = str.substring(0, 4) + str.substring(4 + 2);
		pieceTable.insert(4, 'a\n\r\n');
		str = str.substring(0, 4) + 'a\n\r\n' + str.substring(4);
		pieceTable.insert(1, 'aa\n\r');
		str = str.substring(0, 1) + 'aa\n\r' + str.substring(1);
		pieceTable.insert(7, '\na\r\n');
		str = str.substring(0, 7) + '\na\r\n' + str.substring(7);
		pieceTable.insert(5, '\n\na\r');
		str = str.substring(0, 5) + '\n\na\r' + str.substring(5);
		pieceTable.insert(10, '\r\r\n\r');
		str = str.substring(0, 10) + '\r\r\n\r' + str.substring(10);
		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		pieceTable.delete(21, 3);
		str = str.substring(0, 21) + str.substring(21 + 3);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});

	test('random insert/delete \\r bug 4s', () => {
		let str = 'a';
		const pieceTree = createTextBuffer(['a']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.delete(0, 1);
		str = str.substring(0, 0) + str.substring(0 + 1);
		pieceTable.insert(0, '\naaa');
		str = str.substring(0, 0) + '\naaa' + str.substring(0);
		pieceTable.insert(2, '\n\naa');
		str = str.substring(0, 2) + '\n\naa' + str.substring(2);
		pieceTable.delete(1, 4);
		str = str.substring(0, 1) + str.substring(1 + 4);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.delete(1, 2);
		str = str.substring(0, 1) + str.substring(1 + 2);
		pieceTable.delete(0, 1);
		str = str.substring(0, 0) + str.substring(0 + 1);
		pieceTable.insert(0, 'a\n\n\r');
		str = str.substring(0, 0) + 'a\n\n\r' + str.substring(0);
		pieceTable.insert(2, 'aa\r\n');
		str = str.substring(0, 2) + 'aa\r\n' + str.substring(2);
		pieceTable.insert(3, 'a\naa');
		str = str.substring(0, 3) + 'a\naa' + str.substring(3);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});
	test('random insert/delete \\r bug 5', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, '\n\n\n\r');
		str = str.substring(0, 0) + '\n\n\n\r' + str.substring(0);
		pieceTable.insert(1, '\n\n\n\r');
		str = str.substring(0, 1) + '\n\n\n\r' + str.substring(1);
		pieceTable.insert(2, '\n\r\r\r');
		str = str.substring(0, 2) + '\n\r\r\r' + str.substring(2);
		pieceTable.insert(8, '\n\r\n\r');
		str = str.substring(0, 8) + '\n\r\n\r' + str.substring(8);
		pieceTable.delete(5, 2);
		str = str.substring(0, 5) + str.substring(5 + 2);
		pieceTable.insert(4, '\n\r\r\r');
		str = str.substring(0, 4) + '\n\r\r\r' + str.substring(4);
		pieceTable.insert(8, '\n\n\n\r');
		str = str.substring(0, 8) + '\n\n\n\r' + str.substring(8);
		pieceTable.delete(0, 7);
		str = str.substring(0, 0) + str.substring(0 + 7);
		pieceTable.insert(1, '\r\n\r\r');
		str = str.substring(0, 1) + '\r\n\r\r' + str.substring(1);
		pieceTable.insert(15, '\n\r\r\r');
		str = str.substring(0, 15) + '\n\r\r\r' + str.substring(15);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		assertTreeInvariants(pieceTable);
	});
});

suite('prefix sum for line feed', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('basic', () => {
		const pieceTree = createTextBuffer(['1\n2\n3\n4']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		assert.strictEqual(pieceTable.getLineCount(), 4);
		assert.deepStrictEqual(pieceTable.getPositionAt(0), new Position(1, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(1), new Position(1, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(2), new Position(2, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(3), new Position(2, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(4), new Position(3, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(5), new Position(3, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));

		assert.strictEqual(pieceTable.getOffsetAt(1, 1), 0);
		assert.strictEqual(pieceTable.getOffsetAt(1, 2), 1);
		assert.strictEqual(pieceTable.getOffsetAt(2, 1), 2);
		assert.strictEqual(pieceTable.getOffsetAt(2, 2), 3);
		assert.strictEqual(pieceTable.getOffsetAt(3, 1), 4);
		assert.strictEqual(pieceTable.getOffsetAt(3, 2), 5);
		assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
		assertTreeInvariants(pieceTable);
	});

	test('append', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\nde']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(8, 'fh\ni\njk');

		assert.strictEqual(pieceTable.getLineCount(), 6);
		assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(4, 4));
		assert.strictEqual(pieceTable.getOffsetAt(1, 1), 0);
		assertTreeInvariants(pieceTable);
	});

	test('insert', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\nde']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(7, 'fh\ni\njk');

		assert.strictEqual(pieceTable.getLineCount(), 6);
		assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
		assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(4, 4));
		assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(14), new Position(6, 3));

		assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
		assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
		assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
		assert.strictEqual(pieceTable.getOffsetAt(4, 4), 9);
		assert.strictEqual(pieceTable.getOffsetAt(6, 1), 12);
		assert.strictEqual(pieceTable.getOffsetAt(6, 2), 13);
		assert.strictEqual(pieceTable.getOffsetAt(6, 3), 14);
		assertTreeInvariants(pieceTable);
	});

	test('delete', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\ndefh\ni\njk']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(7, 2);

		assert.strictEqual(pieceTable.getLinesRawContent(), 'a\nb\nc\ndh\ni\njk');
		assert.strictEqual(pieceTable.getLineCount(), 6);
		assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
		assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(5, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(11), new Position(6, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 3));

		assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
		assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
		assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
		assert.strictEqual(pieceTable.getOffsetAt(5, 1), 9);
		assert.strictEqual(pieceTable.getOffsetAt(6, 1), 11);
		assert.strictEqual(pieceTable.getOffsetAt(6, 2), 12);
		assert.strictEqual(pieceTable.getOffsetAt(6, 3), 13);
		assertTreeInvariants(pieceTable);
	});

	test('add+delete 1', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\nde']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(8, 'fh\ni\njk');
		pieceTable.delete(7, 2);

		assert.strictEqual(pieceTable.getLinesRawContent(), 'a\nb\nc\ndh\ni\njk');
		assert.strictEqual(pieceTable.getLineCount(), 6);
		assert.deepStrictEqual(pieceTable.getPositionAt(6), new Position(4, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(7), new Position(4, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(8), new Position(4, 3));
		assert.deepStrictEqual(pieceTable.getPositionAt(9), new Position(5, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(11), new Position(6, 1));
		assert.deepStrictEqual(pieceTable.getPositionAt(12), new Position(6, 2));
		assert.deepStrictEqual(pieceTable.getPositionAt(13), new Position(6, 3));

		assert.strictEqual(pieceTable.getOffsetAt(4, 1), 6);
		assert.strictEqual(pieceTable.getOffsetAt(4, 2), 7);
		assert.strictEqual(pieceTable.getOffsetAt(4, 3), 8);
		assert.strictEqual(pieceTable.getOffsetAt(5, 1), 9);
		assert.strictEqual(pieceTable.getOffsetAt(6, 1), 11);
		assert.strictEqual(pieceTable.getOffsetAt(6, 2), 12);
		assert.strictEqual(pieceTable.getOffsetAt(6, 3), 13);
		assertTreeInvariants(pieceTable);
	});

	test('insert random bug 1: prefixSumComputer.removeValues(start, cnt) cnt is 1 based.', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, ' ZX \n Z\nZ\n YZ\nY\nZXX ');
		str =
			str.substring(0, 0) +
			' ZX \n Z\nZ\n YZ\nY\nZXX ' +
			str.substring(0);
		pieceTable.insert(14, 'X ZZ\nYZZYZXXY Y XY\n ');
		str =
			str.substring(0, 14) + 'X ZZ\nYZZYZXXY Y XY\n ' + str.substring(14);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('insert random bug 2: prefixSumComputer initialize does not do deep copy of UInt32Array.', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'ZYZ\nYY XY\nX \nZ Y \nZ ');
		str =
			str.substring(0, 0) + 'ZYZ\nYY XY\nX \nZ Y \nZ ' + str.substring(0);
		pieceTable.insert(3, 'XXY \n\nY Y YYY  ZYXY ');
		str = str.substring(0, 3) + 'XXY \n\nY Y YYY  ZYXY ' + str.substring(3);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('delete random bug 1: I forgot to update the lineFeedCnt when deletion is on one single piece.', () => {
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'ba\na\nca\nba\ncbab\ncaa ');
		pieceTable.insert(13, 'cca\naabb\ncac\nccc\nab ');
		pieceTable.delete(5, 8);
		pieceTable.delete(30, 2);
		pieceTable.insert(24, 'cbbacccbac\nbaaab\n\nc ');
		pieceTable.delete(29, 3);
		pieceTable.delete(23, 9);
		pieceTable.delete(21, 5);
		pieceTable.delete(30, 3);
		pieceTable.insert(3, 'cb\nac\nc\n\nacc\nbb\nb\nc ');
		pieceTable.delete(19, 5);
		pieceTable.insert(18, '\nbb\n\nacbc\ncbb\nc\nbb\n ');
		pieceTable.insert(65, 'cbccbac\nbc\n\nccabba\n ');
		pieceTable.insert(77, 'a\ncacb\n\nac\n\n\n\n\nabab ');
		pieceTable.delete(30, 9);
		pieceTable.insert(45, 'b\n\nc\nba\n\nbbbba\n\naa\n ');
		pieceTable.insert(82, 'ab\nbb\ncabacab\ncbc\na ');
		pieceTable.delete(123, 9);
		pieceTable.delete(71, 2);
		pieceTable.insert(33, 'acaa\nacb\n\naa\n\nc\n\n\n\n ');

		const str = pieceTable.getLinesRawContent();
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('delete random bug rb tree 1', () => {
		let str = '';
		const pieceTree = createTextBuffer([str]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'YXXZ\n\nYY\n');
		str = str.substring(0, 0) + 'YXXZ\n\nYY\n' + str.substring(0);
		pieceTable.delete(0, 5);
		str = str.substring(0, 0) + str.substring(0 + 5);
		pieceTable.insert(0, 'ZXYY\nX\nZ\n');
		str = str.substring(0, 0) + 'ZXYY\nX\nZ\n' + str.substring(0);
		pieceTable.insert(10, '\nXY\nYXYXY');
		str = str.substring(0, 10) + '\nXY\nYXYXY' + str.substring(10);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('delete random bug rb tree 2', () => {
		let str = '';
		const pieceTree = createTextBuffer([str]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'YXXZ\n\nYY\n');
		str = str.substring(0, 0) + 'YXXZ\n\nYY\n' + str.substring(0);
		pieceTable.insert(0, 'ZXYY\nX\nZ\n');
		str = str.substring(0, 0) + 'ZXYY\nX\nZ\n' + str.substring(0);
		pieceTable.insert(10, '\nXY\nYXYXY');
		str = str.substring(0, 10) + '\nXY\nYXYXY' + str.substring(10);
		pieceTable.insert(8, 'YZXY\nZ\nYX');
		str = str.substring(0, 8) + 'YZXY\nZ\nYX' + str.substring(8);
		pieceTable.insert(12, 'XX\nXXYXYZ');
		str = str.substring(0, 12) + 'XX\nXXYXYZ' + str.substring(12);
		pieceTable.delete(0, 4);
		str = str.substring(0, 0) + str.substring(0 + 4);

		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('delete random bug rb tree 3', () => {
		let str = '';
		const pieceTree = createTextBuffer([str]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'YXXZ\n\nYY\n');
		str = str.substring(0, 0) + 'YXXZ\n\nYY\n' + str.substring(0);
		pieceTable.delete(7, 2);
		str = str.substring(0, 7) + str.substring(7 + 2);
		pieceTable.delete(6, 1);
		str = str.substring(0, 6) + str.substring(6 + 1);
		pieceTable.delete(0, 5);
		str = str.substring(0, 0) + str.substring(0 + 5);
		pieceTable.insert(0, 'ZXYY\nX\nZ\n');
		str = str.substring(0, 0) + 'ZXYY\nX\nZ\n' + str.substring(0);
		pieceTable.insert(10, '\nXY\nYXYXY');
		str = str.substring(0, 10) + '\nXY\nYXYXY' + str.substring(10);
		pieceTable.insert(8, 'YZXY\nZ\nYX');
		str = str.substring(0, 8) + 'YZXY\nZ\nYX' + str.substring(8);
		pieceTable.insert(12, 'XX\nXXYXYZ');
		str = str.substring(0, 12) + 'XX\nXXYXYZ' + str.substring(12);
		pieceTable.delete(0, 4);
		str = str.substring(0, 0) + str.substring(0 + 4);
		pieceTable.delete(30, 3);
		str = str.substring(0, 30) + str.substring(30 + 3);

		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('offset 2 position', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('random tests bug 1', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'huuyYzUfKOENwGgZLqn ');
		str = str.substring(0, 0) + 'huuyYzUfKOENwGgZLqn ' + str.substring(0);
		pieceTable.delete(18, 2);
		str = str.substring(0, 18) + str.substring(18 + 2);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.delete(12, 4);
		str = str.substring(0, 12) + str.substring(12 + 4);
		pieceTable.insert(3, 'hMbnVEdTSdhLlPevXKF ');
		str = str.substring(0, 3) + 'hMbnVEdTSdhLlPevXKF ' + str.substring(3);
		pieceTable.delete(22, 8);
		str = str.substring(0, 22) + str.substring(22 + 8);
		pieceTable.insert(4, 'S umSnYrqOmOAV\nEbZJ ');
		str = str.substring(0, 4) + 'S umSnYrqOmOAV\nEbZJ ' + str.substring(4);

		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('get text in range', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('getContentInRange', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\nde']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(8, 'fh\ni\njk');
		pieceTable.delete(7, 2);
		// 'a\nb\nc\ndh\ni\njk'

		assert.strictEqual(pieceTable.getValueInRange(new Range(1, 1, 1, 3)), 'a\n');
		assert.strictEqual(pieceTable.getValueInRange(new Range(2, 1, 2, 3)), 'b\n');
		assert.strictEqual(pieceTable.getValueInRange(new Range(3, 1, 3, 3)), 'c\n');
		assert.strictEqual(pieceTable.getValueInRange(new Range(4, 1, 4, 4)), 'dh\n');
		assert.strictEqual(pieceTable.getValueInRange(new Range(5, 1, 5, 3)), 'i\n');
		assert.strictEqual(pieceTable.getValueInRange(new Range(6, 1, 6, 3)), 'jk');
		assertTreeInvariants(pieceTable);
	});

	test('random test value in range', () => {
		let str = '';
		const pieceTree = createTextBuffer([str]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'ZXXY');
		str = str.substring(0, 0) + 'ZXXY' + str.substring(0);
		pieceTable.insert(1, 'XZZY');
		str = str.substring(0, 1) + 'XZZY' + str.substring(1);
		pieceTable.insert(5, '\nX\n\n');
		str = str.substring(0, 5) + '\nX\n\n' + str.substring(5);
		pieceTable.insert(3, '\nXX\n');
		str = str.substring(0, 3) + '\nXX\n' + str.substring(3);
		pieceTable.insert(12, 'YYYX');
		str = str.substring(0, 12) + 'YYYX' + str.substring(12);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
	test('random test value in range exception', () => {
		let str = '';
		const pieceTree = createTextBuffer([str]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'XZ\nZ');
		str = str.substring(0, 0) + 'XZ\nZ' + str.substring(0);
		pieceTable.delete(0, 3);
		str = str.substring(0, 0) + str.substring(0 + 3);
		pieceTable.delete(0, 1);
		str = str.substring(0, 0) + str.substring(0 + 1);
		pieceTable.insert(0, 'ZYX\n');
		str = str.substring(0, 0) + 'ZYX\n' + str.substring(0);
		pieceTable.delete(0, 4);
		str = str.substring(0, 0) + str.substring(0 + 4);

		pieceTable.getValueInRange(new Range(1, 1, 1, 1));
		assertTreeInvariants(pieceTable);
	});

	test('random tests bug 1', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'huuyYzUfKOENwGgZLqn ');
		str = str.substring(0, 0) + 'huuyYzUfKOENwGgZLqn ' + str.substring(0);
		pieceTable.delete(18, 2);
		str = str.substring(0, 18) + str.substring(18 + 2);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.delete(12, 4);
		str = str.substring(0, 12) + str.substring(12 + 4);
		pieceTable.insert(3, 'hMbnVEdTSdhLlPevXKF ');
		str = str.substring(0, 3) + 'hMbnVEdTSdhLlPevXKF ' + str.substring(3);
		pieceTable.delete(22, 8);
		str = str.substring(0, 22) + str.substring(22 + 8);
		pieceTable.insert(4, 'S umSnYrqOmOAV\nEbZJ ');
		str = str.substring(0, 4) + 'S umSnYrqOmOAV\nEbZJ ' + str.substring(4);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random tests bug 2', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'xfouRDZwdAHjVXJAMV\n ');
		str = str.substring(0, 0) + 'xfouRDZwdAHjVXJAMV\n ' + str.substring(0);
		pieceTable.insert(16, 'dBGndxpFZBEAIKykYYx ');
		str = str.substring(0, 16) + 'dBGndxpFZBEAIKykYYx ' + str.substring(16);
		pieceTable.delete(7, 6);
		str = str.substring(0, 7) + str.substring(7 + 6);
		pieceTable.delete(9, 7);
		str = str.substring(0, 9) + str.substring(9 + 7);
		pieceTable.delete(17, 6);
		str = str.substring(0, 17) + str.substring(17 + 6);
		pieceTable.delete(0, 4);
		str = str.substring(0, 0) + str.substring(0 + 4);
		pieceTable.insert(9, 'qvEFXCNvVkWgvykahYt ');
		str = str.substring(0, 9) + 'qvEFXCNvVkWgvykahYt ' + str.substring(9);
		pieceTable.delete(4, 6);
		str = str.substring(0, 4) + str.substring(4 + 6);
		pieceTable.insert(11, 'OcSChUYT\nzPEBOpsGmR ');
		str =
			str.substring(0, 11) + 'OcSChUYT\nzPEBOpsGmR ' + str.substring(11);
		pieceTable.insert(15, 'KJCozaXTvkE\nxnqAeTz ');
		str =
			str.substring(0, 15) + 'KJCozaXTvkE\nxnqAeTz ' + str.substring(15);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('get line content', () => {
		const pieceTree = createTextBuffer(['1']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		assert.strictEqual(pieceTable.getLineRawContent(1), '1');
		pieceTable.insert(1, '2');
		assert.strictEqual(pieceTable.getLineRawContent(1), '12');
		assertTreeInvariants(pieceTable);
	});

	test('get line content basic', () => {
		const pieceTree = createTextBuffer(['1\n2\n3\n4']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		assert.strictEqual(pieceTable.getLineRawContent(1), '1\n');
		assert.strictEqual(pieceTable.getLineRawContent(2), '2\n');
		assert.strictEqual(pieceTable.getLineRawContent(3), '3\n');
		assert.strictEqual(pieceTable.getLineRawContent(4), '4');
		assertTreeInvariants(pieceTable);
	});

	test('get line content after inserts/deletes', () => {
		const pieceTree = createTextBuffer(['a\nb\nc\nde']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(8, 'fh\ni\njk');
		pieceTable.delete(7, 2);
		// 'a\nb\nc\ndh\ni\njk'

		assert.strictEqual(pieceTable.getLineRawContent(1), 'a\n');
		assert.strictEqual(pieceTable.getLineRawContent(2), 'b\n');
		assert.strictEqual(pieceTable.getLineRawContent(3), 'c\n');
		assert.strictEqual(pieceTable.getLineRawContent(4), 'dh\n');
		assert.strictEqual(pieceTable.getLineRawContent(5), 'i\n');
		assert.strictEqual(pieceTable.getLineRawContent(6), 'jk');
		assertTreeInvariants(pieceTable);
	});

	test('random 1', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'J eNnDzQpnlWyjmUu\ny ');
		str = str.substring(0, 0) + 'J eNnDzQpnlWyjmUu\ny ' + str.substring(0);
		pieceTable.insert(0, 'QPEeRAQmRwlJqtZSWhQ ');
		str = str.substring(0, 0) + 'QPEeRAQmRwlJqtZSWhQ ' + str.substring(0);
		pieceTable.delete(5, 1);
		str = str.substring(0, 5) + str.substring(5 + 1);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random 2', () => {
		let str = '';
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'DZoQ tglPCRHMltejRI ');
		str = str.substring(0, 0) + 'DZoQ tglPCRHMltejRI ' + str.substring(0);
		pieceTable.insert(10, 'JRXiyYqJ qqdcmbfkKX ');
		str = str.substring(0, 10) + 'JRXiyYqJ qqdcmbfkKX ' + str.substring(10);
		pieceTable.delete(16, 3);
		str = str.substring(0, 16) + str.substring(16 + 3);
		pieceTable.delete(25, 1);
		str = str.substring(0, 25) + str.substring(25 + 1);
		pieceTable.insert(18, 'vH\nNlvfqQJPm\nSFkhMc ');
		str =
			str.substring(0, 18) + 'vH\nNlvfqQJPm\nSFkhMc ' + str.substring(18);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('CRLF', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('delete CR in CRLF 1', () => {
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'a\r\nb');
		pieceTable.delete(0, 2);

		assert.strictEqual(pieceTable.getLineCount(), 2);
		assertTreeInvariants(pieceTable);
	});

	test('delete CR in CRLF 2', () => {
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, 'a\r\nb');
		pieceTable.delete(2, 2);

		assert.strictEqual(pieceTable.getLineCount(), 2);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 1', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.insert(0, '\n\n\r\r');
		str = str.substring(0, 0) + '\n\n\r\r' + str.substring(0);
		pieceTable.insert(1, '\r\n\r\n');
		str = str.substring(0, 1) + '\r\n\r\n' + str.substring(1);
		pieceTable.delete(5, 3);
		str = str.substring(0, 5) + str.substring(5 + 3);
		pieceTable.delete(2, 3);
		str = str.substring(0, 2) + str.substring(2 + 3);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 2', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\r\n\r');
		str = str.substring(0, 0) + '\n\r\n\r' + str.substring(0);
		pieceTable.insert(2, '\n\r\r\r');
		str = str.substring(0, 2) + '\n\r\r\r' + str.substring(2);
		pieceTable.delete(4, 1);
		str = str.substring(0, 4) + str.substring(4 + 1);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 3', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\n\n\r');
		str = str.substring(0, 0) + '\n\n\n\r' + str.substring(0);
		pieceTable.delete(2, 2);
		str = str.substring(0, 2) + str.substring(2 + 2);
		pieceTable.delete(0, 2);
		str = str.substring(0, 0) + str.substring(0 + 2);
		pieceTable.insert(0, '\r\r\r\r');
		str = str.substring(0, 0) + '\r\r\r\r' + str.substring(0);
		pieceTable.insert(2, '\r\n\r\r');
		str = str.substring(0, 2) + '\r\n\r\r' + str.substring(2);
		pieceTable.insert(3, '\r\r\r\n');
		str = str.substring(0, 3) + '\r\r\r\n' + str.substring(3);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 4', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\n\n\n');
		str = str.substring(0, 0) + '\n\n\n\n' + str.substring(0);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.insert(1, '\r\r\r\r');
		str = str.substring(0, 1) + '\r\r\r\r' + str.substring(1);
		pieceTable.insert(6, '\r\n\n\r');
		str = str.substring(0, 6) + '\r\n\n\r' + str.substring(6);
		pieceTable.delete(5, 3);
		str = str.substring(0, 5) + str.substring(5 + 3);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 5', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\n\n\n');
		str = str.substring(0, 0) + '\n\n\n\n' + str.substring(0);
		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.insert(0, '\n\r\r\n');
		str = str.substring(0, 0) + '\n\r\r\n' + str.substring(0);
		pieceTable.insert(4, '\n\r\r\n');
		str = str.substring(0, 4) + '\n\r\r\n' + str.substring(4);
		pieceTable.delete(4, 3);
		str = str.substring(0, 4) + str.substring(4 + 3);
		pieceTable.insert(5, '\r\r\n\r');
		str = str.substring(0, 5) + '\r\r\n\r' + str.substring(5);
		pieceTable.insert(12, '\n\n\n\r');
		str = str.substring(0, 12) + '\n\n\n\r' + str.substring(12);
		pieceTable.insert(5, '\r\r\r\n');
		str = str.substring(0, 5) + '\r\r\r\n' + str.substring(5);
		pieceTable.insert(20, '\n\n\r\n');
		str = str.substring(0, 20) + '\n\n\r\n' + str.substring(20);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 6', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\r\r\n');
		str = str.substring(0, 0) + '\n\r\r\n' + str.substring(0);
		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(3, '\r\n\n\n');
		str = str.substring(0, 3) + '\r\n\n\n' + str.substring(3);
		pieceTable.delete(4, 8);
		str = str.substring(0, 4) + str.substring(4 + 8);
		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(0, '\r\n\n\r');
		str = str.substring(0, 0) + '\r\n\n\r' + str.substring(0);
		pieceTable.delete(4, 0);
		str = str.substring(0, 4) + str.substring(4 + 0);
		pieceTable.delete(8, 4);
		str = str.substring(0, 8) + str.substring(8 + 4);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 8', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\r\n\n\r');
		str = str.substring(0, 0) + '\r\n\n\r' + str.substring(0);
		pieceTable.delete(1, 0);
		str = str.substring(0, 1) + str.substring(1 + 0);
		pieceTable.insert(3, '\n\n\n\r');
		str = str.substring(0, 3) + '\n\n\n\r' + str.substring(3);
		pieceTable.insert(7, '\n\n\r\n');
		str = str.substring(0, 7) + '\n\n\r\n' + str.substring(7);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 7', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\r\r\n\n');
		str = str.substring(0, 0) + '\r\r\n\n' + str.substring(0);
		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(7, '\n\r\r\r');
		str = str.substring(0, 7) + '\n\r\r\r' + str.substring(7);
		pieceTable.insert(11, '\n\n\r\n');
		str = str.substring(0, 11) + '\n\n\r\n' + str.substring(11);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 10', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'qneW');
		str = str.substring(0, 0) + 'qneW' + str.substring(0);
		pieceTable.insert(0, 'YhIl');
		str = str.substring(0, 0) + 'YhIl' + str.substring(0);
		pieceTable.insert(0, 'qdsm');
		str = str.substring(0, 0) + 'qdsm' + str.substring(0);
		pieceTable.delete(7, 0);
		str = str.substring(0, 7) + str.substring(7 + 0);
		pieceTable.insert(12, 'iiPv');
		str = str.substring(0, 12) + 'iiPv' + str.substring(12);
		pieceTable.insert(9, 'V\rSA');
		str = str.substring(0, 9) + 'V\rSA' + str.substring(9);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 9', () => {
		let str = '';
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, '\n\n\n\n');
		str = str.substring(0, 0) + '\n\n\n\n' + str.substring(0);
		pieceTable.insert(3, '\n\r\n\r');
		str = str.substring(0, 3) + '\n\r\n\r' + str.substring(3);
		pieceTable.insert(2, '\n\r\n\n');
		str = str.substring(0, 2) + '\n\r\n\n' + str.substring(2);
		pieceTable.insert(0, '\n\n\r\r');
		str = str.substring(0, 0) + '\n\n\r\r' + str.substring(0);
		pieceTable.insert(3, '\r\r\r\r');
		str = str.substring(0, 3) + '\r\r\r\r' + str.substring(3);
		pieceTable.insert(3, '\n\n\r\r');
		str = str.substring(0, 3) + '\n\n\r\r' + str.substring(3);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('centralized lineStarts with CRLF', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('delete CR in CRLF 1', () => {
		const pieceTree = createTextBuffer(['a\r\nb'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.delete(2, 2);
		assert.strictEqual(pieceTable.getLineCount(), 2);
		assertTreeInvariants(pieceTable);
	});
	test('delete CR in CRLF 2', () => {
		const pieceTree = createTextBuffer(['a\r\nb']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.delete(0, 2);

		assert.strictEqual(pieceTable.getLineCount(), 2);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 1', () => {
		let str = '\n\n\r\r';
		const pieceTree = createTextBuffer(['\n\n\r\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(1, '\r\n\r\n');
		str = str.substring(0, 1) + '\r\n\r\n' + str.substring(1);
		pieceTable.delete(5, 3);
		str = str.substring(0, 5) + str.substring(5 + 3);
		pieceTable.delete(2, 3);
		str = str.substring(0, 2) + str.substring(2 + 3);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});
	test('random bug 2', () => {
		let str = '\n\r\n\r';
		const pieceTree = createTextBuffer(['\n\r\n\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(2, '\n\r\r\r');
		str = str.substring(0, 2) + '\n\r\r\r' + str.substring(2);
		pieceTable.delete(4, 1);
		str = str.substring(0, 4) + str.substring(4 + 1);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 3', () => {
		let str = '\n\n\n\r';
		const pieceTree = createTextBuffer(['\n\n\n\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(2, 2);
		str = str.substring(0, 2) + str.substring(2 + 2);
		pieceTable.delete(0, 2);
		str = str.substring(0, 0) + str.substring(0 + 2);
		pieceTable.insert(0, '\r\r\r\r');
		str = str.substring(0, 0) + '\r\r\r\r' + str.substring(0);
		pieceTable.insert(2, '\r\n\r\r');
		str = str.substring(0, 2) + '\r\n\r\r' + str.substring(2);
		pieceTable.insert(3, '\r\r\r\n');
		str = str.substring(0, 3) + '\r\r\r\n' + str.substring(3);

		const lines = splitLines(str);
		assert.strictEqual(pieceTable.getLineCount(), lines.length);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 4', () => {
		let str = '\n\n\n\n';
		const pieceTree = createTextBuffer(['\n\n\n\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.insert(1, '\r\r\r\r');
		str = str.substring(0, 1) + '\r\r\r\r' + str.substring(1);
		pieceTable.insert(6, '\r\n\n\r');
		str = str.substring(0, 6) + '\r\n\n\r' + str.substring(6);
		pieceTable.delete(5, 3);
		str = str.substring(0, 5) + str.substring(5 + 3);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 5', () => {
		let str = '\n\n\n\n';
		const pieceTree = createTextBuffer(['\n\n\n\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(3, 1);
		str = str.substring(0, 3) + str.substring(3 + 1);
		pieceTable.insert(0, '\n\r\r\n');
		str = str.substring(0, 0) + '\n\r\r\n' + str.substring(0);
		pieceTable.insert(4, '\n\r\r\n');
		str = str.substring(0, 4) + '\n\r\r\n' + str.substring(4);
		pieceTable.delete(4, 3);
		str = str.substring(0, 4) + str.substring(4 + 3);
		pieceTable.insert(5, '\r\r\n\r');
		str = str.substring(0, 5) + '\r\r\n\r' + str.substring(5);
		pieceTable.insert(12, '\n\n\n\r');
		str = str.substring(0, 12) + '\n\n\n\r' + str.substring(12);
		pieceTable.insert(5, '\r\r\r\n');
		str = str.substring(0, 5) + '\r\r\r\n' + str.substring(5);
		pieceTable.insert(20, '\n\n\r\n');
		str = str.substring(0, 20) + '\n\n\r\n' + str.substring(20);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 6', () => {
		let str = '\n\r\r\n';
		const pieceTree = createTextBuffer(['\n\r\r\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(3, '\r\n\n\n');
		str = str.substring(0, 3) + '\r\n\n\n' + str.substring(3);
		pieceTable.delete(4, 8);
		str = str.substring(0, 4) + str.substring(4 + 8);
		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(0, '\r\n\n\r');
		str = str.substring(0, 0) + '\r\n\n\r' + str.substring(0);
		pieceTable.delete(4, 0);
		str = str.substring(0, 4) + str.substring(4 + 0);
		pieceTable.delete(8, 4);
		str = str.substring(0, 8) + str.substring(8 + 4);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 7', () => {
		let str = '\r\n\n\r';
		const pieceTree = createTextBuffer(['\r\n\n\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(1, 0);
		str = str.substring(0, 1) + str.substring(1 + 0);
		pieceTable.insert(3, '\n\n\n\r');
		str = str.substring(0, 3) + '\n\n\n\r' + str.substring(3);
		pieceTable.insert(7, '\n\n\r\n');
		str = str.substring(0, 7) + '\n\n\r\n' + str.substring(7);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 8', () => {
		let str = '\r\r\n\n';
		const pieceTree = createTextBuffer(['\r\r\n\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(4, '\r\n\n\r');
		str = str.substring(0, 4) + '\r\n\n\r' + str.substring(4);
		pieceTable.insert(7, '\n\r\r\r');
		str = str.substring(0, 7) + '\n\r\r\r' + str.substring(7);
		pieceTable.insert(11, '\n\n\r\n');
		str = str.substring(0, 11) + '\n\n\r\n' + str.substring(11);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 9', () => {
		let str = 'qneW';
		const pieceTree = createTextBuffer(['qneW'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(0, 'YhIl');
		str = str.substring(0, 0) + 'YhIl' + str.substring(0);
		pieceTable.insert(0, 'qdsm');
		str = str.substring(0, 0) + 'qdsm' + str.substring(0);
		pieceTable.delete(7, 0);
		str = str.substring(0, 7) + str.substring(7 + 0);
		pieceTable.insert(12, 'iiPv');
		str = str.substring(0, 12) + 'iiPv' + str.substring(12);
		pieceTable.insert(9, 'V\rSA');
		str = str.substring(0, 9) + 'V\rSA' + str.substring(9);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random bug 10', () => {
		let str = '\n\n\n\n';
		const pieceTree = createTextBuffer(['\n\n\n\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.insert(3, '\n\r\n\r');
		str = str.substring(0, 3) + '\n\r\n\r' + str.substring(3);
		pieceTable.insert(2, '\n\r\n\n');
		str = str.substring(0, 2) + '\n\r\n\n' + str.substring(2);
		pieceTable.insert(0, '\n\n\r\r');
		str = str.substring(0, 0) + '\n\n\r\r' + str.substring(0);
		pieceTable.insert(3, '\r\r\r\r');
		str = str.substring(0, 3) + '\r\r\r\r' + str.substring(3);
		pieceTable.insert(3, '\n\n\r\r');
		str = str.substring(0, 3) + '\n\n\r\r' + str.substring(3);

		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunk bug 1', () => {
		const pieceTree = createTextBuffer(['\n\r\r\n\n\n\r\n\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		let str = '\n\r\r\n\n\n\r\n\r';
		pieceTable.delete(0, 2);
		str = str.substring(0, 0) + str.substring(0 + 2);
		pieceTable.insert(1, '\r\r\n\n');
		str = str.substring(0, 1) + '\r\r\n\n' + str.substring(1);
		pieceTable.insert(7, '\r\r\r\r');
		str = str.substring(0, 7) + '\r\r\r\r' + str.substring(7);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunk bug 2', () => {
		const pieceTree = createTextBuffer([
			'\n\r\n\n\n\r\n\r\n\r\r\n\n\n\r\r\n\r\n'
		], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = '\n\r\n\n\n\r\n\r\n\r\r\n\n\n\r\r\n\r\n';
		pieceTable.insert(16, '\r\n\r\r');
		str = str.substring(0, 16) + '\r\n\r\r' + str.substring(16);
		pieceTable.insert(13, '\n\n\r\r');
		str = str.substring(0, 13) + '\n\n\r\r' + str.substring(13);
		pieceTable.insert(19, '\n\n\r\n');
		str = str.substring(0, 19) + '\n\n\r\n' + str.substring(19);
		pieceTable.delete(5, 0);
		str = str.substring(0, 5) + str.substring(5 + 0);
		pieceTable.delete(11, 2);
		str = str.substring(0, 11) + str.substring(11 + 2);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunk bug 3', () => {
		const pieceTree = createTextBuffer(['\r\n\n\n\n\n\n\r\n'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = '\r\n\n\n\n\n\n\r\n';
		pieceTable.insert(4, '\n\n\r\n\r\r\n\n\r');
		str = str.substring(0, 4) + '\n\n\r\n\r\r\n\n\r' + str.substring(4);
		pieceTable.delete(4, 4);
		str = str.substring(0, 4) + str.substring(4 + 4);
		pieceTable.insert(11, '\r\n\r\n\n\r\r\n\n');
		str = str.substring(0, 11) + '\r\n\r\n\n\r\r\n\n' + str.substring(11);
		pieceTable.delete(1, 2);
		str = str.substring(0, 1) + str.substring(1 + 2);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunk bug 4', () => {
		const pieceTree = createTextBuffer(['\n\r\n\r'], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = '\n\r\n\r';
		pieceTable.insert(4, '\n\n\r\n');
		str = str.substring(0, 4) + '\n\n\r\n' + str.substring(4);
		pieceTable.insert(3, '\r\n\n\n');
		str = str.substring(0, 3) + '\r\n\n\n' + str.substring(3);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('random is unsupervised', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('splitting large change buffer', function () {
		const pieceTree = createTextBuffer([''], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = '';

		pieceTable.insert(0, 'WUZ\nXVZY\n');
		str = str.substring(0, 0) + 'WUZ\nXVZY\n' + str.substring(0);
		pieceTable.insert(8, '\r\r\nZXUWVW');
		str = str.substring(0, 8) + '\r\r\nZXUWVW' + str.substring(8);
		pieceTable.delete(10, 7);
		str = str.substring(0, 10) + str.substring(10 + 7);
		pieceTable.delete(10, 1);
		str = str.substring(0, 10) + str.substring(10 + 1);
		pieceTable.insert(4, 'VX\r\r\nWZVZ');
		str = str.substring(0, 4) + 'VX\r\r\nWZVZ' + str.substring(4);
		pieceTable.delete(11, 3);
		str = str.substring(0, 11) + str.substring(11 + 3);
		pieceTable.delete(12, 4);
		str = str.substring(0, 12) + str.substring(12 + 4);
		pieceTable.delete(8, 0);
		str = str.substring(0, 8) + str.substring(8 + 0);
		pieceTable.delete(10, 2);
		str = str.substring(0, 10) + str.substring(10 + 2);
		pieceTable.insert(0, 'VZXXZYZX\r');
		str = str.substring(0, 0) + 'VZXXZYZX\r' + str.substring(0);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random insert delete', function () {
		this.timeout(500000);
		let str = '';
		const pieceTree = createTextBuffer([str], false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		// let output = '';
		for (let i = 0; i < 1000; i++) {
			if (Math.random() < 0.6) {
				// insert
				const text = randomStr(100);
				const pos = randomInt(str.length + 1);
				pieceTable.insert(pos, text);
				str = str.substring(0, pos) + text + str.substring(pos);
				// output += `pieceTable.insert(${pos}, '${text.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}');\n`;
				// output += `str = str.substring(0, ${pos}) + '${text.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}' + str.substring(${pos});\n`;
			} else {
				// delete
				const pos = randomInt(str.length);
				const length = Math.min(
					str.length - pos,
					Math.floor(Math.random() * 10)
				);
				pieceTable.delete(pos, length);
				str = str.substring(0, pos) + str.substring(pos + length);
				// output += `pieceTable.delete(${pos}, ${length});\n`;
				// output += `str = str.substring(0, ${pos}) + str.substring(${pos} + ${length});\n`

			}
		}
		// console.log(output);

		assert.strictEqual(pieceTable.getLinesRawContent(), str);

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunks', function () {
		this.timeout(500000);
		const chunks: string[] = [];
		for (let i = 0; i < 5; i++) {
			chunks.push(randomStr(1000));
		}

		const pieceTree = createTextBuffer(chunks, false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = chunks.join('');

		for (let i = 0; i < 1000; i++) {
			if (Math.random() < 0.6) {
				// insert
				const text = randomStr(100);
				const pos = randomInt(str.length + 1);
				pieceTable.insert(pos, text);
				str = str.substring(0, pos) + text + str.substring(pos);
			} else {
				// delete
				const pos = randomInt(str.length);
				const length = Math.min(
					str.length - pos,
					Math.floor(Math.random() * 10)
				);
				pieceTable.delete(pos, length);
				str = str.substring(0, pos) + str.substring(pos + length);
			}
		}

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('random chunks 2', function () {
		this.timeout(500000);
		const chunks: string[] = [];
		chunks.push(randomStr(1000));

		const pieceTree = createTextBuffer(chunks, false);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = chunks.join('');

		for (let i = 0; i < 50; i++) {
			if (Math.random() < 0.6) {
				// insert
				const text = randomStr(30);
				const pos = randomInt(str.length + 1);
				pieceTable.insert(pos, text);
				str = str.substring(0, pos) + text + str.substring(pos);
			} else {
				// delete
				const pos = randomInt(str.length);
				const length = Math.min(
					str.length - pos,
					Math.floor(Math.random() * 10)
				);
				pieceTable.delete(pos, length);
				str = str.substring(0, pos) + str.substring(pos + length);
			}
			testLinesContent(str, pieceTable);
		}

		assert.strictEqual(pieceTable.getLinesRawContent(), str);
		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});
});

suite('buffer api', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('equal', () => {
		const a = createTextBuffer(['abc']);
		const b = createTextBuffer(['ab', 'c']);
		const c = createTextBuffer(['abd']);
		const d = createTextBuffer(['abcd']);
		ds.add(a);
		ds.add(b);
		ds.add(c);
		ds.add(d);

		assert(a.getPieceTree().equal(b.getPieceTree()));
		assert(!a.getPieceTree().equal(c.getPieceTree()));
		assert(!a.getPieceTree().equal(d.getPieceTree()));
	});

	test('equal with more chunks', () => {
		const a = createTextBuffer(['ab', 'cd', 'e']);
		const b = createTextBuffer(['ab', 'c', 'de']);
		ds.add(a);
		ds.add(b);
		assert(a.getPieceTree().equal(b.getPieceTree()));
	});

	test('equal 2, empty buffer', () => {
		const a = createTextBuffer(['']);
		const b = createTextBuffer(['']);
		ds.add(a);
		ds.add(b);

		assert(a.getPieceTree().equal(b.getPieceTree()));
	});

	test('equal 3, empty buffer', () => {
		const a = createTextBuffer(['a']);
		const b = createTextBuffer(['']);
		ds.add(a);
		ds.add(b);

		assert(!a.getPieceTree().equal(b.getPieceTree()));
	});

	test('getLineCharCode - issue #45735', () => {
		const pieceTree = createTextBuffer(['LINE1\nline2']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		assert.strictEqual(pieceTable.getLineCharCode(1, 0), 'L'.charCodeAt(0), 'L');
		assert.strictEqual(pieceTable.getLineCharCode(1, 1), 'I'.charCodeAt(0), 'I');
		assert.strictEqual(pieceTable.getLineCharCode(1, 2), 'N'.charCodeAt(0), 'N');
		assert.strictEqual(pieceTable.getLineCharCode(1, 3), 'E'.charCodeAt(0), 'E');
		assert.strictEqual(pieceTable.getLineCharCode(1, 4), '1'.charCodeAt(0), '1');
		assert.strictEqual(pieceTable.getLineCharCode(1, 5), '\n'.charCodeAt(0), '\\n');
		assert.strictEqual(pieceTable.getLineCharCode(2, 0), 'l'.charCodeAt(0), 'l');
		assert.strictEqual(pieceTable.getLineCharCode(2, 1), 'i'.charCodeAt(0), 'i');
		assert.strictEqual(pieceTable.getLineCharCode(2, 2), 'n'.charCodeAt(0), 'n');
		assert.strictEqual(pieceTable.getLineCharCode(2, 3), 'e'.charCodeAt(0), 'e');
		assert.strictEqual(pieceTable.getLineCharCode(2, 4), '2'.charCodeAt(0), '2');
	});


	test('getLineCharCode - issue #47733', () => {
		const pieceTree = createTextBuffer(['', 'LINE1\n', 'line2']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		assert.strictEqual(pieceTable.getLineCharCode(1, 0), 'L'.charCodeAt(0), 'L');
		assert.strictEqual(pieceTable.getLineCharCode(1, 1), 'I'.charCodeAt(0), 'I');
		assert.strictEqual(pieceTable.getLineCharCode(1, 2), 'N'.charCodeAt(0), 'N');
		assert.strictEqual(pieceTable.getLineCharCode(1, 3), 'E'.charCodeAt(0), 'E');
		assert.strictEqual(pieceTable.getLineCharCode(1, 4), '1'.charCodeAt(0), '1');
		assert.strictEqual(pieceTable.getLineCharCode(1, 5), '\n'.charCodeAt(0), '\\n');
		assert.strictEqual(pieceTable.getLineCharCode(2, 0), 'l'.charCodeAt(0), 'l');
		assert.strictEqual(pieceTable.getLineCharCode(2, 1), 'i'.charCodeAt(0), 'i');
		assert.strictEqual(pieceTable.getLineCharCode(2, 2), 'n'.charCodeAt(0), 'n');
		assert.strictEqual(pieceTable.getLineCharCode(2, 3), 'e'.charCodeAt(0), 'e');
		assert.strictEqual(pieceTable.getLineCharCode(2, 4), '2'.charCodeAt(0), '2');
	});

	test('getNearestChunk', () => {
		const pieceTree = createTextBuffer(['012345678']);
		ds.add(pieceTree);
		const pt = pieceTree.getPieceTree();

		pt.insert(3, 'ABC');
		assert.equal(pt.getLineContent(1), '012ABC345678');
		assert.equal(pt.getNearestChunk(3), 'ABC');
		assert.equal(pt.getNearestChunk(6), '345678');

		pt.delete(9, 1);
		assert.equal(pt.getLineContent(1), '012ABC34578');
		assert.equal(pt.getNearestChunk(6), '345');
		assert.equal(pt.getNearestChunk(9), '78');
	});
});

suite('search offset cache', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('render white space exception', () => {
		const pieceTree = createTextBuffer(['class Name{\n\t\n\t\t\tget() {\n\n\t\t\t}\n\t\t}']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = 'class Name{\n\t\n\t\t\tget() {\n\n\t\t\t}\n\t\t}';

		pieceTable.insert(12, 's');
		str = str.substring(0, 12) + 's' + str.substring(12);

		pieceTable.insert(13, 'e');
		str = str.substring(0, 13) + 'e' + str.substring(13);

		pieceTable.insert(14, 't');
		str = str.substring(0, 14) + 't' + str.substring(14);

		pieceTable.insert(15, '()');
		str = str.substring(0, 15) + '()' + str.substring(15);

		pieceTable.delete(16, 1);
		str = str.substring(0, 16) + str.substring(16 + 1);

		pieceTable.insert(17, '()');
		str = str.substring(0, 17) + '()' + str.substring(17);

		pieceTable.delete(18, 1);
		str = str.substring(0, 18) + str.substring(18 + 1);

		pieceTable.insert(18, '}');
		str = str.substring(0, 18) + '}' + str.substring(18);

		pieceTable.insert(12, '\n');
		str = str.substring(0, 12) + '\n' + str.substring(12);

		pieceTable.delete(12, 1);
		str = str.substring(0, 12) + str.substring(12 + 1);

		pieceTable.delete(18, 1);
		str = str.substring(0, 18) + str.substring(18 + 1);

		pieceTable.insert(18, '}');
		str = str.substring(0, 18) + '}' + str.substring(18);

		pieceTable.delete(17, 2);
		str = str.substring(0, 17) + str.substring(17 + 2);

		pieceTable.delete(16, 1);
		str = str.substring(0, 16) + str.substring(16 + 1);

		pieceTable.insert(16, ')');
		str = str.substring(0, 16) + ')' + str.substring(16);

		pieceTable.delete(15, 2);
		str = str.substring(0, 15) + str.substring(15 + 2);

		const content = pieceTable.getLinesRawContent();
		assert(content === str);
	});

	test('Line breaks replacement is not necessary when EOL is normalized', () => {
		const pieceTree = createTextBuffer(['abc']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = 'abc';

		pieceTable.insert(3, 'def\nabc');
		str = str + 'def\nabc';

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('Line breaks replacement is not necessary when EOL is normalized 2', () => {
		const pieceTree = createTextBuffer(['abc\n']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = 'abc\n';

		pieceTable.insert(4, 'def\nabc');
		str = str + 'def\nabc';

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('Line breaks replacement is not necessary when EOL is normalized 3', () => {
		const pieceTree = createTextBuffer(['abc\n']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = 'abc\n';

		pieceTable.insert(2, 'def\nabc');
		str = str.substring(0, 2) + 'def\nabc' + str.substring(2);

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

	test('Line breaks replacement is not necessary when EOL is normalized 4', () => {
		const pieceTree = createTextBuffer(['abc\n']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		let str = 'abc\n';

		pieceTable.insert(3, 'def\nabc');
		str = str.substring(0, 3) + 'def\nabc' + str.substring(3);

		testLineStarts(str, pieceTable);
		testLinesContent(str, pieceTable);
		assertTreeInvariants(pieceTable);
	});

});

function getValueInSnapshot(snapshot: ITextSnapshot) {
	let ret = '';
	let tmp = snapshot.read();

	while (tmp !== null) {
		ret += tmp;
		tmp = snapshot.read();
	}

	return ret;
}
suite('snapshot', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('bug #45564, piece tree pieces should be immutable', () => {
		const model = createTextModel('\n');
		model.applyEdits([
			{
				range: new Range(2, 1, 2, 1),
				text: '!'
			}
		]);
		const snapshot = model.createSnapshot();
		const snapshot1 = model.createSnapshot();
		assert.strictEqual(model.getLinesContent().join('\n'), getValueInSnapshot(snapshot));

		model.applyEdits([
			{
				range: new Range(2, 1, 2, 2),
				text: ''
			}
		]);
		model.applyEdits([
			{
				range: new Range(2, 1, 2, 1),
				text: '!'
			}
		]);

		assert.strictEqual(model.getLinesContent().join('\n'), getValueInSnapshot(snapshot1));

		model.dispose();
	});

	test('immutable snapshot 1', () => {
		const model = createTextModel('abc\ndef');
		const snapshot = model.createSnapshot();
		model.applyEdits([
			{
				range: new Range(2, 1, 2, 4),
				text: ''
			}
		]);

		model.applyEdits([
			{
				range: new Range(1, 1, 2, 1),
				text: 'abc\ndef'
			}
		]);

		assert.strictEqual(model.getLinesContent().join('\n'), getValueInSnapshot(snapshot));

		model.dispose();
	});

	test('immutable snapshot 2', () => {
		const model = createTextModel('abc\ndef');
		const snapshot = model.createSnapshot();
		model.applyEdits([
			{
				range: new Range(2, 1, 2, 1),
				text: '!'
			}
		]);

		model.applyEdits([
			{
				range: new Range(2, 1, 2, 2),
				text: ''
			}
		]);

		assert.strictEqual(model.getLinesContent().join('\n'), getValueInSnapshot(snapshot));

		model.dispose();
	});

	test('immutable snapshot 3', () => {
		const model = createTextModel('abc\ndef');
		model.applyEdits([
			{
				range: new Range(2, 4, 2, 4),
				text: '!'
			}
		]);
		const snapshot = model.createSnapshot();
		model.applyEdits([
			{
				range: new Range(2, 5, 2, 5),
				text: '!'
			}
		]);

		assert.notStrictEqual(model.getLinesContent().join('\n'), getValueInSnapshot(snapshot));

		model.dispose();
	});
});

suite('chunk based search', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('#45892. For some cases, the buffer is empty but we still try to search', () => {
		const pieceTree = createTextBuffer(['']);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();
		pieceTable.delete(0, 1);
		const ret = pieceTree.findMatchesLineByLine(new Range(1, 1, 1, 1), new SearchData(/abc/, new WordCharacterClassifier(',./', []), 'abc'), true, 1000);
		assert.strictEqual(ret.length, 0);
	});

	test('#45770. FindInNode should not cross node boundary.', () => {
		const pieceTree = createTextBuffer([
			[
				'balabalababalabalababalabalaba',
				'balabalababalabalababalabalaba',
				'',
				'* [ ] task1',
				'* [x] task2 balabalaba',
				'* [ ] task 3'
			].join('\n')
		]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(0, 62);
		pieceTable.delete(16, 1);

		pieceTable.insert(16, ' ');
		const ret = pieceTable.findMatchesLineByLine(new Range(1, 1, 4, 13), new SearchData(/\[/gi, new WordCharacterClassifier(',./', []), '['), true, 1000);
		assert.strictEqual(ret.length, 3);

		assert.deepStrictEqual(ret[0].range, new Range(2, 3, 2, 4));
		assert.deepStrictEqual(ret[1].range, new Range(3, 3, 3, 4));
		assert.deepStrictEqual(ret[2].range, new Range(4, 3, 4, 4));
	});

	test('search searching from the middle', () => {
		const pieceTree = createTextBuffer([
			[
				'def',
				'dbcabc'
			].join('\n')
		]);
		ds.add(pieceTree);
		const pieceTable = pieceTree.getPieceTree();

		pieceTable.delete(4, 1);
		let ret = pieceTable.findMatchesLineByLine(new Range(2, 3, 2, 6), new SearchData(/a/gi, null, 'a'), true, 1000);
		assert.strictEqual(ret.length, 1);
		assert.deepStrictEqual(ret[0].range, new Range(2, 3, 2, 4));

		pieceTable.delete(4, 1);
		ret = pieceTable.findMatchesLineByLine(new Range(2, 2, 2, 5), new SearchData(/a/gi, null, 'a'), true, 1000);
		assert.strictEqual(ret.length, 1);
		assert.deepStrictEqual(ret[0].range, new Range(2, 2, 2, 3));
	});
});
