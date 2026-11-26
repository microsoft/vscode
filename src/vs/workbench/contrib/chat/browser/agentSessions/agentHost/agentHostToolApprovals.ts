/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { mcpServerRule, mcpToolRule } from '../../../../../../platform/agentHost/common/permissionRules.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { isAgentHostSessionResource, isLocalAgentHostTarget } from '../../../common/chatSessionsService.js';
import { InternalFetchWebPageToolId } from '../../../common/tools/builtinTools/tools.js';
import { ILanguageModelToolsConfirmationService, IToolPreApprovalStore } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { TerminalToolId } from '../../../common/tools/terminalToolIds.js';
import { MANAGE_AGENT_HOST_TOOL_APPROVALS_COMMAND_ID } from '../../actions/chatActions.js';
import { getMcpServerDisplayLabel, IAgentHostCustomizationService } from './agentHostCustomizationService.js';

const LIST_TOOLS_TIMEOUT_MS = 5000;

CommandsRegistry.registerCommand(MANAGE_AGENT_HOST_TOOL_APPROVALS_COMMAND_ID, (accessor: ServicesAccessor, sessionResource: URI) => manageAgentHostToolApprovals(
	sessionResource,
	accessor.get(IAgentHostCustomizationService),
	accessor.get(ILanguageModelToolsConfirmationService),
	accessor.get(ILanguageModelToolsService),
	!accessor.get(IWorkbenchEnvironmentService).remoteAuthority,
));

/** Opens host-wide tool approvals for an agent-host session, returning false when its root config is unavailable. */
export function manageAgentHostToolApprovals(
	sessionResource: URI,
	customizationService: IAgentHostCustomizationService,
	confirmationService: ILanguageModelToolsConfirmationService,
	toolsService: ILanguageModelToolsService,
	mirrorsLocalSettings: boolean,
): boolean {
	if (!isAgentHostSessionResource(sessionResource)) {
		return false;
	}
	const initialPermissions = customizationService.getHostPermissions(sessionResource);
	if (!initialPermissions) {
		return false;
	}
	const approvalOverrides = new Map<string, boolean>();
	const rules = [...initialPermissions.allow, ...initialPermissions.deny, ...(initialPermissions.ask ?? [])];
	const servers = customizationService.getMcpServers(sessionResource).filter(server => {
		const rule = mcpServerRule(server.name);
		return rule !== undefined && (server.enabled || rules.some(value => value === rule || value.startsWith(`Mcp(${server.name}/`)));
	});
	const toolsById = new Map<string, IToolData>();
	const toolNames = new Map<string, { server: string; tool: string }>();
	const addMcpTool = (target: Map<string, IToolData>, server: typeof servers[number], name: string, displayName: string) => {
		if (mcpToolRule(server.name, name) === undefined) {
			return;
		}
		const id = `agentHostMcp:${server.name}/${name}`;
		const label = getMcpServerDisplayLabel(server);
		toolNames.set(id, { server: server.name, tool: name });
		target.set(id, {
			id,
			displayName,
			modelDescription: '',
			canRequestPreApproval: true,
			source: { type: 'mcp', label, serverLabel: label, instructions: undefined, collectionId: server.name, definitionId: server.name },
		});
	};
	for (const server of servers) {
		const prefix = `Mcp(${server.name}/`;
		for (const rule of initialPermissions.allow) {
			if (rule.startsWith(prefix) && rule.endsWith(')')) {
				const name = rule.slice(prefix.length, -1);
				addMcpTool(toolsById, server, name, name);
			}
		}
	}
	const tools = [...toolsById.values()];
	const discoveredTools = observableValue<readonly IToolData[]>('agentHostToolApprovals.discoveredTools', []);
	const isDiscovering = observableValue('agentHostToolApprovals.isDiscovering', servers.some(server => !!server.listTools));

	// URL and terminal approval settings are mirrored only into the local agent host.
	if (mirrorsLocalSettings && isLocalAgentHostTarget(sessionResource.scheme)) {
		for (const toolId of [InternalFetchWebPageToolId, TerminalToolId.RunInTerminal]) {
			const tool = toolsService.getTool(toolId);
			if (tool) {
				tools.push(tool);
			} else if (toolId === InternalFetchWebPageToolId) {
				tools.push({
					id: InternalFetchWebPageToolId,
					displayName: localize('agentHost.fetchWebPage', "Fetch Web Page"),
					modelDescription: '',
					source: ToolDataSource.Internal,
				});
			}
		}
	}

	const getHostPermissions = () => {
		const permissions = customizationService.getHostPermissions(sessionResource);
		if (permissions) {
			for (const [rule, approved] of approvalOverrides) {
				if (permissions.allow.includes(rule) === approved) {
					approvalOverrides.delete(rule);
				}
			}
		}
		return permissions;
	};
	const setRuleApproved = (rule: string | undefined, approved: boolean) => {
		if (rule === undefined) {
			return;
		}
		const permissions = getHostPermissions();
		if (!permissions) {
			return;
		}
		approvalOverrides.set(rule, approved);
		const allow = new Set(permissions.allow);
		for (const [overriddenRule, overriddenApproved] of approvalOverrides) {
			if (overriddenApproved) {
				allow.add(overriddenRule);
			} else {
				allow.delete(overriddenRule);
			}
		}
		customizationService.setHostPermissions(sessionResource, { ...permissions, allow: [...allow] });
	};
	const isRuleApproved = (rule: string | undefined) => {
		const permissions = getHostPermissions();
		return rule !== undefined && (approvalOverrides.get(rule) ?? permissions?.allow.includes(rule) ?? false);
	};
	const getToolRule = (tool: IToolData) => {
		const name = toolNames.get(tool.id);
		return name ? mcpToolRule(name.server, name.tool) : undefined;
	};
	const preApprovalStore: IToolPreApprovalStore = {
		discoveredTools,
		isDiscovering,
		servers: servers.map(server => ({ id: server.name, label: getMcpServerDisplayLabel(server) })),
		placeholder: localize('agentHost.configureToolApprovals', "Configure tool approvals for the agent host"),
		isServerApproved: serverId => isRuleApproved(mcpServerRule(serverId)),
		setServerApproved: (serverId, approved) => setRuleApproved(mcpServerRule(serverId), approved),
		isToolApproved: tool => isRuleApproved(getToolRule(tool)),
		setToolApproved: (tool, approved) => setRuleApproved(getToolRule(tool), approved),
	};
	confirmationService.manageConfirmationPreferences(tools, { preApprovalStore });
	void (async () => {
		const discoveredToolsById = new Map<string, IToolData>();
		await Promise.allSettled(servers.map(async server => {
			if (!server.listTools) {
				return;
			}
			const listedTools = await raceTimeout(server.listTools(), LIST_TOOLS_TIMEOUT_MS);
			for (const tool of listedTools ?? []) {
				addMcpTool(discoveredToolsById, server, tool.name, tool.title ?? tool.annotations?.title ?? tool.name);
			}
			discoveredTools.set([...discoveredToolsById.values()], undefined);
		}));
		isDiscovering.set(false, undefined);
	})();
	return true;
}
