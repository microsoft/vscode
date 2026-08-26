/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	compareProtocolVersions,
	createAgentHostCapabilityAdapter,
	LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS,
} from './agentHostLiveCompatCapabilities.js';
import type { AgentProviderCapabilities } from './agentHostLiveCompatProtocol.js';

function adapterFor(protocolVersion: string, providers: Readonly<Record<string, AgentProviderCapabilities>> = {}) {
	return createAgentHostCapabilityAdapter({
		protocolVersion,
		providerCapabilities: new Map(Object.entries(providers)),
	});
}

suite('Agent Host live-compat capability adapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('capabilities come from what the build advertises, not from its checkpoint', () => {
		const legacy = adapterFor('0.8.0', { mock: {}, copilotcli: { multipleChats: { fork: true } } });
		const current = adapterFor('1.0.0', { mock: {}, copilotcli: { multipleChats: { fork: true } } });
		assert.deepStrictEqual(
			[legacy, current].map(adapter => ({
				protocolVersion: adapter.protocolVersion,
				rename: adapter.supportsSessionRename,
				peerOnMock: adapter.supportsPeerChats('mock'),
				peerOnCopilot: adapter.supportsPeerChats('copilotcli'),
				peerOnUnknown: adapter.supportsPeerChats('not-registered'),
			})),
			[
				{ protocolVersion: '0.8.0', rename: true, peerOnMock: false, peerOnCopilot: true, peerOnUnknown: false },
				{ protocolVersion: '1.0.0', rename: true, peerOnMock: false, peerOnCopilot: true, peerOnUnknown: false },
			],
		);
	});

	test('a build older than the whole matrix degrades rename instead of asserting on it', () => {
		assert.strictEqual(adapterFor('0.4.0').supportsSessionRename, false);
		assert.strictEqual(adapterFor('0.5.1').supportsSessionRename, true);
	});

	test('the offered version list is ordered newest-first and covers every checkpoint in the matrix', () => {
		const ordered = [...LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS]
			.every((version, index, all) => index === 0 || compareProtocolVersions(all[index - 1], version) > 0);
		assert.deepStrictEqual(
			{
				ordered,
				// The versions the four prepared builds actually negotiate today.
				offersLegacy: LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS.includes('0.8.0'),
				offersCurrent: LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS.includes('1.0.0'),
			},
			{ ordered: true, offersLegacy: true, offersCurrent: true },
		);
	});

	test('protocol versions compare by precedence, and malformed input is rejected', () => {
		assert.deepStrictEqual(
			[
				Math.sign(compareProtocolVersions('1.0.0', '0.8.0')),
				Math.sign(compareProtocolVersions('0.8.0', '1.0.0')),
				Math.sign(compareProtocolVersions('0.8.0', '0.8.0')),
				Math.sign(compareProtocolVersions('0.10.0', '0.9.0')),
				Math.sign(compareProtocolVersions('0.8.2', '0.8.10')),
			],
			[1, -1, 0, 1, -1],
		);
		assert.throws(() => compareProtocolVersions('1.0', '1.0.0'), /not a protocol version/);
	});
});
