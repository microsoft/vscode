/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import * as errors from '../../../../../base/common/errors.js';
import { Emitter, Event, PauseableEmitter } from '../../../../../base/common/event.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';
import { ReplacePattern } from '../../../../services/search/common/replace.js';
import { IFileMatch, IPatternInfo, ISearchComplete, ISearchConfigurationProperties, ISearchProgressItem, ISearchService, ITextQuery, ITextSearchStats, QueryType, SearchCompletionExitCode } from '../../../../services/search/common/search.js';
import { IChangeEvent, mergeSearchResultEvents, SearchModelLocation, ISearchModel, ISearchResult, SEARCH_MODEL_PREFIX } from './searchTreeCommon.js';
import { SearchResultImpl } from './searchResult.js';
import { ISearchViewModelWorkbenchService } from './searchViewModelWorkbenchService.js';

export class SearchModelImpl extends Disposable implements ISearchModel {

	private _searchResult: ISearchResult;
	private _searchQuery: ITextQuery | null = null;
	private _replaceActive: boolean = false;
	private _replaceString: string | null = null;
	private _replacePattern: ReplacePattern | null = null;
	private _preserveCase: boolean = false;
	private _startStreamDelay: Promise<void> = Promise.resolve();
	private readonly _resultQueue: IFileMatch[] = [];
	private readonly _aiResultQueue: IFileMatch[] = [];

	private readonly _onReplaceTermChanged: Emitter<void> = this._register(new Emitter<void>());
	readonly onReplaceTermChanged: Event<void> = this._onReplaceTermChanged.event;

	private readonly _onSearchResultChanged = this._register(new PauseableEmitter<IChangeEvent>({
		merge: mergeSearchResultEvents
	}));
	readonly onSearchResultChanged: Event<IChangeEvent> = this._onSearchResultChanged.event;

	private currentCancelTokenSource: CancellationTokenSource | null = null;
	private currentAICancelTokenSource: CancellationTokenSource | null = null;
	private searchCancelledForNewSearch: boolean = false;
	private aiSearchCancelledForNewSearch: boolean = false;
	public location: SearchModelLocation = SearchModelLocation.PANEL;
	private readonly _aiTextResultProviderName: Lazy<Promise<string | undefined>>;

	private readonly _id: string;

	constructor(
		@ISearchService private readonly searchService: ISearchService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@INotebookSearchService private readonly notebookSearchService: INotebookSearchService,
	) {
		super();
		this._searchResult = this.instantiationService.createInstance(SearchResultImpl, this);
		this._register(this._searchResult.onChange((e) => this._onSearchResultChanged.fire(e)));

		this._aiTextResultProviderName = new Lazy(async () => this.searchService.getAIName());
		this._id = SEARCH_MODEL_PREFIX + Date.now().toString();
	}

	id(): string {
		return this._id;
	}

	async getAITextResultProviderName(): Promise<string> {
		const result = await this._aiTextResultProviderName.value;
		if (!result) {
			throw Error('Fetching AI name when no provider present.');
		}
		return result;
	}

	isReplaceActive(): boolean {
		return this._replaceActive;
	}

	set replaceActive(replaceActive: boolean) {
		this._replaceActive = replaceActive;
	}

	get replacePattern(): ReplacePattern | null {
		return this._replacePattern;
	}

	get replaceString(): string {
		return this._replaceString || '';
	}

	set preserveCase(value: boolean) {
		this._preserveCase = value;
	}

	get preserveCase(): boolean {
		return this._preserveCase;
	}

	set replaceString(replaceString: string) {
		this._replaceString = replaceString;
		if (this._searchQuery) {
			this._replacePattern = new ReplacePattern(replaceString, this._searchQuery.contentPattern);
		}
		this._onReplaceTermChanged.fire();
	}

	get searchResult(): ISearchResult {
		return this._searchResult;
	}

	aiSearch(): Promise<ISearchComplete> {
		if (this.hasAIResults) {
			// already has matches or pending matches
			throw Error('AI results already exist');
		}
		if (!this._searchQuery) {
			throw Error('No search query');
		}

		const searchInstanceID = Date.now().toString();
		const tokenSource = new CancellationTokenSource();
		this.currentAICancelTokenSource = tokenSource;
		const start = Date.now();
		const asyncAIResults = this.searchService.aiTextSearch(
			{ ...this._searchQuery, contentPattern: this._searchQuery.contentPattern.pattern, type: QueryType.aiText },
			tokenSource.token,
			async (p: ISearchProgressItem) => {
				this.onSearchProgress(p, searchInstanceID, false, true);
			}).finally(() => {
				tokenSource.dispose(true);
			}).then(
				value => {
					this.onSearchCompleted(value, Date.now() - start, searchInstanceID, true);
					return value;
				},
				e => {
					this.onSearchError(e, Date.now() - start, true);
					throw e;
				});
		return asyncAIResults;
	}

	private doSearch(query: ITextQuery, progressEmitter: Emitter<void>, searchQuery: ITextQuery, searchInstanceID: string, onProgress?: (result: ISearchProgressItem) => void, callerToken?: CancellationToken): {
		asyncResults: Promise<ISearchComplete>;
		syncResults: IFileMatch<URI>[];
	} {
		const asyncGenerateOnProgress = async (p: ISearchProgressItem) => {
			progressEmitter.fire();
			this.onSearchProgress(p, searchInstanceID, false, false);
			onProgress?.(p);
		};

		const syncGenerateOnProgress = (p: ISearchProgressItem) => {
			progressEmitter.fire();
			this.onSearchProgress(p, searchInstanceID, true);
			onProgress?.(p);
		};
		const tokenSource = this.currentCancelTokenSource = new CancellationTokenSource(callerToken);

		const notebookResult = this.notebookSearchService.notebookSearch(query, tokenSource.token, searchInstanceID, asyncGenerateOnProgress);
		const textResult = this.searchService.textSearchSplitSyncAsync(
			searchQuery,
			tokenSource.token, asyncGenerateOnProgress,
			notebookResult.openFilesToScan,
			notebookResult.allScannedFiles,
		);

		const syncResults = textResult.syncResults.results;
		syncResults.forEach(p => { if (p) { syncGenerateOnProgress(p); } });

		const getAsyncResults = async (): Promise<ISearchComplete> => {
			const searchStart = Date.now();

			// resolve async parts of search
			const allClosedEditorResults = await textResult.asyncResults;
			const resolvedNotebookResults = await notebookResult.completeData;
			const searchLength = Date.now() - searchStart;
			const resolvedResult: ISearchComplete = {
				results: [...allClosedEditorResults.results, ...resolvedNotebookResults.results],
				messages: [...allClosedEditorResults.messages, ...resolvedNotebookResults.messages],
				limitHit: allClosedEditorResults.limitHit || resolvedNotebookResults.limitHit,
				exit: allClosedEditorResults.exit,
				stats: allClosedEditorResults.stats,
			};
			this.logService.trace(`whole search time | ${searchLength}ms`);
			return resolvedResult;
		};
		return {
			asyncResults: getAsyncResults()
				.finally(() => tokenSource.dispose(true)),
			syncResults
		};
	}

	get hasAIResults(): boolean {
		return !!(this.searchResult.getCachedSearchComplete(true)) || (!!this.currentAICancelTokenSource && !this.currentAICancelTokenSource.token.isCancellationRequested);
	}

	get hasPlainResults(): boolean {
		return !!(this.searchResult.getCachedSearchComplete(false)) || (!!this.currentCancelTokenSource && !this.currentCancelTokenSource.token.isCancellationRequested);
	}

	search(query: ITextQuery, onProgress?: (result: ISearchProgressItem) => void, callerToken?: CancellationToken): {
		asyncResults: Promise<ISearchComplete>;
		syncResults: IFileMatch<URI>[];
	} {
		this.cancelSearch(true);

		this._searchQuery = query;
		if (!this.searchConfig.searchOnType) {
			this.searchResult.clear();
		}
		const searchInstanceID = Date.now().toString();

		this._searchResult.query = this._searchQuery;

		const progressEmitter = this._register(new Emitter<void>());
		this._replacePattern = new ReplacePattern(this.replaceString, this._searchQuery.contentPattern);

		// In search on type case, delay the streaming of results just a bit, so that we don't flash the only "local results" fast path
		this._startStreamDelay = new Promise(resolve => setTimeout(resolve, this.searchConfig.searchOnType ? 150 : 0));

		const req = this.doSearch(query, progressEmitter, this._searchQuery, searchInstanceID, onProgress, callerToken);
		const asyncResults = req.asyncResults;
		const syncResults = req.syncResults;

		if (onProgress) {
			syncResults.forEach(p => {
				if (p) {
					onProgress(p);
				}
			});
		}

		const start = Date.now();
		let event: IDisposable | undefined;

		const progressEmitterPromise = new Promise(resolve => {
			event = Event.once(progressEmitter.event)(resolve);
			return event;
		});

		Promise.race([asyncResults, progressEmitterPromise]).finally(() => {
			/* __GDPR__
				"searchResultsFirstRender" : {
					"owner": "roblourens",
					"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
				}
			*/
			event?.dispose();
			this.telemetryService.publicLog('searchResultsFirstRender', { duration: Date.now() - start });
		});

		try {
			return {
				asyncResults: asyncResults.then(
					value => {
						this.onSearchCompleted(value, Date.now() - start, searchInstanceID, false);
						return value;
					},
					e => {
						this.onSearchError(e, Date.now() - start, false);
						throw e;
					}),
				syncResults
			};
		} finally {
			/* __GDPR__
				"searchResultsFinished" : {
					"owner": "roblourens",
					"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('searchResultsFinished', { duration: Date.now() - start });
		}
	}

	private onSearchCompleted(completed: ISearchComplete | undefined, duration: number, searchInstanceID: string, ai: boolean): ISearchComplete | undefined {
		if (!this._searchQuery) {
			throw new Error('onSearchCompleted must be called after a search is started');
		}

		if (ai) {
			this._searchResult.add(this._aiResultQueue, searchInstanceID, true);
			this._aiResultQueue.length = 0;
		} else {
			this._searchResult.add(this._resultQueue, searchInstanceID, false);
			this._resultQueue.length = 0;
		}

		this.searchResult.setCachedSearchComplete(completed, ai);

		const options: IPatternInfo = Object.assign({}, this._searchQuery.contentPattern);
		delete (options as any).pattern;

		const stats = completed && completed.stats as ITextSearchStats;

		const fileSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme === Schemas.file);
		const otherSchemeOnly = this._searchQuery.folderQueries.every(fq => fq.folder.scheme !== Schemas.file);
		const scheme = fileSchemeOnly ? Schemas.file :
			otherSchemeOnly ? 'other' :
				'mixed';

		/* __GDPR__
			"searchResultsShown" : {
				"owner": "roblourens",
				"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"fileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"options": { "${inline}": [ "${IPatternInfo}" ] },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"scheme" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"searchOnTypeEnabled" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('searchResultsShown', {
			count: this._searchResult.count(),
			fileCount: this._searchResult.fileCount(),
			options,
			duration,
			type: stats && stats.type,
			scheme,
			searchOnTypeEnabled: this.searchConfig.searchOnType
		});
		return completed;
	}

	private onSearchError(e: any, duration: number, ai: boolean): void {
		if (errors.isCancellationError(e)) {
			this.onSearchCompleted(
				(ai ? this.aiSearchCancelledForNewSearch : this.searchCancelledForNewSearch)
					? { exit: SearchCompletionExitCode.NewSearchStarted, results: [], messages: [] }
					: undefined,
				duration, '', ai);
			if (ai) {
				this.aiSearchCancelledForNewSearch = false;
			} else {
				this.searchCancelledForNewSearch = false;
			}
		}
	}

	private onSearchProgress(p: ISearchProgressItem, searchInstanceID: string, sync = true, ai: boolean = false) {
		const targetQueue = ai ? this._aiResultQueue : this._resultQueue;
		if ((<IFileMatch>p).resource) {
			targetQueue.push(<IFileMatch>p);
			if (sync) {
				if (targetQueue.length) {
					this._searchResult.add(targetQueue, searchInstanceID, false, true);
					targetQueue.length = 0;
				}
			} else {
				this._startStreamDelay.then(() => {
					if (targetQueue.length) {
						this._searchResult.add(targetQueue, searchInstanceID, ai, !ai);
						targetQueue.length = 0;
					}
				});
			}

		}
	}

	private get searchConfig() {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}

	cancelSearch(cancelledForNewSearch = false): boolean {
		if (this.currentCancelTokenSource) {
			this.searchCancelledForNewSearch = cancelledForNewSearch;
			this.currentCancelTokenSource.cancel();
			return true;
		}
		return false;
	}
	cancelAISearch(cancelledForNewSearch = false): boolean {
		if (this.currentAICancelTokenSource) {
			this.aiSearchCancelledForNewSearch = cancelledForNewSearch;
			this.currentAICancelTokenSource.cancel();
			return true;
		}
		return false;
	}
	clearAiSearchResults(): void {
		this._aiResultQueue.length = 0;
		// it's not clear all as we are only clearing the AI results
		this._searchResult.aiTextSearchResult.clear(false);
	}
	override dispose(): void {
		this.cancelSearch();
		this.cancelAISearch();
		this.searchResult.dispose();
		super.dispose();
	}

}


export class SearchViewModelWorkbenchService implements ISearchViewModelWorkbenchService {

	declare readonly _serviceBrand: undefined;
	private _searchModel: SearchModelImpl | null = null;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
	}

	get searchModel(): SearchModelImpl {
		if (!this._searchModel) {
			this._searchModel = this.instantiationService.createInstance(SearchModelImpl);
		}
		return this._searchModel;
	}

	set searchModel(searchModel: SearchModelImpl) {
		this._searchModel?.dispose();
		this._searchModel = searchModel;
	}
}

