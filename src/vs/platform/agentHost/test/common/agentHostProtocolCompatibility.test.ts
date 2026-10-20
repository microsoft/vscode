/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostSupportedProtocolVersions, negotiateAgentHostProtocolVersion } from '../../common/agentHostProtocolCompatibility.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';

suite('Agent Host protocol compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('retains all three compatibility baselines independently of the development version', () => {
		const offered = getAgentHostSupportedProtocolVersions();
		assert.deepStrictEqual({
			offered,
			negotiated: offered.map(version => negotiateAgentHostProtocolVersion([version])),
			developmentVersion: negotiateAgentHostProtocolVersion([PROTOCOL_VERSION]),
		}, {
			offered: ['1.0.0', '0.10.0', '0.9.0'],
			negotiated: ['1.0.0', '0.10.0', '0.9.0'],
			developmentVersion: PROTOCOL_VERSION,
		});
	});

	test('selects the highest compatible offered version regardless of client order', () => {
		const offered = [
			['0.9.0', '1.0.0', '1.5.0'],
			['1.5.0', '0.9.0', '1.0.0'],
			['0.9.0', '0.9.1'],
			['2.0.0', '0.9.0'],
			[],
		];
		assert.deepStrictEqual(offered.map(versions => negotiateAgentHostProtocolVersion(versions)), ['1.5.0', '1.5.0', '0.9.1', '0.9.0', undefined]);
	});

	test('retains exact 0.10.0 compatibility alongside upstream caret ranges', () => {
		const offered = [
			['0.10.0'],
			['0.9.0', '0.10.0'],
			['0.10.0', '0.9.5'],
			['0.10.0', '1.0.0'],
			['1.0.0', '0.10.0'],
			['0.10.0', '1.5.0'],
			['2.0.0', '0.10.0'],
		];
		assert.deepStrictEqual(offered.map(versions => negotiateAgentHostProtocolVersion(versions)), [
			'0.10.0', '0.10.0', '0.10.0', '1.0.0', '1.0.0', '1.5.0', '0.10.0',
		]);
	});

	test('rejects versions outside the supported caret ranges', () => {
		const versions = ['0.8.0', '0.10.1', '0.11.0', '2.0.0'];
		assert.deepStrictEqual(versions.map(version => negotiateAgentHostProtocolVersion([version])), versions.map(() => undefined));
	});

	test('rejects malformed versions even alongside compatible offers', () => {
		for (const version of ['0.9', '01.0.0', '1.0.0-beta', '1.0.0\n', 'not-a-version']) {
			assert.throws(() => negotiateAgentHostProtocolVersion(['1.0.0', '0.10.0', version]), /Invalid protocol version/);
		}
	});

	test('client offers and unsupported-version errors include the legacy alias', () => {
		assert.deepStrictEqual(getAgentHostSupportedProtocolVersions(), ['1.0.0', '0.10.0', '0.9.0']);
	});

	test('discovery metadata retains the built-in version', () => {
		assert.strictEqual(createRemoteAgentHostState({ pid: 1, port: 1234, connectionToken: undefined }).protocolVersion, PROTOCOL_VERSION);
	});
});
