/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { hasAgentCommand } from '../../node/server.cliAgent.js';

suite('Server CLI agent command guard', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects agent endpoints', () => {
		assert.strictEqual(hasAgentCommand(['agent', 'endpoints', '--user-data-dir', '/home/tester/.vscode-remote']), true);
	});

	test('detects agent after global native CLI options', () => {
		assert.strictEqual(hasAgentCommand(['--cli-data-dir', '/x', 'agent', 'endpoints', '--user-data-dir', '/y']), true);
	});

	test('ignores non-agent commands', () => {
		assert.strictEqual(hasAgentCommand(['--version']), false);
	});

	test('does not treat a global option value as an agent command', () => {
		assert.strictEqual(hasAgentCommand(['--profile', 'agent']), false);
	});

	test('does not treat a deprecated global option value as an agent command', () => {
		assert.strictEqual(hasAgentCommand(['--extensionHomePath', 'agent']), false);
	});

	test('stops at the first recognized subcommand', () => {
		assert.deepStrictEqual([
			hasAgentCommand(['chat', 'agent']),
			hasAgentCommand(['serve-web', 'agent']),
			hasAgentCommand(['tunnel', 'agent']),
		], [false, false, false]);
	});

	test('does not detect agent after the option terminator', () => {
		assert.strictEqual(hasAgentCommand(['--', 'agent', 'endpoints']), false);
	});
});
