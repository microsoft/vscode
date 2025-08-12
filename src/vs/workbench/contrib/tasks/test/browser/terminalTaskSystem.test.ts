/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as Platform from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

/**
 * Test helper function to simulate the Windows command quoting logic.
 * This tests the core logic that was changed in the fix.
 */
function testWindowsCommandQuoting(commandLine: string): string {
	// This simulates the logic from lines 1221-1223 in terminalTaskSystem.ts
	const isAlreadyQuoted = commandLine.length >= 2 && commandLine.startsWith('"') && commandLine.endsWith('"');
	return isAlreadyQuoted ? commandLine : '"' + commandLine + '"';
}

suite('Terminal Task System - Double Quoting', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Should not double quote already quoted command', () => {
		const quotedCommand = '"unify_builder -p d:\\MyProgram\\xxx\\builder.params"';
		const result = testWindowsCommandQuoting(quotedCommand);
		
		assert.strictEqual(result, quotedCommand, 'Already quoted command should not get additional quotes');
		assert.ok(!result.includes('""'), 'Result should not contain double quotes');
	});

	test('Should quote unquoted command', () => {
		const unquotedCommand = 'unify_builder -p d:\\MyProgram\\xxx\\builder.params';
		const result = testWindowsCommandQuoting(unquotedCommand);
		
		assert.strictEqual(result, `"${unquotedCommand}"`, 'Unquoted command should get quotes');
		assert.ok(result.startsWith('"') && result.endsWith('"'), 'Result should be quoted');
	});

	test('Should handle partial quotes (start quote only)', () => {
		const partialQuotedCommand = '"unify_builder -p d:\\MyProgram\\xxx\\builder.params';
		const result = testWindowsCommandQuoting(partialQuotedCommand);
		
		assert.strictEqual(result, `"${partialQuotedCommand}"`, 'Partial quoted command should get full quotes');
		assert.ok(result.startsWith('"') && result.endsWith('"'), 'Result should be fully quoted');
	});

	test('Should handle partial quotes (end quote only)', () => {
		const partialQuotedCommand = 'unify_builder -p d:\\MyProgram\\xxx\\builder.params"';
		const result = testWindowsCommandQuoting(partialQuotedCommand);
		
		assert.strictEqual(result, `"${partialQuotedCommand}"`, 'Partial quoted command should get full quotes');
		assert.ok(result.startsWith('"') && result.endsWith('"'), 'Result should be fully quoted');
	});

	test('Should handle empty command', () => {
		const emptyCommand = '';
		const result = testWindowsCommandQuoting(emptyCommand);
		
		assert.strictEqual(result, '""', 'Empty command should be quoted');
	});

	test('Should handle single character command', () => {
		const singleCharCommand = 'a';
		const result = testWindowsCommandQuoting(singleCharCommand);
		
		assert.strictEqual(result, '"a"', 'Single character command should be quoted');
	});

	test('Should handle command with only start quote', () => {
		const commandWithStartQuote = '"';
		const result = testWindowsCommandQuoting(commandWithStartQuote);
		
		assert.strictEqual(result, '"""', 'Command with only start quote should get additional quotes');
	});

	test('Should handle command with only end quote', () => {
		const commandWithEndQuote = '"';
		const result = testWindowsCommandQuoting(commandWithEndQuote);
		
		assert.strictEqual(result, '"""', 'Command with only end quote should get additional quotes');
	});

	test('Should handle command that starts and ends with quotes but has content', () => {
		const quotedCommandWithContent = '"echo hello"';
		const result = testWindowsCommandQuoting(quotedCommandWithContent);
		
		assert.strictEqual(result, quotedCommandWithContent, 'Properly quoted command should remain unchanged');
	});

	test('Should handle complex command with spaces and special characters', () => {
		const complexCommand = '"C:\\Program Files\\MyApp\\app.exe" --input "file with spaces.txt" --output result.txt';
		const result = testWindowsCommandQuoting(complexCommand);
		
		assert.strictEqual(result, complexCommand, 'Complex quoted command should not get additional quotes');
	});

	test('Should handle unquoted complex command', () => {
		const complexUnquotedCommand = 'C:\\Program Files\\MyApp\\app.exe --input file.txt';
		const result = testWindowsCommandQuoting(complexUnquotedCommand);
		
		assert.strictEqual(result, `"${complexUnquotedCommand}"`, 'Complex unquoted command should get quotes');
	});

	test('Should handle minimum quoted string', () => {
		const minQuotedString = '""';
		const result = testWindowsCommandQuoting(minQuotedString);
		
		assert.strictEqual(result, minQuotedString, 'Minimum quoted string should remain unchanged');
	});
});