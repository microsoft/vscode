/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, IGitService, toGithubNwo } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IAgentMemoryService, type MemoryPromptResponse } from '../common/agentMemoryService';
import { ToolRegistry } from '../common/toolsRegistry';
import { buildStoreMemoryToolDefinition, StoreMemoryTool } from './storeMemoryTool';
import { buildVoteMemoryToolDefinition, VoteMemoryTool } from './voteMemoryTool';

export interface IAgentMemoryToolRegistrar {
	readonly _serviceBrand: undefined;
	/**
	 * Register store_memory (and optionally vote_memory) as model-specific tools using an
	 * already-fetched prompt response. When called without a response, fetches the /prompt
	 * endpoint itself. Safe to call multiple times — re-registers on each call to pick up
	 * updated tool definitions from the server.
	 */
	registerMemoryTools(promptResponse?: MemoryPromptResponse): Promise<void>;
}

export const IAgentMemoryToolRegistrar = createServiceIdentifier<IAgentMemoryToolRegistrar>('IAgentMemoryToolRegistrar');

export class AgentMemoryToolRegistrar implements IAgentMemoryToolRegistrar {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new DisposableStore();

	constructor(
		@IAgentMemoryService private readonly agentMemoryService: IAgentMemoryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILogService private readonly logService: ILogService,
	) { }

	private async getRepoNwo(): Promise<string | undefined> {
		try {
			const workspaceFolders = this.workspaceService.getWorkspaceFolders();
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return undefined;
			}
			const repo = await this.gitService.getRepository(workspaceFolders[0]);
			if (!repo) {
				return undefined;
			}
			for (const remoteUrl of getOrderedRemoteUrlsFromContext(repo)) {
				const repoId = getGithubRepoIdFromFetchUrl(remoteUrl);
				if (repoId) {
					return toGithubNwo(repoId);
				}
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	async registerMemoryTools(promptResponse?: MemoryPromptResponse): Promise<void> {
		const enabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
		if (!enabled) {
			this._registrations.clear();
			return;
		}

		if (!promptResponse) {
			const repoNwo = await this.getRepoNwo();
			promptResponse = await this.agentMemoryService.getMemoryPrompt(repoNwo);
		}
		if (!promptResponse) {
			this.logService.warn('[AgentMemoryToolRegistrar] Could not fetch memory prompt — skipping tool registration');
			return;
		}

		// Dispose any previously registered memory tools before re-registering
		this._registrations.clear();

		// Use storeToolDefinition if present (version >= 1.1.0 includes scope param),
		// fall back to the legacy toolDefinition for older servers.
		const storeToolDef = promptResponse.storeToolDefinition ?? promptResponse.toolDefinition;
		const storeDefinition = buildStoreMemoryToolDefinition(
			storeToolDef.name,
			storeToolDef.description,
			storeToolDef.definitionVersion,
		);
		this._registrations.add(ToolRegistry.registerModelSpecificTool(storeDefinition, StoreMemoryTool));
		this.logService.info(`[AgentMemoryToolRegistrar] Registered store_memory tool (schema v${storeToolDef.definitionVersion})`);

		// vote_memory is only registered when the server returns voteToolDefinition
		if (promptResponse.voteToolDefinition) {
			const { name, description } = promptResponse.voteToolDefinition;
			const voteDefinition = buildVoteMemoryToolDefinition(name, description);
			this._registrations.add(ToolRegistry.registerModelSpecificTool(voteDefinition, VoteMemoryTool));
			this.logService.info('[AgentMemoryToolRegistrar] Registered vote_memory tool');
		}
	}

	dispose(): void {
		this._registrations.dispose();
	}
}
