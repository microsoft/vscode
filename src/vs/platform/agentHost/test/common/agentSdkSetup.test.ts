/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentSdkSetupStatusKey, isAgentSdkSetupRequestFor, readAgentSdkSetupInfos } from '../../common/agentSdkSetup.js';

suite('Agent SDK setup channel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads one entry per agent, from the transient meta bag', () => {
		assert.deepStrictEqual(readAgentSdkSetupInfos({
			agents: [],
			_meta: {
				[agentSdkSetupStatusKey('claude')]: { download: 'ready', setupDocsUrl: 'https://example.test/claude' },
				[agentSdkSetupStatusKey('codex')]: { download: 'notDownloaded', signInProviderName: 'ChatGPT' },
			},
		}), [
			{ agent: 'claude', download: 'ready', setupDocsUrl: 'https://example.test/claude', signInProviderName: undefined },
			{ agent: 'codex', download: 'notDownloaded', setupDocsUrl: undefined, signInProviderName: 'ChatGPT' },
		]);
	});

	test('a persisted config value wins over the transient meta bag for the same agent', () => {
		assert.deepStrictEqual(readAgentSdkSetupInfos({
			agents: [],
			config: { schema: { type: 'object', properties: {} }, values: { [agentSdkSetupStatusKey('claude')]: { download: 'ready' } } },
			_meta: { [agentSdkSetupStatusKey('claude')]: { download: 'notDownloaded' } },
		}), [
			{ agent: 'claude', download: 'ready', setupDocsUrl: undefined, signInProviderName: undefined },
		]);
	});

	test('an agent that never published is absent rather than guessed at', () => {
		assert.deepStrictEqual(readAgentSdkSetupInfos({ agents: [] }), []);
		assert.deepStrictEqual(readAgentSdkSetupInfos(undefined), []);
	});

	test('drops entries whose download status is not one we understand', () => {
		assert.deepStrictEqual(readAgentSdkSetupInfos({
			agents: [],
			_meta: {
				[agentSdkSetupStatusKey('claude')]: { download: 'somethingElse' },
				[agentSdkSetupStatusKey('codex')]: 'not an object',
				[agentSdkSetupStatusKey('')]: { download: 'ready' },
				'vscode.codexAccount': { status: 'signedIn' },
			},
		}), []);
	});

	test('drops optional fields that are wrong-typed, or right-typed but useless', () => {
		assert.deepStrictEqual(readAgentSdkSetupInfos({
			agents: [],
			_meta: {
				// An empty provider name would render a "Sign in to " button, so it is
				// dropped like a wrong type rather than passed through.
				[agentSdkSetupStatusKey('claude')]: { download: 'ready', setupDocsUrl: 42, signInProviderName: '' },
			},
		}), [
			{ agent: 'claude', download: 'ready', setupDocsUrl: undefined, signInProviderName: undefined },
		]);
	});

	test('a request is only for the agent it names, and only when it carries a nonce', () => {
		assert.strictEqual(isAgentSdkSetupRequestFor({ agent: 'claude', request: 'abc' }, 'claude'), true);
		assert.strictEqual(isAgentSdkSetupRequestFor({ agent: 'claude', request: 'abc' }, 'codex'), false);
		assert.strictEqual(isAgentSdkSetupRequestFor({ agent: 'claude', request: '' }, 'claude'), false);
		assert.strictEqual(isAgentSdkSetupRequestFor({ agent: 'claude' }, 'claude'), false);
		assert.strictEqual(isAgentSdkSetupRequestFor(undefined, 'claude'), false);
		// The key is cleared by writing `undefined`, which is what a consumed
		// request looks like on the next change event.
		assert.strictEqual(isAgentSdkSetupRequestFor('claude', 'claude'), false);
	});

});
