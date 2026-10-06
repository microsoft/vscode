/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getMissionControlProtocolVersion } from '../../common/missionControlProtocolVersion.js';
import { createRemoteAgentHostState } from '../../common/remoteAgentHostMetadata.js';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '../../common/state/protocol/version/registry.js';
suite('Mission Control protocol version override', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the built-in version when empty and leaves client offers unchanged', () => {
		assert.deepStrictEqual({
			host: getMissionControlProtocolVersion(''),
			absent: getMissionControlProtocolVersion(undefined),
			override: getMissionControlProtocolVersion('0.9.0'),
			client: SUPPORTED_PROTOCOL_VERSIONS[0],
		}, { host: PROTOCOL_VERSION, absent: PROTOCOL_VERSION, override: '0.9.0', client: PROTOCOL_VERSION });
	});

	for (const version of ['0.9.0', '0.9.5', '1.0.0', '0.0.0']) {
		test(`accepts ${version}`, () => assert.strictEqual(getMissionControlProtocolVersion(version), version));
	}

	for (const version of ['0.9', '^0.9.0', '0.9.0-beta', '0.9.0+test', ' 0.9.0 ', '01.9.0', '0.-1.0', '0.9.9007199254740992']) {
		test(`rejects invalid override ${version}`, () => assert.throws(() => getMissionControlProtocolVersion(version), /Invalid Mission Control protocol version override/));
	}

	test('other remote discovery metadata keeps the built-in version', () => {
		assert.strictEqual(createRemoteAgentHostState({ pid: 1, port: 1234, connectionToken: undefined }).protocolVersion, PROTOCOL_VERSION);
	});
});
