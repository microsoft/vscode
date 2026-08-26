/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { prepareWindowsBatchCommand } from '../../node/debugAdapter.js';

suite('Debug - Debug Adapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('escapes Windows batch commands and arguments', () => {
		assert.deepStrictEqual(
			prepareWindowsBatchCommand(
				'C:\\Program Files\\adapter.cmd',
				['plain', 'with spaces', 'quote" & calc.exe & "', '|<>()^%!', 'C:\\path\\', '%PATH:z=z%']
			),
			[
				'/e:ON',
				'/v:OFF',
				'/d',
				'/c',
				'""C:\\Program Files\\adapter.cmd" plain "with spaces" "quote"" & calc.exe & """ "|<>()^%%cd:~,%!" "C:\\path\\\\" "%%cd:~,%PATH:z=z%%cd:~,%""'
			]
		);
	});

	test('escapes backslash runs around quotes', () => {
		assert.deepStrictEqual(
			prepareWindowsBatchCommand('adapter.cmd', ['two\\\\', 'three\\\\\\', 'two\\\\"quote', 'three\\\\\\"quote']),
			[
				'/e:ON',
				'/v:OFF',
				'/d',
				'/c',
				'""adapter.cmd" "two\\\\\\\\" "three\\\\\\\\\\\\" "two\\\\\\\\""quote" "three\\\\\\\\\\\\""quote""'
			]
		);
	});

	test('rejects invalid Windows batch command characters', () => {
		assert.deepStrictEqual(
			[
				() => prepareWindowsBatchCommand('adapter.cmd', ['safe\r\ncalc.exe']),
				() => prepareWindowsBatchCommand('adapter.cmd', ['safe\0calc.exe']),
				() => prepareWindowsBatchCommand('adapter".cmd', [])
			].map(run => {
				try {
					run();
					return false;
				} catch {
					return true;
				}
			}),
			[true, true, true]
		);
	});
});
