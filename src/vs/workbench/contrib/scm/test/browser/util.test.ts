/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { formatHistoryItem } from '../../browser/util.js';
import { ISCMHistoryItem } from '../../common/history.js';

function createTestHistoryItem(overrides?: Partial<ISCMHistoryItem>): ISCMHistoryItem {
	return {
		id: 'abc123',
		displayId: 'abc123',
		parentIds: [],
		subject: 'Fix critical bug',
		message: 'Fix critical bug\n\nThis resolves issue #123',
		author: 'John Doe',
		authorEmail: 'john.doe@example.com',
		timestamp: new Date('2023-12-01T10:30:00Z').getTime(),
		...overrides
	};
}

suite('SCM History Item Formatting', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('default format returns subject', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject}');
		assert.strictEqual(result, 'Fix critical bug');
	});

	test('empty format returns subject', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '');
		assert.strictEqual(result, 'Fix critical bug');
	});

	test('format with author', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${author} • ${subject}');
		assert.strictEqual(result, 'John Doe • Fix critical bug');
	});

	test('format with displayId', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '[${displayId}] ${subject}');
		assert.strictEqual(result, '[abc123] Fix critical bug');
	});

	test('format with hash', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${hash} - ${subject} by ${author}');
		assert.strictEqual(result, 'abc123 - Fix critical bug by John Doe');
	});

	test('format with message', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject}: ${message}');
		assert.strictEqual(result, 'Fix critical bug: Fix critical bug\n\nThis resolves issue #123');
	});

	test('format with authorEmail', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject} (${authorEmail})');
		assert.strictEqual(result, 'Fix critical bug (john.doe@example.com)');
	});

	test('format with date', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject} ${date}');
		// The exact date format may vary based on locale, so just check it contains the subject
		assert.ok(result.startsWith('Fix critical bug '));
		assert.ok(result.length > 'Fix critical bug '.length);
	});

	test('format with timestamp', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject} (${timestamp})');
		// The exact timestamp format may vary based on locale, so just check it contains the subject
		assert.ok(result.startsWith('Fix critical bug ('));
		assert.ok(result.endsWith(')'));
	});

	test('format with multiple variables', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '[${displayId}] ${subject} by ${author} <${authorEmail}>');
		assert.strictEqual(result, '[abc123] Fix critical bug by John Doe <john.doe@example.com>');
	});

	test('format with missing values', () => {
		const historyItem = createTestHistoryItem({
			author: undefined,
			authorEmail: undefined,
			timestamp: undefined
		});
		const result = formatHistoryItem(historyItem, '${author} • ${subject} (${authorEmail}) ${date}');
		assert.strictEqual(result, ' • Fix critical bug ()');
	});

	test('format with unknown variables', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject} ${unknownVariable}');
		assert.strictEqual(result, 'Fix critical bug ${unknownVariable}');
	});

	test('format with escaped variables', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${subject} $${notVariable}');
		assert.strictEqual(result, 'Fix critical bug $${notVariable}');
	});

	test('complex GitLens-style format', () => {
		const historyItem = createTestHistoryItem();
		const result = formatHistoryItem(historyItem, '${author}, ${date} • ${subject}');
		assert.ok(result.includes('John Doe'));
		assert.ok(result.includes('Fix critical bug'));
		assert.ok(result.includes(' • '));
	});
});
