/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CommandString } from '../../common/tasks.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Tasks - Empty Command Handling', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('CommandString utility for empty command detection', () => {
		test('Should extract string value correctly', () => {
			assert.strictEqual(CommandString.value('test'), 'test');
			assert.strictEqual(CommandString.value(''), '');
			assert.strictEqual(CommandString.value('  whitespace  '), '  whitespace  ');
		});

		test('Should handle quoted strings correctly', () => {
			const quotedString = { value: 'quoted command', quoting: 'strong' as any };
			assert.strictEqual(CommandString.value(quotedString), 'quoted command');
		});

		test('Empty command string should be considered empty after trim', () => {
			// This tests the logic that was fixed in _isTaskEmpty()
			const emptyCommand = '';
			const result = CommandString.value(emptyCommand).trim() !== '';
			assert.strictEqual(result, false, 'Empty command should be considered empty after trim');
		});

		test('Whitespace-only command should be considered empty after trim', () => {
			const whitespaceCommand = '   \t  \n  ';
			const result = CommandString.value(whitespaceCommand).trim() !== '';
			assert.strictEqual(result, false, 'Whitespace-only command should be considered empty after trim');
		});

		test('Valid command should not be considered empty', () => {
			const validCommand = 'echo hello';
			const result = CommandString.value(validCommand).trim() !== '';
			assert.strictEqual(result, true, 'Valid command should not be considered empty');
		});

		test('Command with leading/trailing whitespace should not be considered empty', () => {
			const commandWithWhitespace = '  echo hello  ';
			const result = CommandString.value(commandWithWhitespace).trim() !== '';
			assert.strictEqual(result, true, 'Command with whitespace should not be considered empty after trim');
		});
	});
});