/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { strictEqual } from 'node:assert';
import { getTokenType, TokenType } from '../tokens';

suite('Terminal Suggest', () => {
	test('simple command', () => {
		strictEqual(getTokenType({ commandLine: 'echo', cursorPosition: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo hello'.length }, undefined), TokenType.Argument);
	});
	test('simple command, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo'.length }, undefined), TokenType.Command);
	});
	test('simple argument, cursor mid text', () => {
		strictEqual(getTokenType({ commandLine: 'echo hello', cursorPosition: 'echo hel'.length }, undefined), TokenType.Argument);
	});
	suite('reset to command', () => {
		test('|', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello | ', cursorPosition: 'echo hello | '.length }, undefined), TokenType.Command);
		});
		test(';', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello; ', cursorPosition: 'echo hello; '.length }, undefined), TokenType.Command);
		});
		test('&&', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello && ', cursorPosition: 'echo hello && '.length }, undefined), TokenType.Command);
		});
		test('||', () => {
			strictEqual(getTokenType({ commandLine: 'echo hello || ', cursorPosition: 'echo hello || '.length }, undefined), TokenType.Command);
		});
	});
	suite('pwsh', () => {
		test('simple command', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host', cursorPosition: 'Write-Host'.length }, 'pwsh'), TokenType.Command);
		});
		test('simple argument', () => {
			strictEqual(getTokenType({ commandLine: 'Write-Host hello', cursorPosition: 'Write-Host hello'.length }, 'pwsh'), TokenType.Argument);
		});
		test('reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and `, cursorPosition: `Write-Host hello -and `.length }, 'pwsh'), TokenType.Command);
		});
		test('arguments after reset char', () => {
			strictEqual(getTokenType({ commandLine: `Write-Host hello -and $true `, cursorPosition: `Write-Host hello -and $true `.length }, 'pwsh'), TokenType.Argument);
		});
	});
});
