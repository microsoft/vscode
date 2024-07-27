/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit } from 'vs/editor/common/core/textEdit';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { combineTextEditInfos } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos';
import { lengthAdd, lengthToObj, lengthToPosition, positionToLength, toLength } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Random } from 'vs/editor/test/common/core/random';
import { createTextModel } from 'vs/editor/test/common/testTextModel';

suite('combineTextEditInfos', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (let seed = 0; seed < 50; seed++) {
		test('test' + seed, () => {
			runTest(seed);
		});
	}
});

function runTest(seed: number) {
	const rng = Random.create(seed);

	const str = 'abcde\nfghij\nklmno\npqrst\n';
	const textModelS0 = createTextModel(str);

	const edits1 = getRandomEditInfos(textModelS0, rng.nextIntRange(1, 4), rng);
	const textModelS1 = createTextModel(textModelS0.getValue());
	textModelS1.applyEdits(edits1.map(e => toEdit(e)));

	const edits2 = getRandomEditInfos(textModelS1, rng.nextIntRange(1, 4), rng);
	const textModelS2 = createTextModel(textModelS1.getValue());
	textModelS2.applyEdits(edits2.map(e => toEdit(e)));

	const combinedEdits = combineTextEditInfos(edits1, edits2);
	for (const edit of combinedEdits) {
		const range = Range.fromPositions(lengthToPosition(edit.startOffset), lengthToPosition(lengthAdd(edit.startOffset, edit.newLength)));
		const value = textModelS2.getValueInRange(range);
		if (!value.match(/^(L|C|\n)*$/)) {
			throw new Error('Invalid edit: ' + value);
		}
		textModelS2.applyEdits([{
			range,
			text: textModelS0.getValueInRange(Range.fromPositions(lengthToPosition(edit.startOffset), lengthToPosition(edit.endOffset))),
		}]);
	}

	assert.deepStrictEqual(textModelS2.getValue(), textModelS0.getValue());

	textModelS0.dispose();
	textModelS1.dispose();
	textModelS2.dispose();
}

export function getRandomEditInfos(textModel: TextModel, count: number, rng: Random, disjoint: boolean = false): TextEditInfo[] {
	const edits: TextEditInfo[] = [];
	let i = 0;
	for (let j = 0; j < count; j++) {
		edits.push(getRandomEdit(textModel, i, rng));
		i = textModel.getOffsetAt(lengthToPosition(edits[j].endOffset)) + (disjoint ? 1 : 0);
	}
	return edits;
}

function getRandomEdit(textModel: TextModel, rangeOffsetStart: number, rng: Random): TextEditInfo {
	const textModelLength = textModel.getValueLength();
	const offsetStart = rng.nextIntRange(rangeOffsetStart, textModelLength);
	const offsetEnd = rng.nextIntRange(offsetStart, textModelLength);

	const lineCount = rng.nextIntRange(0, 3);
	const columnCount = rng.nextIntRange(0, 5);

	return new TextEditInfo(positionToLength(textModel.getPositionAt(offsetStart)), positionToLength(textModel.getPositionAt(offsetEnd)), toLength(lineCount, columnCount));
}

function toEdit(editInfo: TextEditInfo): SingleTextEdit {
	const l = lengthToObj(editInfo.newLength);
	let text = '';

	for (let i = 0; i < l.lineCount; i++) {
		text += 'LLL\n';
	}
	for (let i = 0; i < l.columnCount; i++) {
		text += 'C';
	}

	return new SingleTextEdit(
		Range.fromPositions(
			lengthToPosition(editInfo.startOffset),
			lengthToPosition(editInfo.endOffset)
		),
		text
	);
}
