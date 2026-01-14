/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DefaultLinesDiffComputer } from '../../../common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { ILinesDiffComputerOptions } from '../../../common/diff/linesDiffComputer.js';

// Mock model that can be disposed for testing
class MockDisposableModel {
	private _disposed = false;

	isDisposed(): boolean {
		return this._disposed;
	}

	dispose(): void {
		this._disposed = true;
	}
}

suite('Model Disposal Cancellation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Diff computation stops when model is disposed', () => {
		const originalModel = new MockDisposableModel();
		const modifiedModel = new MockDisposableModel();

		// Create large input to ensure computation takes some time
		const originalLines: string[] = [];
		const modifiedLines: string[] = [];
		
		// Generate 1000 lines with differences to make diff computation take time
		for (let i = 0; i < 1000; i++) {
			originalLines.push(`Line ${i}: original content with some text`);
			modifiedLines.push(`Line ${i}: modified content with different text`);
		}

		const computer = new DefaultLinesDiffComputer();
		const options: ILinesDiffComputerOptions = {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 10000, // 10 seconds timeout
			computeMoves: false,
			models: [originalModel, modifiedModel]
		};

		// Dispose models immediately to simulate editor close
		originalModel.dispose();

		// Compute diff - should return early with hitTimeout = true due to disposal
		const result = computer.computeDiff(originalLines, modifiedLines, options);

		// The result should indicate early termination
		assert.strictEqual(result.hitTimeout, true, 'Diff should quit early when model is disposed');
	});

	test('Diff computation completes when models are not disposed', () => {
		const originalModel = new MockDisposableModel();
		const modifiedModel = new MockDisposableModel();

		// Small input for quick computation
		const originalLines = ['line 1', 'line 2', 'line 3'];
		const modifiedLines = ['line 1', 'modified line 2', 'line 3'];

		const computer = new DefaultLinesDiffComputer();
		const options: ILinesDiffComputerOptions = {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 10000,
			computeMoves: false,
			models: [originalModel, modifiedModel]
		};

		// Don't dispose - computation should complete normally
		const result = computer.computeDiff(originalLines, modifiedLines, options);

		// The result should complete successfully
		assert.strictEqual(result.hitTimeout, false, 'Diff should complete when models are not disposed');
		assert.ok(result.changes.length > 0, 'Should detect changes');
	});

	test('Diff computation without models parameter works normally', () => {
		// Test that passing no models parameter doesn't break existing functionality
		const originalLines = ['line 1', 'line 2'];
		const modifiedLines = ['line 1', 'modified line 2'];

		const computer = new DefaultLinesDiffComputer();
		const options: ILinesDiffComputerOptions = {
			ignoreTrimWhitespace: false,
			maxComputationTimeMs: 10000,
			computeMoves: false
			// No models parameter
		};

		const result = computer.computeDiff(originalLines, modifiedLines, options);

		assert.strictEqual(result.hitTimeout, false, 'Diff should complete normally');
		assert.ok(result.changes.length > 0, 'Should detect changes');
	});
});
