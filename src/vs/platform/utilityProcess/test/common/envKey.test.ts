/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isValidEnvVariableKey } from '../common/envKey.js';

suite('envKey', () => {

	test('accepts common valid variable names', () => {
		assert.strictEqual(isValidEnvVariableKey('PATH'), true);
		assert.strictEqual(isValidEnvVariableKey('HOME'), true);
		assert.strictEqual(isValidEnvVariableKey('USERNAME'), true);
		assert.strictEqual(isValidEnvVariableKey('VSCODE_ESM_ENTRYPOINT'), true);
		assert.strictEqual(isValidEnvVariableKey('NODE_UNC_HOST_ALLOWLIST'), true);
		assert.strictEqual(isValidEnvVariableKey('_private'), true);
	});

	test('accepts digits after a leading letter/underscore', () => {
		assert.strictEqual(isValidEnvVariableKey('a1'), true);
		assert.strictEqual(isValidEnvVariableKey('a1b2'), true);
		assert.strictEqual(isValidEnvVariableKey('ABC_123'), true);
	});

	test('rejects names starting with a digit', () => {
		assert.strictEqual(isValidEnvVariableKey('1'), false);
		assert.strictEqual(isValidEnvVariableKey('1HOME'), false);
		assert.strictEqual(isValidEnvVariableKey('123'), false);
		assert.strictEqual(isValidEnvVariableKey('0a'), false);
	});

	test('rejects names containing illegal characters, regardless of case', () => {
		assert.strictEqual(isValidEnvVariableKey('a-b'), false);        // hyphen
		assert.strictEqual(isValidEnvVariableKey('a b'), false);        // space
		assert.strictEqual(isValidEnvVariableKey('a+b'), false);        // plus
		assert.strictEqual(isValidEnvVariableKey('a(b)'), false);       // parens
		assert.strictEqual(isValidEnvVariableKey('clion_g++'), false);  // real-world case
		assert.strictEqual(isValidEnvVariableKey('CLION_G++'), false);  // case variant
		assert.strictEqual(isValidEnvVariableKey('IntelliJ IDEA'), false);
		assert.strictEqual(isValidEnvVariableKey('CommonProgramFiles(x86)'), false);
		assert.strictEqual(isValidEnvVariableKey('ProgramFiles(x86)'), false);
		assert.strictEqual(isValidEnvVariableKey('PROGRAMFILES(X86)'), false);
		assert.strictEqual(isValidEnvVariableKey('CommonProgramFiles(X86)'), false);
	});

	test('rejects empty and non-string inputs', () => {
		assert.strictEqual(isValidEnvVariableKey(''), false);
	});
});