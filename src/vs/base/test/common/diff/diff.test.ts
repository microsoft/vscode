/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import * as assert from 'assert';
import { LcsDiff, IDiffChange } from 'vs/base/common/diff/diff';
import { LcsDiff2 } from 'vs/base/common/diff/diff2';

class StringDiffSequence {

	constructor(private source: string) {

	}

	getLength() {
		return this.source.length;
	}

	getElementHash(i) {
		return this.source.charAt(i);
	}
}

function createArray<T>(length: number, value: T): T[] {
	var r = [];
	for (var i = 0; i < length; i++) {
		r[i] = value;
	}
	return r;
}

function maskBasedSubstring(str: string, mask: boolean[]): string {
	var r = '';
	for (var i = 0; i < str.length; i++) {
		if (mask[i]) {
			r += str.charAt(i);
		}
	}
	return r;
}

function assertAnswer(originalStr: string, modifiedStr: string, changes: IDiffChange[], answerStr: string, onlyLength: boolean = false): void {
	var originalMask = createArray(originalStr.length, true);
	var modifiedMask = createArray(modifiedStr.length, true);

	var i, j, change;
	for (i = 0; i < changes.length; i++) {
		change = changes[i];

		if (change.originalLength) {
			for (j = 0; j < change.originalLength; j++) {
				originalMask[change.originalStart + j] = false;
			}
		}

		if (change.modifiedLength) {
			for (j = 0; j < change.modifiedLength; j++) {
				modifiedMask[change.modifiedStart + j] = false;
			}
		}
	}

	var originalAnswer = maskBasedSubstring(originalStr, originalMask);
	var modifiedAnswer = maskBasedSubstring(modifiedStr, modifiedMask);

	if (onlyLength) {
		assert.equal(originalAnswer.length, answerStr.length);
		assert.equal(modifiedAnswer.length, answerStr.length);
	} else {
		assert.equal(originalAnswer, answerStr);
		assert.equal(modifiedAnswer, answerStr);
	}
}

function lcsInnerTest(Algorithm: any, originalStr: string, modifiedStr: string, answerStr: string, onlyLength: boolean = false): void {
	var diff = new Algorithm(new StringDiffSequence(originalStr), new StringDiffSequence(modifiedStr));
	var changes = diff.ComputeDiff();
	assertAnswer(originalStr, modifiedStr, changes, answerStr, onlyLength);
}

function stringPower(str: string, power: number): string {
	var r = str;
	for (var i = 0; i < power; i++) {
		r += r;
	}
	return r;
}

function lcsTest(Algorithm: any, originalStr: string, modifiedStr: string, answerStr: string) {
	lcsInnerTest(Algorithm, originalStr, modifiedStr, answerStr);
	for (var i = 2; i <= 5; i++) {
		lcsInnerTest(Algorithm, stringPower(originalStr, i), stringPower(modifiedStr, i), stringPower(answerStr, i), true);
	}
}

function lcsTests(Algorithm) {
	lcsTest(Algorithm, 'heLLo world', 'hello orlando', 'heo orld');
	lcsTest(Algorithm, 'abcde', 'acd', 'acd'); // simple
	lcsTest(Algorithm, 'abcdbce', 'bcede', 'bcde'); // skip
	lcsTest(Algorithm, 'abcdefgabcdefg', 'bcehafg', 'bceafg'); // long
	lcsTest(Algorithm, 'abcde', 'fgh', ''); // no match
	lcsTest(Algorithm, 'abcfabc', 'fabc', 'fabc');
	lcsTest(Algorithm, '0azby0', '9axbzby9', 'azby');
	lcsTest(Algorithm, '0abc00000', '9a1b2c399999', 'abc');

	lcsTest(Algorithm, 'fooBar', 'myfooBar', 'fooBar'); // all insertions
	lcsTest(Algorithm, 'fooBar', 'fooMyBar', 'fooBar'); // all insertions
	lcsTest(Algorithm, 'fooBar', 'fooBar', 'fooBar'); // identical sequences
}

suite('Diff', () => {
	test('LcsDiff - different strings tests', function () {
		this.timeout(10000);
		lcsTests(LcsDiff);
	});

	test('LcsDiff2 - different strings tests', function () {
		this.timeout(10000);
		lcsTests(LcsDiff2);
	});
});

suite('Diff - Ported from VS', () => {
	test('using continue processing predicate to quit early', function () {
		var left = 'abcdef';
		var right = 'abxxcyyydzzzzezzzzzzzzzzzzzzzzzzzzf';

		// We use a long non-matching portion at the end of the right-side string, so the backwards tracking logic
		// doesn't get there first.
		var predicateCallCount = 0;

		var diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, leftSequence, longestMatchSoFar) {
			assert.equal(predicateCallCount, 0);

			predicateCallCount++;

			assert.equal(leftSequence.getLength(), left.length);
			assert.equal(leftIndex, 1);

			// cancel processing
			return false;
		});
		var changes = diff.ComputeDiff();

		assert.equal(predicateCallCount, 1);

		// Doesn't include 'c', 'd', or 'e', since we quit on the first request
		assertAnswer(left, right, changes, 'abf');



		// Cancel after the first match ('c')
		diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, leftSequence, longestMatchSoFar) {
			assert(longestMatchSoFar <= 1); // We never see a match of length > 1

			// Continue processing as long as there hasn't been a match made.
			return longestMatchSoFar < 1;
		});
		changes = diff.ComputeDiff();

		assertAnswer(left, right, changes, 'abcf');



		// Cancel after the second match ('d')
		diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, leftSequence, longestMatchSoFar) {
			assert(longestMatchSoFar <= 2); // We never see a match of length > 2

			// Continue processing as long as there hasn't been a match made.
			return longestMatchSoFar < 2;
		});
		changes = diff.ComputeDiff();

		assertAnswer(left, right, changes, 'abcdf');



		// Cancel *one iteration* after the second match ('d')
		var hitSecondMatch = false;
		diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, leftSequence, longestMatchSoFar) {
			assert(longestMatchSoFar <= 2); // We never see a match of length > 2

			var hitYet = hitSecondMatch;
			hitSecondMatch = longestMatchSoFar > 1;
			// Continue processing as long as there hasn't been a match made.
			return !hitYet;
		});
		changes = diff.ComputeDiff();

		assertAnswer(left, right, changes, 'abcdf');



		// Cancel after the third and final match ('e')
		diff = new LcsDiff(new StringDiffSequence(left), new StringDiffSequence(right), function (leftIndex, leftSequence, longestMatchSoFar) {
			assert(longestMatchSoFar <= 3); // We never see a match of length > 3

			// Continue processing as long as there hasn't been a match made.
			return longestMatchSoFar < 3;
		});
		changes = diff.ComputeDiff();

		assertAnswer(left, right, changes, 'abcdef');
	});
});
