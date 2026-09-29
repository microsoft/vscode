/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { codexDelegationDisplayText, parseCodexDelegation } from '../../../node/codex/codexDelegation.js';

suite('codexDelegation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses a delegated prompt and decodes escaped text', () => {
		const text = [
			'<codex_delegation>',
			'  <source_thread_id>source-thread</source_thread_id>',
			'  <input>Fix &lt;the test&gt; &amp; report back</input>',
			'</codex_delegation>',
		].join('\n');

		assert.deepStrictEqual({
			delegation: parseCodexDelegation(text),
			displayText: codexDelegationDisplayText(text),
		}, {
			delegation: {
				sourceThreadId: 'source-thread',
				input: 'Fix <the test> & report back',
			},
			displayText: 'Fix <the test> & report back',
		});
	});

	test('does not reinterpret ordinary or malformed user text', () => {
		assert.deepStrictEqual({
			ordinary: parseCodexDelegation('Explain <codex_delegation> tags'),
			malformed: parseCodexDelegation('<codex_delegation><input>Missing source</input></codex_delegation>'),
			ordinaryTitle: codexDelegationDisplayText('Explain delegation tags'),
			malformedTitle: codexDelegationDisplayText('  <CODEX_DELEGATION><input>Missing source'),
		}, {
			ordinary: undefined,
			malformed: undefined,
			ordinaryTitle: 'Explain delegation tags',
			malformedTitle: undefined,
		});
	});
});
