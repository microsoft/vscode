/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { stripAnsiEscapeSequences, stripAnsiEscapeSequencesFromPrompt } from 'vs/base/common/ansi';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ansi', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('stripAnsiEscapeSequences', () => {
		test('should strip simple SGR escape sequences', () => {
			strictEqual(stripAnsiEscapeSequences('\u001b[31mHello, World!\u001b[0m'), 'Hello, World!');
		});
		test('should strip complex SGR escape sequences', () => {
			strictEqual(stripAnsiEscapeSequences('\u001b[38;2;255;82;197;48;2;155;106;0mHello, World!\u001b[0m'), 'Hello, World!');
		});
		test('should strip ED, EL escape sequences', () => {
			strictEqual(stripAnsiEscapeSequences('\u001b[KHello, World!\r\n\u001b[2J'), 'Hello, World!\r\n');
		});
	});

	suite('stripAnsiEscapeSequencesFromPrompt', () => {
		test('should strip simple SGR escape sequences', () => {
			strictEqual(stripAnsiEscapeSequences('\u001b[31m$ \u001b[0m'), '$ ');
		});
		test('should strip \[ and \] chars and their contents', () => {
			strictEqual(stripAnsiEscapeSequencesFromPrompt('\n\\[\u001b[01;34m\\]\\w\\[\u001b[00m\\]\n\\[\u001b[1;32m\\]> \\[\u001b[0m\\]'), '\n\\w\n> ');
		});
	});
});
