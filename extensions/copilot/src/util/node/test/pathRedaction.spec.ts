/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { beforeEach, suite, test } from 'vitest';
import { redactPaths } from '../../common/pathRedaction';

suite('Path redaction', () => {
	beforeEach(() => { });

	test('returns input', function () {
		const input = 'abc';
		const output = redactPaths(input);
		assert.deepStrictEqual(output, 'abc');
	});

	test('leaves urls intact', function () {
		const input = 'foo http://github.com/github/copilot bar';
		const output = redactPaths(input);
		assert.deepStrictEqual(output, 'foo http://github.com/github/copilot bar');
	});

	test('filter unix path', function () {
		assertRedacted('foo /Users/copilot bar', 'foo [redacted] bar');
	});

	test('path in parenthesis', function () {
		assertRedacted('See details (/Users/copilot)', 'See details ([redacted]');
	});

	test('filter windows path', function () {
		assertRedacted('foo C:\\Windows\\System32 bar', 'foo [redacted] bar');
		assertRedacted('foo d:\\Windows\\System32 bar', 'foo [redacted] bar');
		assertRedacted(
			'foo C:/Users/XXX/IdeaProjects/TesteUnitario/src/test/kotlin/MainTest.kt bar',
			'foo [redacted] bar'
		);
		assertRedacted('foo Z:\\projects/MainTest.kt bar', 'foo [redacted] bar');
	});

	test('filter unc path', function () {
		assertRedacted('foo \\server-name\\shared-resource-pathname bar', 'foo [redacted] bar');
		assertRedacted('foo file://\\server-name\\shared-resource-pathname bar', 'foo file://[redacted] bar');
	});

	test('file urls', function () {
		assertRedacted(
			'Invalid file file://C:/Users/XXX/IdeaProjects/kotlin/MainTest.kt bar',
			'Invalid file file://[redacted] bar'
		);
		assertRedacted('Invalid file file:///Users/copilot bar', 'Invalid file file://[redacted] bar');
	});

	function assertRedacted(input: string, output: string) {
		assert.deepStrictEqual(redactPaths(input), output);
	}
});
