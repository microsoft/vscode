/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { postProcessTerminalDictation } from '../../browser/terminalVoice.js';

suite('postProcessTerminalDictation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('substitutes spoken symbols including single word forms like "dash"', () => {
		assert.strictEqual(postProcessTerminalDictation('ls dash la'), 'ls - la');
	});

	test('prefers multi-word symbol phrases over their single word forms', () => {
		assert.strictEqual(postProcessTerminalDictation('echo dollar sign path'), 'echo $ path');
	});

	test('strips sentence punctuation added by the transcriber', () => {
		assert.strictEqual(postProcessTerminalDictation('git status.'), 'git status');
	});

	test('lower-cases the capitalized first word', () => {
		assert.strictEqual(postProcessTerminalDictation('Echo hello'), 'echo hello');
	});

	test('substitutes every occurrence of a symbol name', () => {
		assert.strictEqual(postProcessTerminalDictation('a ampersand b ampersand c'), 'a & b & c');
	});
});
