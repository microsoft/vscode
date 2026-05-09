/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RequestType } from '@vscode/copilot-api';
import { shouldInclude } from '../../../util/common/glob';
import { Result } from '../../../util/common/result';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { createDecorator, IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { FileChunk, FileChunkAndScore } from '../../chunking/common/chunk';
import { stripChunkTextMetadata, truncateToMaxUtf8Length } from '../../chunking/common/chunkingStringUtils';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IEnvService } from '../../env/common/envService';
import { GithubRepoId, toGithubNwo } from '../../git/common/gitService';
import { makeGitHubAPIRequest } from '../../github/common/githubAPI';
import { getGithubMetadataHeaders } from '../../github/common/githubApiFetcherService';
import { IIgnoreService } from '../../ignore/common/ignoreService';
import { ILogService } from '../../log/common/logService';
import { IFetcherService, Response } from '../../networking/common/fetcherService';
import { postRequest } from '../../networking/common/networking';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { CodeSearchOptions, LexicalCodeSearchResult, RemoteCodeSearchError, RemoteCodeSearchIndexState, RemoteCodeSearchIndexStatus, SemanticCodeSearchResult } from './remoteCodeSearch';


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
		ref_name: string;
		repo: {
			nwo: string;
			url: string;
		};
	};
};

export interface GithubCodeSearchRepoInfo {
	readonly kind: 'repo';
	readonly githubRepoId: GithubRepoId;
	readonly localRepoRoot: URI | undefined;
	readonly indexedCommit: string | undefined;
}

export interface GithubCodeSearchOrgInfo {
	readonly kind: 'org';
	readonly org: string;
}

export type GithubCodeSearchScope = GithubCodeSearchRepoInfo | GithubCodeSearchOrgInfo;

export const IGithubCodeSearchService = createDecorator('IGithubCodeSearchService');

export interface IGithubCodeSearchService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets the state of the remote index for a given repo.
	 */
	getRemoteIndexState(
		authOptions: { readonly silent: boolean },
		githubRepoId: GithubRepoId,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>>;

	/**
	 * Requests that a given repo be indexed.
	 */
	triggerIndexing(
		authOptions: { readonly silent: boolean },
		triggerReason: 'auto' | 'manual' | 'tool',
		githubRepoId: GithubRepoId,
		telemetryInfo: TelemetryCorrelationId,
	): Promise<Result<true, RemoteCodeSearchError>>;

	/**
	 * Semantic searches a given github repo for relevant code snippets
	 *
	 * The repo must have been indexed first. Make sure to check {@link getRemoteIndexState} or call {@link triggerIndexing}.
	 */
	semanticSearch(
		authOptions: { readonly silent: boolean },
		embeddingType: EmbeddingType,
		scope: GithubCodeSearchRepoInfo,
		query: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<SemanticCodeSearchResult>;

	/**
	 * Lexical searches a given github repo or org for relevant code snippets
	 */
	lexicalSearch(
		authOptions: { readonly silent: boolean },
		scope: GithubCodeSearchScope,
		query: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken,
	): Promise<LexicalCodeSearchResult>;
}

export class GithubCodeSearchService implements IGithubCodeSearchService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IEnvService private readonly _envService: IEnvService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	async getRemoteIndexState(auth: { readonly silent: boolean }, githubRepoId: GithubRepoId, telemetryInfo: TelemetryCorrelationId, token: CancellationToken): Promise<Result<RemoteCodeSearchIndexState, RemoteCodeSearchError>> {
		const repoNwo = toGithubNwo(githubRepoId);

		if (repoNwo.startsWith('microsoft/simuluation-test-')) {
			return Result.ok({ status: RemoteCodeSearchIndexStatus.NotYetIndexed });
		}

		const authToken = await this.getGithubAccessToken(auth.silent);
		if (!authToken) {
			this._logService.error(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Failed to fetch indexing status. No valid github auth token.`);
			return Result.error<RemoteCodeSearchError>({ type: 'not-authorized' });
		}

		try {
			const statusRequest = await raceCancellationError(this._capiClientService.makeRequest<Response>({
				method: 'GET',
				headers: {
					Authorization: `Bearer ${authToken}`,
					...getGithubMetadataHeaders(telemetryInfo.callTracker, this._envService),
				}
			}, { type: RequestType.EmbeddingsIndex, repoWithOwner: repoNwo }), token);
			if (!statusRequest.ok) {
				/* __GDPR__
					"githubCodeSearch.getRemoteIndexState.error" : {
						"owner": "mjbvz",
						"comment": "Information about failed remote index state requests",
						"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.getRemoteIndexState.error', {}, {
					statusCode: statusRequest.status,
				});

				this._logService.error(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Failed to fetch indexing status. Response: ${statusRequest.status}. ${await statusRequest.text()}`);
				return Result.error<RemoteCodeSearchError>({ type: 'generic-error', error: new Error(`Failed to fetch indexing status. Response: ${statusRequest.status}.`) });
			}

			const preCheckResult = await raceCancellationError(statusRequest.json(), token);
			if (preCheckResult.semantic_code_search_ok && preCheckResult.semantic_commit_sha) {
				const indexedCommit = preCheckResult.semantic_commit_sha;
				this._logService.trace(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Found indexed commit: ${indexedCommit}.`);
				return Result.ok({
					status: RemoteCodeSearchIndexStatus.Ready,
					indexedCommit,
				});
			}

			if (preCheckResult.semantic_indexing_enabled) {
				if (await raceCancellationError(this.isEmptyRepo(authToken, githubRepoId, token), token)) {
					this._logService.trace(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Semantic indexing enabled but repo is empty.`);
					return Result.ok({
						status: RemoteCodeSearchIndexStatus.Ready,
						indexedCommit: undefined
					});
				}

				this._logService.trace(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Semantic indexing enabled but not yet indexed.`);

				return Result.ok({ status: RemoteCodeSearchIndexStatus.BuildingIndex });
			} else {
				this._logService.trace(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). semantic_indexing_enabled was false. Repo not yet indexed but possibly can be.`);
				return Result.ok({ status: RemoteCodeSearchIndexStatus.NotYetIndexed });
			}
		} catch (e: unknown) {
			if (isCancellationError(e)) {
				throw e;
			}

			this._logService.error(`GithubCodeSearchService::getRemoteIndexState(${repoNwo}). Error: ${e}`);
			return Result.error<RemoteCodeSearchError>({ type: 'generic-error', error: e instanceof Error ? e : new Error(String(e)) });
		}
	}

	public async triggerIndexing(
		auth: { readonly silent: boolean },
		triggerReason: 'auto' | 'manual' | 'tool',
		githubRepoId: GithubRepoId,
		telemetryInfo: TelemetryCorrelationId,
	): Promise<Result<true, RemoteCodeSearchError>> {
		const authToken = await this.getGithubAccessToken(auth.silent);
		if (!authToken) {
			return Result.error({ type: 'not-authorized' });
		}

		const response = await this._capiClientService.makeRequest<Response>({
			method: 'POST',
			headers: {
				Authorization: `Bearer ${authToken}`,
				...getGithubMetadataHeaders(telemetryInfo.callTracker, this._envService),
			},
			body: JSON.stringify({
				auto: triggerReason === 'auto',
			})
		}, { type: RequestType.EmbeddingsIndex, repoWithOwner: toGithubNwo(githubRepoId) });

		if (!response.ok) {
			this._logService.error(`GithubCodeSearchService.triggerIndexing(${triggerReason}). Failed to request indexing for '${githubRepoId}'. Response: ${response.status}. ${await response.text()}`);

			/* __GDPR__
				"githubCodeSearch.triggerIndexing.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed trigger indexing requests",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"triggerReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Reason why the indexing was triggered" },
					"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.triggerIndexing.error', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
				triggerReason
			}, {
				statusCode: response.status,
			});

			return Result.error({ type: 'generic-error', error: new Error(`Failed to request indexing for '${githubRepoId}'. Response: ${response.status}.`) });
		}

		/* __GDPR__
			"githubCodeSearch.getRemoteIndexState.success" : {
				"owner": "mjbvz",
				"comment": "Information about failed remote index state requests",
				"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
				"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
				"triggerReason": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Reason why the indexing was triggered" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.getRemoteIndexState.success', {
			workspaceSearchSource: telemetryInfo.callTracker.toString(),
			workspaceSearchCorrelationId: telemetryInfo.correlationId,
			triggerReason,
		}, {});

		return Result.ok(true);
	}

	async semanticSearch(
		auth: { readonly silent: boolean },
		embeddingType: EmbeddingType,
		repo: GithubCodeSearchRepoInfo,
		searchQuery: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken
	): Promise<SemanticCodeSearchResult> {
		const authToken = await this.getGithubAccessToken(auth.silent);
		if (!authToken) {
			throw new Error('No valid auth token');
		}

		const response = await raceCancellationError(
			this._instantiationService.invokeFunction(postRequest, {
				endpointOrUrl: { type: RequestType.EmbeddingsCodeSearch },
				secretKey: authToken,
				intent: 'copilot-panel',
				requestId: '',
				body: {
					scoping_query: `repo:${toGithubNwo(repo.githubRepoId)}`,
					// The semantic search endpoint only supports prompts of up to 8k bytes (in utf8)
					// For now just truncate but we should consider a better way to handle this, such as having a model
					// generate a short prompt
					prompt: truncateToMaxUtf8Length(searchQuery, 7800),
					include_embeddings: false,
					limit: maxResults,
					embedding_model: embeddingType.id,
				} satisfies {
					scoping_query: string;
					prompt: string;
					include_embeddings: boolean;
					limit: number;
					embedding_model: string;
				} as any,
				additionalHeaders: getGithubMetadataHeaders(telemetryInfo.callTracker, this._envService),
				cancelToken: token,
			}),
			token);

		if (!response.ok) {
			/* __GDPR__
				"githubCodeSearch.searchRepo.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed code searches",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
					"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.searchRepo.error', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			}, {
				statusCode: response.status,
			});

			throw new Error(`Code search semantic search failed with status: ${response.status}`);
		}

		const body = await raceCancellationError(response.json(), token);
		if (!Array.isArray(body.results)) {
			throw new Error(`Code search semantic search unexpected response json shape`);
		}

		const result = await raceCancellationError(parseGithubCodeSearchResponse(body, repo, options, this._ignoreService), token);

		/* __GDPR__
			"githubCodeSearch.searchRepo.success" : {
				"owner": "mjbvz",
				"comment": "Information about successful code searches",
				"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
				"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
				"resultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of returned chunks from the search" },
				"resultOutOfSync": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Tracks if the commit we think code search has indexed matches the commit code search returns results from" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.searchRepo.success', {
			workspaceSearchSource: telemetryInfo.callTracker.toString(),
			workspaceSearchCorrelationId: telemetryInfo.correlationId,
		}, {
			resultCount: body.results.length,
			resultOutOfSync: result.outOfSync ? 1 : 0,
		});

		return result;
	}

	async lexicalSearch(
		auth: { readonly silent: boolean },
		scope: GithubCodeSearchScope,
		query: string,
		maxResults: number,
		options: CodeSearchOptions,
		telemetryInfo: TelemetryCorrelationId,
		token: CancellationToken
	): Promise<LexicalCodeSearchResult> {
		const authToken = await this.getGithubAccessToken(auth.silent);
		if (!authToken) {
			throw new Error('No valid auth token');
		}

		const scopeQualifier = scope.kind === 'org' ? `org:${scope.org}` : `repo:${toGithubNwo(scope.githubRepoId)}`;
		const searchQuery = `${query} ${scopeQualifier}`;
		const routeSlug = `search/code?q=${encodeURIComponent(searchQuery)}&per_page=${maxResults}`;

		const body = await raceCancellationError(makeGitHubAPIRequest(
			this._fetcherService,
			this._logService,
			this._telemetryService,
			this._capiClientService.dotcomAPIURL,
			routeSlug,
			'GET',
			authToken,
			{
				accept: 'application/vnd.github.text-match+json',
				additionalHeaders: getGithubMetadataHeaders(telemetryInfo.callTracker, this._envService),
				callSite: 'github-code-search-lexical',
			},
		), token);

		if (!body) {
			/* __GDPR__
				"githubCodeSearch.lexicalSearch.error" : {
					"owner": "mjbvz",
					"comment": "Information about failed lexical code searches",
					"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
					"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.lexicalSearch.error', {
				workspaceSearchSource: telemetryInfo.callTracker.toString(),
				workspaceSearchCorrelationId: telemetryInfo.correlationId,
			});

			throw new Error(`Code search lexical search failed`);
		}
		if (!Array.isArray(body.items)) {
			throw new Error(`Code search lexical search unexpected response json shape`);
		}

		const result = await raceCancellationError(parseLexicalSearchResponse(body, scope, options, this._ignoreService), token);

		/* __GDPR__
			"githubCodeSearch.lexicalSearch.success" : {
				"owner": "mjbvz",
				"comment": "Information about successful lexical code searches",
				"workspaceSearchSource": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Caller of the search" },
				"workspaceSearchCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight",  "comment": "Correlation id for the search" },
				"resultCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of returned items from the search" }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('githubCodeSearch.lexicalSearch.success', {
			workspaceSearchSource: telemetryInfo.callTracker.toString(),
			workspaceSearchCorrelationId: telemetryInfo.correlationId,
		}, {
			resultCount: body.items.length,
		});

		return result;
	}

	private async getGithubAccessToken(silent: boolean) {
		return (await this._authenticationService.getGitHubSession('permissive', { silent }))?.accessToken
			?? (await this._authenticationService.getGitHubSession('any', { silent }))?.accessToken;
	}


	private async isEmptyRepo(authToken: string, githubRepoId: GithubRepoId, token: CancellationToken): Promise<boolean> {
		const response = await raceCancellationError(fetch(this._capiClientService.dotcomAPIURL + `/repos/${toGithubNwo(githubRepoId)}`, {
			headers: {
				'Authorization': `Bearer ${authToken}`,
				'Accept': 'application/vnd.github.v3+json'
			}
		}), token);

		if (!response.ok) {
			this._logService.error(`GithubCodeSearchService.isEmptyRepo(${toGithubNwo(githubRepoId)}). Failed to fetch repo info. Response: ${response.status}. ${await response.text()}`);
			return false;
		}

		const data: any = await response.json();

		// Check multiple indicators of an empty repo:
		// - size of 0 indicates no content
		// - missing default_branch often means no commits
		return data.size === 0 || !data.default_branch;
	}
}

export async function parseGithubCodeSearchResponse(body: ResponseShape, repo: GithubCodeSearchRepoInfo, options: CodeSearchOptions & { skipVerifyRepo?: boolean }, ignoreService: IIgnoreService): Promise<SemanticCodeSearchResult> {
	let outOfSync = false;
	const outChunks: FileChunkAndScore[] = [];

	const embeddingsType = new EmbeddingType(body.embedding_model);

	await Promise.all(body.results.map(async (result): Promise<FileChunkAndScore | undefined> => {
		if (!options.skipVerifyRepo && result.location.repo.nwo.toLowerCase() !== toGithubNwo(repo.githubRepoId)) {
			return;
		}

		let fileUri: URI;
		if (repo.localRepoRoot) {
			fileUri = URI.joinPath(repo.localRepoRoot, result.location.path);
			if (await ignoreService.isCopilotIgnored(fileUri)) {
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
				isFullFile: false, // TODO: get this from github
			},
			distance: {
				embeddingType: embeddingsType,
				value: result.distance,
			}
		});
	}));

	// Extract the remote URL and ref name from the first result
	const firstResult = body.results[0];
	let remoteUrl: string | undefined;
	let refName: string | undefined;
	if (firstResult) {
		// Derive the web URL from the API URL (e.g. https://api.github.com/repos/o/r -> https://github.com/o/r)
		const apiUrl = firstResult.location.repo.url;
		const nwo = firstResult.location.repo.nwo;
		try {
			const parsed = URI.parse(apiUrl);
			const host = parsed.authority === 'api.github.com' ? 'github.com' : parsed.authority.replace(/^api\./, '');
			remoteUrl = `https://${host}/${nwo}`;
		} catch {
			// Fall back to constructing from nwo
			remoteUrl = `https://github.com/${nwo}`;
		}

		// Extract branch name from ref_name (e.g. "refs/heads/main" -> "main")
		const rawRef = firstResult.location.ref_name;
		if (rawRef?.startsWith('refs/heads/')) {
			refName = rawRef.slice('refs/heads/'.length);
		} else if (rawRef) {
			refName = rawRef;
		}
	}

	return { chunks: outChunks, outOfSync, remoteUrl, refName };
}

interface LexicalSearchResponseShape {
	readonly total_count: number;
	readonly incomplete_results: boolean;
	readonly items: readonly LexicalSearchItem[];
}

type LexicalSearchItem = {
	readonly path: string;
	readonly repository: {
		readonly full_name: string;
	};
	readonly text_matches?: readonly {
		readonly fragment: string;
		readonly matches: readonly { readonly text: string; readonly indices: readonly [number, number] }[];
		readonly object_type: string;
		readonly property: string;
	}[];
	readonly score: number;
};

export async function parseLexicalSearchResponse(body: LexicalSearchResponseShape, scope: GithubCodeSearchScope & { skipVerifyRepo?: boolean }, options: CodeSearchOptions & { skipVerifyRepo?: boolean }, ignoreService: IIgnoreService): Promise<LexicalCodeSearchResult> {
	const outChunks: FileChunk[] = [];

	await Promise.all(body.items.map(async (item): Promise<void> => {
		if (!options.skipVerifyRepo && scope.kind === 'repo' && item.repository.full_name.toLowerCase() !== toGithubNwo(scope.githubRepoId)) {
			return;
		}
		if (!options.skipVerifyRepo && scope.kind === 'org' && item.repository.full_name.toLowerCase().split('/')[0] !== scope.org.toLowerCase()) {
			return;
		}

		const localRepoRoot = scope.kind === 'repo' ? scope.localRepoRoot : undefined;
		let fileUri: URI;
		if (localRepoRoot) {
			fileUri = URI.joinPath(localRepoRoot, item.path);
			if (await ignoreService.isCopilotIgnored(fileUri)) {
				return;
			}
		} else {
			fileUri = URI.from({
				scheme: 'githubRepoResult',
				path: '/' + item.repository.full_name + '/' + item.path
			});
		}

		if (!shouldInclude(fileUri, options.globPatterns)) {
			return;
		}

		const textMatches = item.text_matches?.filter(m => m.property === 'content');
		if (textMatches && textMatches.length > 0) {
			for (const match of textMatches) {
				outChunks.push({
					file: fileUri,
					text: match.fragment,
					rawText: undefined,
					range: new Range(0, 0, 0, 0),
					isFullFile: false,
				});
			}
		} else {
			// No text matches, include the file as a whole-file result
			outChunks.push({
				file: fileUri,
				text: '',
				rawText: undefined,
				range: new Range(0, 0, 0, 0),
				isFullFile: true,
			});
		}
	}));

	return { chunks: outChunks, outOfSync: false };
}
