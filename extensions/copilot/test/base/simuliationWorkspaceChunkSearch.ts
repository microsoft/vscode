/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ChatResponsePart, Progress } from 'vscode';
import { EmbeddingType } from '../../src/platform/embeddings/common/embeddingsComputer';
import { GithubRepoId } from '../../src/platform/git/common/gitService';
import { IIgnoreService } from '../../src/platform/ignore/common/ignoreService';
import { ILogService } from '../../src/platform/log/common/logService';
import { GithubCodeSearchRepoInfo, IGithubCodeSearchService, parseGithubCodeSearchResponse } from '../../src/platform/remoteCodeSearch/common/githubCodeSearchService';
import { CodeSearchResult, RemoteCodeSearchError, RemoteCodeSearchIndexState, RemoteCodeSearchIndexStatus } from '../../src/platform/remoteCodeSearch/common/remoteCodeSearch';
import { WorkspaceChunkQuery, WorkspaceChunkSearchOptions } from '../../src/platform/workspaceChunkSearch/common/workspaceChunkSearch';
import { BuildIndexTriggerReason, TriggerIndexingError } from '../../src/platform/workspaceChunkSearch/node/codeSearch/codeSearchRepo';
import { IWorkspaceChunkSearchService, WorkspaceChunkSearchResult, WorkspaceChunkSearchSizing, WorkspaceIndexState } from '../../src/platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { Result } from '../../src/util/common/result';
import { TelemetryCorrelationId } from '../../src/util/common/telemetryCorrelationId';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { Event } from '../../src/util/vs/base/common/event';
import { Disposable } from '../../src/util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';

const searchEndpoint = 'http://localhost:4443/api/embeddings/code/search';


class SimulationGithubCodeSearchService extends Disposable implements IGithubCodeSearchService {

	declare readonly _serviceBrand: undefined;


	constructor(
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async searchRepo(authOptions: { silent: boolean }, embeddingType: EmbeddingType, repo: GithubCodeSearchRepoInfo, query: string, maxResults: number, options: WorkspaceChunkSearchOptions, _telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<CodeSearchResult> {
		this._logService.trace(`SimulationGithubCodeSearchService::searchRepo(${repo.githubRepoId}, ${query})`);
		const response = await fetch(searchEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				scoping_query: `repo:msbench/workspace`,
				prompt: query,
				limit: maxResults
			})
		});

		if (!response.ok) {
			this._logService.trace(`SimulationGithubCodeSearchService::searchRepo(${repo.githubRepoId}, ${query}) failed. status: ${response.status}`);
			const body = await response.text();
			throw new Error(`Error fetching index status: ${response.status} - ${body}`);
		}

		const json: any = await response.json();

		const result = await parseGithubCodeSearchResponse(json, repo, { ...options, skipVerifyRepo: true }, this._ignoreService);
		this._logService.trace(`SimulationGithubCodeSearchService::searchRepo(${repo.githubRepoId}, ${query}) success. Found ${result.chunks.length} chunks`);
		return result;
	}

	async getRemoteIndexState(authOptions: { silent: boolean }, githubRepoId: GithubRepoId, _telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		return Result.ok({ status: RemoteCodeSearchIndexStatus.Ready, indexedCommit: 'HEAD' });
	}

	triggerIndexing(authOptions: { silent: boolean }, triggerReason: 'auto' | 'manual' | 'tool', githubRepoId: GithubRepoId): Promise<Result<true, RemoteCodeSearchError>> {
		throw new Error('Method not implemented.');
	}
}


export class SimulationCodeSearchChunkSearchService extends Disposable implements IWorkspaceChunkSearchService {
	declare readonly _serviceBrand: undefined;

	private readonly _githubCodeSearchService: IGithubCodeSearchService;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._githubCodeSearchService = instantiationService.createInstance(SimulationGithubCodeSearchService);
	}

	readonly onDidChangeIndexState = Event.None;

	getIndexState(): Promise<WorkspaceIndexState> {
		throw new Error('Method not implemented.');
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async searchFileChunks(sizing: WorkspaceChunkSearchSizing, query: WorkspaceChunkQuery, options: WorkspaceChunkSearchOptions, telemetryInfo: TelemetryCorrelationId, progress: Progress<ChatResponsePart> | undefined, token: CancellationToken): Promise<WorkspaceChunkSearchResult> {
		const repo = new GithubRepoId('test-org', 'test-repo');
		try {
			const results = await this._githubCodeSearchService.searchRepo({ silent: true }, EmbeddingType.text3small_512, {
				githubRepoId: repo,
				indexedCommit: undefined,
				localRepoRoot: undefined,
			}, query.queryText, sizing.maxResults ?? 128, options, telemetryInfo, token);
			return {
				chunks: results.chunks,
			};
		} catch (error) {
			console.error('Error searching repo:', error);
		}

		return {
			chunks: [],
		};
	}

	triggerIndexing(trigger: BuildIndexTriggerReason, _onProgress?: (message: string) => void, _telemetryInfo?: TelemetryCorrelationId, _token?: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		throw new Error('Method not implemented.');
	}

	deleteExternalIngestWorkspaceIndex(): Promise<void> {
		return Promise.resolve();
	}
}
