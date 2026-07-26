/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { codexAccountStateForUsageSource, codexAccountStateFromResponse, codexProtectedResourcesForUsageSource, resolveCodexUsageSourceAfterAccountRead } from '../../../node/codex/codexAccountState.js';

suite('CodexAccountState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	test('maps signed-out, ChatGPT, API-key, and other accounts', () => {
		assert.deepStrictEqual([
			codexAccountStateFromResponse({ account: null, requiresOpenaiAuth: true }),
			codexAccountStateFromResponse({ account: { type: 'chatgpt', email: 'private@example.com', planType: 'plus' }, requiresOpenaiAuth: true }),
			codexAccountStateFromResponse({ account: { type: 'apiKey' }, requiresOpenaiAuth: true }),
			codexAccountStateFromResponse({ account: { type: 'amazonBedrock', credentialSource: 'awsManaged' }, requiresOpenaiAuth: false }),
		], [
			{ usageSource: 'openai', status: 'signedOut' },
			{ usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus' },
			{ usageSource: 'openai', status: 'signedIn', authType: 'apiKey' },
			{ usageSource: 'openai', status: 'signedIn', authType: 'other' },
		]);
	});

	test('falls back to Copilot only when OpenAI is confirmed signed out', () => {
		assert.deepStrictEqual([
			resolveCodexUsageSourceAfterAccountRead('openai', { usageSource: 'openai', status: 'signedOut' }),
			resolveCodexUsageSourceAfterAccountRead('openai', { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt' }),
			resolveCodexUsageSourceAfterAccountRead('openai', { usageSource: 'openai', status: 'error', error: 'temporarily unavailable' }),
			resolveCodexUsageSourceAfterAccountRead('copilot', { usageSource: 'copilot', status: 'signedOut' }),
		], [
			'copilot',
			'openai',
			'openai',
			'copilot',
		]);
	});

	test('keeps OpenAI authentication separate from the active usage source', () => {
		assert.deepStrictEqual([
			codexAccountStateForUsageSource('copilot', { usageSource: 'openai', status: 'signedOut' }),
			codexAccountStateForUsageSource('copilot', { usageSource: 'openai', status: 'signedIn', authType: 'chatgpt', planType: 'plus' }),
			codexAccountStateForUsageSource('openai', { usageSource: 'openai', status: 'signedIn', authType: 'apiKey' }),
		], [
			{ usageSource: 'copilot', status: 'signedOut' },
			{ usageSource: 'copilot', status: 'signedIn', authType: 'chatgpt', planType: 'plus' },
			{ usageSource: 'openai', status: 'signedIn', authType: 'apiKey' },
		]);
	});

	test('preloads an optional Copilot token while OpenAI is active', () => {
		const copilot = { resource: 'https://api.github.com', required: true };
		const repo = { resource: 'https://api.github.com/repos', required: false };
		assert.deepStrictEqual(codexProtectedResourcesForUsageSource('openai', copilot, repo), [
			{ resource: 'https://api.github.com', required: false },
			repo,
		]);
		assert.deepStrictEqual(codexProtectedResourcesForUsageSource('copilot', copilot, repo), [copilot, repo]);
	});
});
