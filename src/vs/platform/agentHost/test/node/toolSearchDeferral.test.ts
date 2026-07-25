/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { agentHostModelSupportsToolSearch, NON_DEFERRED_CLIENT_TOOL_NAMES } from '../../node/copilot/toolSearchDeferral.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../common/toolSearchConstants.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('toolSearchDeferral', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('agentHostModelSupportsToolSearch', () => {
		test('supports Claude Sonnet/Opus 4.5 and up, including future families', () => {
			for (const id of [
				'claude-sonnet-4-5', 'claude-sonnet-4.5', 'claude-sonnet-4-5-20250929',
				'claude-sonnet-4-6', 'claude-sonnet-4.6', 'claude-sonnet-4-6@1.0.0',
				'claude-opus-4-5', 'claude-opus-4.5', 'claude-opus-4-5-20251101',
				'claude-opus-4-6', 'claude-opus-4.6', 'claude-opus-4.7',
				'claude-opus-4-7@1.0.0', 'claude-opus-4-8', 'claude-opus-4.8', 'claude-opus-5',
				'claude-future-version',
			]) {
				assert.strictEqual(agentHostModelSupportsToolSearch(id), true, id);
			}
		});

		test('rejects pre-4.5 models, including date-suffixed ones', () => {
			for (const id of [
				'claude-sonnet-4-20250514', 'claude-sonnet-4',
				'claude-opus-4', 'claude-opus-4-20250514',
				'claude-opus-4-1', 'claude-opus-4.1', 'claude-opus-4-1-20250805',
			]) {
				assert.strictEqual(agentHostModelSupportsToolSearch(id), false, id);
			}
		});

		test('rejects Haiku and legacy Claude families', () => {
			for (const id of ['claude-haiku-4-5', 'claude-haiku-4.5', 'claude-3-5-sonnet-20241022', 'claude-3-opus']) {
				assert.strictEqual(agentHostModelSupportsToolSearch(id), false, id);
			}
		});

		test('rejects OpenAI model families due to an SDK issue', () => {
			for (const id of ['gpt-5.4', 'gpt-5.5', 'gpt-5-4', 'gpt-5-5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
				assert.strictEqual(agentHostModelSupportsToolSearch(id), false, id);
			}
		});

		test('rejects suffixed GPT variants and other non-Claude models', () => {
			for (const id of ['gpt-5', 'gpt-5.3', 'gpt-5.4-mini', 'gpt-5.4-preview', 'gpt-5.5-preview', 'gpt5.5-preview', 'gpt-5-6-luna', 'gpt-6', 'gemini-2.5-pro', '']) {
				assert.strictEqual(agentHostModelSupportsToolSearch(id), false, id);
			}
			assert.strictEqual(agentHostModelSupportsToolSearch(undefined), false);
		});
	});

	suite('constants', () => {
		test('runtime / client tool-search names are distinct and stable', () => {
			assert.strictEqual(RUNTIME_TOOL_SEARCH_TOOL_NAME, 'tool_search_tool');
			assert.strictEqual(CLIENT_TOOL_SEARCH_REFERENCE_NAME, 'toolSearch');
			assert.notStrictEqual(RUNTIME_TOOL_SEARCH_TOOL_NAME, CLIENT_TOOL_SEARCH_REFERENCE_NAME);
		});

		test('non-deferred client allowlist holds the core VS Code tools, not the search tool', () => {
			assert.ok(NON_DEFERRED_CLIENT_TOOL_NAMES.has('runTests'));
			assert.ok(NON_DEFERRED_CLIENT_TOOL_NAMES.has('rename'));
			assert.ok(NON_DEFERRED_CLIENT_TOOL_NAMES.has('usages'));
			assert.strictEqual(NON_DEFERRED_CLIENT_TOOL_NAMES.has(CLIENT_TOOL_SEARCH_REFERENCE_NAME), false);
		});
	});
});
