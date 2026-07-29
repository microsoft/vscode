/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { expect, suite, test } from 'vitest';
import { range } from '../../../../util/vs/base/common/arrays';
import { splitLines } from '../../../../util/vs/base/common/strings';
import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { TextReplacement } from '../../../../util/vs/editor/common/core/edits/textEdit';
import { LineRange } from '../../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { RootedEdit } from '../../common/dataTypes/edit';
import { decomposeStringEdit } from '../../common/dataTypes/editUtils';
import { Permutation } from '../../common/dataTypes/permutation';
import { RootedLineEdit } from '../../common/dataTypes/rootedLineEdit';
import { Random, sequenceGenerator } from './random';

suite('Edit <-> LineEdit equivalence', () => {
	for (let i = 0; i < 100; i++) {
		test('case' + i, () => {
			testWithSeed(i);
		});
	}

	test.skip('fuzz', () => {
		for (let i = 0; i < 1_000_000; i++) {
			testWithSeed(i);
		}
	});

	function testWithSeed(seed: number) {
		const rand = Random.create(seed);
		const lineCount = rand.nextIntRange(1, 4);
		const str = rand.nextMultiLineString(lineCount, new OffsetRange(0, 5));
		const editCount = rand.nextIntRange(1, 4);
		const randomOffsetEdit = rand.nextOffsetEdit(str, editCount);
		const randomEdit = randomOffsetEdit;

		const rootedEdit = new RootedEdit(new StringText(str), randomEdit);
		const editApplied = rootedEdit.getEditedState().value;

		const rootedLineEdit = RootedLineEdit.fromEdit(rootedEdit);
		const lineEditApplied = rootedLineEdit.getEditedState().join('\n');
		const editFromLineEditApplied = rootedLineEdit.toRootedEdit().getEditedState().value;

		assert.deepStrictEqual(lineEditApplied, editApplied);
		assert.deepStrictEqual(editFromLineEditApplied, editApplied);
	}
});

suite('Edit.compose', () => {
	for (let i = 0; i < 1000; i++) {
		test('case' + i, () => {
			runTest(i);
		});
	}

	test.skip('fuzz', () => {
		for (let i = 0; i < 1_000_000; i++) {
			runTest(i);
		}
	});

	function runTest(seed: number) {
		const rng = Random.create(seed);

		const s0 = 'abcde\nfghij\nklmno\npqrst\n';

		const edits1 = getRandomEdit(s0, rng.nextIntRange(1, 4), rng);
		const s1 = edits1.apply(s0);

		const edits2 = getRandomEdit(s1, rng.nextIntRange(1, 4), rng);
		const s2 = edits2.apply(s1);

		const combinedEdits = edits1.compose(edits2);
		const s2C = combinedEdits.apply(s0);

		assert.strictEqual(s2C, s2);
	}
});


function getRandomEdit(str: string, count: number, rng: Random): StringEdit {
	const edits: StringReplacement[] = [];
	let i = 0;
	for (let j = 0; j < count; j++) {
		if (i >= str.length) {
			break;
		}
		edits.push(getRandomSingleEdit(str, i, rng));
		i = edits[j].replaceRange.endExclusive + 1;
	}
	return StringEdit.create(edits);
}

function getRandomSingleEdit(str: string, rangeOffsetStart: number, rng: Random): StringReplacement {
	const offsetStart = rng.nextIntRange(rangeOffsetStart, str.length);
	const offsetEnd = rng.nextIntRange(offsetStart, str.length);

	const textStart = rng.nextIntRange(0, str.length);
	const textLen = rng.nextIntRange(0, Math.min(7, str.length - textStart));

	return StringReplacement.replace(
		new OffsetRange(offsetStart, offsetEnd),
		str.substring(textStart, textStart + textLen)
	);
}

suite('LineEdit', () => {
	suite('fromSingleTextEdit', () => {
		for (let i = 0; i < 100; i++) {
			test('case' + i, () => {
				testWithSeed(i);
			});
		}

		test.skip('fuzz', () => {
			for (let i = 0; i < 1_000_000; i++) {
				testWithSeed(i);
			}
		});

		function testWithSeed(seed: number) {
			const rand = Random.create(seed);
			const lineCount = rand.nextIntRange(1, 4);
			// Use unique letters to such that .shrink can be tested
			const str = rand.nextMultiLineString(lineCount, new OffsetRange(0, 5), sequenceGenerator([...Random.alphabetUppercase]));

			let randomOffsetEdit = rand.nextSingleOffsetEdit(str, Random.alphabetSmallLowercase + '\n');
			randomOffsetEdit = randomOffsetEdit.removeCommonSuffixPrefix(str);
			const randomEdit = randomOffsetEdit;

			const strVal = new StringText(str);

			const singleTextEdit = TextReplacement.fromStringReplacement(randomEdit, strVal);
			const singleLineEdit1 = LineReplacement.fromSingleTextEdit(singleTextEdit, strVal);

			const extendedEdit = singleTextEdit.extendToFullLine(strVal);
			const singleLineEdit2Full = new LineReplacement(
				new LineRange(extendedEdit.range.startLineNumber, extendedEdit.range.endLineNumber + 1),
				splitLines(extendedEdit.text)
			);
			const singleLineEdit2 = singleLineEdit2Full.removeCommonSuffixPrefixLines(strVal);

			if (singleLineEdit1.lineRange.isEmpty && singleLineEdit2.lineRange.isEmpty
				&& singleLineEdit1.newLines.length === 0 && singleLineEdit2.newLines.length === 0) {
				return;
			}

			assert.deepStrictEqual(singleLineEdit1, singleLineEdit2);
		}
	});

	suite('RootedLineEdit.toString', () => {
		test('format normal edit 1', () => {
			const lineEdit = new RootedLineEdit(
				new StringText('abc\ndef\nghi'),
				new LineEdit([new LineReplacement(new LineRange(2, 3), ['xyz'])])
			);
			expect(lineEdit.toString()).toMatchInlineSnapshot(`
			"    1   1 abc
			-   2     def
			+       2 xyz
			    3   3 ghi"
		`);
		});

		test('format normal edit 2', () => {
			const lineEdit = new RootedLineEdit(
				new StringText('abc\ndef\nghi'),
				new LineEdit([new LineReplacement(new LineRange(3, 4), ['xyz'])])
			);
			expect(lineEdit.toString()).toMatchInlineSnapshot(`
			"    1   1 abc
			    2   2 def
			-   3     ghi
			+       3 xyz"
		`);
		});

		test('format invalid edit', () => {
			const lineEdit = new RootedLineEdit(
				new StringText('abc\ndef\nghi'),
				new LineEdit([new LineReplacement(new LineRange(4, 5), ['xyz'])])
			);
			expect(lineEdit.toString()).toMatchInlineSnapshot(`
				"    2   2 def
				    3   3 ghi
				-   4     [[[[[ WARNING: LINE DOES NOT EXIST ]]]]]
				+       4 xyz"
			`);
		});

		test('format invalid edit', () => {
			const lineEdit = new RootedLineEdit(
				new StringText('abc\ndef\nghi'),
				new LineEdit([new LineReplacement(new LineRange(6, 7), ['xyz'])])
			);
			expect(lineEdit.toString()).toMatchInlineSnapshot(`
				"    4   4 [[[[[ WARNING: LINE DOES NOT EXIST ]]]]]
				    5   5 [[[[[ WARNING: LINE DOES NOT EXIST ]]]]]
				-   6     [[[[[ WARNING: LINE DOES NOT EXIST ]]]]]
				+       6 xyz"
			`);
		});
	});
});

suite('Edit#decompose', () => {
	test('', () => {
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 5), '12345'),
			StringReplacement.replace(new OffsetRange(10, 12), ''),
		]);

		expect(decomposeStringEdit(edit).edits.toString()).toMatchInlineSnapshot(`"[0, 5) -> "12345",[10, 12) -> """`);
	});

	test('1', () => {
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 5), '12345'),
			StringReplacement.replace(new OffsetRange(10, 12), ''),
		]);

		expect(decomposeStringEdit(edit, new Permutation([1, 0])).edits.toString()).toMatchInlineSnapshot(`"[10, 12) -> "",[0, 5) -> "12345""`);
	});

	test('2', () => {
		const edit = StringEdit.create([
			StringReplacement.replace(new OffsetRange(0, 5), '12345'),
			StringReplacement.replace(new OffsetRange(10, 22), ''),
			StringReplacement.replace(new OffsetRange(23, 24), ''),
		]);

		const decomposedEdits = decomposeStringEdit(edit, new Permutation([1, 0, 2]));

		const recomposedEdits = decomposedEdits.compose();

		expect(decomposedEdits.edits.toString()).toMatchInlineSnapshot(`"[10, 22) -> "",[0, 5) -> "12345",[11, 12) -> """`);
		expect(edit.toString()).toStrictEqual(recomposedEdits.toString());
	});

	test.each(range(100))('fuzzing %i', (i) => {
		const rand = Random.create(i);
		const strLength = rand.nextIntRange(1, 100);
		const str = rand.nextString(strLength);
		const editCount = rand.nextIntRange(1, 10);
		const randomOffsetEdit = rand.nextOffsetEdit(str, editCount);
		const randomEdit = randomOffsetEdit;

		const shuffledEdits = shuffle(range(randomEdit.replacements.length), i);
		const decomposedEdits = decomposeStringEdit(randomEdit, shuffledEdits);
		const recomposedEdits = decomposedEdits.compose();

		expect(randomEdit.toString()).toStrictEqual(recomposedEdits.toString());
	});
});

export function shuffle<T>(array: T[], _seed?: number): Permutation {
	let rand: () => number;
	const indexMap = array.map((_, i) => i); // Create an index map that will be shuffled

	if (typeof _seed === 'number') {
		let seed = _seed;
		// Seeded random number generator in JS
		rand = () => {
			const x = Math.sin(seed++) * 179426549;
			return x - Math.floor(x);
		};
	} else {
		rand = Math.random;
	}

	for (let i = indexMap.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rand() * (i + 1));

		// Swap elements in the index map
		[indexMap[i], indexMap[j]] = [indexMap[j], indexMap[i]];
	}

	// Return a new Permutation instance based on the shuffled index map
	return new Permutation(indexMap);
}
