/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { expandShellToolName, normalizeShellToolNameForCapture } from './e2e/harness/capiReplayProxy.js';

/**
 * The Copilot CLI names its shell tools after the shell it runs, so a capture
 * recorded on one platform would otherwise instruct the agent to call a tool
 * that does not exist on the other. Captures store a platform-neutral
 * placeholder and expand it on replay.
 *
 * Both directions are asserted for both platforms here because the replay side
 * of this round-trip is otherwise only exercised on the platform the developer
 * happens to be using.
 */
suite('capiReplayProxy shell tool names', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('captures store platform-neutral placeholders', () => {
		assert.deepStrictEqual([
			'bash', 'powershell',
			'read_bash', 'read_powershell',
			'write_bash', 'write_powershell',
			'stop_bash', 'stop_powershell',
			'list_bash', 'list_powershell',
			'bash_shutdown', 'powershell_shutdown',
		].map(normalizeShellToolNameForCapture), [
			'${shell}', '${shell}',
			'${read_shell}', '${read_shell}',
			'${write_shell}', '${write_shell}',
			'${stop_shell}', '${stop_shell}',
			'${list_shell}', '${list_shell}',
			'${shell_shutdown}', '${shell_shutdown}',
		]);
	});

	test('replay expands placeholders to the running platform', () => {
		const placeholders = ['${shell}', '${read_shell}', '${write_shell}', '${stop_shell}', '${list_shell}', '${shell_shutdown}'];
		assert.deepStrictEqual({
			win32: placeholders.map(name => expandShellToolName(name, 'win32')),
			posix: placeholders.map(name => expandShellToolName(name, 'linux')),
		}, {
			win32: ['powershell', 'read_powershell', 'write_powershell', 'stop_powershell', 'list_powershell', 'powershell_shutdown'],
			posix: ['bash', 'read_bash', 'write_bash', 'stop_bash', 'list_bash', 'bash_shutdown'],
		});
	});

	test('names that do not vary by platform are left alone', () => {
		// Claude's `Bash` and Codex's `shell` are fixed strings their SDKs use
		// everywhere; rewriting them would hide a genuine provider change.
		const untouched = ['Bash', 'shell', 'Read', 'view', 'create', 'str_replace_editor'];
		assert.deepStrictEqual({
			normalized: untouched.map(normalizeShellToolNameForCapture),
			expanded: untouched.map(name => expandShellToolName(name, 'win32')),
		}, {
			normalized: untouched,
			expanded: untouched,
		});
	});
});
