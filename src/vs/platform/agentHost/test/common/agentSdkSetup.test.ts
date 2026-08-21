/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentSdkSetupStatusKey, isAgentSdkSetupRequestFor, readAgentSdkSetupInfos, readConsentedSdkAgents, resolveConsentedSdkDownloads, writeConsentedSdkAgents, type IAgentSdkSetupInfo } from '../../common/agentSdkSetup.js';

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

	suite('standing consent', () => {
		const claude: IAgentSdkSetupInfo = { agent: 'claude', download: 'notDownloaded' };
		const codex: IAgentSdkSetupInfo = { agent: 'codex', download: 'notDownloaded' };
		const none: ReadonlySet<string> = new Set();
		const both: ReadonlySet<string> = new Set(['claude', 'codex']);

		test('a consented user whose cache a version bump invalidated re-downloads with no gate', () => {
			assert.deepStrictEqual(resolveConsentedSdkDownloads(both, [claude, codex], none), ['claude', 'codex']);
		});

		test('a user who never consented still sees the offer', () => {
			assert.deepStrictEqual(resolveConsentedSdkDownloads(new Set(), [claude, codex], none), []);
		});

		test('consenting to one agent is not consent to fetch another', () => {
			// The button that records this says "download the Codex Agent SDK".
			assert.deepStrictEqual(resolveConsentedSdkDownloads(new Set(['codex']), [claude, codex], none), ['codex']);
		});

		test('an SDK already on disk, or already fetching, is left alone', () => {
			assert.deepStrictEqual(resolveConsentedSdkDownloads(both, [
				{ ...claude, download: 'ready' },
				{ ...codex, download: 'downloading' },
			], none), []);
		});

		test('a download that failed is not retried until the next window', () => {
			// The failure republishes `notDownloaded`, and every status change re-runs
			// this — without the guard that is an unbounded retry loop.
			assert.deepStrictEqual(resolveConsentedSdkDownloads(both, [claude, codex], new Set(['claude'])), ['codex']);
		});

		test('the consent record survives a round trip, and a corrupt one consents to nobody', () => {
			assert.deepStrictEqual({
				roundTrip: [...readConsentedSdkAgents(writeConsentedSdkAgents(both))],
				absent: [...readConsentedSdkAgents(undefined)],
				corrupt: [...readConsentedSdkAgents('{not json')],
				wrongShape: [...readConsentedSdkAgents('{"claude":true}')],
				// A stray non-string entry drops out rather than poisoning the set.
				mixed: [...readConsentedSdkAgents('["claude",7]')],
			}, {
				roundTrip: ['claude', 'codex'],
				absent: [],
				corrupt: [],
				wrongShape: [],
				mixed: ['claude'],
			});
		});
	});
});
