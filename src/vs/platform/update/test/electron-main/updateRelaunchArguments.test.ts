/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { getRelaunchArguments, quoteWindowsArgument } from '../../electron-main/updateRelaunchArguments.js';

suite('Win32UpdateService - relaunch arguments', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function args(overrides: Partial<NativeParsedArgs>): NativeParsedArgs {
		return { _: [], ...overrides } as NativeParsedArgs;
	}

	test('quoteWindowsArgument', () => {
		assert.strictEqual(quoteWindowsArgument('--disable-gpu'), '--disable-gpu');
		assert.strictEqual(quoteWindowsArgument('C:\\Users\\test\\ext'), 'C:\\Users\\test\\ext');
		assert.strictEqual(quoteWindowsArgument('C:\\path with space\\ext'), '"C:\\path with space\\ext"');
		assert.strictEqual(quoteWindowsArgument('a"b'), '"a\\"b"');
		assert.strictEqual(quoteWindowsArgument('C:\\ends with slash\\'), '"C:\\ends with slash\\\\"');
	});

	test('carries forward curated path and flag arguments', () => {
		const result = getRelaunchArguments(args({
			'user-data-dir': 'C:\\data',
			'extensions-dir': 'C:\\path with space\\ext',
			'disable-gpu': true,
			'disable-lcd-text': true
		}));

		assert.strictEqual(result, '--user-data-dir C:\\data --extensions-dir "C:\\path with space\\ext" --disable-gpu --disable-lcd-text');
	});

	test('returns empty string when no relevant arguments are present', () => {
		assert.strictEqual(getRelaunchArguments(args({})), '');
	});

	test('ignores transient and one-shot arguments', () => {
		const result = getRelaunchArguments(args({
			_: ['C:\\some\\file.txt'],
			wait: true,
			'new-window': true,
			'install-extension': ['some.extension'],
			'extensions-dir': 'C:\\ext'
		}));

		assert.strictEqual(result, '--extensions-dir C:\\ext');
	});

	test('carries forward additional environment string and boolean arguments', () => {
		const result = getRelaunchArguments(args({
			'profile': 'work',
			'proxy-server': 'http://localhost:8080',
			'no-sandbox': true,
			'disable-updates': true
		}));

		assert.strictEqual(result, '--profile work --proxy-server http://localhost:8080 --no-sandbox --disable-updates');
	});

	test('ignores flag arguments that are not set to true', () => {
		const result = getRelaunchArguments(args({
			'disable-gpu': false,
			'user-data-dir': ''
		}));

		assert.strictEqual(result, '');
	});
});
