/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { shellQuotePluginRootInCommand } from '../../../common/plugins/agentPluginServiceImpl.js';

suite('shellQuotePluginRootInCommand', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const TOKEN = '${PLUGIN_ROOT}';

	test('returns command unchanged when token is not present', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('echo hello', '/safe/path', TOKEN),
			'echo hello',
		);
	});

	test('plain replacement when path has no special characters', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/safe/path', TOKEN),
			'/safe/path/run.sh',
		);
	});

	test('plain replacement for multiple occurrences with safe path', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b', '/safe', TOKEN),
			'/safe/a && /safe/b',
		);
	});

	test('quotes path with spaces', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path with spaces', TOKEN),
			'"/path with spaces/run.sh"',
		);
	});

	test('quotes path with ampersand', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path&dir', TOKEN),
			'"/path&dir/run.sh"',
		);
	});

	test('quotes multiple occurrences with unsafe path', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b', '/my dir', TOKEN),
			'"/my dir/a" && "/my dir/b"',
		);
	});

	test('does not double-quote when already in double quotes', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('"${PLUGIN_ROOT}/run.sh"', '/my dir', TOKEN),
			'"/my dir/run.sh"',
		);
	});

	test('does not double-quote when already in single quotes', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand(`'\${PLUGIN_ROOT}/run.sh'`, '/my dir', TOKEN),
			`'/my dir/run.sh'`,
		);
	});

	test('escapes embedded double-quote characters in path', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path"with"quotes', TOKEN),
			'"/path\\"with\\"quotes/run.sh"',
		);
	});

	test('handles token without trailing path suffix', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT} && run', '/my dir', TOKEN),
			'cd "/my dir" && run',
		);
	});

	test('does not consume shell operators adjacent to token', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('cd ${PLUGIN_ROOT}&& echo ok', '/my dir', TOKEN),
			'cd "/my dir"&& echo ok',
		);
	});

	test('handles token at start, middle and end of command', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/a ${PLUGIN_ROOT}/b ${PLUGIN_ROOT}/c', '/sp ace', TOKEN),
			'"/sp ace/a" "/sp ace/b" "/sp ace/c"',
		);
	});

	test('uses default CLAUDE_PLUGIN_ROOT token when not specified', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${CLAUDE_PLUGIN_ROOT}/run.sh', '/safe/path'),
			'/safe/path/run.sh',
		);
	});

	test('uses default CLAUDE_PLUGIN_ROOT token with quoting', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${CLAUDE_PLUGIN_ROOT}/run.sh', '/my dir'),
			'"/my dir/run.sh"',
		);
	});

	test('handles Windows-style paths with spaces', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}\\scripts\\run.bat', 'C:\\Program Files\\plugin', TOKEN),
			'"C:\\Program Files\\plugin\\scripts\\run.bat"',
		);
	});

	test('handles path with parentheses', () => {
		assert.strictEqual(
			shellQuotePluginRootInCommand('${PLUGIN_ROOT}/run.sh', '/path(1)', TOKEN),
			'"/path(1)/run.sh"',
		);
	});
});
