/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { shouldInclude } from '../../../util/common/glob';
import { Result } from '../../../util/common/result';
import { CallTracker, TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { createDecorator, IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { FileChunkAndScore } from '../../chunking/common/chunk';
import { stripChunkTextMetadata } from '../../chunking/common/chunkingStringUtils';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { IEnvService } from '../../env/common/envService';
import { AdoRepoId } from '../../git/common/gitService';
import { getGithubMetadataHeaders } from '../../github/common/githubApiFetcherService';
import { IIgnoreService } from '../../ignore/common/ignoreService';
import { measureExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { getRequest, postRequest } from '../../networking/common/networking';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { CodeSearchOptions, CodeSearchResult, RemoteCodeSearchError, RemoteCodeSearchIndexState, RemoteCodeSearchIndexStatus } from './remoteCodeSearch';


interface ResponseShape {
	readonly results: readonly SemanticSearchResult[];
	readonly embedding_model: string;
}

type SemanticSearchResult = {
	chunk: {
		hash: string;
		text: string;
		// Byte offset range of the chunk
		range: { start: number; end: number };
		line_range: { start: number; end: number };
		embedding?: { embedding: number[] };
	};
	distance: number;
	location: {
		path: string; // file path
		commit_sha: string;
		repo: {
			nwo: string;
			url: string;
		};
	};
};


export interface AdoCodeSearchRepoInfo {
	readonly adoRepoId: AdoRepoId;
	readonly localRepoRoot: URI | undefined;
	readonly indexedCommit: string | undefined;
}

export const IAdoCodeSearchService = createDecorator('IAdoCodeSearchService');

export interface IAdoCodeSearchService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeIndexState: Event<void>;

	/**
	 * Gets the state of the remote index for a given repo.
	 */
	getRemoteIndexState(
		auth: { readonly silent: boolean },
		repoId: AdoRepoId,
		token: CancellationToken,
	): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>>;

	/**
	 * Requests that a given repo be indexed.
	 */
	triggerIndexing(
		auth: { readonly silent: boolean },
		triggerReason: 'auto' | 'manual' | 'tool',
		repoId: AdoRepoId,
		telemetryInfo: TelemetryCorrelationId,
	): Promise<Result<true, RemoteCodeSearchError>>;

	/**
	 * Semantic searches a given repo for relevant code snippets
	 *
	 * The repo must have been indexed first. Make sure to check {@link getRemoteIndexState} or call {@link triggerIndexing}.
	 */
	searchRepo(
		auth: { readonly silent: boolean },
		repo: AdoCodeSearchRepoInfo,
		query: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<CodeSearchResult>;
}

/**
 * Ado currently uses their own scoring system for embeddings.
 */
const adoCustomEmbeddingScoreType = new EmbeddingType('adoCustomEmbeddingScore');

export class AdoCodeSearchService extends Disposable implements IAdoCodeSearchService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndexState = this._register(new Emitter<void>());
	public readonly onDidChangeIndexState = this._onDidChangeIndexState.event;

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvService private readonly _envService: IEnvService,
		@ILogService private readonly _logService: ILogService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	private getAdoAlmStatusUrl(repoId: AdoRepoId): string {
		return `https://almsearch.dev.azure.com/${repoId.org}/${repoId.project}/_apis/search/semanticsearchstatus/${repoId.repo}?api-version=7.1-preview`;
	}

	private getAdoAlmSearchUrl(repo: AdoRepoId): string {
		return `https://almsearch.dev.azure.com/${repo.org}/${repo.project}/_apis/search/embeddings?api-version=7.1-preview`;
	}

	async getRemoteIndexState(auth: { readonly silent: boolean }, repoId: AdoRepoId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		return measureExecTime(() => this.getRemoteIndexStateImpl(auth, repoId, token), (execTime, status, result) => {
			/* __GDPR__
				"adoCodeSearch.getRemoteIndexState" : {
					"owner": "mjbvz",
					"comment": "Information about failed remote index state requests",
					"status": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "If the call succeeded or failed" },
					"ok": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Details on successful calls" },
					"err": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Details on failed calls" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Time in milliseconds that the call took" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('adoCodeSearch.getRemoteIndexState', {
				status,
				ok: result?.isOk() ? result.val.status : undefined,
				error: result?.isError() ? result.err.type : undefined,
			}, {
				execTime
			});
		});
	}

	private async getRemoteIndexStateImpl(auth: { readonly silent: boolean }, repoId: AdoRepoId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		const authToken = await this.getAdoAuthToken(auth.silent);
		if (!authToken) {
			this._logService.error(`AdoCodeSearchService::getRemoteIndexState(${repoId}). Failed to fetch indexing status. No valid ADO auth token.`);
			return Result.error<RemoteCodeSearchError>({ type: 'not-authorized' });
		}

		const endpoint = this.getAdoAlmStatusUrl(repoId);

		const additionalHeaders = {
			Accept: 'application/json',
			Authorization: `Basic ${authToken}`,
			'Content-Type': 'application/json',
			...getGithubMetadataHeaders(new CallTracker('AdoCodeSearchService::getRemoteIndexState'), this._envService)
		};

		const result = await raceCancellationError(
			this._instantiationService.invokeFunction(getRequest, {
				endpointOrUrl: endpoint,
				secretKey: authToken,
				intent: 'copilot-panel',
				requestId: '',
				additionalHeaders,
				cancelToken: token,
			}),
			token);

		if (!result.ok) {
			/* __GDPR__
				"adoCodeSearch.getRemoteIndexState.requestError" : {
					"owner": "mjbvz",
					"comment": "Information about failed remote index state requests",
					"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('adoCodeSearch.getRemoteIndexState.requestError', {}, {
				statusCode: result.status,
			});

			if (result.status === 401 || result.status === 403) {
				return Result.error<RemoteCodeSearchError>({ type: 'not-authorized' });
			}

			return Result.error<RemoteCodeSearchError>({ type: 'generic-error', error: new Error(`ADO code search index status request failed with status: ${result.status}`) });
		}
		type AdoIndexStatusResponse = {
			semanticSearchEnabled: boolean;
			id: string;
			name: string;
			indexedBranches: {
				name: string;
				lastIndexedChangeId: string;
				lastProcessedTime: string;
			}[];
		};

		const body: AdoIndexStatusResponse = await result.json();
		if (!body.semanticSearchEnabled) {
			return Result.ok<RemoteCodeSearchIndexState>({
				status: RemoteCodeSearchIndexStatus.NotIndexable,
			});
		}

		const indexedCommit = body.indexedBranches.at(0)?.lastIndexedChangeId;

		return Result.ok<RemoteCodeSearchIndexState>({
			indexedCommit,
			status: RemoteCodeSearchIndexStatus.Ready,
		});
	}

	public async triggerIndexing(
		auth: { readonly silent: boolean },
		_triggerReason: 'auto' | 'manual' | 'tool',
		repoId: AdoRepoId,
		telemetryInfo: TelemetryCorrelationId,
	): Promise<Result<true, RemoteCodeSearchError>> {
		// ADO doesn't support explicit indexing. Just use the status and assume it's always ready
		const status = await this.getRemoteIndexState(auth, repoId, CancellationToken.None);
		if (status.isOk()) {
			return Result.ok(true);
		}

		return status;
	}

	async searchRepo(
		auth: { readonly silent: boolean },
		repo: AdoCodeSearchRepoInfo,
		searchQuery: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken
	): Promise<CodeSearchResult> {
		const totalSw = new StopWatch();

		const authToken = await this.getAdoAuthToken(auth.silent);
		if (!authToken) {
			this._logService.error(`AdoCodeSearchService::searchRepo(${repo.adoRepoId}). Failed to search repo. No valid ADO auth token.`);
			throw new Error('No valid auth token');
		}

		let endpoint = this._configurationService.getConfig(ConfigKey.Advanced.WorkspacePrototypeAdoCodeSearchEndpointOverride);
		if (!endpoint) {
			endpoint = this.getAdoAlmSearchUrl(repo.adoRepoId);
		}
		const additionalHeaders = {
			Accept: 'application/json',
			Authorization: `Basic ${authToken}`,
			'Content-Type': 'application/json',
			...getGithubMetadataHeaders(new CallTracker('AdoCodeSearchService::searchRepo'), this._envService)
		};

		const requestSw = new StopWatch();
		const response = await raceCancellationError(
			this._instantiationService.invokeFunction(postRequest, {
				endpointOrUrl: endpoint,
				secretKey: authToken,
				intent: 'copilot-panel',
				requestId: '',
				body: {
					// TODO: Unclear what's ADO's actual limit is
					prompt: searchQuery.slice(0, 10000),
					scoping_query: `repo:${repo.adoRepoId.project}/${repo.adoRepoId.repo}`,
					limit: maxResults,
				} satisfies {
					prompt: string;
					scoping_query: string;
					limit: number;
				},
				additionalHeaders,
				cancelToken: token,
			}),
			token);

		const requestExecTime = requestSw.elapsed();

		if (!response.ok) {
			/* __GDPR__
				"adoCodeSearch.searchRepo.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed code ado searches",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" },
					"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The total time for the search call" },
					"requestExecTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The request execution time" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('adoCodeSearch.searchRepo.error', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				statusCode: response.status,
				execTime: totalSw.elapsed(),
				requestExecTime: requestExecTime,
			});

			this._logService.trace(`AdoCodeSearchService::searchRepo: Failed. Status code: ${response.status}`);

			throw new Error(`Ado code search semantic search failed with status: ${response.status}`);
		}

		const body: ResponseShape = await raceCancellationError(response.json(), token);
		if (!Array.isArray(body.results)) {
			throw new Error(`Code search semantic search unexpected response json shape`);
		}
		const rawResultCount = body.results.length;

		const returnedEmbeddingsType = body.embedding_model ? new EmbeddingType(body.embedding_model) : adoCustomEmbeddingScoreType;

		const outChunks: FileChunkAndScore[] = [];
		let outOfSync = false;
		await Promise.all(body.results.map(async (result: SemanticSearchResult): Promise<FileChunkAndScore | undefined> => {
			let fileUri: URI;
			if (repo.localRepoRoot) {
				fileUri = URI.joinPath(repo.localRepoRoot, result.location.path.replace('%repo%/', ''));
				if (await this._ignoreService.isCopilotIgnored(fileUri)) {
					return;
				}
			} else {
				// Non-local repo, make up a URI
				fileUri = URI.from({
					scheme: 'githubRepoResult',
					path: '/' + result.location.path
				});
			}

			if (!shouldInclude(fileUri, options.globPatterns)) {
				return;
			}

			outOfSync ||= !!repo.indexedCommit && result.location.commit_sha !== repo.indexedCommit;

			outChunks.push({
				chunk: {
					file: fileUri,
					text: stripChunkTextMetadata(result.chunk.text),
					rawText: undefined,
					range: new Range(result.chunk.line_range.start, 0, result.chunk.line_range.end, 0),
					isFullFile: false, // TODO: not provided
				},
				distance: {
					embeddingType: returnedEmbeddingsType,
					value: result.distance,
				}
			});
		}));

		/* __GDPR__
			"adoCodeSearch.searchRepo.success" : {
				"owner": "mjbvz",
				"comment": "Information about successful ado code search searches",
				"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
				"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
				"resultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of returned chunks from the search after filtering" },
				"rawResultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Original number of returned chunks from the search before filtering" },
				"resultOutOfSync": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Tracks if the commit we think code search has indexed matches the commit code search returns results from" },
				"execTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The total time for the search call" },
				"requestExecTime": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The request execution time" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('adoCodeSearch.searchRepo.success', {
			workspaceSearchSource: telemetryInfo.callTracker.toString(),
			workspaceSearchCorrelationId: telemetryInfo.correlationId,
		}, {
			resultCount: body.results.length,
			rawResultCount,
			resultOutOfSync: outOfSync ? 1 : 0,
			execTime: totalSw.elapsed(),
			requestExecTime: requestExecTime,
		});

		this._logService.trace(`AdoCodeSearchService::searchRepo: Returning ${outChunks.length} chunks. Raw result count: ${rawResultCount}`);
		return { chunks: outChunks, outOfSync };
	}

	private getAdoAuthToken(silent: boolean): Promise<string | undefined> {
		return this._authenticationService.getAdoAccessTokenBase64({ silent });
	}
}
