/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	decodeWslOutput,
	parseRunningDistros,
	parseWslListVerbose,
} from '../../node/wslRemoteAgentHostHelpers.js';

suite('WSL Remote Agent Host Helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseWslListVerbose', () => {
		// Build a verbose-list output from a structured row description so
		// the test cases stay readable. The whitespace shape mirrors what
		// `wsl.exe --list --verbose` emits in practice (default marker is
		// `* ` at column 0; the data columns are space-padded).
		function row(opts: { name: string; state: string; version: number; isDefault?: boolean }): string {
			const marker = opts.isDefault ? '* ' : '  ';
			return `${marker}${opts.name.padEnd(24, ' ')}${opts.state.padEnd(16, ' ')}${opts.version}`;
		}

		test('parses a representative listing end-to-end', () => {
			const output = [
				'\uFEFF  NAME                    STATE           VERSION',
				row({ name: 'Ubuntu', state: 'Running', version: 2, isDefault: true }),
				row({ name: 'Debian', state: 'Stopped', version: 2 }),
				row({ name: 'Ubuntu 22.04', state: 'Running', version: 2 }),
				row({ name: 'Legacy', state: 'Stopped', version: 1 }),
				'',
				'',
			].join('\r\n');

			assert.deepStrictEqual(parseWslListVerbose(output), [
				{ name: 'Ubuntu', isDefault: true, isRunning: true, version: 2 },
				{ name: 'Debian', isDefault: false, isRunning: false, version: 2 },
				{ name: 'Ubuntu 22.04', isDefault: false, isRunning: true, version: 2 },
			]);
		});

		test('tolerates LF-only line endings and missing BOM', () => {
			const output = [
				'  NAME                    STATE           VERSION',
				row({ name: 'Ubuntu', state: 'Running', version: 2, isDefault: true }),
			].join('\n');

			assert.deepStrictEqual(parseWslListVerbose(output), [
				{ name: 'Ubuntu', isDefault: true, isRunning: true, version: 2 },
			]);
		});

		test('returns empty for empty input', () => {
			assert.deepStrictEqual(parseWslListVerbose(''), []);
		});
	});

	suite('parseRunningDistros', () => {
		test('parses a representative running list end-to-end', () => {
			assert.deepStrictEqual(
				parseRunningDistros('\uFEFFUbuntu\r\nUbuntu 22.04\r\nDebian\r\n\r\n'),
				['Ubuntu', 'Ubuntu 22.04', 'Debian'],
			);
		});

		test('returns empty for empty input', () => {
			assert.deepStrictEqual(parseRunningDistros(''), []);
		});
	});

	suite('decodeWslOutput', () => {
		test('decodes UTF-8 input', () => {
			assert.strictEqual(decodeWslOutput(Buffer.from('Hello, WSL!\n', 'utf8')), 'Hello, WSL!\n');
		});

		test('strips UTF-8 BOM', () => {
			assert.strictEqual(
				decodeWslOutput(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Ubuntu', 'utf8')])),
				'Ubuntu',
			);
		});

		test('decodes UTF-16LE input with BOM', () => {
			const text = 'There is no distribution with the supplied name.';
			const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
			assert.strictEqual(decodeWslOutput(buffer), text);
		});

		test('detects null-padded UTF-16LE without BOM via heuristic', () => {
			const text = 'WSL is not running';
			assert.strictEqual(decodeWslOutput(Buffer.from(text, 'utf16le')), text);
		});

		test('returns empty string for empty buffer', () => {
			assert.strictEqual(decodeWslOutput(Buffer.alloc(0)), '');
		});
	});
});
