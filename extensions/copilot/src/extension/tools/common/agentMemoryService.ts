/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	checkMemoryEnabled,
	fetchMemoryPrompts,
	fetchRecentMemories,
	storeMemory,
	voteMemory,
	type MemoryApiOptions,
	type MemoryFetchFn,
	type MemoryPromptResponse,
	type MemoryResponse,
	type StoreMemoryRequest,
	type VoteMemoryRequest,
	type VoteMemoryOptions,
} from '@github/copilot-agentic-tools/memory';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, IGitService, toGithubNwo } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

// Re-export package types that callers depend on
export type { MemoryPromptResponse, MemoryResponse as RepoMemoryEntry };

/**
 * User memory entry format for user-scoped memories.
 * @deprecated Use StoreMemoryRequest from @github/copilot-agentic-tools/memory directly.
 */
export interface UserMemoryEntry {
	subject: string;
	fact: string;
	citations?: string | string[];
	reason?: string;
}

/**
 * Normalize citations field to string[] format.
 * Handles backward compatibility for legacy string format.
 */
export function normalizeCitations(citations: string | string[] | undefined): string[] | undefined {
	if (citations === undefined) {
		return undefined;
	}
	if (typeof citations === 'string') {
		return citations.split(',').map(c => c.trim()).filter(c => c.length > 0);
	}
	return citations;
}

/**
 * Type guard to validate if an object is a valid RepoMemoryEntry.
 * Accepts both new format (citations: string[]) and legacy format (citations: string).
 */
export function isRepoMemoryEntry(obj: unknown): obj is MemoryResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const entry = obj as Record<string, unknown>;

	// Required fields
	if (typeof entry.subject !== 'string' || typeof entry.fact !== 'string') {
		return false;
	}

	// Optional fields
	if (entry.citations !== undefined) {
		const isString = typeof entry.citations === 'string';
		const isStringArray = Array.isArray(entry.citations) && entry.citations.every(c => typeof c === 'string');
		if (!isString && !isStringArray) {
			return false;
		}
	}

	if (entry.reason !== undefined && typeof entry.reason !== 'string') {
		return false;
	}

	if (entry.category !== undefined && typeof entry.category !== 'string') {
		return false;
	}

	return true;
}

const INTEGRATION_ID = 'vscode-chat';

/**
 * Service for managing memories via the Copilot Memory service (CAPI).
 * Delegates to @github/copilot-agentic-tools/memory for all API calls.
 */
export interface IAgentMemoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the GitHub owner/repo NWO for the current workspace, or undefined if not available.
	 */
	getRepoNwo(): Promise<string | undefined>;

	/**
	 * Check if Copilot Memory is enabled for the current repository.
	 */
	checkMemoryEnabled(): Promise<boolean>;

	/**
	 * Get repo memories from Copilot Memory service.
	 */
	getRepoMemories(limit?: number): Promise<MemoryResponse[] | undefined>;

	/**
	 * Store a repo memory to Copilot Memory service.
	 */
	storeRepoMemory(memory: StoreMemoryRequest): Promise<boolean>;

	/**
	 * Store a user-scoped memory to Copilot Memory service.
	 */
	storeUserMemory(memory: StoreMemoryRequest): Promise<boolean>;

	/**
	 * Vote on a memory via the Copilot Memory service.
	 */
	voteOnMemory(vote: VoteMemoryRequest, scope: 'repository' | 'user'): Promise<boolean>;

	/**
	 * Fetch the unified memory prompt from the /prompt endpoint.
	 * Returns the full MemoryPromptResponse including storeToolDefinition and voteToolDefinition,
	 * or undefined on failure.
	 */
	getMemoryPrompt(repoNwo?: string): Promise<MemoryPromptResponse | undefined>;
}

export const IAgentMemoryService = createServiceIdentifier<IAgentMemoryService>('IAgentMemoryService');

export class AgentMemoryService extends Disposable implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ICAPIClientService private readonly capiClientService: ICAPIClientService,
		@IFetcherService private readonly fetcherService: IFetcherService,
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
		// Strip the trailing /_ping path segment to get the API base URL
		const pingUrl = this.capiClientService.capiPingURL;
		const lastSlash = pingUrl.lastIndexOf('/');
		return lastSlash > 0 ? pingUrl.slice(0, lastSlash) : pingUrl;
	}

	private makeFetch(): MemoryFetchFn {
		const fetcher = this.fetcherService;
		return (url: string, init?: { method?: string; headers?: any; body?: any }) => fetcher.fetch(url, {
			callSite: 'AgentMemoryService',
			method: (init?.method as 'GET' | 'POST' | 'PUT') ?? 'GET',
			headers: init?.headers as Record<string, string> | undefined,
			body: init?.body as string | undefined,
		}) as unknown as Promise<any>;
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

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return false;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for memory enablement check');
				return false;
			}

			const [owner, repo] = repoNwo.split('/');
			const enabled = await checkMemoryEnabled({
				scope: 'repository',
				owner,
				repo,
				token,
				integrationId: INTEGRATION_ID,
				baseUrl: this.getBaseUrl(),
				fetch: this.makeFetch(),
				logger: this.makeLogger(),
			});
			this.logService.info(`[AgentMemoryService] Copilot Memory enabled for ${repoNwo}: ${enabled}`);
			return enabled;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to check memory enablement: ${error}`);
			return false;
		}
	}

	async getRepoMemories(limit: number = 10): Promise<MemoryResponse[] | undefined> {
		try {
			const enabled = await this.checkMemoryEnabled();
			if (!enabled) {
				return undefined;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return undefined;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for fetching memories');
				return undefined;
			}

			const [owner, repo] = repoNwo.split('/');
			const options: MemoryApiOptions = {
				scope: 'repository',
				owner,
				repo,
				token,
				integrationId: INTEGRATION_ID,
				baseUrl: this.getBaseUrl(),
				limit,
				fetch: this.makeFetch(),
				logger: this.makeLogger(),
			};

			const memories = await fetchRecentMemories(options);
			this.logService.info(`[AgentMemoryService] Fetched ${memories?.length ?? 0} repo memories for ${repoNwo}`);
			return memories;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to fetch repo memories: ${error}`);
			return undefined;
		}
	}

	async storeRepoMemory(memory: StoreMemoryRequest): Promise<boolean> {
		try {
			const enabled = await this.checkMemoryEnabled();
			if (!enabled) {
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
				fetch: this.makeFetch(),
				logger: this.makeLogger(),
			};

			const result = await storeMemory(memory, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${result.error}`);
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
				fetch: this.makeFetch(),
				logger: this.makeLogger(),
			};

			const result = await storeMemory(memory, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to store user memory: ${result.error}`);
			}
			return result.success;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to store user memory: ${error}`);
			return false;
		}
	}

	async voteOnMemory(vote: VoteMemoryRequest, scope: 'repository' | 'user'): Promise<boolean> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for voting on memory');
				return false;
			}

			let options: VoteMemoryOptions;
			if (scope === 'repository') {
				const repoNwo = await this.getRepoNwo();
				if (!repoNwo) {
					return false;
				}
				const [owner, repo] = repoNwo.split('/');
				options = {
					scope: 'repository',
					owner,
					repo,
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					agent: 'vscode',
					fetch: this.makeFetch(),
					logger: this.makeLogger(),
				};
			} else {
				options = {
					scope: 'user',
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					agent: 'vscode',
					fetch: this.makeFetch(),
					logger: this.makeLogger(),
				};
			}

			const result = await voteMemory(vote, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to vote on memory: ${result.error}`);
			}
			return result.success;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to vote on memory: ${error}`);
			return false;
		}
	}

	async getMemoryPrompt(repoNwo?: string): Promise<MemoryPromptResponse | undefined> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return undefined;
			}

			const token = await this.getToken();
			if (!token) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for fetching memory prompt');
				return undefined;
			}

			// Use repo-scoped options when a repoNwo is available, otherwise user-scoped
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
					fetch: this.makeFetch(),
					logger: this.makeLogger(),
				};
			} else {
				options = {
					scope: 'user',
					token,
					integrationId: INTEGRATION_ID,
					baseUrl: this.getBaseUrl(),
					fetch: this.makeFetch(),
					logger: this.makeLogger(),
				};
			}

			const response = await fetchMemoryPrompts(options);
			if (response) {
				this.logService.info(`[AgentMemoryService] Fetched memory prompt (${response.memoriesContext.memoriesCount} memories)`);
			}
			return response;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to fetch memory prompt: ${error}`);
			return undefined;
		}
	}
}
