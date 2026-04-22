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
	 * Check if Copilot Memory is enabled for the current repository.
	 */
	checkMemoryEnabled(): Promise<boolean>;

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

	private _cachedPromptResponses = new Map<string, MemoryPromptResponse>();
	private static readonly MAX_CACHE_ENTRIES = 50; // Prevent unbounded growth

	override dispose(): void {
		this._cachedPromptResponses.clear();
		super.dispose();
	}

	getCachedMemoryPrompt(sessionId?: string): MemoryPromptResponse | undefined {
		if (sessionId) {
			return this._cachedPromptResponses.get(sessionId);
		}
		// Legacy behavior - return any cached response if no sessionId provided
		const responses = Array.from(this._cachedPromptResponses.values());
		return responses.length > 0 ? responses[0] : undefined;
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IGitService private readonly gitService: IGitService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService
	) {
		super();
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

	async checkMemoryEnabled(): Promise<boolean> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for memory enablement check');
				return false;
			}

			const repoNwo = await this.getRepoNwo();
			let options: MemoryApiOptions;
			if (repoNwo) {
				const [owner, repo] = repoNwo.split('/');
				options = {
					scope: 'repository',
					owner,
					repo,
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					logger: this.makeLogger(),
				};
			} else {
				options = {
					scope: 'user',
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					logger: this.makeLogger(),
				};
			}

			// The package doesn't expose a dedicated enablement check; a successful
			// /prompt response means memory is enabled for this scope.
			const response = await fetchMemoryPrompts(options);
			const enabled = response !== undefined;
			this.logService.info(`[AgentMemoryService] Copilot Memory enabled (scope: ${options.scope}${repoNwo ? ` for ${repoNwo}` : ''}): ${enabled}`);
			return enabled;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to check memory enablement: ${error}`);
			return false;
		}
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
				this.logService.warn('[AgentMemoryService] No GitHub session available for storing memory');
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
				// Clear cache to ensure fresh data on next fetch
				this.invalidateMemoryCache(repoNwo);
				this.logService.debug(`[AgentMemoryService] Invalidated cache after storing repo memory`);
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
				this.logService.warn('[AgentMemoryService] No GitHub session available for storing user memory');
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
				// Clear cache to ensure fresh data on next fetch
				this.invalidateMemoryCache(); // User-scoped, so clear all user entries
				this.logService.debug(`[AgentMemoryService] Invalidated cache after storing user memory`);
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

			// If repoNwo not provided, auto-determine it to preserve original behavior
			const resolvedRepoNwo = repoNwo ?? await this.getRepoNwo();

			// Generate a cache key that includes both sessionId and scope/repo context
			const cacheKey = this.generateCacheKey(sessionId, resolvedRepoNwo);
			
			// Check if we already have a cached response for this session and context
			const cachedResponse = this._cachedPromptResponses.get(cacheKey);
			if (cachedResponse) {
				this.logService.debug(`[AgentMemoryService] Using cached memory prompt for key: ${cacheKey}`);
				return cachedResponse;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for fetching memory prompt');
				return undefined;
			}

			// Use repo-scoped options when a resolvedRepoNwo is available, otherwise user-scoped
			let options: MemoryApiOptions;
			if (resolvedRepoNwo) {
				const [owner, repo] = resolvedRepoNwo.split('/');
				options = {
					scope: 'repository',
					owner,
					repo,
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					logger: this.makeLogger(),
				};
			} else {
				options = {
					scope: 'user',
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					logger: this.makeLogger(),
				};
			}

			const response = await fetchMemoryPrompts(options);
			if (response) {
				this.logService.info(`[AgentMemoryService] Fetched memory prompt (${response.memoriesContext.memoriesCount} memories) for key: ${cacheKey}`);
				
				// Prevent unbounded cache growth
				if (this._cachedPromptResponses.size >= AgentMemoryService.MAX_CACHE_ENTRIES) {
					const firstKey = this._cachedPromptResponses.keys().next().value;
					if (firstKey) {
						this._cachedPromptResponses.delete(firstKey);
						this.logService.debug(`[AgentMemoryService] Evicted cache entry: ${firstKey}`);
					}
				}
				
				this._cachedPromptResponses.set(cacheKey, response);
			}
			return response;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to fetch memory prompt: ${error}`);
			return undefined;
		}
	}

	clearCache(sessionId?: string): void {
		if (sessionId) {
			// Clear all cache entries for a specific session
			const keysToDelete: string[] = [];
			for (const key of this._cachedPromptResponses.keys()) {
				if (key.startsWith(`${sessionId}:`)) {
					keysToDelete.push(key);
				}
			}
			for (const key of keysToDelete) {
				this._cachedPromptResponses.delete(key);
			}
			this.logService.debug(`[AgentMemoryService] Cleared cache for session: ${sessionId}`);
		} else {
			// Clear all cache entries
			this._cachedPromptResponses.clear();
			this.logService.debug(`[AgentMemoryService] Cleared all cache entries`);
		}
	}

	/**
	 * Invalidate cache entries that could be affected by storing new memories
	 */
	private invalidateMemoryCache(repoNwo?: string): void {
		const keysToDelete: string[] = [];
		for (const key of this._cachedPromptResponses.keys()) {
			if (repoNwo) {
				// For repo memories, invalidate entries with this specific repo
				if (key.includes(`:${repoNwo}`)) {
					keysToDelete.push(key);
				}
			} else {
				// For user memories, invalidate user-scoped entries (ending with :user)
				if (key.endsWith(':user')) {
					keysToDelete.push(key);
				}
			}
		}
		for (const key of keysToDelete) {
			this._cachedPromptResponses.delete(key);
		}
		this.logService.debug(`[AgentMemoryService] Invalidated ${keysToDelete.length} cache entries${repoNwo ? ` for repo ${repoNwo}` : ' for user scope'}`);
	}

	private generateCacheKey(sessionId?: string, repoNwo?: string): string {
		// Create a cache key that combines session and context
		// Use 'default' if no sessionId to maintain backward compatibility
		const session = sessionId || 'default';
		const context = repoNwo || 'user';
		return `${session}:${context}`;
	}
}
