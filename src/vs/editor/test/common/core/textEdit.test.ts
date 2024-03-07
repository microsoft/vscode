/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { MersenneTwister, getRandomEditInfos, toEdit, } from 'vs/editor/test/common/model/bracketPairColorizer/combineTextEditInfos.test';
import { TextEdit } from 'vs/editor/common/core/textEdit';
import { TextModelText } from 'vs/editor/common/model/textModelText';

suite('TextEdit', () => {
	suite('inverse', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		function runTest(seed: number): void {
			const rng = new MersenneTwister(seed);
			const randomText = generateRandomMultilineString(rng, 10);
			const model = createTextModel(randomText);

			const edits = new TextEdit(getRandomEditInfos(model, rng.nextIntRange(1, 4), rng, true).map(e => toEdit(e)));
			const invEdits = edits.inverse(new TextModelText(model));

			model.applyEdits(edits.edits);
			model.applyEdits(invEdits.edits);

			assert.deepStrictEqual(model.getValue(), randomText);
			model.dispose();
		}

		test.skip('brute-force', () => {
			for (let i = 0; i < 10_000; i++) {
				runTest(i);
			}
		});

		for (let seed = 0; seed < 20; seed++) {
			test(`test ${seed}`, () => runTest(seed));
		}
	});
});

function generateRandomMultilineString(rng: MersenneTwister, numberOfLines: number, maximumLengthOfLines: number = 20): string {
	let randomText: string = '';
	for (let i = 0; i < numberOfLines; i++) {
		const lengthOfLine = rng.nextIntRange(0, maximumLengthOfLines + 1);
		randomText += generateRandomSimpleString(rng, lengthOfLine) + '\n';
	}
	return randomText;
}

function generateRandomSimpleString(rng: MersenneTwister, stringLength: number): string {
	const possibleCharacters: string = ' abcdefghijklmnopqrstuvwxyz0123456789';
	let randomText: string = '';
	for (let i = 0; i < stringLength; i++) {
		const characterIndex = rng.nextIntRange(0, possibleCharacters.length);
		randomText += possibleCharacters.charAt(characterIndex);

	}
	return randomText;
}
