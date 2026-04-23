/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	fetchMemoryPrompts,
	storeMemory,
	type MemoryApiOptions,
	type MemoryPromptResponse,
	type StoreMemoryRequest,
} from '@github/copilot-agentic-tools/memory';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, IGitService, toGithubNwo } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

// Re-export package types that callers depend on
export type { MemoryPromptResponse };

const INTEGRATION_ID = 'vscode-chat';

/**
 * Service for managing memories via the Copilot Memory service (CAPI).
 * Delegates to @github/copilot-agentic-tools/memory for all API calls.
 */
export interface IAgentMemoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Store a repo memory to Copilot Memory service.
	 */
	storeRepoMemory(memory: StoreMemoryRequest): Promise<boolean>;

	/**
	 * Store a user-scoped memory to Copilot Memory service.
	 */
	storeUserMemory(memory: StoreMemoryRequest): Promise<boolean>;


	/**
	 * Fetch the unified memory prompt from the /prompt endpoint.
	 * Returns the full MemoryPromptResponse including storeToolDefinition,
	 * or undefined on failure. Caches the result per conversation.
	 */
	getMemoryPrompt(repoNwo?: string, sessionId?: string): Promise<MemoryPromptResponse | undefined>;

	/**
	 * Returns the cached MemoryPromptResponse for a specific session, or undefined if
	 * getMemoryPrompt() has not yet been called successfully for that session.
	 */
	getCachedMemoryPrompt(sessionId?: string): MemoryPromptResponse | undefined;

	/**
	 * Clear cached memory prompts for a specific session or all sessions.
	 */
	clearCache(sessionId?: string): void;
}

export const IAgentMemoryService = createServiceIdentifier<IAgentMemoryService>('IAgentMemoryService');

export class AgentMemoryService extends Disposable implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;

	// Conversation-scoped cache - one entry per conversation, cleared on conversation end
	private _conversationMemoryCache = new Map<string, MemoryPromptResponse>();

	override dispose(): void {
		this._conversationMemoryCache.clear();
		super.dispose();
	}

	getCachedMemoryPrompt(sessionId?: string): MemoryPromptResponse | undefined {
		if (!sessionId) {
			const responses = Array.from(this._conversationMemoryCache.values());
			return responses.length > 0 ? responses[0] : undefined;
		}
		return this._conversationMemoryCache.get(sessionId);
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IChatSessionService private readonly chatSessionService: IChatSessionService,
	) {
		super();
		
		// Clear cache when conversations end to ensure fresh data for new conversations
		this._register(this.chatSessionService.onDidDisposeChatSession(sessionId => {
			this.clearCache(sessionId);
		}));
	}

	async getRepoNwo(): Promise<string | undefined> {
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
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to get repo NWO: ${error}`);
			return undefined;
		}
	}

	private isCAPIMemorySyncConfigEnabled(): boolean {
		return this.configService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
	}

	private getBaseUrl(): string {
		// Strip the last path segment from the ping URL to get the API base URL.
		const pingUrl = this.capiClientService.capiPingURL;
		const lastSlash = pingUrl.lastIndexOf('/');
		return lastSlash > 0 ? pingUrl.slice(0, lastSlash) : pingUrl;
	}

	private async getToken(): Promise<string | undefined> {
		const session = await this.authenticationService.getGitHubSession('any', { silent: true });
		return session?.accessToken;
	}

	private makeLogger() {
		return {
			info: (msg: string) => this.logService.info(`[AgentMemoryService] ${msg}`),
			error: (msg: string) => this.logService.error(`[AgentMemoryService] ${msg}`),
		};
	}

	async storeRepoMemory(memory: StoreMemoryRequest): Promise<boolean> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return false;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub authentication token available for storing memory');
				return false;
			}

			const [owner, repo] = repoNwo.split('/');
			const options = {
				scope: 'repository' as const,
				owner,
				repo,
				token,
				integrationId: INTEGRATION_ID,
				baseUrl: this.getBaseUrl(),
				agent: 'vscode',
				logger: this.makeLogger(),
			};

			const result = await storeMemory(memory, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${result.error}`);
			} else {
				this.logService.debug(`[AgentMemoryService] Successfully stored repo memory`);
				// Note: Cache will be cleared when conversation ends, ensuring fresh data for next conversation
			}
			return result.success;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${error}`);
			return false;
		}
	}

	async storeUserMemory(memory: StoreMemoryRequest): Promise<boolean> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub authentication token available for storing user memory');
				return false;
			}

			const options = {
				scope: 'user' as const,
				token,
				integrationId: INTEGRATION_ID,
				baseUrl: this.getBaseUrl(),
				agent: 'vscode',
				logger: this.makeLogger(),
			};

			const result = await storeMemory(memory, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to store user memory: ${result.error}`);
			} else {
				this.logService.debug(`[AgentMemoryService] Successfully stored user memory`);
				// Note: Cache will be cleared when conversation ends, ensuring fresh data for next conversation
			}
			return result.success;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to store user memory: ${error}`);
			return false;
		}
	}


	async getMemoryPrompt(repoNwo?: string, sessionId?: string): Promise<MemoryPromptResponse | undefined> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return undefined;
			}

			// For conversation-scoped caching, use sessionId as the cache key
			// If no sessionId provided, we don't cache (for backward compatibility)
			if (sessionId) {
				const cachedResponse = this._conversationMemoryCache.get(sessionId);
				if (cachedResponse) {
					this.logService.debug(`[AgentMemoryService] Using cached memory prompt for conversation: ${sessionId}`);
					return cachedResponse;
				} else {
					this.logService.debug(`[AgentMemoryService] Cache miss for conversation: ${sessionId}, cache size: ${this._conversationMemoryCache.size}`);
				}
			} else {
				this.logService.debug(`[AgentMemoryService] No sessionId provided, skipping cache lookup`);
			}

			const resolvedRepoNwo = repoNwo ?? await this.getRepoNwo();

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub authentication token available for fetching memory prompt');
				return undefined;
			}

			const baseOptions = {
				token,
				integrationId: INTEGRATION_ID,
				baseUrl: this.getBaseUrl(),
				logger: this.makeLogger(),
			};

			let options: MemoryApiOptions;
			if (resolvedRepoNwo) {
				const [owner, repo] = resolvedRepoNwo.split('/');
				options = { scope: 'repository', owner, repo, ...baseOptions };
			} else {
				options = { scope: 'user', ...baseOptions };
			}

			const response = await fetchMemoryPrompts(options);
			if (response) {
				this.logService.info(`[AgentMemoryService] Fetched memory prompt (${response.memoriesContext.memoriesCount} memories)${sessionId ? ` for conversation: ${sessionId}` : ''}`);
				if (sessionId) {
					this._conversationMemoryCache.set(sessionId, response);
				}
			}
			return response;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to fetch memory prompt: ${error}`);
			return undefined;
		}
	}

	/**
	 * Clear cached memory for a specific conversation (called when conversation ends)
	 */
	clearCache(sessionId?: string): void {
		if (sessionId) {
			const deleted = this._conversationMemoryCache.delete(sessionId);
			this.logService.debug(`[AgentMemoryService] Cleared cache for conversation: ${sessionId} (found: ${deleted})`);
		} else {
			// Clear all conversations
			const count = this._conversationMemoryCache.size;
			this._conversationMemoryCache.clear();
			this.logService.debug(`[AgentMemoryService] Cleared all conversation caches (${count} entries)`);
		}
	}

}
