/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { shouldInclude } from '../../../util/common/glob';
import { Result } from '../../../util/common/result';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import type { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { FileChunkAndScore } from '../../chunking/common/chunk';
import { stripChunkTextMetadata, truncateToMaxUtf8Length } from '../../chunking/common/chunkingStringUtils';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { getGitHubRepoInfoFromContext, IGitService, toGithubNwo } from '../../git/common/gitService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { WorkspaceChunkQuery, WorkspaceChunkSearchOptions } from '../common/workspaceChunkSearch';
import { BuildIndexTriggerReason, TriggerIndexingError } from './codeSearch/codeSearchRepo';
import {
	IWorkspaceChunkSearchService,
	WorkspaceChunkSearchResult,
	WorkspaceChunkSearchSizing,
	WorkspaceIndexState,
} from './workspaceChunkSearchService';

/**
 * The Blackbird local server endpoint for embeddings code search.
 * In scenario automation (msbench), Blackbird always runs at this address.
 */
const BLACKBIRD_EMBEDDINGS_URL = 'http://localhost:4443/api/embeddings/code/search';

interface BlackbirdSearchResponse {
	readonly embedding_model?: string;
	readonly results: ReadonlyArray<{
		readonly location: {
			readonly path: string;
		};
		readonly chunk: {
			readonly text: string;
			readonly line_range: {
				readonly start: number;
				readonly end: number;
			};
		};
		readonly distance: number;
	}>;
}

/**
 * Scenario automation implementation of {@link IWorkspaceChunkSearchService}.
 *
 * This is a minimal implementation that directly calls the Blackbird local
 * embeddings endpoint without depending on the production
 * {@link WorkspaceChunkSearchService} or any of its strategies.
 * All methods except {@link searchFileChunks} and {@link getIndexState}
 * are no-ops.
 */
export class ScenarioAutomationWorkspaceChunkSearchService implements IWorkspaceChunkSearchService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChangeIndexState: Event<void> = Event.None;

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@IGitService private readonly _gitService: IGitService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async getIndexState(): Promise<WorkspaceIndexState> {
		return {
			remoteIndexState: { status: 'loaded', repos: [] },
		};
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async searchFileChunks(
		sizing: WorkspaceChunkSearchSizing,
		query: WorkspaceChunkQuery,
		options: WorkspaceChunkSearchOptions,
		_telemetryInfo: TelemetryCorrelationId,
		_progress: vscode.Progress<vscode.ChatResponsePart> | undefined,
		token: CancellationToken,
	): Promise<WorkspaceChunkSearchResult> {
		if (token.isCancellationRequested) {
			return { chunks: [] };
		}

		const repo = this._gitService.repositories[0];
		const repoInfo = repo ? getGitHubRepoInfoFromContext(repo) : undefined;
		const nwo = repoInfo ? toGithubNwo(repoInfo.id) : (process.env.SWEBENCH_REPO ?? '');

		const queryText = query.queryText;
		const maxResults = sizing.maxResults ?? 20;

		this._logService.trace(`ScenarioAutomationWorkspaceChunkSearchService: searching for "${queryText}" in repo ${nwo}`);

		if (!nwo) {
			this._logService.error('ScenarioAutomationWorkspaceChunkSearchService: no repo NWO available (git has no remotes and SWEBENCH_REPO is unset)');
			return { chunks: [] };
		}

		const requestBody = {
			scoping_query: `repo:${nwo}`,
			prompt: truncateToMaxUtf8Length(queryText, 7800),
			include_embeddings: false,
			limit: maxResults,
			embedding_model: EmbeddingType.metis_1024_I16_Binary.id,
		};

		let response;
		const abortController = this._fetcherService.makeAbortController();
		const tokenListener = token.onCancellationRequested(() => abortController.abort());
		try {
			response = await this._fetcherService.fetch(BLACKBIRD_EMBEDDINGS_URL, {
				callSite: 'ScenarioAutomationWorkspaceChunkSearchService.searchFileChunks',
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
				signal: abortController.signal,
			});
		} catch (e) {
			if (token.isCancellationRequested || this._fetcherService.isAbortError(e)) {
				this._logService.trace('ScenarioAutomationWorkspaceChunkSearchService: search cancelled');
				return { chunks: [] };
			}
			this._logService.error(`ScenarioAutomationWorkspaceChunkSearchService: fetch failed: ${e instanceof Error ? e.message : e}`);
			return { chunks: [] };
		} finally {
			tokenListener.dispose();
		}

		if (!response.ok) {
			const errorBody = await response.text().catch(() => '<unable to read body>');
			this._logService.error(`ScenarioAutomationWorkspaceChunkSearchService: search failed with status ${response.status}, body: ${errorBody}`);
			return { chunks: [] };
		}

		if (token.isCancellationRequested) {
			return { chunks: [] };
		}

		let body: unknown;
		try {
			body = await response.json();
		} catch (e) {
			if (token.isCancellationRequested || this._fetcherService.isAbortError(e)) {
				this._logService.trace('ScenarioAutomationWorkspaceChunkSearchService: search cancelled');
				return { chunks: [] };
			}
			this._logService.error(`ScenarioAutomationWorkspaceChunkSearchService: failed to parse response JSON: ${e instanceof Error ? e.message : e}`);
			return { chunks: [] };
		}

		const parsedBody = body as Partial<BlackbirdSearchResponse>;
		if (!Array.isArray(parsedBody.results)) {
			this._logService.error('ScenarioAutomationWorkspaceChunkSearchService: unexpected response shape');
			return { chunks: [] };
		}

		const embeddingType = new EmbeddingType(parsedBody.embedding_model ?? EmbeddingType.metis_1024_I16_Binary.id);
		const chunks: FileChunkAndScore[] = [];
		for (const result of parsedBody.results) {
			const fileUri = repo?.rootUri
				? URI.joinPath(repo.rootUri, result.location.path)
				: URI.from({ scheme: 'githubRepoResult', path: '/' + result.location.path });

			if (!shouldInclude(fileUri, options.globPatterns)) {
				continue;
			}

			chunks.push({
				chunk: {
					file: fileUri,
					text: stripChunkTextMetadata(result.chunk.text),
					rawText: undefined,
					range: new Range(result.chunk.line_range.start, 0, result.chunk.line_range.end, 0),
					isFullFile: false,
				},
				distance: {
					embeddingType,
					value: result.distance,
				},
			});
		}

		this._logService.trace(`ScenarioAutomationWorkspaceChunkSearchService: got ${chunks.length} chunks`);
		return { chunks };
	}

	async triggerIndexing(_trigger: BuildIndexTriggerReason, _onProgress: (message: string) => void, _telemetryInfo: TelemetryCorrelationId, _token: CancellationToken): Promise<Result<true, TriggerIndexingError>> {
		return Result.ok(true);
	}

	async deleteExternalIngestWorkspaceIndex(): Promise<void> {
		// noop
	}

	dispose(): void {
		// noop
	}
}
