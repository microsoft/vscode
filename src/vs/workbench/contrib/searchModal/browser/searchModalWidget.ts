/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/searchModal.css';
import { Disposable, DisposableStore, MutableDisposable, IReference } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { ISearchService, QueryType, IFileMatch, IFileQuery, resultIsMatch } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { localize } from '../../../../nls.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../editor/common/services/resolverService.js';
import { ScrollType } from '../../../../editor/common/editorCommon.js';

type SearchTab = 'all' | 'files' | 'symbols' | 'actions';

interface ISearchResultItem {
	type: 'file' | 'symbol' | 'action' | 'text';
	resource?: URI;
	range?: Range;
	label: string;
	description: string;
	detail: string;
	matchText?: string;
	iconClasses?: string[];
	score?: number;
	commandId?: string;
	matchPositions?: number[];
}

const INITIAL_MAX_RESULTS = 100;
const LOAD_MORE_INCREMENT = 100;
const DISPLAY_PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 200;
const MAX_RECENT_SEARCHES = 8;

export class SearchModalWidget extends Disposable {

	private static readonly WIDTH = 1000;
	private static readonly HEIGHT = 650;

	private _domNode: FastDomNode<HTMLElement>;
	private _backdropNode: HTMLElement;
	private _inputBox: InputBox;
	private _tabsContainer: HTMLElement;
	private _toolbarContainer: HTMLElement;
	private _resultsContainer: HTMLElement;
	private _previewHeader: HTMLElement;
	private _previewBody: HTMLElement;
	private _previewEditor: CodeEditorWidget;
	private _previewImageWrap: HTMLElement;
	private _statusBar: HTMLElement;

	private _currentTab: SearchTab = 'all';
	private _matchCase: boolean = false;
	private _wholeWord: boolean = false;
	private _useRegex: boolean = false;

	private _currentResults: ISearchResultItem[] = [];
	private _selectedIndex: number = 0;
	private _currentCancellation: CancellationTokenSource | undefined;
	private _displayLimit: number = DISPLAY_PAGE_SIZE;
	private _maxResults: number = INITIAL_MAX_RESULTS;
	private _hasMoreResults: boolean = false;
	private _recentSearches: string[] = [];
	private _searchTimeout: ReturnType<typeof setTimeout> | undefined;

	/** Disposables recreated on every renderResults() call to avoid listener accumulation. */
	private readonly _resultItemDisposables = this._register(new DisposableStore());

	/** Holds the current model reference; disposing it releases the model. */
	private readonly _previewModelRef = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());

	/** Cancellation for in-flight preview model loads. */
	private _previewCts: CancellationTokenSource | undefined;

	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide: Event<void> = this._onDidHide.event;

	private _isVisible: boolean = false;

	constructor(
		private readonly parent: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly editorService: IEditorService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Backdrop
		this._backdropNode = dom.$('.search-modal-backdrop');
		this._backdropNode.style.display = 'none';
		this._register(dom.addDisposableListener(this._backdropNode, dom.EventType.CLICK, () => this.hide()));

		// Main widget
		this._domNode = createFastDomNode(dom.$('.search-modal-widget'));
		this._domNode.setDisplay('none');
		this._domNode.setPosition('absolute');
		this._domNode.setWidth(SearchModalWidget.WIDTH);
		this._domNode.setHeight(SearchModalWidget.HEIGHT);

		// Header: input + tabs
		const header = dom.append(this._domNode.domNode, dom.$('.search-modal-header'));
		const inputContainer = dom.append(header, dom.$('.search-modal-input'));
		this._inputBox = this._register(new InputBox(inputContainer, this.contextViewService, {
			placeholder: localize('searchModal.placeholder', 'Search everywhere...'),
			inputBoxStyles: defaultInputBoxStyles
		}));
		this._tabsContainer = dom.append(header, dom.$('ul.search-modal-tabs'));
		this.createTabs();

		// Toolbar
		this._toolbarContainer = dom.append(this._domNode.domNode, dom.$('.search-modal-toolbar'));
		this.createToolbar();

		// Status bar
		this._statusBar = dom.append(this._domNode.domNode, dom.$('.search-modal-status'));

		// Body: results + preview
		const body = dom.append(this._domNode.domNode, dom.$('.search-modal-body'));
		this._resultsContainer = dom.append(body, dom.$('.search-modal-results'));

		const previewPanel = dom.append(body, dom.$('.search-modal-preview'));

		// Preview header
		this._previewHeader = dom.append(previewPanel, dom.$('.preview-header'));
		dom.append(this._previewHeader, dom.$('span.codicon.codicon-preview'));
		const previewLabel = dom.append(this._previewHeader, dom.$('span.preview-header-label'));
		previewLabel.textContent = localize('searchModal.preview', 'Preview');

		// Preview body: editor fills it; image wrap overlays on top
		this._previewBody = dom.append(previewPanel, dom.$('.preview-body'));

		this._previewEditor = this._register(this.instantiationService.createInstance(
			CodeEditorWidget,
			this._previewBody,
			{
				readOnly: true,
				automaticLayout: true,
				scrollBeyondLastLine: false,
				minimap: { enabled: false },
				lineNumbers: 'on',
				folding: false,
				overviewRulerLanes: 0,
				overviewRulerBorder: false,
				stickyScroll: { enabled: false },
				renderLineHighlight: 'all',
				contextmenu: false,
				wordWrap: 'off',
				glyphMargin: false,
				lineDecorationsWidth: 8,
				renderFinalNewline: 'off',
				padding: { top: 8, bottom: 8 },
			},
			{ isSimpleWidget: true }
		));

		// Absolutely-positioned overlay for image files
		this._previewImageWrap = dom.append(this._previewBody, dom.$('.preview-image-wrap'));
		this._previewImageWrap.style.display = 'none';

		// Mount
		dom.append(parent, this._backdropNode);
		dom.append(parent, this._domNode.domNode);

		// Events
		this._register(this._inputBox.onDidChange(() => this.scheduleSearch()));
		this._register(dom.addStandardDisposableListener(this._inputBox.inputElement, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e)));
	}

	override dispose(): void {
		if (this._searchTimeout) {
			clearTimeout(this._searchTimeout);
			this._searchTimeout = undefined;
		}
		if (this._previewCts) {
			this._previewCts.cancel();
			this._previewCts = undefined;
		}
		super.dispose();
	}


	private createTabs(): void {
		const tabs: { id: SearchTab; label: string; icon: string }[] = [
			{ id: 'all', label: localize('searchModal.tabAll', 'All'), icon: 'codicon-search' },
			{ id: 'files', label: localize('searchModal.tabFiles', 'Files'), icon: 'codicon-file' },
			{ id: 'symbols', label: localize('searchModal.tabSymbols', 'Symbols'), icon: 'codicon-symbol-class' },
			{ id: 'actions', label: localize('searchModal.tabActions', 'Actions'), icon: 'codicon-zap' }
		];

		tabs.forEach(tab => {
			const tabButton = dom.append(this._tabsContainer, dom.$('button.search-tab'));
			const iconEl = dom.append(tabButton, dom.$(`span.codicon.${tab.icon}`));
			iconEl.setAttribute('aria-hidden', 'true');
			const labelEl = dom.append(tabButton, dom.$('span.tab-label'));
			labelEl.textContent = tab.label;
			if (tab.id === this._currentTab) {
				tabButton.classList.add('active');
			}
			this._register(dom.addDisposableListener(tabButton, dom.EventType.CLICK, () => this.switchTab(tab.id)));
		});
	}

	private createToolbar(): void {
		const leftGroup = dom.append(this._toolbarContainer, dom.$('.toolbar-group'));

		const matchCaseBtn = dom.append(leftGroup, dom.$('button.toolbar-button'));
		dom.append(matchCaseBtn, dom.$('span.codicon.codicon-case-sensitive'));
		matchCaseBtn.title = localize('searchModal.matchCase', 'Match Case');
		matchCaseBtn.setAttribute('aria-label', localize('searchModal.matchCase', 'Match Case'));
		this._register(dom.addDisposableListener(matchCaseBtn, dom.EventType.CLICK, () => {
			this._matchCase = !this._matchCase;
			matchCaseBtn.classList.toggle('active', this._matchCase);
			this.scheduleSearch();
		}));

		const wholeWordBtn = dom.append(leftGroup, dom.$('button.toolbar-button'));
		dom.append(wholeWordBtn, dom.$('span.codicon.codicon-whole-word'));
		wholeWordBtn.title = localize('searchModal.matchWholeWord', 'Match Whole Word');
		wholeWordBtn.setAttribute('aria-label', localize('searchModal.matchWholeWord', 'Match Whole Word'));
		this._register(dom.addDisposableListener(wholeWordBtn, dom.EventType.CLICK, () => {
			this._wholeWord = !this._wholeWord;
			wholeWordBtn.classList.toggle('active', this._wholeWord);
			this.scheduleSearch();
		}));

		const regexBtn = dom.append(leftGroup, dom.$('button.toolbar-button'));
		dom.append(regexBtn, dom.$('span.codicon.codicon-regex'));
		regexBtn.title = localize('searchModal.useRegex', 'Use Regular Expression');
		regexBtn.setAttribute('aria-label', localize('searchModal.useRegex', 'Use Regular Expression'));
		this._register(dom.addDisposableListener(regexBtn, dom.EventType.CLICK, () => {
			this._useRegex = !this._useRegex;
			regexBtn.classList.toggle('active', this._useRegex);
			this.scheduleSearch();
		}));

		const rightGroup = dom.append(this._toolbarContainer, dom.$('.toolbar-hints'));
		const hintEl = dom.append(rightGroup, dom.$('span.toolbar-hint'));
		hintEl.textContent = localize('searchModal.keyboardHints', '↑↓ Navigate  ↵ Open  Tab Switch  Esc Close');
	}


	show(): void {
		if (this._isVisible) {
			return;
		}

		this._isVisible = true;
		this._backdropNode.style.display = 'block';
		this._domNode.setDisplay('flex');
		this._currentResults = [];
		this._selectedIndex = 0;
		this._displayLimit = DISPLAY_PAGE_SIZE;
		this._maxResults = INITIAL_MAX_RESULTS;
		this._hasMoreResults = false;
		this._inputBox.value = '';
		this._statusBar.textContent = '';

		// Clear editor and image
		this._previewModelRef.clear();
		this._previewEditor.setModel(null);
		this._previewImageWrap.style.display = 'none';
		this.setPreviewLabel(localize('searchModal.preview', 'Preview'));

		this.layout();
		this._inputBox.focus();
		this._inputBox.select();
		this.renderRecentSearches();
	}

	hide(): void {
		if (!this._isVisible) {
			return;
		}

		this._isVisible = false;
		this._backdropNode.style.display = 'none';
		this._domNode.setDisplay('none');

		if (this._searchTimeout) {
			clearTimeout(this._searchTimeout);
			this._searchTimeout = undefined;
		}
		if (this._currentCancellation) {
			this._currentCancellation.cancel();
			this._currentCancellation = undefined;
		}
		if (this._previewCts) {
			this._previewCts.cancel();
			this._previewCts = undefined;
		}

		this._onDidHide.fire();
	}

	layout(): void {
		const parentRect = this.parent.getBoundingClientRect();
		const top = Math.round((parentRect.height - SearchModalWidget.HEIGHT) / 2);
		const left = Math.round((parentRect.width - SearchModalWidget.WIDTH) / 2);
		this._domNode.setTop(Math.max(20, top));
		this._domNode.setLeft(Math.max(20, left));
	}

	private scheduleSearch(): void {
		if (this._searchTimeout) {
			clearTimeout(this._searchTimeout);
		}
		this._searchTimeout = setTimeout(() => {
			this._searchTimeout = undefined;
			this.onInputChanged();
		}, SEARCH_DEBOUNCE_MS);
	}

	private async onInputChanged(): Promise<void> {
		const value = this._inputBox.value.trim();

		if (!value) {
			this._currentResults = [];
			this._hasMoreResults = false;
			this.updateStatusBar(0);
			this.renderRecentSearches();
			this._previewEditor.setModel(null);
			this._previewImageWrap.style.display = 'none';
			this.setPreviewLabel(localize('searchModal.preview', 'Preview'));
			return;
		}

		if (this._currentCancellation) {
			this._currentCancellation.cancel();
		}
		this._currentCancellation = new CancellationTokenSource();
		this._displayLimit = DISPLAY_PAGE_SIZE;
		this._hasMoreResults = false;

		// Show loading
		this._resultItemDisposables.clear();
		dom.clearNode(this._resultsContainer);
		const loading = dom.append(this._resultsContainer, dom.$('.loading'));
		dom.append(loading, dom.$('.loading-spinner'));
		const loadingText = dom.append(loading, dom.$('div'));
		loadingText.textContent = localize('searchModal.searching', 'Searching...');

		try {
			const items: ISearchResultItem[] = [];

			if (this._currentTab === 'all' || this._currentTab === 'files') {
				items.push(...await this.searchFiles(value));
			}
			if (this._currentTab === 'all' || this._currentTab === 'symbols') {
				items.push(...await this.searchText(value));
			}
			if (this._currentTab === 'all' || this._currentTab === 'actions') {
				items.push(...await this.searchActions(value));
			}

			items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

			this._currentResults = items;
			this._selectedIndex = 0;
			this.renderResults();

			if (items.length > 0) {
				this.showPreview(items[0]);
			} else {
				this._previewEditor.setModel(null);
				this._previewImageWrap.style.display = 'none';
				this.setPreviewLabel(localize('searchModal.preview', 'Preview'));
			}

		} catch (error) {
			if (!this._currentCancellation?.token.isCancellationRequested) {
				console.error('Search error:', error);
			}
		}
	}

	/**
	 * Returns a relevance score for `pattern` against `text`.
	 * Higher is better; -1 means no match.
	 */
	private fuzzyScore(pattern: string, text: string): number {
		const lp = pattern.toLowerCase();
		const lt = text.toLowerCase();

		if (!lp) { return 0; }
		if (lt === lp) { return 100000; }
		if (lt.startsWith(lp)) { return 90000 + (1000 - lt.length); }

		const subIdx = lt.indexOf(lp);
		if (subIdx !== -1) {
			const atBoundary = subIdx === 0 || /[\s\-_./\\]/.test(text[subIdx - 1]);
			return (atBoundary ? 85000 : 80000) - subIdx * 10;
		}

		// Fuzzy: all chars must appear in order
		let score = 0;
		let consecutive = 0;
		let prevIdx = -1;
		let pi = 0;

		for (let i = 0; i < lt.length && pi < lp.length; i++) {
			if (lt[i] === lp[pi]) {
				consecutive = prevIdx === i - 1 ? consecutive + 1 : 1;
				score += consecutive * 8;
				if (i === 0 || /[\s\-_./\\]/.test(text[i - 1])) { score += 15; }
				prevIdx = i;
				pi++;
			}
		}

		return pi < lp.length ? -1 : score;
	}

	/** Returns character positions in `text` that match `pattern`, for highlighting. */
	private fuzzyMatchPositions(pattern: string, text: string): number[] {
		const lp = pattern.toLowerCase();
		const lt = text.toLowerCase();

		const subIdx = lt.indexOf(lp);
		if (subIdx !== -1) {
			return Array.from({ length: lp.length }, (_, i) => subIdx + i);
		}

		const positions: number[] = [];
		let pi = 0;
		for (let i = 0; i < lt.length && pi < lp.length; i++) {
			if (lt[i] === lp[pi]) { positions.push(i); pi++; }
		}
		return pi === lp.length ? positions : [];
	}

	private renderHighlightedText(container: HTMLElement, text: string, positions: number[]): void {
		if (positions.length === 0) {
			container.textContent = text;
			return;
		}
		const posSet = new Set(positions);
		let i = 0;
		while (i < text.length) {
			if (posSet.has(i)) {
				dom.append(container, dom.$('span.match-highlight')).textContent = text[i++];
			} else {
				let j = i;
				while (j < text.length && !posSet.has(j)) { j++; }
				dom.append(container, dom.$('span')).textContent = text.slice(i, j);
				i = j;
			}
		}
	}

	private async searchFiles(value: string): Promise<ISearchResultItem[]> {
		const folders = this.workspaceService.getWorkspace().folders;
		if (!folders.length) { return []; }

		const query: IFileQuery = {
			type: QueryType.File,
			filePattern: value,
			folderQueries: folders.map(f => ({ folder: f.uri })),
			maxResults: this._maxResults,
			sortByScore: true
		};

		const result = await this.searchService.fileSearch(query, this._currentCancellation!.token);
		if (result.results.length >= this._maxResults) { this._hasMoreResults = true; }

		return result.results.flatMap(fileMatch => {
			const resource = fileMatch.resource;
			const label = this.labelService.getUriBasenameLabel(resource);
			const score = this.fuzzyScore(value, label);
			if (score < 0) { return []; }
			return [{
				type: 'file' as const,
				resource,
				label,
				description: this.labelService.getUriLabel(resource, { relative: true }),
				detail: '',
				iconClasses: getIconClasses(this.modelService, this.languageService, resource),
				score,
				matchPositions: this.fuzzyMatchPositions(value, label)
			}];
		});
	}

	private async searchText(value: string): Promise<ISearchResultItem[]> {
		const folders = this.workspaceService.getWorkspace().folders;
		if (!folders.length) { return []; }

		let isRegex = this._useRegex;
		if (isRegex) {
			try { new RegExp(value); } catch { isRegex = false; }
		}

		const result = await this.searchService.textSearch({
			type: QueryType.Text,
			contentPattern: {
				pattern: value,
				isCaseSensitive: this._matchCase,
				isRegExp: isRegex,
				isWordMatch: this._wholeWord
			},
			folderQueries: folders.map(f => ({ folder: f.uri })),
			maxResults: this._maxResults
		}, this._currentCancellation!.token);

		if (result.results.length >= this._maxResults) { this._hasMoreResults = true; }

		const items: ISearchResultItem[] = [];
		result.results.forEach((fileMatch: IFileMatch) => {
			const resource = fileMatch.resource;
			const iconClasses = getIconClasses(this.modelService, this.languageService, resource);
			fileMatch.results?.forEach(searchResult => {
				if (!resultIsMatch(searchResult)) { return; }
				const previewText = searchResult.previewText.trim();
				const loc = searchResult.rangeLocations[0];
				if (!loc) { return; }
				const src = loc.source;
				const lp = previewText.toLowerCase();
				const lv = value.toLowerCase();
				const score = lp.includes(lv) ? 5000 - lp.indexOf(lv) : 500;
				items.push({
					type: 'text',
					resource,
					range: new Range(src.startLineNumber + 1, src.startColumn + 1, src.endLineNumber + 1, src.endColumn + 1),
					label: this.labelService.getUriBasenameLabel(resource),
					description: this.labelService.getUriLabel(resource, { relative: true }),
					detail: previewText,
					iconClasses,
					score
				});
			});
		});
		return items;
	}

	private async searchActions(_value: string): Promise<ISearchResultItem[]> {
		// TODO: implement command palette search
		return [];
	}

	private switchTab(tab: SearchTab): void {
		if (this._currentTab === tab) { return; }
		this._currentTab = tab;
		this._displayLimit = DISPLAY_PAGE_SIZE;

		this._tabsContainer.querySelectorAll('.search-tab').forEach((el, i) => {
			const ids: SearchTab[] = ['all', 'files', 'symbols', 'actions'];
			el.classList.toggle('active', ids[i] === tab);
		});

		this.scheduleSearch();
	}


	private updateStatusBar(total: number): void {
		if (total === 0) { this._statusBar.textContent = ''; return; }
		const shown = Math.min(total, this._displayLimit);
		this._statusBar.textContent = (shown < total || this._hasMoreResults)
			? localize('searchModal.statusPartial', 'Showing {0} of {1}{2} result(s)', shown, total, this._hasMoreResults ? '+' : '')
			: localize('searchModal.statusFull', '{0} result(s)', total);
	}


	private renderRecentSearches(): void {
		this._resultItemDisposables.clear();
		dom.clearNode(this._resultsContainer);

		if (!this._recentSearches.length) {
			const empty = dom.append(this._resultsContainer, dom.$('.no-results'));
			dom.append(empty, dom.$('.no-results-icon.codicon.codicon-search'));
			dom.append(empty, dom.$('.no-results-text')).textContent =
				localize('searchModal.typeToSearch', 'Type to search everywhere...');
			dom.append(empty, dom.$('.no-results-hint')).textContent =
				localize('searchModal.hintEmpty', 'Search files, text content, symbols, and actions');
			return;
		}

		const header = dom.append(this._resultsContainer, dom.$('.result-group-header'));
		dom.append(header, dom.$('span.codicon.codicon-history'));
		dom.append(header, dom.$('span')).textContent = localize('searchModal.recentSearches', 'Recent Searches');

		this._recentSearches.forEach(search => {
			const item = dom.append(this._resultsContainer, dom.$('.result-item'));
			dom.append(item, dom.$('.result-icon.codicon.codicon-history'));
			const content = dom.append(item, dom.$('.result-content'));
			dom.append(content, dom.$('.result-item-label')).textContent = search;
			this._resultItemDisposables.add(dom.addDisposableListener(item, dom.EventType.CLICK, () => {
				this._inputBox.value = search;
				this._inputBox.focus();
				this.scheduleSearch();
			}));
		});
	}

	private renderResults(): void {
		this._resultItemDisposables.clear();
		dom.clearNode(this._resultsContainer);

		if (!this._currentResults.length) {
			const noResults = dom.append(this._resultsContainer, dom.$('.no-results'));
			dom.append(noResults, dom.$('.no-results-icon.codicon.codicon-search'));
			dom.append(noResults, dom.$('.no-results-text')).textContent =
				localize('searchModal.noResults', 'No results found');
			dom.append(noResults, dom.$('.no-results-hint')).textContent =
				localize('searchModal.hint', 'Try different search terms or filters');
			return;
		}

		const groups = new Map<string, ISearchResultItem[]>();
		for (const item of this._currentResults) {
			if (!groups.has(item.type)) { groups.set(item.type, []); }
			groups.get(item.type)!.push(item);
		}

		const typeLabels: Record<string, string> = {
			'file': localize('searchModal.groupFiles', 'Files'),
			'text': localize('searchModal.groupText', 'Text Matches'),
			'symbol': localize('searchModal.groupSymbols', 'Symbols'),
			'action': localize('searchModal.groupActions', 'Actions')
		};
		const typeIcons: Record<string, string> = {
			'file': 'codicon-file', 'text': 'codicon-symbol-string',
			'symbol': 'codicon-symbol-class', 'action': 'codicon-zap'
		};

		let globalIndex = 0;

		groups.forEach((items, type) => {
			if (this._currentTab === 'all' && groups.size > 1) {
				const header = dom.append(this._resultsContainer, dom.$('.result-group-header'));
				dom.append(header, dom.$(`span.codicon.${typeIcons[type]}`));
				dom.append(header, dom.$('span')).textContent =
					`${typeLabels[type]} (${items.length}${this._hasMoreResults ? '+' : ''})`;
			}

			items.forEach(item => {
				const idx = globalIndex++;
				if (idx >= this._displayLimit) { return; }

				const row = dom.append(this._resultsContainer, dom.$('.result-item'));
				if (idx === this._selectedIndex) { row.classList.add('selected'); }

				// Icon
				const icon = dom.append(row, dom.$('.result-icon'));
				if (item.iconClasses?.length) {
					icon.classList.add(...item.iconClasses);
				} else {
					const fallback = { symbol: 'codicon-symbol-class', action: 'codicon-zap', text: 'codicon-symbol-string', file: 'codicon-file' }[item.type];
					icon.classList.add('codicon', fallback);
				}

				// Content
				const content = dom.append(row, dom.$('.result-content'));
				const labelRow = dom.append(content, dom.$('.result-item-label'));

				if (item.type !== 'file') {
					dom.append(labelRow, dom.$(`span.result-badge.result-badge-${item.type}`)).textContent = item.type;
				}

				const labelText = dom.append(labelRow, dom.$('span.label-text'));
				if (item.matchPositions?.length) {
					this.renderHighlightedText(labelText, item.label, item.matchPositions);
				} else {
					labelText.textContent = item.label;
				}

				if (item.description) {
					dom.append(content, dom.$('.result-item-description')).textContent = item.description;
				}
				if (item.detail) {
					dom.append(content, dom.$('.result-item-detail')).textContent = item.detail;
				}

				this._resultItemDisposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, () => {
					this._selectedIndex = idx;
					this.renderResults();
					this.showPreview(item);
				}));
				this._resultItemDisposables.add(dom.addDisposableListener(row, dom.EventType.DBLCLICK, () => {
					this.openSelectedResult();
				}));
			});
		});

		// Load More
		const shown = Math.min(this._currentResults.length, this._displayLimit);
		const total = this._currentResults.length;
		if (shown < total || this._hasMoreResults) {
			const container = dom.append(this._resultsContainer, dom.$('.load-more-container'));
			const btn = dom.append(container, dom.$('button.load-more-button'));
			dom.append(btn, dom.$('span.codicon.codicon-chevron-down'));
			const btnText = dom.append(btn, dom.$('span'));
			btnText.textContent = shown < total
				? localize('searchModal.loadMore', 'Show {0} More', Math.min(total - shown, DISPLAY_PAGE_SIZE))
				: localize('searchModal.loadMoreFromDisk', 'Load More From Disk');

			this._resultItemDisposables.add(dom.addDisposableListener(btn, dom.EventType.CLICK, () => {
				if (shown < total) {
					this._displayLimit += DISPLAY_PAGE_SIZE;
					this.renderResults();
				} else {
					this._maxResults += LOAD_MORE_INCREMENT;
					this._hasMoreResults = false;
					this.onInputChanged();
				}
			}));
		}

		this.updateStatusBar(total);
	}

	private setPreviewLabel(text: string): void {
		const el = this._previewHeader.querySelector<HTMLElement>('.preview-header-label');
		if (el) { el.textContent = text; }
	}

	private async showPreview(item: ISearchResultItem): Promise<void> {
		// Cancel any in-flight load
		if (this._previewCts) {
			this._previewCts.cancel();
		}
		this._previewCts = new CancellationTokenSource();
		const cts = this._previewCts;

		if (!item.resource) {
			this._previewEditor.setModel(null);
			this._previewImageWrap.style.display = 'none';
			this.setPreviewLabel(localize('searchModal.noPreview', 'No preview available'));
			return;
		}

		this.setPreviewLabel(this.labelService.getUriLabel(item.resource, { relative: true }));

		if (this.isImageResource(item.resource)) {
			this._previewEditor.setModel(null);
			this.renderImagePreview(item.resource);
			return;
		}

		// Hide image overlay while loading text
		this._previewImageWrap.style.display = 'none';

		try {
			const ref = await this.textModelService.createModelReference(item.resource);

			if (cts.token.isCancellationRequested) {
				ref.dispose();
				return;
			}

			// Assign new ref; MutableDisposable disposes the old one automatically
			this._previewModelRef.value = ref;
			const model = ref.object.textEditorModel;

			this._previewEditor.setModel(model);

			if (item.range) {
				// Scroll the match into view and highlight it
				this._previewEditor.revealRangeInCenter(item.range, ScrollType.Immediate);
				this._previewEditor.setSelection(item.range);
			} else {
				this._previewEditor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
			}

		} catch (error) {
			if (!cts.token.isCancellationRequested) {
				this._previewEditor.setModel(null);
				this.setPreviewLabel(localize('searchModal.previewError', 'Failed to load preview'));
				console.error('Preview error:', error);
			}
		}
	}

	private static readonly IMAGE_EXTENSIONS = new Set([
		'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg', 'tiff', 'tif', 'avif'
	]);

	private isImageResource(resource: URI): boolean {
		return SearchModalWidget.IMAGE_EXTENSIONS.has(resource.path.split('.').pop()?.toLowerCase() ?? '');
	}

	private renderImagePreview(resource: URI): void {
		dom.clearNode(this._previewImageWrap);
		const img = dom.append(this._previewImageWrap, dom.$('img.image-preview'));
		(img as HTMLImageElement).src = resource.toString(true);
		(img as HTMLImageElement).alt = this.labelService.getUriBasenameLabel(resource);
		this._previewImageWrap.style.display = 'flex';
	}


	private onKeyDown(e: KeyboardEvent): void {
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				this.hide();
				break;
			case 'ArrowDown':
				e.preventDefault();
				this.selectNext();
				break;
			case 'ArrowUp':
				e.preventDefault();
				this.selectPrevious();
				break;
			case 'Enter':
				e.preventDefault();
				this.addRecentSearch(this._inputBox.value);
				this.openSelectedResult();
				break;
			case 'Tab':
				e.preventDefault();
				const tabs: SearchTab[] = ['all', 'files', 'symbols', 'actions'];
				this.switchTab(tabs[(tabs.indexOf(this._currentTab) + 1) % tabs.length]);
				break;
		}
	}

	private selectNext(): void {
		if (!this._currentResults.length) { return; }
		const visible = Math.min(this._currentResults.length, this._displayLimit);
		this._selectedIndex = (this._selectedIndex + 1) % visible;
		this.renderResults();
		this.showPreview(this._currentResults[this._selectedIndex]);
		this.scrollSelectedIntoView();
	}

	private selectPrevious(): void {
		if (!this._currentResults.length) { return; }
		const visible = Math.min(this._currentResults.length, this._displayLimit);
		this._selectedIndex = (this._selectedIndex - 1 + visible) % visible;
		this.renderResults();
		this.showPreview(this._currentResults[this._selectedIndex]);
		this.scrollSelectedIntoView();
	}

	private scrollSelectedIntoView(): void {
		this._resultsContainer.querySelector('.result-item.selected')
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	private addRecentSearch(value: string): void {
		const trimmed = value.trim();
		if (!trimmed) { return; }
		const idx = this._recentSearches.indexOf(trimmed);
		if (idx !== -1) { this._recentSearches.splice(idx, 1); }
		this._recentSearches.unshift(trimmed);
		if (this._recentSearches.length > MAX_RECENT_SEARCHES) {
			this._recentSearches.length = MAX_RECENT_SEARCHES;
		}
	}

	private openSelectedResult(): void {
		if (!this._currentResults.length || this._selectedIndex < 0) { return; }

		const item = this._currentResults[this._selectedIndex];
		if (item.resource) {
			this.editorService.openEditor({
				resource: item.resource,
				options: { selection: item.range, preserveFocus: false, revealIfOpened: true, pinned: true }
			});
		} else if (item.commandId) {
			this.commandService.executeCommand(item.commandId);
		}

		this.addRecentSearch(this._inputBox.value);
		this.hide();
	}
}
