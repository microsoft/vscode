/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MemoryApiOptions, StoreMemoryRequest } from '@github/copilot-agentic-tools/memory';
import { fetchMemoryPrompts, storeMemory } from '@github/copilot-agentic-tools/memory';
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

const INTEGRATION_ID = 'vscode';

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
 */
export function isRepoMemoryEntry(obj: unknown): obj is RepoMemoryEntry {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const entry = obj as Record<string, unknown>;
	if (typeof entry.subject !== 'string' || typeof entry.fact !== 'string') {
		return false;
	}
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

export interface IAgentMemoryService {
	readonly _serviceBrand: undefined;

	checkMemoryEnabled(): Promise<boolean>;

	/**
	 * Get repo memories from Copilot Memory service.
	 * Returns undefined if Copilot Memory is not enabled or if fetching fails.
	 */
	getRepoMemories(limit?: number): Promise<RepoMemoryEntry[] | undefined>;

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
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
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
		return new URL('.', this.capiClientService.capiPingURL).toString().replace(/\/$/, '');
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

	private async makeOptions(repoNwo?: string): Promise<MemoryApiOptions | undefined> {
		const token = await this.getToken();
		if (!token) {
			this.logService.warn('[AgentMemoryService] No GitHub authentication token available');
			return undefined;
		}

		const baseOptions = {
			token,
			integrationId: INTEGRATION_ID,
			baseUrl: this.getBaseUrl(),
			logger: this.makeLogger(),
		};

		const resolvedRepoNwo = repoNwo ?? await this.getRepoNwo();
		if (resolvedRepoNwo) {
			const [owner, repo] = resolvedRepoNwo.split('/');
			return { scope: 'repository', owner, repo, ...baseOptions };
		}
		return { scope: 'user', ...baseOptions };
	}

	async checkMemoryEnabled(): Promise<boolean> {
		try {
			if (!this.isCAPIMemorySyncConfigEnabled()) {
				return false;
			}
			const options = await this.makeOptions();
			if (!options) {
				return false;
			}
			const response = await fetchMemoryPrompts(options);
			return !!response;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to check memory enablement: ${error}`);
			return false;
		}
	}

	async getRepoMemories(limit: number = 10): Promise<RepoMemoryEntry[] | undefined> {
		try {
			const enabled = await this.checkMemoryEnabled();
			if (!enabled) {
				return undefined;
			}

			const repoNwo = await this.getRepoNwo();
			if (!repoNwo) {
				return undefined;
			}

			const session = await this.authenticationService.getGitHubSession('any', { silent: true });
			if (!session) {
				this.logService.warn('[AgentMemoryService] No GitHub session available for fetching memories');
				return undefined;
			}

			const response = await this.capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: { 'Authorization': `Bearer ${session.accessToken}` }
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

			const memories: RepoMemoryEntry[] = data
				.filter(isRepoMemoryEntry)
				.map(entry => ({
					subject: entry.subject,
					fact: entry.fact,
					citations: entry.citations,
					reason: entry.reason,
					category: entry.category,
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
			const request: StoreMemoryRequest = {
				subject: memory.subject,
				fact: memory.fact,
				citations: Array.isArray(memory.citations)
					? memory.citations
					: typeof memory.citations === 'string'
						? memory.citations.split(',').map(c => c.trim()).filter(c => c.length > 0)
						: [],
				reason: memory.reason,
			};

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

			const result = await storeMemory(request, options);
			if (!result.success) {
				this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${result.error}`);
			} else {
				this.logService.debug('[AgentMemoryService] Successfully stored repo memory');
			}
			return result.success;
		} catch (error) {
			this.logService.warn(`[AgentMemoryService] Failed to store repo memory: ${error}`);
			return false;
		}
	}
}
