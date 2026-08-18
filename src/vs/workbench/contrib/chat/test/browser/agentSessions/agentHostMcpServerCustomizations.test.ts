/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, McpServerStatus, type Customization, type DirectoryCustomization, type McpServerCustomization, type McpServerState, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { getPresentableMcpServerCustomizations } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';

suite('agent host MCP server customizations', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function mcpServer(id: string, name: string, state: McpServerState = { kind: McpServerStatus.Stopped }): McpServerCustomization {
		return { type: CustomizationType.McpServer, id, uri: `file:///${encodeURIComponent(id)}`, name, state };
	}

	function plugin(id: string, children: McpServerCustomization[]): PluginCustomization {
		return { type: CustomizationType.Plugin, id, uri: `file:///${encodeURIComponent(id)}`, name: id, children };
	}

	function directory(id: string, children: McpServerCustomization[]): DirectoryCustomization {
		return { type: CustomizationType.Directory, id, uri: `file:///${encodeURIComponent(id)}`, name: id, enabled: true, writable: true, contents: CustomizationType.McpServer, children };
	}

	function shown(customizations: readonly Customization[]): [string, string][] {
		return getPresentableMcpServerCustomizations(customizations).map(({ server }) => [server.name, server.id]);
	}

	test('a server a plugin declares and the host also minted is shown once, as the live copy', () => {
		// The shape an agent host actually publishes: the synced `.mcp.json` declares the server
		// and never leaves `stopped`, while the minted top-level entry is the one it keeps current.
		const declaration = mcpServer('file:///synced/.mcp.json#mcp=notion', 'notion');
		const live = mcpServer('mcp-top-level:copilotcli:session:notion', 'notion', { kind: McpServerStatus.Ready });

		assert.deepStrictEqual(shown([plugin('synced', [declaration]), live]), [
			['notion', 'mcp-top-level:copilotcli:session:notion'],
		]);
	});

	test('a server a directory declares and the host also minted is shown once, as the live copy', () => {
		// A directory-declared child carries no owning plugin, so "has no plugin" cannot stand in
		// for "is top-level": doing so would let this child claim the name and survive shadowing.
		const declaration = mcpServer('file:///.mcp.json#mcp=notion', 'notion');
		const live = mcpServer('mcp-top-level:copilotcli:session:notion', 'notion', { kind: McpServerStatus.Ready });

		assert.deepStrictEqual(shown([directory('mcp-config', [declaration]), live]), [
			['notion', 'mcp-top-level:copilotcli:session:notion'],
		]);
	});

	test('a server only a container declares is kept, and so is one only the host minted', () => {
		const declared = mcpServer('file:///synced/.mcp.json#mcp=cleanshot', 'cleanshot');
		const inDirectory = mcpServer('file:///.mcp.json#mcp=playwright', 'playwright');
		const minted = mcpServer('mcp-top-level:copilotcli:session:notion', 'notion', { kind: McpServerStatus.Ready });

		// Source order is preserved, exactly as it was before duplicates were collapsed.
		assert.deepStrictEqual(shown([plugin('synced', [declared]), directory('mcp-config', [inDirectory]), minted]), [
			['cleanshot', 'file:///synced/.mcp.json#mcp=cleanshot'],
			['playwright', 'file:///.mcp.json#mcp=playwright'],
			['notion', 'mcp-top-level:copilotcli:session:notion'],
		]);
	});

	test('two plugins declaring the same name stay two servers, because they are two servers', () => {
		assert.deepStrictEqual(shown([
			plugin('a', [mcpServer('file:///a/.mcp.json#mcp=search', 'search')]),
			plugin('b', [mcpServer('file:///b/.mcp.json#mcp=search', 'search')]),
		]), [
			['search', 'file:///a/.mcp.json#mcp=search'],
			['search', 'file:///b/.mcp.json#mcp=search'],
		]);
	});
});
