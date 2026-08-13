/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, McpServerStatus, type McpServerCustomization, type McpServerState, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { getPresentableMcpServerCustomizations } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

suite('agent host MCP server customizations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function mcpServer(id: string, name: string, state: McpServerState): McpServerCustomization {
		return {
			type: CustomizationType.McpServer,
			id,
			uri: `file:///${encodeURIComponent(id)}`,
			name,
			enabled: true,
			state,
		};
	}

	function plugin(id: string, children: McpServerCustomization[]): PluginCustomization {
		return {
			type: CustomizationType.Plugin,
			id,
			uri: `file:///${encodeURIComponent(id)}`,
			name: id,
			enabled: true,
			children,
		};
	}

	test('a server declared by a plugin and minted top-level is shown once, as the live copy', () => {
		// The shape an agent host actually publishes: the synced `.mcp.json` declares the
		// server and never leaves `stopped`, while the minted top-level entry is the one the
		// host keeps up to date.
		const declaration = mcpServer('file:///synced/.mcp.json#mcp=notion', 'notion', { kind: McpServerStatus.Stopped });
		const live = mcpServer('mcp-top-level:copilotcli:session:notion', 'notion', { kind: McpServerStatus.Ready });

		const result = getPresentableMcpServerCustomizations([plugin('synced', [declaration]), live]);

		assert.deepStrictEqual(result.map(s => [s.name, s.id, s.state.kind]), [
			['notion', 'mcp-top-level:copilotcli:session:notion', McpServerStatus.Ready],
		]);
	});

	test('a server only a plugin declares is kept, and so is one only the host minted', () => {
		const declared = mcpServer('file:///synced/.mcp.json#mcp=cleanshot', 'cleanshot', { kind: McpServerStatus.Stopped });
		const minted = mcpServer('mcp-top-level:copilotcli:session:notion', 'notion', { kind: McpServerStatus.Ready });

		const result = getPresentableMcpServerCustomizations([plugin('synced', [declared]), minted]);

		// Source order is preserved, exactly as it was before duplicates were collapsed.
		assert.deepStrictEqual(result.map(s => s.name), ['cleanshot', 'notion']);
	});

	test('two plugins declaring the same name stay two servers, because they are two servers', () => {
		const first = mcpServer('file:///a/.mcp.json#mcp=search', 'search', { kind: McpServerStatus.Stopped });
		const second = mcpServer('file:///b/.mcp.json#mcp=search', 'search', { kind: McpServerStatus.Stopped });

		const result = getPresentableMcpServerCustomizations([plugin('a', [first]), plugin('b', [second])]);

		assert.deepStrictEqual(result.map(s => s.id), [
			'file:///a/.mcp.json#mcp=search',
			'file:///b/.mcp.json#mcp=search',
		]);
	});
});
