/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, IGitService, toGithubNwo } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

/**
 * Repository memory entry format aligned with CAPI service contract.
 * Supports both new format (citations as string[]) and legacy format (citations as string).
 */
export interface RepoMemoryEntry {
	subject: string;
	fact: string;
	citations?: string | string[];
	reason?: string;
	category?: string;
}

/**
 * Type guard to validate if an object is a valid RepoMemoryEntry.
 * Accepts both new format (citations: string[]) and legacy format (citations: string).
 */
export function isRepoMemoryEntry(obj: unknown): obj is RepoMemoryEntry {
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
 * Service for managing repository memories via the Copilot Memory service (CAPI).
 * Memories are stored in the cloud and available when Copilot Memory is enabled for the repository.
 */
export interface IAgentMemoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Check if Copilot Memory is enabled for the current repository.
	 * Makes a lightweight API call to the enablement check endpoint.
	 * Returns false if not enabled or if the check fails.
	 */
	checkMemoryEnabled(): Promise<boolean>;

	/**
	 * Get repo memories from Copilot Memory service.
	 * Returns undefined if Copilot Memory is not enabled or if fetching fails.
	 */
	getRepoMemories(limit?: number): Promise<RepoMemoryEntry[] | undefined>;

	/**
	 * Store a repo memory to Copilot Memory service.
	 * Returns true if stored successfully, false if Copilot Memory is not enabled or if storing fails.
	 */
	storeRepoMemory(memory: RepoMemoryEntry): Promise<boolean>;
}

export const IAgentMemoryService = createServiceIdentifier<IAgentMemoryService>('IAgentMemoryService');

export class AgentMemoryService extends Disposable implements IAgentMemoryService {
	declare readonly _serviceBrand: undefined;

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

	/**
	 * Get the GitHub repository NWO (name with owner) for the current workspace.
	 * Returns the NWO in lowercase format (e.g., "microsoft/vscode").
	 */
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

			// Try to get GitHub repo info from remote URLs
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

	/**
	 * Check if the chat.copilotMemory.enabled config is enabled.
	 * Uses experiment-based configuration for gradual rollout.
	 */
	private isCAPIMemorySyncConfigEnabled(): boolean {
		return this.configService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
	}

	async checkMemoryEnabled(): Promise<boolean> {
		try {
			// Check if CAPI sync is enabled via config
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return false;
			}

			// Get OAuth token for API call
			const session = await this.authenticationService.getGitHubSession('any', { silent: true });
			if (!session) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for memory enablement check');
				return false;
			}

			// Make API call to check enablement
			const response = await this.capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, {
				type: RequestType.CopilotAgentMemory,
				repo: repoNwo,
				action: 'enabled'
			});

			if (!response.ok) {
				this.logService.warn(`[AgentMemoryService] Memory enablement check failed: ${response.statusText}`);
				return false;
			}

			const data = await response.json() as { enabled?: boolean };
			const enabled = data?.enabled ?? false;

			this.logService.info(`[AgentMemoryService] Copilot Memory enabled for ${repoNwo}: ${enabled}`);
			return enabled;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to check memory enablement: ${error}`);
			return false;
		}
	}

	async getRepoMemories(limit: number = 10): Promise<RepoMemoryEntry[] | undefined> {
		try {
			// Check if Copilot Memory is enabled
			const enabled = await this.checkMemoryEnabled();
			if (!enabled) {
				this.logService.debug('[AgentMemoryService] Copilot Memory not enabled, skipping repo memory fetch');
				return undefined;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return undefined;
			}

			// Get OAuth token for API call
			const session = await this.authenticationService.getGitHubSession('any', { silent: true });
			if (!session) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for fetching memories');
				return undefined;
			}

			// Fetch memories from Copilot Memory service
			const response = await this.capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			}, {
				type: RequestType.CopilotAgentMemory,
				repo: repoNwo,
				action: 'recent',
				limit
			});

			if (!response.ok) {
				this.logService.warn(`[AgentMemoryService] Failed to fetch memories: ${response.statusText}`);
				return undefined;
			}

			const data = await response.json() as Array<{
				subject: string;
				fact: string;
				citations?: string[];
				reason?: string;
				category?: string;
			}>;

			if (!data || !Array.isArray(data)) {
				return undefined;
			}

			// Transform response to RepoMemoryEntry format
			const memories: RepoMemoryEntry[] = data
				.filter(isRepoMemoryEntry)
				.map(entry => ({
					subject: entry.subject,
					fact: entry.fact,
					citations: entry.citations,
					reason: entry.reason,
					category: entry.category
				}));

			this.logService.info(`[AgentMemoryService] Fetched ${memories.length} repo memories for ${repoNwo}`);
			return memories.length > 0 ? memories : undefined;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to fetch repo memories: ${error}`);
			return undefined;
		}
	}

	async storeRepoMemory(memory: RepoMemoryEntry): Promise<boolean> {
		try {
			// Check if Copilot Memory is enabled
			const enabled = await this.checkMemoryEnabled();
			if (!enabled) {
				this.logService.debug('[AgentMemoryService] Copilot Memory not enabled, skipping repo memory store');
				return false;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return false;
			}

			// Normalize citations to array format for CAPI
			const citations = normalizeCitations(memory.citations) ?? [];

			// Get OAuth token for API call
			const session = await this.authenticationService.getGitHubSession('any', { silent: true });
			if (!session) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for storing memory');
				return false;
			}

			// Store memory to Copilot Memory service
			const response = await this.capiClientService.makeRequest<Response>({
				method: 'PUT',
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				},
				json: {
					subject: memory.subject,
					fact: memory.fact,
					citations,
					reason: memory.reason,
					category: memory.category,
					source: { agent: 'vscode' }
				}
			}, {
				type: RequestType.CopilotAgentMemory,
				repo: repoNwo
			});

			if (!response.ok) {
				this.logService.warn(`[AgentMemoryService] Failed to store memory: ${response.statusText}`);
				return false;
			}

			this.logService.info(`[AgentMemoryService] Stored repo memory for ${repoNwo}: ${memory.subject}`);
			return true;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${error}`);
			return false;
		}
	}
}
