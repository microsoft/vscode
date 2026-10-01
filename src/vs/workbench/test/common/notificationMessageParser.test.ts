/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCodeSpan, parseNotificationMessage } from '../../common/notificationMessageParser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('NotificationMessageParser', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('plain text passes through unchanged', () => {
		assert.deepStrictEqual(parseNotificationMessage(''), []);
		assert.deepStrictEqual(parseNotificationMessage('hello world'), ['hello world']);
	});

	test('plain link still parses as a link', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('See [docs](https://example.com) for more.'),
			[
				'See ',
				{ label: 'docs', href: 'https://example.com' },
				' for more.'
			]
		);
	});

	test('single backtick span renders as code', () => {
		const nodes = parseNotificationMessage('Use `npm install` to begin.');
		assert.deepStrictEqual(nodes, [
			'Use ',
			{ code: 'npm install' },
			' to begin.'
		]);
		assert.ok(isCodeSpan(nodes[1] as any));
	});

	test('code span and link can co-exist in the same message', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('Run `npm install` then visit [docs](https://example.com).'),
			[
				'Run ',
				{ code: 'npm install' },
				' then visit ',
				{ label: 'docs', href: 'https://example.com' },
				'.'
			]
		);
	});

	test('empty backticks stay literal', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('before `` after'),
			['before `` after']
		);
	});

	test('unmatched trailing backtick stays literal', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('hello `world'),
			['hello `world']
		);
	});

	test('escaped backtick stays literal and drops the backslash', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('use \\`literal\\` text'),
			['use `literal` text']
		);
	});

	test('escaped backtick inside a code span is preserved as a literal backtick', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('value `a\\`b` end'),
			[
				'value ',
				{ code: 'a`b' },
				' end'
			]
		);
	});

	test('link inside code span is NOT parsed as a link', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('see `[click](https://example.com)` for syntax'),
			[
				'see ',
				{ code: '[click](https://example.com)' },
				' for syntax'
			]
		);
	});

	test('multiple code spans in a single message', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('Run `npm i` and then `npm test`.'),
			[
				'Run ',
				{ code: 'npm i' },
				' and then ',
				{ code: 'npm test' },
				'.'
			]
		);
	});

	test('command-link still works with surrounding code spans', () => {
		assert.deepStrictEqual(
			parseNotificationMessage('Selected: `(.venv)` — see [details](command:foo).'),
			[
				'Selected: ',
				{ code: '(.venv)' },
				' — see ',
				{ label: 'details', href: 'command:foo' },
				'.'
			]
		);
	});
});
