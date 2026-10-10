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

	function getArguments(overrides: Partial<NativeParsedArgs>, rawArgs: readonly string[] = []): string {
		return getRelaunchArguments(args(overrides), rawArgs, 'C:\\cwd');
	}

	test('quoteWindowsArgument', () => {
		assert.strictEqual(quoteWindowsArgument('--disable-gpu'), '--disable-gpu');
		assert.strictEqual(quoteWindowsArgument('C:\\Users\\test\\ext'), 'C:\\Users\\test\\ext');
		assert.strictEqual(quoteWindowsArgument('C:\\path with space\\ext'), '"C:\\path with space\\ext"');
		assert.strictEqual(quoteWindowsArgument('a"b'), '"a\\"b"');
		assert.strictEqual(quoteWindowsArgument('C:\\ends with slash\\'), '"C:\\ends with slash\\\\"');
	});

	test('carries forward curated path and flag arguments', () => {
		const result = getArguments({
			'user-data-dir': 'C:\\data',
			'extensions-dir': 'C:\\path with space\\ext',
			'disable-gpu': true,
			'disable-lcd-text': true
		});

		assert.strictEqual(result, '--user-data-dir=C:\\data "--extensions-dir=C:\\path with space\\ext" --disable-gpu --disable-lcd-text');
	});

	test('returns empty string when no relevant arguments are present', () => {
		assert.strictEqual(getArguments({}), '');
	});

	test('ignores transient and one-shot arguments', () => {
		const result = getArguments({
			_: ['C:\\some\\file.txt'],
			wait: true,
			'new-window': true,
			'install-extension': ['some.extension'],
			'profile': 'work',
			'profile-temp': true,
			'crash-reporter-id': 'derived-id',
			'logsPath': 'C:\\logs',
			'extensions-dir': 'C:\\ext'
		});

		assert.strictEqual(result, '--extensions-dir=C:\\ext');
	});

	test('carries forward additional environment string and boolean arguments', () => {
		const result = getArguments({
			'proxy-server': 'http://localhost:8080',
			'disable-updates': true
		}, ['--no-sandbox']);

		assert.strictEqual(result, '--proxy-server=http://localhost:8080 --disable-updates --no-sandbox');
	});

	test('carries forward explicit negated flags from raw arguments', () => {
		const result = getArguments({
			'no-sandbox': false,
			'no-proxy-server': false
		}, ['--no-sandbox', '--no-proxy-server']);

		assert.strictEqual(result, '--no-sandbox --no-proxy-server');
	});

	test('carries forward string values that start with a hyphen', () => {
		const result = getArguments({
			'js-flags': '--max-old-space-size=8192',
			'enable-tracing': '-*,v8'
		});

		assert.strictEqual(result, '--js-flags=--max-old-space-size=8192 --enable-tracing=-*,v8');
	});

	test('ignores flag arguments that are not set to true', () => {
		const result = getArguments({
			'disable-gpu': false,
			'user-data-dir': ''
		});

		assert.strictEqual(result, '');
	});

	test('resolves relative path arguments against the current working directory', () => {
		const result = getArguments({
			'extensions-dir': '.\\extensions',
			'user-data-dir': '..\\data',
			'trace-startup-file': 'trace.json',
			'locale': 'de'
		});

		assert.strictEqual(result, '--user-data-dir=C:\\data --extensions-dir=C:\\cwd\\extensions --locale=de --trace-startup-file=C:\\cwd\\trace.json');
	});

	test('ignores negated flags that appear after the end-of-options marker', () => {
		const result = getArguments({
			'extensions-dir': 'C:\\ext'
		}, ['--no-proxy-server', '--', '--no-sandbox']);

		assert.strictEqual(result, '--extensions-dir=C:\\ext --no-proxy-server');
	});
});
