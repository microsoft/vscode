/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCanonicalPortString } from '../../../../base/common/ports.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getFreePortProcessCommand, getPosixListeningProcess, getWindowsListeningProcess } from '../../node/ptyService.js';

suite('PtyService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates canonical port strings', () => {
		const valid = ['1', '9', '10', '80', '3000', '65535'];
		const invalid: unknown[] = [undefined, null, 0, 3000, '', '0', '01', '+80', '-80', '80 ', ' 80', '80.0', '1e3', '0x50', '65536', '3000;id', '3000&&id', '3000|id', '3000$(id)'];
		assert.deepStrictEqual({
			valid: valid.map(isCanonicalPortString),
			invalid: invalid.map(isCanonicalPortString),
		}, {
			valid: valid.map(() => true),
			invalid: invalid.map(() => false),
		});
	});

	test('builds shell-free process commands', () => {
		assert.deepStrictEqual(getFreePortProcessCommand('3000', false), {
			executable: 'lsof',
			args: ['-nP', '-iTCP:3000', '-sTCP:LISTEN', '-t'],
		});
		assert.deepStrictEqual(getFreePortProcessCommand('3000', true), {
			executable: 'netstat',
			args: ['-ano', '-p', 'tcp'],
		});
		assert.throws(() => getFreePortProcessCommand('3000;id', false));
	});

	test('parses listening process output', () => {
		assert.strictEqual(getPosixListeningProcess('123\n456\n'), '123');
		assert.strictEqual(getPosixListeningProcess('0\nabc\n'), undefined);
		const stdout = [
			'TCP 0.0.0.0:13000 0.0.0.0:0 LISTENING 111',
			'TCP [::]:3000 [::]:0 LISTENING 222',
			'TCP 127.0.0.1:4000 127.0.0.1:3000 ESTABLISHED 333',
		].join('\n');
		assert.strictEqual(getWindowsListeningProcess(stdout, '3000'), '222');
		assert.strictEqual(getWindowsListeningProcess(stdout, '13000'), '111');
		assert.strictEqual(getWindowsListeningProcess(stdout, '4000'), undefined);
	});
});
