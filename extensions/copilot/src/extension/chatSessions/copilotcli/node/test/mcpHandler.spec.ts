/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import { describe, expect, it } from 'vitest';
import type { LanguageModelToolInformation } from '../../../../../vscodeTypes';
import { buildMcpServerMappings, type MCPServerConfig, type McpServerMappings, remapCustomAgentTools } from '../mcpHandler';

function makeAgent(partial: { slug: string; tools?: string[] }): SweCustomAgent {
	return partial as unknown as SweCustomAgent;
}

function makeTool(fullReferenceName: string | undefined, sourceLabel?: string): LanguageModelToolInformation {
	return {
		name: fullReferenceName ?? 'no-ref',
		fullReferenceName,
		source: sourceLabel ? { label: sourceLabel, name: sourceLabel } : undefined,
	} as unknown as LanguageModelToolInformation;
}

function makeToolsMap(...entries: [LanguageModelToolInformation, boolean][]): ReadonlyMap<LanguageModelToolInformation, boolean> {
	return new Map(entries);
}

describe('buildMcpServerMappings', () => {
	it('should extract simple server name from fullReferenceName', () => {
		const tools = makeToolsMap(
			[makeTool('myServer/myTool', 'My Server'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.get('myServer')).toBe('My Server');
	});

	it('should use the last slash to split server name from tool name', () => {
		const tools = makeToolsMap(
			[makeTool('scope/myServer/myTool', 'Scoped Server'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.get('scope/myServer')).toBe('Scoped Server');
		expect(mappings.has('scope')).toBe(false);
	});

	it('should handle server names with multiple slashes', () => {
		const tools = makeToolsMap(
			[makeTool('a/b/c/toolName', 'Deep Server'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.get('a/b/c')).toBe('Deep Server');
	});

	it('should skip tools without source', () => {
		const tools = makeToolsMap(
			[makeTool('server/tool'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.size).toBe(0);
	});

	it('should skip tools without fullReferenceName', () => {
		const tools = makeToolsMap(
			[makeTool(undefined, 'Some Server'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.size).toBe(0);
	});

	it('should skip tools with no slash in fullReferenceName', () => {
		const tools = makeToolsMap(
			[makeTool('toolOnly', 'Server'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.size).toBe(0);
	});

	it('should not overwrite existing mappings for the same server name', () => {
		const tools = makeToolsMap(
			[makeTool('server/tool1', 'First Label'), true],
			[makeTool('server/tool2', 'Second Label'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.get('server')).toBe('First Label');
	});

	it('should handle multiple different servers', () => {
		const tools = makeToolsMap(
			[makeTool('serverA/tool1', 'Server A'), true],
			[makeTool('serverB/tool2', 'Server B'), true],
		);
		const mappings = buildMcpServerMappings(tools);
		expect(mappings.get('serverA')).toBe('Server A');
		expect(mappings.get('serverB')).toBe('Server B');
	});
});

describe('remapCustomAgentTools', () => {
	function makeMcpServers(entries: Record<string, { displayName?: string }>): Record<string, MCPServerConfig> {
		const result: Record<string, MCPServerConfig> = {};
		for (const [key, val] of Object.entries(entries)) {
			result[key] = { type: 'http' as const, url: 'http://localhost', tools: ['*'], ...val };
		}
		return result;
	}

	it('should remap simple server/tool references', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['friendlyName/toolA'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['friendlyName', 'Display Name']]);
		const mcpServers = makeMcpServers({ 'gateway_name': { displayName: 'Display Name' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['gateway_name/toolA']);
	});

	it('should remap tools with slashes in server name using last slash', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['org/server/toolA'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['org/server', 'Org Server Display']]);
		const mcpServers = makeMcpServers({ 'org_server_gw': { displayName: 'Org Server Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['org_server_gw/toolA']);
	});

	it('should remap tools with multiple slashes in server name', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['a/b/c/myTool'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['a/b/c', 'ABC Server']]);
		const mcpServers = makeMcpServers({ 'abc_gateway': { displayName: 'ABC Server' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['abc_gateway/myTool']);
	});

	it('should also remap selectedAgent tools', () => {
		const agents: SweCustomAgent[] = [];
		const selectedAgent = makeAgent({ slug: 'selected', tools: ['server/tool1'] });
		const mcpMappings: McpServerMappings = new Map([['server', 'Server Display']]);
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Server Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, selectedAgent);

		expect(selectedAgent.tools).toEqual(['gw/tool1']);
	});

	it('should not remap tools without a slash', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['plainTool'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['server', 'Display']]);
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['plainTool']);
	});

	it('should not remap when server name has no mapping', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['unknown/toolA'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['other', 'Other Display']]);
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Other Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['unknown/toolA']);
	});

	it('should skip agents without tools', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1' }),
		];
		const mcpMappings: McpServerMappings = new Map([['server', 'Display']]);
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toBeUndefined();
	});

	it('should do nothing when mcpServerMappings is empty', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['server/toolA'] }),
		];
		const mcpMappings: McpServerMappings = new Map();
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Display' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['server/toolA']);
	});

	it('should do nothing when mcpServers is undefined', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['server/toolA'] }),
		];
		const mcpMappings: McpServerMappings = new Map([['server', 'Display']]);

		remapCustomAgentTools(agents, mcpMappings, undefined, undefined);

		expect(agents[0].tools).toEqual(['server/toolA']);
	});

	it('should fall back to direct display name lookup when no friendly mapping exists', () => {
		const agents: SweCustomAgent[] = [
			makeAgent({ slug: 'agent1', tools: ['Display Name/toolA'] }),
		];
		// No friendly → display mapping for "Display Name", but it matches a gateway displayName directly.
		const mcpMappings: McpServerMappings = new Map([['other', 'Other']]);
		const mcpServers = makeMcpServers({ 'gw': { displayName: 'Display Name' } });

		remapCustomAgentTools(agents, mcpMappings, mcpServers, undefined);

		expect(agents[0].tools).toEqual(['gw/toolA']);
	});
});
