/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	SuggestionStatus,
	computeCompCharLen,
	computeCompletionText,
	countLines,
} from '../partialSuggestions';

suite('partial acceptance utilities', () => {
	test('returns the length of the completion text when compType is full', () => {
		const completionText = 'Hello, World!';
		const suggestionStatus: SuggestionStatus = {
			compType: 'full',
			acceptedLength: completionText.length,
			acceptedLines: 0,
		};

		const result = computeCompCharLen(suggestionStatus, completionText);

		assert.strictEqual(result, completionText.length);
	});

	test('returns the acceptedLength when compType is partial', () => {
		const acceptedLength = 5;
		const suggestionStatus: SuggestionStatus = { compType: 'partial', acceptedLength, acceptedLines: 0 };

		const result = computeCompCharLen(suggestionStatus, 'Hello, World!');

		assert.strictEqual(result, acceptedLength);
	});

	test('returns the full completion text when compType is full', () => {
		const completionText = 'Hello, World!';
		const suggestionStatus: SuggestionStatus = {
			compType: 'full',
			acceptedLength: completionText.length,
			acceptedLines: 0,
		};

		const result = computeCompletionText(completionText, suggestionStatus);

		assert.strictEqual(result, completionText);
	});

	test('returns the substring of the completion text when compType is partial', () => {
		const acceptedLength = 5;
		const completionText = 'Hello, World!';
		const suggestionStatus: SuggestionStatus = { compType: 'partial', acceptedLength, acceptedLines: 0 };

		const result = computeCompletionText(completionText, suggestionStatus);

		assert.strictEqual(result, 'Hello');
	});
});

suite('countLines function', () => {
	test('returns 0 for empty string', () => {
		const result = countLines('');
		assert.strictEqual(result, 0);
	});

	test('returns 1 for single line without newline', () => {
		const result = countLines('single line text');
		assert.strictEqual(result, 1);
	});

	test('handles Unix newlines (\\n)', () => {
		const text = 'line1\nline2\nline3';
		const result = countLines(text);

		assert.strictEqual(result, 3);
	});

	test('handles Windows newlines (\\r\\n)', () => {
		const text = 'line1\r\nline2\r\nline3';
		const result = countLines(text);

		assert.strictEqual(result, 3);
	});

	test('ignores old Mac newlines (\\r)', () => {
		const text = 'line1\rline2';
		const result = countLines(text);

		assert.strictEqual(result, 1);
	});
});
