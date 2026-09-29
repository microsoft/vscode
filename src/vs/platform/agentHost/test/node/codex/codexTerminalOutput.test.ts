/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ToolResultContentType } from '../../../common/state/sessionState.js';
import { codexRetainedCommandOutputContent, shouldRetainCodexCommandOutput } from '../../../node/codex/codexTerminalOutput.js';

suite('shouldRetainCodexCommandOutput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps output up to 80,000 UTF-16 code units inline', () => {
		assert.deepStrictEqual([
			shouldRetainCodexCommandOutput('x'.repeat(80_000)),
			shouldRetainCodexCommandOutput('x'.repeat(80_001)),
			shouldRetainCodexCommandOutput('\u00e9'.repeat(80_000)),
			shouldRetainCodexCommandOutput('\u00e9'.repeat(80_001)),
			shouldRetainCodexCommandOutput('\ud83d\ude00'.repeat(40_000)),
			shouldRetainCodexCommandOutput('\ud83d\ude00'.repeat(40_000) + 'x'),
		], [false, true, false, true, false, true]);
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
