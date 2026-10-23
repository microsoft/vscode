/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseBangCommand } from '../../node/agentHostBangCommand.js';

suite('agentHostBangCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses a leading ! command', () => {
		assert.strictEqual(parseBangCommand('!echo hi'), 'echo hi');
		assert.strictEqual(parseBangCommand('!ls -la'), 'ls -la');
		assert.strictEqual(parseBangCommand('!  npm test  '), 'npm test');
	});

	test('is undefined for non-bang messages', () => {
		assert.strictEqual(parseBangCommand('echo hi'), undefined);
		assert.strictEqual(parseBangCommand(' !echo hi'), undefined);
		assert.strictEqual(parseBangCommand('run !echo'), undefined);
	});

	test('is undefined for a lone ! or whitespace-only command', () => {
		assert.strictEqual(parseBangCommand('!'), undefined);
		assert.strictEqual(parseBangCommand('!   '), undefined);
	});
});
