/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { countRunningMcpServersInOtherSessions, getActiveAgentHostMcpSessionResource, type IMcpEditorAgentHostSessionServers } from '../../common/mcpEditorAffordanceState.js';

suite('MCP Editor Affordance State', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks session switching across agent host sessions', () => {
		const first = URI.parse('agent-host-copilotcli:/session-1');
		const second = URI.parse('agent-host-claude:/session-2');

		assert.deepStrictEqual([
			getActiveAgentHostMcpSessionResource(first)?.toString(),
			getActiveAgentHostMcpSessionResource(second)?.toString(),
		], [
			first.toString(),
			second.toString(),
		]);
	});

	test('treats provisional agent host sessions as active MCP sessions', () => {
		const provisional = URI.parse('agent-host-copilotcli:/untitled-123');

		assert.strictEqual(getActiveAgentHostMcpSessionResource(provisional)?.toString(), provisional.toString());
	});

	test('falls back to local state for non-agent-host sessions', () => {
		assert.deepStrictEqual([
			getActiveAgentHostMcpSessionResource(URI.parse('vscode-local-chat://local/session')),
			getActiveAgentHostMcpSessionResource(URI.parse('file:///workspace/mcp.json')),
			getActiveAgentHostMcpSessionResource(undefined),
		], [
			undefined,
			undefined,
			undefined,
		]);
	});

	test('counts running servers in other sessions', () => {
		const current = URI.parse('agent-host-copilotcli:/current');
		const sessions: IMcpEditorAgentHostSessionServers[] = [
			{
				resource: current,
				servers: [
					{ name: 'db', enabled: true, status: McpServerStatus.Ready },
					{ name: 'search', enabled: true, status: McpServerStatus.Ready },
				],
			},
			{
				resource: URI.parse('agent-host-copilotcli:/other-1'),
				servers: [
					{ name: 'db', enabled: true, status: McpServerStatus.Ready },
					{ name: 'db', enabled: true, status: McpServerStatus.Ready },
					{ name: 'search', enabled: false, status: McpServerStatus.Ready },
				],
			},
			{
				resource: URI.parse('agent-host-claude:/other-2'),
				servers: [
					{ name: 'db', enabled: true, status: McpServerStatus.Ready },
					{ name: 'search', enabled: true, status: McpServerStatus.Stopped },
				],
			},
		];

		assert.deepStrictEqual([...countRunningMcpServersInOtherSessions(current, sessions)], [['db', 2]]);
	});
});
