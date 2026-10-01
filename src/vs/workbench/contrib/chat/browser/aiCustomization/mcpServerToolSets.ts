/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { type IMcpServerToolMeta } from '../../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { IMcpServer, McpToolVisibility } from '../../../mcp/common/mcpTypes.js';
import { mcpServerToSourceData } from '../../../mcp/common/mcpTypesUtils.js';
import { isContributionEnabled } from '../../common/enablement.js';
import { IToolData, IToolSet } from '../../common/tools/languageModelToolsService.js';
import { ActiveSessionMcpServerMatcher, AgentHostMcpServer, getRuntimeServerMatchKeys } from './mcpServerCount.js';

/** An MCP server paired with the tools it contributes, as listed in Chat Customizations → Tools. */
export interface IMcpServerToolSet {
	readonly server: IMcpServer;
	readonly toolSet: IToolSet;
	readonly toolCount: number;
}

/**
 * Remembers the tools the active agent-host session last reported for each MCP server. The host
 * republishes a synced plugin container as Loading, with no children, whenever customizations
 * re-sync (for example after an MCP server is toggled), so a server can briefly disappear from
 * the session. Reusing its last reported tools keeps it listed and counted instead of flickering.
 */
export class McpSessionToolsMemory {
	private _sessionKey: string | undefined;
	private readonly _toolsByServerId = new Map<string, readonly IMcpServerToolMeta[]>();

	resolve(sessionKey: string, serverId: string, reported: readonly IMcpServerToolMeta[] | undefined): readonly IMcpServerToolMeta[] | undefined {
		if (sessionKey !== this._sessionKey) {
			this._sessionKey = sessionKey;
			this._toolsByServerId.clear();
		}
		if (reported !== undefined) {
			this._toolsByServerId.set(serverId, reported);
			return reported;
		}
		return this._toolsByServerId.get(serverId);
	}
}

/**
 * Builds a tool set for every MCP server that contributes at least one model-visible tool.
 * Prefers the tools the active agent-host session reports for a server (it runs the server
 * for agent sessions), falling back to VS Code's own cache. Disabled servers stay listed so
 * they can be re-enabled.
 */
export function getMcpServerToolSets(localServers: readonly IMcpServer[], sessionServers: readonly AgentHostMcpServer[], reader: IReader, memory?: { readonly instance: McpSessionToolsMemory; readonly sessionKey: string }): IMcpServerToolSet[] {
	const matcher = new ActiveSessionMcpServerMatcher(sessionServers);
	const result: IMcpServerToolSet[] = [];
	for (const server of localServers) {
		const reported = matcher.take(getRuntimeServerMatchKeys(server))?.tools;
		const sessionTools = memory ? memory.instance.resolve(memory.sessionKey, server.definition.id, reported) : reported;
		const toolSet = createMcpServerToolSet(server, reader, sessionTools);
		if (toolSet) {
			result.push({ server, toolSet: toolSet.toolSet, toolCount: toolSet.toolCount });
		}
	}
	return result;
}

/** Counts the tools contributed by enabled MCP servers. */
export function countEnabledMcpServerTools(toolSets: readonly IMcpServerToolSet[], reader: IReader): number {
	let count = 0;
	for (const { server, toolCount } of toolSets) {
		if (isContributionEnabled(server.enablement.read(reader))) {
			count += toolCount;
		}
	}
	return count;
}

function createMcpServerToolSet(server: IMcpServer, reader: IReader, sessionTools: readonly IMcpServerToolMeta[] | undefined): { readonly toolSet: IToolSet; readonly toolCount: number } | undefined {
	const toolInfos = sessionTools
		? sessionTools.map(tool => ({ id: `${server.definition.id}/${tool.name}`, displayName: tool.name, description: tool.description ?? '' }))
		: server.tools.read(reader)
			.filter(tool => tool.visibility & McpToolVisibility.Model)
			.map(tool => ({
				id: tool.id,
				displayName: tool.definition.annotations?.title || tool.definition.title || tool.definition.name,
				description: tool.definition.description ?? '',
			}));
	if (toolInfos.length === 0) {
		return undefined;
	}
	const source = mcpServerToSourceData(server, reader);
	const tools: IToolData[] = toolInfos.map(tool => ({
		id: tool.id,
		source,
		displayName: tool.displayName,
		modelDescription: tool.description,
		userDescription: tool.description,
		canBeReferencedInPrompt: false,
	}));
	const toolSet: IToolSet = {
		id: server.definition.id,
		referenceName: server.definition.label,
		icon: Codicon.mcp,
		source,
		description: server.definition.label,
		detail: localize('toolsSetMcpDetail', "MCP server. Turning it off disables all of its tools."),
		getTools: () => tools,
	};
	return { toolSet, toolCount: tools.length };
}
