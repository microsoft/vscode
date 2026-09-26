/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ToolResultContentType } from '../../../common/state/sessionState.js';
import { codexRetainedCommandOutputContent, shouldRetainCodexCommandOutput } from '../../../node/codex/codexTerminalOutput.js';
import { SHELL_COMMAND_MAX_OUTPUT_BYTES } from '../../../node/shared/shellCommandExecution.js';

suite('shouldRetainCodexCommandOutput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps output up to the shell output limit inline', () => {
		assert.deepStrictEqual([
			shouldRetainCodexCommandOutput('x'.repeat(SHELL_COMMAND_MAX_OUTPUT_BYTES)),
			shouldRetainCodexCommandOutput('x'.repeat(SHELL_COMMAND_MAX_OUTPUT_BYTES + 1)),
		], [false, true]);
	});

	test('keeps a raw prefix as the retained output preview', () => {
		const output = `BEGIN\n${'x'.repeat(1_000)}\nEND\n`;
		const preview = output.slice(0, 400);

		assert.deepStrictEqual(codexRetainedCommandOutputContent('agenthost-terminal://shell/retained', output, 0), [
			{ type: ToolResultContentType.Text, text: preview },
			{
				type: ToolResultContentType.Terminal,
				resource: 'agenthost-terminal://shell/retained',
				title: 'Run shell command',
				isPty: false,
				result: { exitCode: 0, preview, truncated: true },
			},
		]);
	});
});
