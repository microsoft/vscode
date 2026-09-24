/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { shouldRetainCodexCommandOutput } from '../../../node/codex/codexTerminalOutput.js';
import { SHELL_COMMAND_MAX_OUTPUT_BYTES } from '../../../node/shared/shellCommandExecution.js';

suite('shouldRetainCodexCommandOutput', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps output up to the shell output limit inline', () => {
		assert.deepStrictEqual([
			shouldRetainCodexCommandOutput('x'.repeat(SHELL_COMMAND_MAX_OUTPUT_BYTES)),
			shouldRetainCodexCommandOutput('x'.repeat(SHELL_COMMAND_MAX_OUTPUT_BYTES + 1)),
		], [false, true]);
	});
});
