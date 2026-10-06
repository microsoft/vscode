/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import { AgentHostProtocolVersionOverrideSettingId, getAgentHostProtocolVersion } from '../../common/agentHostProtocolVersion.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '../../common/state/protocol/version/registry.js';
import '../../common/agentHostStarter.config.contribution.js';

const protocolVersionOverrideSetting = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[AgentHostProtocolVersionOverrideSettingId];

suite('Agent Host protocol version override', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the built-in version when empty and leaves client offers unchanged', () => {
		assert.deepStrictEqual({
			host: getAgentHostProtocolVersion(''),
			override: getAgentHostProtocolVersion('0.9.0'),
			client: SUPPORTED_PROTOCOL_VERSIONS[0],
		}, { host: PROTOCOL_VERSION, override: '0.9.0', client: PROTOCOL_VERSION });
	});

	for (const version of ['0.9.0', '0.9.5', '1.0.0', '0.0.0']) {
		test(`accepts ${version}`, () => assert.strictEqual(getAgentHostProtocolVersion(version), version));
	}

	for (const version of ['0.9', '^0.9.0', '0.9.0-beta', '0.9.0+test', ' 0.9.0 ', '01.9.0', '0.-1.0', '0.9.9007199254740992']) {
		test(`rejects invalid override ${version}`, () => assert.throws(() => getAgentHostProtocolVersion(version), /Invalid Agent Host protocol version override/));
	}

	test('registers a machine-local development string setting', () => {
		const property = protocolVersionOverrideSetting;
		assert.deepStrictEqual({
			type: property.type, default: property.default, scope: property.scope,
			ignoreSync: property.ignoreSync, restricted: property.restricted,
			valid: new RegExp(property.pattern!).test('0.9.0'),
			invalid: new RegExp(property.pattern!).test('0.9'),
		}, { type: 'string', default: '', scope: ConfigurationScope.APPLICATION, ignoreSync: true, restricted: true, valid: true, invalid: false });
	});

	test('remote discovery metadata uses the overridden host version', () => {
		assert.strictEqual(createRemoteAgentHostState({ pid: 1, port: 1234, connectionToken: undefined, protocolVersion: '0.9.0' }).protocolVersion, '0.9.0');
	});
});
