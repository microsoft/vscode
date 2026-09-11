/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';

suite('TerminalTaskSystem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should include the nonce in serialized CWD reports', () => {
		const sequence = TerminalTaskSystem.prototype.taskShellIntegrationStartSequence('/workspace/semi;colon\\folder', 'test-nonce');

		strictEqual(sequence, '\x1b]633;P;HasRichCommandDetection=True\x07\x1b]633;A\x07\x1b]633;P;Task=True\x07\x1b]633;P;Cwd=/workspace/semi\\x3bcolon\\\\folder;test-nonce\x07\x1b]633;B\x07');
	});
});
