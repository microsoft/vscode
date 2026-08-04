/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { claudeTransportForProvider, CLAUDE_PROVIDER_ANTHROPIC, CLAUDE_PROVIDER_COPILOT, parseClaudeModelSelection, toClaudeModelSelectionId } from '../../node/claude/claudeModelSelection.js';

suite('claudeModelSelection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips provider and model identifiers, url-encoding separators', () => {
		const id = toClaudeModelSelectionId('custom/provider', 'org/model:latest');
		assert.strictEqual(id, '@provider=custom%2Fprovider:org%2Fmodel%3Alatest');
		assert.deepStrictEqual(parseClaudeModelSelection({ id }), {
			provider: 'custom/provider',
			modelId: 'org/model:latest',
		});
	});

	test('a bare (un-prefixed) id decodes to the default Copilot provider, id passed through', () => {
		assert.deepStrictEqual(parseClaudeModelSelection({ id: 'claude-opus-4-8' }), {
			provider: CLAUDE_PROVIDER_COPILOT,
			modelId: 'claude-opus-4-8',
		});
	});

	test('a malformed prefix (no separator) falls back to the default Copilot provider', () => {
		assert.deepStrictEqual(parseClaudeModelSelection({ id: '@provider=anthropic' }), {
			provider: CLAUDE_PROVIDER_COPILOT,
			modelId: '@provider=anthropic',
		});
	});

	test('the same model under two providers does not collide', () => {
		assert.notStrictEqual(
			toClaudeModelSelectionId(CLAUDE_PROVIDER_COPILOT, 'claude-opus-4-8'),
			toClaudeModelSelectionId(CLAUDE_PROVIDER_ANTHROPIC, 'claude-opus-4-8'),
		);
	});

	test('provider maps to transport: anthropic is native, everything else (incl. copilot/unknown) is proxy', () => {
		assert.deepStrictEqual(
			[
				claudeTransportForProvider(CLAUDE_PROVIDER_ANTHROPIC),
				claudeTransportForProvider(CLAUDE_PROVIDER_COPILOT),
				claudeTransportForProvider('something-else'),
			],
			['native', 'proxy', 'proxy'],
		);
	});
});
