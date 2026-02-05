/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';

/**
 * Test cases for model switching index calculation logic used by
 * switchToNextModel and switchToPreviousModel in ChatInputPart.
 */
suite('ChatInputPart Model Switching', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Helper function that replicates the index calculation logic from
	 * switchToNextModel in chatInputPart.ts
	 */
	function getNextModelIndex(currentIndex: number, modelsLength: number): number {
		return (currentIndex + 1) % modelsLength;
	}

	/**
	 * Helper function that replicates the index calculation logic from
	 * switchToPreviousModel in chatInputPart.ts
	 */
	function getPreviousModelIndex(currentIndex: number, modelsLength: number): number {
		return (currentIndex - 1 + modelsLength) % modelsLength;
	}

	suite('switchToNextModel', () => {

		test('should cycle to next model', () => {
			// Given 3 models [0, 1, 2], starting at index 0
			assert.strictEqual(getNextModelIndex(0, 3), 1);
			assert.strictEqual(getNextModelIndex(1, 3), 2);
		});

		test('should wrap around from last model to first', () => {
			// Given 3 models [0, 1, 2], starting at last index 2
			assert.strictEqual(getNextModelIndex(2, 3), 0);
		});

		test('should work with single model', () => {
			// Given 1 model [0], should stay at 0
			assert.strictEqual(getNextModelIndex(0, 1), 0);
		});

		test('should work with two models', () => {
			assert.strictEqual(getNextModelIndex(0, 2), 1);
			assert.strictEqual(getNextModelIndex(1, 2), 0);
		});

		test('should handle model not found (index -1)', () => {
			// When current model is not found, findIndex returns -1
			// (-1 + 1) % 3 = 0, so it selects the first model
			assert.strictEqual(getNextModelIndex(-1, 3), 0);
		});
	});

	suite('switchToPreviousModel', () => {

		test('should cycle to previous model', () => {
			// Given 3 models [0, 1, 2], starting at index 2
			assert.strictEqual(getPreviousModelIndex(2, 3), 1);
			assert.strictEqual(getPreviousModelIndex(1, 3), 0);
		});

		test('should wrap around from first model to last', () => {
			// Given 3 models [0, 1, 2], starting at first index 0
			assert.strictEqual(getPreviousModelIndex(0, 3), 2);
		});

		test('should work with single model', () => {
			// Given 1 model [0], should stay at 0
			assert.strictEqual(getPreviousModelIndex(0, 1), 0);
		});

		test('should work with two models', () => {
			assert.strictEqual(getPreviousModelIndex(0, 2), 1);
			assert.strictEqual(getPreviousModelIndex(1, 2), 0);
		});

		test('should handle model not found (index -1)', () => {
			// When current model is not found, findIndex returns -1
			// (-1 - 1 + 3) % 3 = 1, so it selects index 1
			assert.strictEqual(getPreviousModelIndex(-1, 3), 1);
		});
	});

	suite('bidirectional cycling', () => {

		test('next then previous should return to same model', () => {
			const modelsLength = 5;
			for (let i = 0; i < modelsLength; i++) {
				const afterNext = getNextModelIndex(i, modelsLength);
				const backToPrevious = getPreviousModelIndex(afterNext, modelsLength);
				assert.strictEqual(backToPrevious, i, `Starting at ${i}, next then previous should return to ${i}`);
			}
		});

		test('previous then next should return to same model', () => {
			const modelsLength = 5;
			for (let i = 0; i < modelsLength; i++) {
				const afterPrevious = getPreviousModelIndex(i, modelsLength);
				const backToNext = getNextModelIndex(afterPrevious, modelsLength);
				assert.strictEqual(backToNext, i, `Starting at ${i}, previous then next should return to ${i}`);
			}
		});

		test('cycling through all models forward returns to start', () => {
			const modelsLength = 4;
			let index = 0;
			for (let i = 0; i < modelsLength; i++) {
				index = getNextModelIndex(index, modelsLength);
			}
			assert.strictEqual(index, 0, 'After cycling through all models forward, should return to start');
		});

		test('cycling through all models backward returns to start', () => {
			const modelsLength = 4;
			let index = 0;
			for (let i = 0; i < modelsLength; i++) {
				index = getPreviousModelIndex(index, modelsLength);
			}
			assert.strictEqual(index, 0, 'After cycling through all models backward, should return to start');
		});
	});
});
