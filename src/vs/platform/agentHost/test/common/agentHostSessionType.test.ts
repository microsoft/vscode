/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, parseRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeAuthorityPrefix, remoteAgentHostSessionTypeId } from '../../common/agentHostSessionType.js';

suite('agentHostSessionType', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('remoteAgentHostSessionTypeId pins the wire format', () => {
		assert.deepStrictEqual([
			remoteAgentHostSessionTypeId('foo', 'copilot'),
			remoteAgentHostSessionTypeId('10.0.0.1__8080', 'copilot'),
			remoteAgentHostSessionTypeId('foo', 'openai'),
		], [
			'remote-foo-copilot',
			'remote-10.0.0.1__8080-copilot',
			'remote-foo-openai',
		]);
	});

	test('finds the longest matching authority', () => {
		assert.deepStrictEqual([
			remoteAgentHostSessionTypeAuthorityPrefix('foo-bar'),
			isRemoteAgentHostSessionType('remote-foo-bar-copilot'),
			findRemoteAgentHostSessionTypeAuthority('remote-foo-bar-copilot', ['foo', 'foo-bar']),
			findRemoteAgentHostSessionTypeAuthority('remote-foo-bar-copilot', ['baz']),
			findRemoteAgentHostSessionTypeAuthority('agent-host-copilot', ['foo-bar']),
		], [
			'remote-foo-bar-',
			true,
			'foo-bar',
			undefined,
			undefined,
		]);
	});

	test('parses authority when provider is known', () => {
		assert.deepStrictEqual([
			parseRemoteAgentHostSessionTypeAuthority('remote-foo-bar-copilotcli', 'copilotcli'),
			parseRemoteAgentHostSessionTypeAuthority('remote-foo-bar-copilotcli', 'copilot'),
			parseRemoteAgentHostSessionTypeAuthority('agent-host-copilotcli', 'copilotcli'),
			parseRemoteAgentHostSessionTypeAuthority('remote--copilotcli', 'copilotcli'),
		], [
			'foo-bar',
			undefined,
			undefined,
			undefined,
		]);
	});
});
