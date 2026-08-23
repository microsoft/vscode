/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'vitest';
import { DiagnosticData } from '../../../../platform/inlineEdits/common/dataTypes/diagnosticData';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { Diagnostic } from '../../vscode-node/features/diagnosticsBasedCompletions/diagnosticsCompletions';
import { DiagnosticsCollection } from '../../vscode-node/features/diagnosticsCompletionProcessor';

// Helper function to create a Diagnostic from a mock VS Code diagnostic
function createDiagnostic(message: string, range: OffsetRange): Diagnostic {
	return new Diagnostic(new DiagnosticData(
		URI.parse('file:///test/document.ts'),
		message,
		'error',
		range,
		undefined,
		undefined
	));
}

suite('DiagnosticsCollection', () => {
	test('isEqualAndUpdate should return true for empty arrays', () => {
		const collection = new DiagnosticsCollection();
		const result = collection.isEqualAndUpdate([]);
		assert.strictEqual(result, true);
	});
	test('isEqualAndUpdate should update diagnostics and return false when different', () => {
		const collection = new DiagnosticsCollection();
		const diagnostic = createDiagnostic(
			'Test error',
			new OffsetRange(0, 4)
		);

		const result = collection.isEqualAndUpdate([diagnostic]);

		assert.strictEqual(result, false);
	});
	test('isEqualAndUpdate should return true when diagnostics are equal', () => {
		const collection = new DiagnosticsCollection();
		const diagnostic1 = createDiagnostic('Test error', new OffsetRange(0, 4));
		const diagnostic2 = createDiagnostic('Test error', new OffsetRange(0, 4));

		collection.isEqualAndUpdate([diagnostic1]);
		const result = collection.isEqualAndUpdate([diagnostic2]);

		assert.strictEqual(result, true);
	});
	test('isEqualAndUpdate should return false when a diagnostics is invalidated', () => {
		const collection = new DiagnosticsCollection();
		const diagnostic1 = createDiagnostic('Test error', new OffsetRange(0, 4));
		const diagnostic2 = createDiagnostic('Test error', new OffsetRange(0, 4));

		collection.isEqualAndUpdate([diagnostic1]);

		diagnostic1.invalidate();

		const result = collection.isEqualAndUpdate([diagnostic2]);

		assert.strictEqual(result, false);
	});

	suite('applyEdit', () => {
		test('should invalidate when typing numbers at the end of a diagnostic range', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 17)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic]);

			// Replace "test" with "test123"
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(12, 17), 'test123'); // 0-based: 12-16
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);
			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});

		test('should invalidate diagnostic when range shrinks', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(6, 11)); // "world"
			collection.isEqualAndUpdate([diagnostic]);

			// Create an edit that removes "w"
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(6, 7), ''); // Remove "w"
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});

		test('should update range when content stays the same and range length unchanged', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16));
			collection.isEqualAndUpdate([diagnostic]);

			// Insert " big" without touching the diagnostic range
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(6, 6), ' big');
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, false);
			assert.strictEqual(diagnostic.isValid(), true);
		});

		test('should invalidate diagnostic when content at range changes with same length', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test"
			collection.isEqualAndUpdate([diagnostic]);

			// Replace "test" with "best"
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(12, 16), 'best');
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});
		test('should handle range growth with same prefix content', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16));
			collection.isEqualAndUpdate([diagnostic]);

			// "test" becomes "test!" (non-alphanumeric edge)
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(12, 16), 'test!');
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, false);
			assert.strictEqual(diagnostic.isValid(), true);

			// Range should still point to the original "test" part
			assert.strictEqual(diagnostic.range.start, 12);
			assert.strictEqual(diagnostic.range.endExclusive, 16);
		});

		test('should handle range growth with same suffix content', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test"
			collection.isEqualAndUpdate([diagnostic]);

			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(12, 12), 'ab');
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});

		test('should invalidate when edge character is alphanumeric with prefix match', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test"
			collection.isEqualAndUpdate([diagnostic]);

			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(16, 16), 'A');
			const after = edit.applyOnText(before);

			// Add A after "test"

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});

		test('should not invalidate when edge character is non-alphanumeric with prefix match', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic]);

			// Replace "test" with "test!"
			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(12, 16), 'test!'); // 0-based: 12-15
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, false);
			assert.strictEqual(diagnostic.isValid(), true);
		});

		test('should handle multiple diagnostics correctly', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic1 = createDiagnostic('Error 1', new OffsetRange(0, 5));   // "hello" = positions 0-4 (0-based)
			const diagnostic2 = createDiagnostic('Error 2', new OffsetRange(12, 16)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic1, diagnostic2]);

			const before = new StringText('hello world test');
			const edit = StringEdit.replace(new OffsetRange(6, 6), 'big ');
			const after = edit.applyOnText(before);

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, false);
			assert.strictEqual(diagnostic1.isValid(), true);
			assert.strictEqual(diagnostic2.isValid(), true);

			// First diagnostic range should be unchanged
			assert.strictEqual(diagnostic1.range.start, 0);
			assert.strictEqual(diagnostic1.range.endExclusive, 5);

			// Second diagnostic range should be shifted by 4 positions ("big ")
			assert.strictEqual(diagnostic2.range.start, 16);
			assert.strictEqual(diagnostic2.range.endExclusive, 20);
		});

		test('should handle edge case with empty edge character', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic]);

			const before = new StringText('hello world test');
			const after = new StringText('hello world testx'); // Add 'x' at end

			// Replace "test" with "testx"
			const edit = StringEdit.replace(new OffsetRange(12, 16), 'testx'); // 0-based: 12-15

			const hasInvalidated = collection.applyEdit(before, edit, after);

			// Since 'x' is alphanumeric, should invalidate
			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});

		test('should handle suffix match with non-alphanumeric edge character', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic]);

			const before = new StringText('hello world test');
			const after = new StringText('hello world .test'); // "test" becomes ".test"

			// Replace "test" with ".test"
			const edit = StringEdit.replace(new OffsetRange(12, 16), '.test'); // 0-based: 12-15

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, false);
			assert.strictEqual(diagnostic.isValid(), true);
			// Range should point to the suffix "test" part
			assert.strictEqual(diagnostic.range.start, 13);
			assert.strictEqual(diagnostic.range.endExclusive, 17);   // 17 + 1 (".")
		});

		test('should handle case where newOffsetRange is null', () => {
			const collection = new DiagnosticsCollection();
			const diagnostic = createDiagnostic('Test error', new OffsetRange(12, 16)); // "test" = positions 12-15 (0-based)
			collection.isEqualAndUpdate([diagnostic]);

			// Mock applyEditsToRanges to return null (would happen if range is completely removed)
			const before = new StringText('hello world test');
			const after = new StringText('hello world'); // "test" completely removed

			// Remove " test" completely (0-based: positions 11-15)
			const edit = StringEdit.replace(new OffsetRange(11, 16), '');

			const hasInvalidated = collection.applyEdit(before, edit, after);

			assert.strictEqual(hasInvalidated, true);
			assert.strictEqual(diagnostic.isValid(), false);
		});
	});
});
