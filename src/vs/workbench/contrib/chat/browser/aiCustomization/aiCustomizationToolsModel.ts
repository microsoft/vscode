/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { type IAgentHostMcpServerTool } from '../../../../../sessions/common/agentHostSessionsProvider.js';
import { IMcpService } from '../../../mcp/common/mcpTypes.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { AgentHostMcpServer } from './mcpServerCount.js';
import { countEnabledMcpServerTools, getMcpServerToolSets, IMcpServerToolSet, McpSessionToolsMemory } from './mcpServerToolSets.js';

export const IAICustomizationToolsModel = createDecorator<IAICustomizationToolsModel>('aiCustomizationToolsModel');

/**
 * Shared model behind Chat Customizations → Tools, so the section and every count shown for it
 * (the customizations editor, the Agents window toolbar and overview) agree.
 */
export interface IAICustomizationToolsModel {
	readonly _serviceBrand: undefined;
	/** MCP servers that contribute tools, including disabled ones so they can be re-enabled. */
	readonly mcpServerToolSets: IObservable<readonly IMcpServerToolSet[]>;
	/** Enabled built-in and extension tools plus the tools contributed by enabled MCP servers. */
	readonly enabledToolCount: IObservable<number>;
}

export class AICustomizationToolsModel extends Disposable implements IAICustomizationToolsModel {
	declare readonly _serviceBrand: undefined;

	readonly mcpServerToolSets: IObservable<readonly IMcpServerToolSet[]>;
	readonly enabledToolCount: IObservable<number>;

	/** Tools listed over each agent-host MCP server's `mcp://` channel, keyed by channel. */
	private readonly _channelTools = observableValue<ReadonlyMap<string, readonly IAgentHostMcpServerTool[]>>(this, new Map());
	/** Latest request per channel, so an older `tools/list` response never overwrites a newer one. */
	private readonly _channelRequests = new Map<string, number>();
	private _requestCounter = 0;
	private _sessionKey: string | undefined;

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService toolEnablementService: IAgentHostToolSetEnablementService,
		@IMcpService mcpService: IMcpService,
		@IAgentHostCustomizationService agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService harnessService: ICustomizationHarnessService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const agentHostCustomizationsChanged = observableSignalFromEvent(this, agentHostCustomizationService.onDidChangeCustomizations);
		const session = derived(this, reader => {
			agentHostCustomizationsChanged.read(reader);
			const sessionResource = harnessService.activeSessionResource.read(reader);
			return { key: sessionResource.toString(), servers: agentHostCustomizationService.getMcpServers(sessionResource) };
		});

		// List each ready server's tools over its channel once, and again when it reports a change.
		this._register(autorun(reader => {
			const { key, servers } = session.read(reader);
			if (key !== this._sessionKey) {
				this._sessionKey = key;
				this._channelRequests.clear();
				this._channelTools.set(new Map(), undefined);
			}
			for (const server of servers) {
				if (server.toolsChannel && !this._channelRequests.has(server.toolsChannel)) {
					this._listTools(server);
				}
			}
		}));
		this._register(agentHostCustomizationService.onDidChangeMcpServerTools(channel => {
			const server = session.get().servers.find(candidate => candidate.toolsChannel === channel);
			if (server) {
				this._listTools(server);
			}
		}));

		const mcpToolsMemory = new McpSessionToolsMemory();
		this.mcpServerToolSets = derived(this, reader => {
			const { key, servers } = session.read(reader);
			const channelTools = this._channelTools.read(reader);
			return getMcpServerToolSets(
				mcpService.servers.read(reader),
				servers,
				server => server.toolsChannel ? channelTools.get(server.toolsChannel) : undefined,
				reader,
				{ instance: mcpToolsMemory, sessionKey: key },
			);
		});
		this.enabledToolCount = derived(this, reader => {
			const state = toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
			return countEnabledCustomizationTools(toolsService.toolSets.read(reader), state, reader)
				+ countEnabledMcpServerTools(this.mcpServerToolSets.read(reader), reader);
		});
	}

	private _listTools(server: AgentHostMcpServer): void {
		const channel = server.toolsChannel;
		if (!channel || !server.listTools) {
			return;
		}
		const requestId = ++this._requestCounter;
		this._channelRequests.set(channel, requestId);
		server.listTools().then(tools => {
			if (this._store.isDisposed || this._channelRequests.get(channel) !== requestId) {
				return;
			}
			const next = new Map(this._channelTools.get());
			next.set(channel, tools);
			this._channelTools.set(next, undefined);
		}, error => {
			this._logService.warn(`[AICustomizationToolsModel] Failed to list tools for MCP server '${server.name}'`, error);
		});
	}
}

registerSingleton(IAICustomizationToolsModel, AICustomizationToolsModel, InstantiationType.Delayed);
