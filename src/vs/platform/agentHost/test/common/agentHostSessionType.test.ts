/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { findRemoteAgentHostSessionTypeAuthority, isCopilotAgentHostProvider, isCopilotAgentHostSessionType, isRemoteAgentHostSessionType, parseAgentHostHarness, parseRemoteAgentHostHarness, parseRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeAuthorityPrefix, remoteAgentHostSessionTypeId } from '../../common/agentHostSessionType.js';

suite('agentHostSessionType', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes both Copilot provider IDs without matching other providers', () => {
		assert.deepStrictEqual(
			['copilotcli', 'copilot', 'claude', 'codex', 'copilotcloud', undefined].map(isCopilotAgentHostProvider),
			[true, true, false, false, false, false],
		);
	});

	test('recognizes local and remote Copilot session types without changing their schemes', () => {
		assert.deepStrictEqual([
			'agent-host-copilotcli',
			'agent-host-copilot',
			'remote-dev-box-copilotcli',
			'remote-cloudsandbox_environment-one-copilot',
			'agent-host-claude',
			'remote-dev-box-codex',
			'copilotcli',
			'copilot',
			'copilotcloud',
			'remote--copilot',
			'remote-dev-box-copilot-other',
		].map(isCopilotAgentHostSessionType), [
			true, true, true, true, false, false, false, false, false, false, false,
		]);
	});

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

	test('parses harness from remote session type', () => {
		assert.deepStrictEqual([
			parseRemoteAgentHostHarness('remote-foo-copilotcli'),
			parseRemoteAgentHostHarness('remote-foo-bar-claude'),
			parseRemoteAgentHostHarness('remote-10.0.0.1__8080-codex'),
			parseRemoteAgentHostHarness('vscodeLocalChatSession'),
			parseRemoteAgentHostHarness('remote-'),
		], [
			'copilotcli',
			'claude',
			'codex',
			undefined,
			undefined,
		]);
	});

	test('parses harness from local and remote agent-host session types', () => {
		assert.deepStrictEqual([
			parseAgentHostHarness('agent-host-copilotcli'),
			parseAgentHostHarness('agent-host-claude'),
			parseAgentHostHarness('remote-foo-bar-codex'),
			parseAgentHostHarness('copilotcli'),
			parseAgentHostHarness('agent-host-'),
		], [
			'copilotcli',
			'claude',
			'codex',
			undefined,
			undefined,
		]);
	});
});
