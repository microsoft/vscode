/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';
import { ChatLocation } from '../../../platform/chat/common/commonTypes';
import { FileChunk } from '../../../platform/chunking/common/chunk';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { RelativePattern } from '../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { TreeSitterExpressionInfo } from '../../../platform/parser/node/nodes';
import { IParserService } from '../../../platform/parser/node/parserService';
import { ISearchService } from '../../../platform/search/common/searchService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { IRerankerService } from '../../../platform/workspaceChunkSearch/common/rerankerService';
import { IWorkspaceChunkSearchService } from '../../../platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { TelemetryCorrelationId } from '../../../util/common/telemetryCorrelationId';
import { raceCancellation } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import * as strings from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { AISearchKeyword, ChatResponseReferencePart, ChatLocation as DeprecatedChatLocation, Position, TextSearchMatch2, Range as VSCodeRange } from '../../../vscodeTypes';
import { IIntentService } from '../../intents/node/intentService';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { ISearchPanelKeywordsPromptContext } from '../../prompts/node/panel/searchPanelKeywordsPrompt';
import { ISearchPanelPromptContext } from '../../prompts/node/panel/searchPanelPrompt';
import { MAX_CHUNK_TOKEN_COUNT, MAX_CHUNKS_RESULTS } from '../../prompts/node/panel/workspace/workspaceContext';
import { combinedRanking, combineRankingInsights } from './combinedRank';

export interface ISearchFeedbackTelemetry {
	chunkCount: number;
	rankResult: string;
	rankResultsCount: number;
	combinedResultsCount: number;
	chunkSearchDuration: number;
	llmFilteringDuration: number;
	llmBestRank?: number;
	llmWorstRank?: number;
	llmSelectedCount?: number;
	rawLlmRankingResultsCount?: number;
	parseResult?: string;

	llmBestInRerank?: number;
	llmWorstInRerank?: number;
}

export const enum SearchFeedbackKind {
	Helpful = 'helpful',
	Unhelpful = 'unhelpful',
	Feedback = 'feedback',
}

export interface IRankResult {
	file: string;
	query: string;
}

export class SemanticSearchTextSearchProvider implements vscode.AITextSearchProvider {
	private _endpoint: IChatEndpoint | undefined = undefined;
	public readonly name: string = 'Copilot';
	public static feedBackSentKey = 'github.copilot.search.feedback.sent';
	public static latestQuery: string | undefined = undefined;
	public static feedBackTelemetry: Partial<ISearchFeedbackTelemetry> = {};

	constructor(
		@IEndpointProvider private _endpointProvider: IEndpointProvider,
		@IWorkspaceChunkSearchService private readonly workspaceChunkSearch: IWorkspaceChunkSearchService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IIntentService private readonly _intentService: IIntentService,
		@IRunCommandExecutionService private readonly _commandService: IRunCommandExecutionService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IParserService private readonly _parserService: IParserService,
		@IRerankerService private readonly _rerankerService: IRerankerService,
	) { }

	private async getEndpoint() {
		this._endpoint = this._endpoint ?? await this._endpointProvider.getChatEndpoint('copilot-fast');
		return this._endpoint;
	}

	private resetFeedbackContext() {
		this._commandService.executeCommand('setContext', SemanticSearchTextSearchProvider.feedBackSentKey, false);
	}

	private getPreviewRange(previewText?: string, symbolsToHighlight?: TreeSitterExpressionInfo[] | undefined): VSCodeRange {
		if (!previewText) {
			return new VSCodeRange(new Position(0, 0), new Position(0, 0));
		}
		if (symbolsToHighlight && symbolsToHighlight.length > 0) {
			// Find the first symbol that actually exists in the previewText
			for (const symbol of symbolsToHighlight) {
				const index = previewText.indexOf(symbol.text);
				if (index !== -1) {
					return new VSCodeRange(
						new Position(0, index),
						new Position(0, index + symbol.text.length)
					);
				}
			}
			// If no symbol is found, fall through to default below
		}
		const firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(previewText);
		const startIndex = firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex !== previewText.length ?
			firstNonWhitespaceIndex : 0;

		return new VSCodeRange(
			new Position(0, startIndex),
			new Position(0, previewText.length)
		);
	}

	provideAITextSearchResults(query: string, options: vscode.TextSearchProviderOptions, progress: vscode.Progress<vscode.TextSearchResult2>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextSearchComplete2> {
		this.resetFeedbackContext();
		const sw = new StopWatch();
		const getResults = async () => {
			const chatProgress: vscode.Progress<ChatResponseReferencePart | vscode.ChatResponseProgressPart> = {
				report(_obj) { }
			};
			this._logService.trace(`Starting semantic search for ${query}`);
			SemanticSearchTextSearchProvider.latestQuery = query;
			const includes = new Set<vscode.GlobPattern>();
			const excludes = new Set<vscode.GlobPattern>();
			for (const folder of options.folderOptions) {
				if (folder.includes) {
					folder.includes.forEach(e => {
						if (!e.startsWith('*')) {
							includes.add(new RelativePattern(folder.folder, e));
						} else {
							includes.add(e);
						}
					});
				}
				if (folder.excludes) {
					folder.excludes.forEach(e => {
						if (typeof e === 'string' && !e.startsWith('*')) {
							excludes.add(new RelativePattern(folder.folder, e));
						} else {
							excludes.add(e);
						}
					});
				}
			}
			let searchResult = '';
			const chunkSearchDuration = Date.now();
			const result = await this.workspaceChunkSearch.searchFileChunks(
				{
					endpoint: await this.getEndpoint(),
					tokenBudget: MAX_CHUNK_TOKEN_COUNT,
					maxResults: MAX_CHUNKS_RESULTS,
				},
				{
					queryText: query,
				},
				{
					globPatterns: {
						include: includes.size > 0 ? Array.from(includes) : undefined,
						exclude: excludes.size > 0 ? Array.from(excludes) : undefined,
					},
				},
				new TelemetryCorrelationId('copilotSearchPanel'),
				chatProgress,
				token,
			);
			SemanticSearchTextSearchProvider.feedBackTelemetry.chunkSearchDuration = Date.now() - chunkSearchDuration;
			SemanticSearchTextSearchProvider.feedBackTelemetry.chunkCount = result.chunks.length;
			this.treeSitterAIKeywords(query, progress, result.chunks.map(chunk => chunk.chunk), token);

			const chunkResults = result.chunks.map(c => c.chunk);
			const intent = this._intentService.getIntent('searchPanel', ChatLocation.Other);
			if (intent) {
				const request: vscode.ChatRequest = {
					location: DeprecatedChatLocation.Panel,
					location2: undefined,
					command: 'searchPanel',
					prompt: '',
					references: [],
					attempt: 0,
					enableCommandDetection: false,
					isParticipantDetected: false,
					toolReferences: [],
					toolInvocationToken: undefined as never,
					model: null!,
					tools: new Map(),
					id: '1',
					sessionId: '1',
					sessionResource: URI.parse('chat:/1'),
					hasHooksEnabled: false,
				};
				const intentInvocation = await intent.invoke({ location: ChatLocation.Other, request });
				const progress: vscode.Progress<ChatResponseReferencePart | vscode.ChatResponseProgressPart> = {
					report(_obj) { }
				};
				const buildPromptContext: ISearchPanelPromptContext = {
					query,
					history: [],
					chatVariables: new ChatVariablesCollection([]),
					tools: { toolReferences: [], toolInvocationToken: undefined as never, availableTools: [] },
					chunkResults,
				};
				const prompt = await intentInvocation.buildPrompt(buildPromptContext, progress, token);

				const llmFilteringDuration = Date.now();
				const fetchResult = await intentInvocation.endpoint.makeChatRequest(
					'searchPanel',
					prompt.messages,
					async (text, _, delta) => {
						return undefined;
					},
					token,
					ChatLocation.Other,
					undefined,
					{
						temperature: 0.1,
					},
					false,
					{
						messageId: generateUuid(),
						messageSource: 'search.workspace'
					},
				);
				SemanticSearchTextSearchProvider.feedBackTelemetry.llmFilteringDuration = Date.now() - llmFilteringDuration;
				searchResult = fetchResult.type === 'success' ? fetchResult.value : (fetchResult.type === 'length' ? fetchResult.truncatedValue : '');
				SemanticSearchTextSearchProvider.feedBackTelemetry.rankResult = fetchResult.type;
			}

			searchResult = searchResult.replace(/```(?:json)?/g, '').trim();
			let rankingResults: IRankResult[] = [];
			try {
				rankingResults = JSON.parse(searchResult) as IRankResult[];
				SemanticSearchTextSearchProvider.feedBackTelemetry.parseResult = 'success';
			} catch (error) {
				SemanticSearchTextSearchProvider.feedBackTelemetry.parseResult = 'failed';
			}
			SemanticSearchTextSearchProvider.feedBackTelemetry.rawLlmRankingResultsCount = rankingResults.length;

			const combinedRank = combinedRanking([...result.chunks], rankingResults);
			SemanticSearchTextSearchProvider.feedBackTelemetry.rankResultsCount = rankingResults.length;
			SemanticSearchTextSearchProvider.feedBackTelemetry.combinedResultsCount = combinedRank.length;

			if (rankingResults.length > 0) {
				const rankingInsights = combineRankingInsights([...result.chunks], rankingResults);
				SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank = rankingInsights.llmBestRank;
				SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank = rankingInsights.llmWorstRank;
				SemanticSearchTextSearchProvider.feedBackTelemetry.llmSelectedCount = combinedRank.filter(chunk => chunk.llmSelected).length;
			}

			const combinedChunks = combinedRank.map(chunk => chunk.chunk);
			await this.reportSearchResults(rankingResults, combinedChunks, progress, token);

			// call workspace chunk search service with options to do reranking
			if (this._rerankerService.isAvailable) {
				try {
					this.workspaceChunkSearch.searchFileChunks(
						{
							endpoint: await this.getEndpoint(),
							tokenBudget: MAX_CHUNK_TOKEN_COUNT,
							maxResults: MAX_CHUNKS_RESULTS,
						},
						{
							queryText: query,
						},
						{
							globPatterns: {
								include: includes.size > 0 ? Array.from(includes) : undefined,
								exclude: excludes.size > 0 ? Array.from(excludes) : undefined,
							},
							enableRerank: true
						},
						new TelemetryCorrelationId('copilotSearchPanel'),
						chatProgress,
						token,
					).then(rerankResult => {
						if (rerankResult && rankingResults.length > 0) {
							const rerankInsights = combineRankingInsights([...rerankResult.chunks], rankingResults);
							SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank = rerankInsights.llmBestRank;
							SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank = rerankInsights.llmWorstRank;
						}

						this.reportTelemetry();
					});
				} catch (ex) {
					// ignore rerank errors
					this._logService.error(`SemanticSearchTextSearchProvider::provideAITextSearchResults rerank failed. error=${ex}`);
				}
			} else {
				this.reportTelemetry();
			}


			this._logService.debug(`Semantic search took ${sw.elapsed()}ms`);
			return { limitHit: false } satisfies vscode.TextSearchComplete;
		};
		return getResults();
	}

	reportTelemetry() {
		/* __GDPR__
		"copilot.search.request" : {
			"owner": "osortega",
			"comment": "Copilot search request.",
			"chunkCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of copilot search code chunks." },
			"rankResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Result of the copilot search ranking." },
			"rankResultsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of the results from copilot search ranking." },
			"combinedResultsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of combined results from copilot search." },
			"chunkSearchDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration of the chunk search" },
			"llmFilteringDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration of the LLM filtering" },
			"llmBestRank": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Best rank (lowest index) among LLM-selected chunks in the original retrieval ranking." },
			"llmWorstRank": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Worst rank (highest index) among LLM-selected chunks in the original retrieval ranking." },
			"llmSelectedCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of chunks selected by LLM from the initial retrieval." },
			"rawLlmRankingResultsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of raw results returned by the LLM." },
			"parseResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Indicates the result of parsing the LLM response." },
			"llmBestInRerank": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Best rank (lowest index) among LLM-selected chunks in the reranked results." },
			"llmWorstInRerank": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Worst rank (highest index) among LLM-selected chunks in the reranked results." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilot.search.request', {
			rankResult: SemanticSearchTextSearchProvider.feedBackTelemetry.rankResult,
			parseResult: SemanticSearchTextSearchProvider.feedBackTelemetry.parseResult,
		}, {
			chunkCount: SemanticSearchTextSearchProvider.feedBackTelemetry.chunkCount,
			rankResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.rankResultsCount,
			combinedResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.combinedResultsCount,
			chunkSearchDuration: SemanticSearchTextSearchProvider.feedBackTelemetry.chunkSearchDuration,
			llmFilteringDuration: SemanticSearchTextSearchProvider.feedBackTelemetry.llmFilteringDuration,
			llmBestRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank,
			llmWorstRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank,
			llmSelectedCount: SemanticSearchTextSearchProvider.feedBackTelemetry.llmSelectedCount,
			rawLlmRankingResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.rawLlmRankingResultsCount,
			llmBestInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank ?? -1,
			llmWorstInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank ?? -1,
		});

		if (SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank !== undefined
			&& SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank !== undefined
			&& SemanticSearchTextSearchProvider.feedBackTelemetry.llmSelectedCount !== undefined
		) {
			/* __GDPR__
			"semanticSearch.ranking" : {
				"owner": "rebornix",
				"comment": "Semantic search request ranking.",
				"llmBestRank": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Best rank (lowest index) among LLM-selected chunks in the original retrieval ranking."
				},
				"llmWorstRank": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Worst rank (highest index) among LLM-selected chunks in the original retrieval ranking."
				},
				"llmSelectedCount": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Number of chunks selected by LLM from the initial retrieval."
				},
				"rawLlmRankingResultsCount": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Number of raw results returned by the LLM."
				},
				"llmBestInRerank": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Best rank (lowest index) among LLM-selected chunks in the reranked results."
				},
				"llmWorstInRerank": {
					"classification": "SystemMetaData",
					"purpose": "FeatureInsight",
					"isMeasurement": true,
					"comment": "Worst rank (highest index) among LLM-selected chunks in the reranked results."
				}
			}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('semanticSearch.ranking', {}, {
				llmBestRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank,
				llmWorstRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank,
				llmSelectedCount: SemanticSearchTextSearchProvider.feedBackTelemetry.llmSelectedCount,
				rawLlmRankingResultsCount: SemanticSearchTextSearchProvider.feedBackTelemetry.rawLlmRankingResultsCount,
				llmBestInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank,
				llmWorstInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank,
			});

			if (SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank !== undefined
				&& SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank !== undefined
				&& (
					SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank > SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank
					|| SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank > SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank
				)
			) {
				this._telemetryService.sendInternalMSFTTelemetryEvent('semanticSearch.rerankImprovement', {
					keyword: SemanticSearchTextSearchProvider.latestQuery || '',
				}, {
					llmBestRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestRank,
					llmWorstRank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstRank,
					llmBestInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmBestInRerank,
					llmWorstInRerank: SemanticSearchTextSearchProvider.feedBackTelemetry.llmWorstInRerank,
				});
			}
		}
	}

	async reportSearchResults(rankingResults: IRankResult[], combinedChunks: FileChunk[], progress: vscode.Progress<vscode.AISearchResult>, token: vscode.CancellationToken): Promise<void> {
		const onResult: vscode.Progress<vscode.TextSearchResult> = {
			report: async (result: vscode.TextSearchMatch) => {
				const docContainingRef = await this.workspaceService.openTextDocumentAndSnapshot(result.uri);
				const resultAST = this._parserService.getTreeSitterAST(
					{ languageId: docContainingRef.languageId, getText: () => docContainingRef.getText() });
				const symbolsToHighlight = await resultAST?.getSymbols({
					startIndex: docContainingRef.offsetAt(result.ranges instanceof Array ? result.ranges[0].start : result.ranges.start),
					endIndex: docContainingRef.offsetAt(result.ranges instanceof Array ? result.ranges[0].end : result.ranges.end),
				});
				const ranges = result.ranges instanceof Array
					? result.ranges.map(r => {
						return {
							sourceRange: new VSCodeRange(
								new Position(r.start.line, r.start.character),
								new Position(r.end.line, (result.preview.text?.length || 0) + r.end.character)
							),
							previewRange: this.getPreviewRange(result.preview.text, symbolsToHighlight),
						};
					})
					: [{
						sourceRange: new VSCodeRange(
							new Position(result.ranges.start.line, result.ranges.start.character),
							new Position(result.ranges.end.line, (result.preview.text?.length || 0) + result.ranges.end.character),
						),
						previewRange: this.getPreviewRange(result.preview.text, symbolsToHighlight),
					}];
				const match: vscode.TextSearchMatch2 = new TextSearchMatch2(
					result.uri,
					ranges,
					result.preview.text
				);
				progress.report(match);
			}
		};
		await Promise.all(rankingResults.map(result => {
			return this.searchService.findTextInFiles(
				{
					pattern: result.query,
					isRegExp: false,
				},
				{
					useDefaultExcludes: true,
					maxResults: 20,
					include: result.file,
				},
				onResult,
				token,
			);
		}));
		//report the rest of the combined results without the LLM ranked ones
		for (const chunk of combinedChunks.slice(rankingResults.length)) {
			const docContainingRef = await this.workspaceService.openTextDocumentAndSnapshot(chunk.file);
			const resultAST = this._parserService.getTreeSitterAST(
				{ languageId: docContainingRef.languageId, getText: () => docContainingRef.getText() });
			const symbolsToHighlight = await resultAST?.getSymbols({
				startIndex: docContainingRef.offsetAt(new Position(chunk.range.startLineNumber, chunk.range.startColumn)),
				endIndex: docContainingRef.offsetAt(new Position(chunk.range.endLineNumber, chunk.range.endColumn)),
			});
			const rangeText = docContainingRef.getText().split('\n').slice(chunk.range.startLineNumber, chunk.range.endLineNumber).join('\n');
			const match: vscode.TextSearchMatch2 = new TextSearchMatch2(
				chunk.file,
				[{
					sourceRange: new VSCodeRange(
						chunk.range.startLineNumber,
						chunk.range.startColumn,
						chunk.range.endLineNumber,
						chunk.range.endColumn
					),
					previewRange: this.getPreviewRange(rangeText, symbolsToHighlight),
				}],
				rangeText
			);
			progress.report(match);
		}
	}

	async treeSitterAIKeywords(query: string, progress: vscode.Progress<vscode.AISearchResult>, chunks: FileChunk[], token: vscode.CancellationToken): Promise<void> {
		const keywordSearchDuration = Date.now();
		const symbols = new Set<string>();
		for (const chunk of chunks) {
			const docContainingRef = await this.workspaceService.openTextDocumentAndSnapshot(chunk.file);
			const resultAST = this._parserService.getTreeSitterAST(
				{ languageId: docContainingRef.languageId, getText: () => docContainingRef.getText() });
			const symbolsToHighlight = await resultAST?.getSymbols({
				startIndex: docContainingRef.offsetAt(new Position(chunk.range.startLineNumber, chunk.range.startColumn)),
				endIndex: docContainingRef.offsetAt(new Position(chunk.range.endLineNumber, chunk.range.endColumn)),
			});
			symbolsToHighlight?.forEach(symbol => symbols.add(symbol.text));
		}
		const searchKeywordsIntent = this._intentService.getIntent('searchKeywords', ChatLocation.Other);
		if (searchKeywordsIntent) {
			const request: vscode.ChatRequest = {
				location: DeprecatedChatLocation.Panel,
				location2: undefined,
				command: 'searchKeywords',
				prompt: '',
				references: [],
				attempt: 0,
				enableCommandDetection: false,
				isParticipantDetected: false,
				toolReferences: [],
				toolInvocationToken: undefined as never,
				model: null!,
				tools: new Map(),
				id: '1',
				sessionId: '1',
				sessionResource: URI.parse('chat:/1'),
				hasHooksEnabled: false,
			};
			const intentInvocation = await searchKeywordsIntent.invoke({ location: ChatLocation.Other, request });
			const fakeProgress: vscode.Progress<any | any> = {
				report(_obj) { }
			};
			const buildPromptContext: ISearchPanelKeywordsPromptContext = {
				query,
				history: [],
				chatVariables: new ChatVariablesCollection([]),
				tools: { toolReferences: [], toolInvocationToken: undefined as never, availableTools: [] },
				symbols: Array.from(symbols),
			};
			const prompt = await intentInvocation.buildPrompt(buildPromptContext, fakeProgress, token);
			const fetchResult = await intentInvocation.endpoint.makeChatRequest(
				'searchKeywords',
				prompt.messages,
				async (text, _, delta) => {
					return undefined;
				},
				token,
				ChatLocation.Other,
				undefined,
				{
					temperature: 0.1,
				},
				false,
				{
					messageId: generateUuid(),
					messageSource: 'search.keywords'
				},
			);
			const keywordResult = fetchResult.type === 'success' ? fetchResult.value : (fetchResult.type === 'length' ? fetchResult.truncatedValue : '');
			const usedResults = [];
			keywordResult.split('\n')
				.map(entry => {
					const trimmedEntry = entry.trim();
					if (trimmedEntry !== '' && !trimmedEntry.startsWith('```')) {
						const cleanedKeyword = this.processKeyword(trimmedEntry, chunks);
						if (cleanedKeyword) {
							progress.report(new AISearchKeyword(cleanedKeyword));
							usedResults.push(cleanedKeyword);
						}
					}
				});

			/* __GDPR__
		"copilot.search.keywords" : {
			"owner": "osortega",
			"comment": "Copilot keywords request.",
			"keywordResult": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Result of the copilot keywords request." },
			"keywordsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of keywords found by copilot search." },
			"keywordSearchDuration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration of the keyword search" }
			}
		*/
			this._telemetryService.sendMSFTTelemetryEvent('copilot.search.keywords', {
				keywordResult: fetchResult.type,
			}, {
				keywordsCount: usedResults.length,
				keywordSearchDuration: Date.now() - keywordSearchDuration,
			});
		}
	}

	private processKeyword(keyword: string, chunks: FileChunk[]): string | undefined {
		// Clean up keyword if it ends with any kind of bracket pairs
		const cleanedKeyword = keyword.replace(/[\(\[\{].*[\)\]\}]/g, '').trim();
		if (cleanedKeyword.length === 0) {
			return undefined;
		}
		// Make sure the keyword exists in any chunk
		const foundChunk = chunks.find(chunk => {
			return chunk.text.includes(cleanedKeyword);
		});
		if (foundChunk) {
			return cleanedKeyword;
		}
		return undefined;
	}
}

function getMatchRanges(fileResults: FileChunk[]): { sourceRange: vscode.Range; previewRange: vscode.Range }[] {
	const ranges: { sourceRange: vscode.Range; previewRange: vscode.Range }[] = [];
	fileResults.forEach(snippet => {
		const range = new VSCodeRange(
			new Position(snippet.range.startLineNumber, snippet.range.startColumn),
			new Position(snippet.range.endLineNumber, snippet.range.endColumn)
		);

		ranges.push({ sourceRange: range, previewRange: range });
	});

	return ranges;
}

export async function getSearchResults(
	fileReader: (uri: vscode.Uri) => Promise<Uint8Array>,
	fileResults: FileChunk[],
	token: vscode.CancellationToken = CancellationToken.None,
	logService?: ILogService,
	telemetryService?: ITelemetryService
): Promise<vscode.TextSearchMatch2[]> {
	const results: vscode.TextSearchMatch2[] = [];

	const getResultsRanges = async () => {
		// get all chunks per file
		const fileChunks: { [key: string]: FileChunk[] } = {};
		fileResults.forEach(fileResult => {
			const filePath = fileResult.file.path;
			if (!fileChunks[filePath]) {
				fileChunks[filePath] = [];
			}
			fileChunks[filePath].push(fileResult);
		});
		await Promise.all(Object.keys(fileChunks).map(async filePath => {
			const file = fileChunks[filePath][0].file;
			const fileContent = await fileReader(file);
			const ranges = getMatchRanges(fileChunks[filePath]);
			if (ranges.length) {
				results.push(
					new TextSearchMatch2(
						file,
						ranges,
						fileContent.toString(),
					)
				);
			}
		}
		));

		return results;
	};

	return await raceCancellation(getResultsRanges(), token) ?? [];
}
