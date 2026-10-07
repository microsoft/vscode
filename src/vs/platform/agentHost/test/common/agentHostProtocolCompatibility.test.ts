/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostSupportedProtocolVersions, negotiateAgentHostProtocolVersion } from '../../common/agentHostProtocolCompatibility.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { negotiateProtocolVersion } from '../../common/state/protocol/version/negotiation.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';

suite('Agent Host protocol compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('0.9.0, 0.10.0 and 1.0.0 are mutually compatible', () => {
		const versions = ['0.9.0', '0.10.0', '1.0.0'];
		const actual = versions.flatMap(current => versions.map(offered => negotiateAgentHostProtocolVersion([offered], current)));
		assert.deepStrictEqual(actual, [...versions, ...versions, ...versions]);
	});

	test('selects the highest compatible offered version regardless of client order', () => {
		const offered = [
			['0.9.0', '0.10.0', '1.0.0'],
			['1.0.0', '0.9.0', '0.10.0'],
			['0.9.0', '0.10.0'],
			['2.0.0', '0.9.0'],
			[],
		];
		assert.deepStrictEqual(offered.map(versions => negotiateAgentHostProtocolVersion(versions)), ['1.0.0', '1.0.0', '0.10.0', '0.9.0', undefined]);
	});

	test('does not broaden the compatibility exception to adjacent or malformed versions', () => {
		const versions = ['0.8.0', '0.9.1', '0.10.1', '0.11.0', '1.0.1', '1.1.0', '2.0.0', '0.9', '1.0.0-beta', 'not-a-version'];
		assert.deepStrictEqual(versions.map(version => negotiateAgentHostProtocolVersion([version], '0.10.0')), versions.map(() => undefined));
	});

	test('unrelated host versions retain standard negotiation rules', () => {
		const cases = [
			{ current: '0.9.5', offered: ['0.9.0', '0.9.3'] },
			{ current: '0.11.0', offered: ['0.9.0', '0.10.0', '1.0.0'] },
			{ current: '1.2.0', offered: ['1.0.0', '1.1.0'] },
			{ current: '2.0.0', offered: ['0.9.0', '0.10.0', '1.0.0'] },
		];
		assert.deepStrictEqual(cases.map(({ current, offered }) => negotiateAgentHostProtocolVersion(offered, current)), cases.map(({ current, offered }) => negotiateProtocolVersion(offered, current)));
	});

	test('unsupported-version errors report the exact compatible aliases', () => {
		assert.deepStrictEqual(['0.9.0', '0.10.0', '1.0.0', '0.11.0'].map(version => getAgentHostSupportedProtocolVersions(version)), [
			['1.0.0', '0.10.0', '0.9.0'],
			['1.0.0', '0.10.0', '0.9.0'],
			['1.0.0', '0.10.0', '0.9.0'],
			['0.11.0'],
		]);
	});

	test('reports bounded ranges matching negotiation for other host versions', () => {
		assert.deepStrictEqual(['0.9.5', '0.11.2', '1.2.3', '2.0.0'].map(version => getAgentHostSupportedProtocolVersions(version)), [
			['>=0.9.0 <=0.9.5'],
			['>=0.11.0 <=0.11.2'],
			['>=1.0.0 <=1.2.3'],
			['2.0.0'],
		]);
	});

	test('discovery metadata retains the built-in version', () => {
		assert.strictEqual(createRemoteAgentHostState({ pid: 1, port: 1234, connectionToken: undefined }).protocolVersion, PROTOCOL_VERSION);
	});
});
