/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISearchComplete, ISearchProgressItem, ITextQuery, SemanticSearchBehavior } from '../../../../services/search/common/search.js';
import { SearchView } from '../../browser/searchView.js';

suite('Search View - keyword suggestions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves existing AI results when no pending promise is stored', async () => {
		const setAIQuery = sinon.spy();
		const aiSearch = sinon.spy();
		const cachedResults: ISearchComplete = { results: [], messages: [] };
		const view: { getKeywordSuggestions(): Promise<void>; _cachedResults: ISearchComplete } = Object.assign(Object.create(SearchView.prototype), {
			viewModel: { hasAIResults: true, searchResult: { setAIQueryUsingTextQuery: setAIQuery }, aiSearch },
			_cachedResults: cachedResults
		});

		await view.getKeywordSuggestions();
		await view.getKeywordSuggestions();

		assert.deepStrictEqual({ resets: setAIQuery.callCount, requests: aiSearch.callCount, cache: view._cachedResults }, {
			resets: 0, requests: 0, cache: cachedResults
		});
	});

	test('reuses an AI request before and after its first streamed match', async () => {
		const pending = new DeferredPromise<ISearchComplete>();
		const setAIQuery = sinon.spy();
		let onResult: ((result: ISearchProgressItem | undefined) => void) | undefined;
		let hasAIResults = false;
		const aiSearch = sinon.spy((callback: (result: ISearchProgressItem | undefined) => void) => {
			onResult = callback;
			hasAIResults = true;
			return pending.p;
		});
		const view: {
			getKeywordSuggestions(): Promise<void>;
			_pendingSemanticSearchPromise: Promise<ISearchComplete> | undefined;
			_cachedResults: ISearchComplete | undefined;
		} = Object.assign(Object.create(SearchView.prototype), {
			viewModel: {
				get hasAIResults() { return hasAIResults; },
				searchResult: { setAIQueryUsingTextQuery: setAIQuery },
				aiSearch
			}
		});

		const first = view.getKeywordSuggestions();
		const second = view.getKeywordSuggestions();
		onResult!({ resource: URI.file('/sample'), results: [] });
		const pendingAfterMatch = view._pendingSemanticSearchPromise;
		await view.getKeywordSuggestions();
		const complete: ISearchComplete = { results: [], messages: [] };
		await pending.complete(complete);
		await Promise.all([first, second]);

		assert.deepStrictEqual({ resets: setAIQuery.callCount, requests: aiSearch.callCount, pendingAfterMatch, cache: view._cachedResults }, {
			resets: 1, requests: 1, pendingAfterMatch: undefined, cache: complete
		});
	});
});

suite('Search View - folder location change', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	type TriggerQueryChangeOptions = Parameters<SearchView['triggerQueryChange']>[0];

	const folder = URI.file('/repo');
	const worktree = URI.file('/repo.worktrees/feature');

	function createView(options: { query?: string; visible?: boolean; searchedFolders?: URI[]; neverSearched?: boolean; currentFolder?: URI; validation?: Promise<void> }) {
		const { query = 'needle', visible = true } = options;
		const searchedFolders = options.neverSearched ? undefined : options.searchedFolders ?? [worktree];
		const triggerQueryChange = sinon.spy((_options?: TriggerQueryChangeOptions) => { });
		const refreshAndUpdateCount = sinon.spy(async () => { });
		const cancelSearch = sinon.spy();
		const onQueryTriggered = sinon.spy();
		const state = { visible, currentFolder: options.currentFolder ?? folder };
		const view: {
			onDidChangeFolderLocation(): void;
			onVisibilityChanged(visible: boolean): Promise<void>;
			onSearchResultsChanged(): Promise<void>;
			_onQueryChanged(preserveFocus: boolean): void;
			replaceSearchModel(searchModel: object, asyncResults: Promise<ISearchComplete>): Promise<void>;
		} = Object.assign(Object.create(SearchView.prototype), {
			searchWidget: {
				searchInput: { getValue: () => query, inputBox: { isInputValid: () => true }, getRegex: () => false, getWholeWords: () => false, getCaseSensitive: () => false },
				getNotebookFilters: () => ({ markupInput: true, markupPreview: true, codeInput: true, codeOutput: true }),
				getReplaceValue: () => '',
			},
			inputPatternExcludes: { getValue: () => '', useExcludesAndIgnoreFiles: () => true },
			inputPatternIncludes: { getValue: () => '', onlySearchInOpenEditors: () => false, onlySearchInChangedFiles: () => false },
			instantiationService: { invokeFunction: () => [] },
			queryBuilder: { text: () => ({ folderQueries: [] }), ignoreGlobCaseForResources: () => false },
			validateQuery: () => options.validation ?? Promise.resolve(),
			viewletVisible: { set: () => { } },
			viewModel: { searchResult: { toggleHighlights: () => { } }, cancelSearch, cancelAISearch: () => { }, isReplaceActive: () => false },
			contextService: { getWorkspace: () => ({ folders: [{ uri: state.currentFolder }] }) },
			uriIdentityService: { extUri },
			isVisible: () => state.visible,
			configurationService: { getValue: () => ({ searchView: { semanticSearchBehavior: SemanticSearchBehavior.Auto } }) },
			logService: { info: () => { } },
			triggerQueryChange,
			refreshAndUpdateCount,
			onQueryTriggered,
			changedWhileHidden: false,
			searchedFolders,
		});
		const setVisible = (value: boolean) => {
			state.visible = value;
			return view.onVisibilityChanged(value);
		};
		const moveTo = (uri: URI) => {
			state.currentFolder = uri;
			view.onDidChangeFolderLocation();
		};
		return { view, triggerQueryChange, refreshAndUpdateCount, cancelSearch, onQueryTriggered, setVisible, moveTo };
	}

	test('reruns the query right away when the view is visible and the search ran in another folder', () => {
		const reruns = (options: Parameters<typeof createView>[0]) => {
			const { view, triggerQueryChange } = createView(options);
			view.onDidChangeFolderLocation();
			return triggerQueryChange.args;
		};

		assert.deepStrictEqual({
			moved: reruns({}),
			sameFolder: reruns({ searchedFolders: [folder] }),
			neverSearched: reruns({ neverSearched: true }),
			emptyQuery: reruns({ query: '' }),
		}, {
			moved: [[{ shouldKeepAIResults: false, shouldUpdateAISearch: false, skipAISearch: true }]],
			sameFolder: [],
			neverSearched: [],
			emptyQuery: [],
		});
	});

	test('reruns the query once when a hidden view becomes visible', async () => {
		const { view, triggerQueryChange, refreshAndUpdateCount, cancelSearch, setVisible } = createView({ visible: false });

		view.onDidChangeFolderLocation();
		await view.onSearchResultsChanged();
		const rerunsWhileHidden = triggerQueryChange.callCount;
		await setVisible(true);
		await setVisible(false);
		await setVisible(true);

		assert.deepStrictEqual({ cancelled: cancelSearch.args, rerunsWhileHidden, reruns: triggerQueryChange.args, redraws: refreshAndUpdateCount.callCount }, {
			cancelled: [[true]],
			rerunsWhileHidden: 0,
			reruns: [[{ shouldKeepAIResults: false, shouldUpdateAISearch: false, skipAISearch: true }]],
			redraws: 0
		});
	});

	test('drops a query of the previous location that is still validating, and reruns', async () => {
		async function run(move: boolean) {
			const validation = new DeferredPromise<void>();
			const { view, triggerQueryChange, onQueryTriggered, moveTo } = createView({ neverSearched: true, currentFolder: worktree, validation: validation.p });
			view._onQueryChanged(true);
			if (move) {
				moveTo(folder);
			}
			await validation.complete();
			await timeout(0);
			return { reruns: triggerQueryChange.args, searches: onQueryTriggered.callCount };
		}

		assert.deepStrictEqual({ moved: await run(true), notMoved: await run(false) }, {
			moved: { reruns: [[{ shouldKeepAIResults: false, shouldUpdateAISearch: false, skipAISearch: true }]], searches: 0 },
			notMoved: { reruns: [], searches: 1 }
		});
	});

	test('reruns results opened from Quick Search after the location changes', async () => {
		const { view, triggerQueryChange, moveTo } = createView({ neverSearched: true, currentFolder: worktree });
		Object.assign(view, {
			progressService: { withProgress: () => { } },
			getProgressLocation: () => 'workbench.view.search',
			_refreshResultsScheduler: { schedule: () => { } },
			_register: <T>(disposable: T) => disposable,
			searchViewModelWorkbenchService: {},
			tree: { setInput: () => { } },
			onSearchResultsChanged: async () => { },
			refreshInputs: () => { },
			onSearchComplete: async () => { },
			expandIfSingularResult: async () => { },
		});
		const quickSearchModel = { searchResult: { query: { folderQueries: [{ folder: worktree }] } }, onSearchResultChanged: () => ({ dispose: () => { } }) };

		await view.replaceSearchModel(quickSearchModel, Promise.resolve({ results: [], messages: [] }));
		moveTo(folder);

		assert.deepStrictEqual(triggerQueryChange.args, [[{ shouldKeepAIResults: false, shouldUpdateAISearch: false, skipAISearch: true }]]);
	});

	test('the rerun neither runs AI search on empty results nor requests keyword suggestions', async () => {
		async function runSearch(skipAISearch: boolean) {
			const aiTextSearchResult = { hidden: true };
			const getKeywordSuggestions = sinon.spy();
			const view: {
				doSearch(query: ITextQuery, excludePatternText: string, includePatternText: string, triggeredOnType: boolean, shouldKeepAIResults: boolean, shouldUpdateAISearch: boolean, skipAISearch: boolean): Thenable<void>;
			} = Object.assign(Object.create(SearchView.prototype), {
				progressService: { withProgress: (_options: object, task: () => Promise<void>) => { task(); } },
				getProgressLocation: () => 'workbench.view.search',
				searchWidget: { searchInput: { clearMessage: () => { } }, setReplaceAllActionState: () => { }, getReplaceValue: () => '' },
				searchStateKey: { set: () => { } },
				showEmptyStage: () => { },
				_refreshResultsScheduler: { schedule: () => { } },
				tree: { setSelection: () => { }, setFocus: () => { } },
				viewModel: {
					searchResult: { aiTextSearchResult, setAIQueryUsingTextQuery: () => { } },
					search: () => ({ asyncResults: Promise.resolve<ISearchComplete>({ results: [], messages: [] }) })
				},
				configurationService: { getValue: () => ({ searchView: { semanticSearchBehavior: SemanticSearchBehavior.RunOnEmpty, keywordSuggestions: true } }) },
				logService: { info: () => { } },
				getKeywordSuggestions,
				onSearchComplete: async () => { },
			});

			await view.doSearch({} as ITextQuery, '', '', false, false, false, skipAISearch);
			return { aiResultsShown: !aiTextSearchResult.hidden, keywordRequests: getKeywordSuggestions.callCount };
		}

		assert.deepStrictEqual({ rerun: await runSearch(true), search: await runSearch(false) }, {
			rerun: { aiResultsShown: false, keywordRequests: 0 },
			search: { aiResultsShown: true, keywordRequests: 1 }
		});
	});
});
