/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Delayer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import './media/searchEditor.css';
import { ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { ICodeEditorViewState } from '../../../../editor/common/editorCommon.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ReferencesController } from '../../../../editor/contrib/gotoSymbol/browser/peek/referencesController.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IEditorProgressService, LongRunningOperation } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { inputBorder, registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { AbstractTextCodeEditor } from '../../../browser/parts/editor/textCodeEditor.js';
import { EditorInputCapabilities, IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ExcludePatternInputWidget, IncludePatternInputWidget } from '../../search/browser/patternInputWidget.js';
import { SearchWidget } from '../../search/browser/searchWidget.js';
import { ITextQueryBuilderOptions, QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { getOutOfWorkspaceEditorResources } from '../../search/common/search.js';
import { SearchModelImpl } from '../../search/browser/searchTreeModel/searchModel.js';
import { InSearchEditor, SearchEditorID, SearchEditorInputTypeId, SearchConfiguration } from './constants.js';
import type { SearchEditorInput } from './searchEditorInput.js';
import { serializeSearchResultForEditor } from './searchEditorSerialization.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPatternInfo, ISearchComplete, ISearchConfigurationProperties, ITextQuery, SearchSortOrder } from '../../../services/search/common/search.js';
import { searchDetailsIcon } from '../../search/browser/searchIcons.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { TextSearchCompleteMessage } from '../../../services/search/common/searchExtTypes.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { renderSearchMessage } from '../../search/browser/searchMessage.js';
import { EditorExtensionsRegistry, IEditorContributionDescription } from '../../../../editor/browser/editorExtensions.js';
import { UnusualLineTerminatorsDetector } from '../../../../editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js';
import { defaultToggleStyles, getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SearchContext } from '../../search/common/constants.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ISearchResult } from '../../search/browser/searchTreeModel/searchTreeCommon.js';

const RESULT_LINE_REGEX = /^(\s+)(\d+)(: |  )(\s*)(.*)$/;
const FILE_LINE_REGEX = /^(\S.*):$/;

type SearchEditorViewState = ICodeEditorViewState & { focused: 'input' | 'editor' };

export class SearchEditor extends AbstractTextCodeEditor<SearchEditorViewState> {
	static readonly ID: string = SearchEditorID;

	static readonly SEARCH_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'searchEditorViewState';

	private queryEditorWidget!: SearchWidget;
	private get searchResultEditor() { return this.editorControl!; }
	private queryEditorContainer!: HTMLElement;
	private dimension?: DOM.Dimension;
	private inputPatternIncludes!: IncludePatternInputWidget;
	private inputPatternExcludes!: ExcludePatternInputWidget;
	private includesExcludesContainer!: HTMLElement;
	private toggleQueryDetailsButton!: HTMLElement;
	private messageBox!: HTMLElement;

	private runSearchDelayer = new Delayer(0);
	private pauseSearching: boolean = false;
	private showingIncludesExcludes: boolean = false;
	private searchOperation: LongRunningOperation;
	private searchHistoryDelayer: Delayer<void>;
	private readonly messageDisposables: DisposableStore;
	private container: HTMLElement;
	private searchModel: SearchModelImpl;
	private ongoingOperations: number = 0;
	private updatingModelForSearch: boolean = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorProgressService progressService: IEditorProgressService,
		@ITextResourceConfigurationService textResourceService: ITextResourceConfigurationService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super(SearchEditor.ID, group, telemetryService, instantiationService, storageService, textResourceService, themeService, editorService, editorGroupService, fileService);
		this.container = DOM.$('.search-editor');

		this.searchOperation = this._register(new LongRunningOperation(progressService));
		this._register(this.messageDisposables = new DisposableStore());

		this.searchHistoryDelayer = new Delayer<void>(2000);

		this.searchModel = this._register(this.instantiationService.createInstance(SearchModelImpl));
	}

	protected override createEditor(parent: HTMLElement) {
		DOM.append(parent, this.container);
		this.queryEditorContainer = DOM.append(this.container, DOM.$('.query-container'));
		const searchResultContainer = DOM.append(this.container, DOM.$('.search-results'));
		super.createEditor(searchResultContainer);
		this.registerEditorListeners();

		const scopedContextKeyService = assertIsDefined(this.scopedContextKeyService);
		InSearchEditor.bindTo(scopedContextKeyService).set(true);

		this.createQueryEditor(
			this.queryEditorContainer,
			this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))),
			SearchContext.InputBoxFocusedKey.bindTo(scopedContextKeyService)
		);
	}


	private createQueryEditor(container: HTMLElement, scopedInstantiationService: IInstantiationService, inputBoxFocusedContextKey: IContextKey<boolean>) {
		const searchEditorInputboxStyles = getInputBoxStyle({ inputBorder: searchEditorTextInputBorder });

		this.queryEditorWidget = this._register(scopedInstantiationService.createInstance(SearchWidget, container, { _hideReplaceToggle: true, showContextToggle: true, inputBoxStyles: searchEditorInputboxStyles, toggleStyles: defaultToggleStyles }));
		this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
		this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
		this._register(this.queryEditorWidget.onSearchSubmit(({ delay }) => this.triggerSearch({ delay })));
		if (this.queryEditorWidget.searchInput) {
			this._register(this.queryEditorWidget.searchInput.onDidOptionChange(() => this.triggerSearch({ resetCursor: false })));
		} else {
			this.logService.warn('SearchEditor: SearchWidget.searchInput is undefined, cannot register onDidOptionChange listener');
		}
		this._register(this.queryEditorWidget.onDidToggleContext(() => this.triggerSearch({ resetCursor: false })));

		// Includes/Excludes Dropdown
		this.includesExcludesContainer = DOM.append(container, DOM.$('.includes-excludes'));

		// Toggle query details button
		const toggleQueryDetailsLabel = localize('moreSearch', "Toggle Search Details");
		this.toggleQueryDetailsButton = DOM.append(this.includesExcludesContainer, DOM.$('.expand' + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: 'button', 'aria-label': toggleQueryDetailsLabel }));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.toggleQueryDetailsButton, toggleQueryDetailsLabel));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.CLICK, e => {
			DOM.EventHelper.stop(e);
			this.toggleIncludesExcludes();
		}));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				DOM.EventHelper.stop(e);
				this.toggleIncludesExcludes();
			}
		}));
		this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
				if (this.queryEditorWidget.isReplaceActive()) {
					this.queryEditorWidget.focusReplaceAllAction();
				}
				else {
					this.queryEditorWidget.isReplaceShown() ? this.queryEditorWidget.replaceInput?.focusOnPreserve() : this.queryEditorWidget.focusRegexAction();
				}
				DOM.EventHelper.stop(e);
			}
		}));

		// Includes
		const folderIncludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.includes'));
		const filesToIncludeTitle = localize('searchScope.includes', "files to include");
		DOM.append(folderIncludesList, DOM.$('h4', undefined, filesToIncludeTitle));
		this.inputPatternIncludes = this._register(scopedInstantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
			ariaLabel: localize('label.includes', 'Search Include Patterns'),
			inputBoxStyles: searchEditorInputboxStyles
		}));
		this.inputPatternIncludes.onSubmit(triggeredOnType => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 }));
		this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerSearch()));

		// Excludes
		const excludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.excludes'));
		const excludesTitle = localize('searchScope.excludes', "files to exclude");
		DOM.append(excludesList, DOM.$('h4', undefined, excludesTitle));
		this.inputPatternExcludes = this._register(scopedInstantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
			ariaLabel: localize('label.excludes', 'Search Exclude Patterns'),
			inputBoxStyles: searchEditorInputboxStyles
		}));
		this._register(this.inputPatternExcludes.onSubmit(triggeredOnType => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
		this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerSearch()));

		// Messages
		this.messageBox = DOM.append(container, DOM.$('.messages.text-search-provider-messages'));

		[this.queryEditorWidget.searchInputFocusTracker, this.queryEditorWidget.replaceInputFocusTracker, this.inputPatternExcludes.inputFocusTracker, this.inputPatternIncludes.inputFocusTracker]
			.forEach(tracker => {
				if (!tracker) {
					return;
				}
				this._register(tracker.onDidFocus(() => setTimeout(() => inputBoxFocusedContextKey.set(true), 0)));
				this._register(tracker.onDidBlur(() => inputBoxFocusedContextKey.set(false)));
			});
	}

	private toggleRunAgainMessage(show: boolean) {
		DOM.clearNode(this.messageBox);
		this.messageDisposables.clear();

		if (show) {
			const runAgainLink = DOM.append(this.messageBox, DOM.$('a.pointer.prominent.message', {}, localize('runSearch', "Run Search")));
			this.messageDisposables.add(DOM.addDisposableListener(runAgainLink, DOM.EventType.CLICK, async () => {
				await this.triggerSearch();
				this.searchResultEditor.focus();
			}));
		}
	}

	private _getContributions(): IEditorContributionDescription[] {
		const skipContributions = [UnusualLineTerminatorsDetector.ID];
		return EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);
	}

	protected override getCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return { contributions: this._getContributions() };
	}

	private registerEditorListeners() {
		this._register(this.searchResultEditor.onMouseUp(e => {
			if (e.event.detail === 1) {
				const behaviour = this.searchConfig.searchEditor.singleClickBehaviour;
				const position = e.target.position;
				if (position && behaviour === 'peekDefinition') {
					const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? '';
					if (line.match(FILE_LINE_REGEX) || line.match(RESULT_LINE_REGEX)) {
						this.searchResultEditor.setSelection(Range.fromPositions(position));
						this.commandService.executeCommand('editor.action.peekDefinition');
					}
				}
			} else if (e.event.detail === 2) {
				const behaviour = this.searchConfig.searchEditor.doubleClickBehaviour;
				const position = e.target.position;
				if (position && behaviour !== 'selectWord') {
					const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? '';
					if (line.match(RESULT_LINE_REGEX)) {
						this.searchResultEditor.setSelection(Range.fromPositions(position));
						this.commandService.executeCommand(behaviour === 'goToLocation' ? 'editor.action.goToDeclaration' : 'editor.action.openDeclarationToTheSide');
					} else if (line.match(FILE_LINE_REGEX)) {
						this.searchResultEditor.setSelection(Range.fromPositions(position));
						this.commandService.executeCommand('editor.action.peekDefinition');
					}
				}
			}
		}));
		this._register(this.searchResultEditor.onDidChangeModelContent(() => {
			if (!this.updatingModelForSearch) {
				this.getInput()?.setDirty(true);
			}
		}));
	}

	override getControl() {
		return this.searchResultEditor;
	}

	override focus() {
		super.focus();

		const viewState = this.loadEditorViewState(this.getInput());
		if (viewState && viewState.focused === 'editor') {
			this.searchResultEditor.focus();
		} else {
			this.queryEditorWidget.focus();
		}
	}

	focusSearchInput() {
		this.queryEditorWidget.searchInput?.focus();
	}

	focusFilesToIncludeInput() {
		if (!this.showingIncludesExcludes) {
			this.toggleIncludesExcludes(true);
		}
		this.inputPatternIncludes.focus();
	}

	focusFilesToExcludeInput() {
		if (!this.showingIncludesExcludes) {
			this.toggleIncludesExcludes(true);
		}
		this.inputPatternExcludes.focus();
	}

	focusNextInput() {
		if (this.queryEditorWidget.searchInputHasFocus()) {
			if (this.showingIncludesExcludes) {
				this.inputPatternIncludes.focus();
			} else {
				this.searchResultEditor.focus();
			}
		} else if (this.inputPatternIncludes.inputHasFocus()) {
			this.inputPatternExcludes.focus();
		} else if (this.inputPatternExcludes.inputHasFocus()) {
			this.searchResultEditor.focus();
		} else if (this.searchResultEditor.hasWidgetFocus()) {
			// pass
		}
	}

	focusPrevInput() {
		if (this.queryEditorWidget.searchInputHasFocus()) {
			this.searchResultEditor.focus(); // wrap
		} else if (this.inputPatternIncludes.inputHasFocus()) {
			this.queryEditorWidget.searchInput?.focus();
		} else if (this.inputPatternExcludes.inputHasFocus()) {
			this.inputPatternIncludes.focus();
		} else if (this.searchResultEditor.hasWidgetFocus()) {
			// unreachable.
		}
	}

	setQuery(query: string) {
		this.queryEditorWidget.searchInput?.setValue(query);
	}

	selectQuery() {
		this.queryEditorWidget.searchInput?.select();
	}

	toggleWholeWords() {
		this.queryEditorWidget.searchInput?.setWholeWords(!this.queryEditorWidget.searchInput.getWholeWords());
		this.triggerSearch({ resetCursor: false });
	}

	toggleRegex() {
		this.queryEditorWidget.searchInput?.setRegex(!this.queryEditorWidget.searchInput.getRegex());
		this.triggerSearch({ resetCursor: false });
	}

	toggleCaseSensitive() {
		this.queryEditorWidget.searchInput?.setCaseSensitive(!this.queryEditorWidget.searchInput.getCaseSensitive());
		this.triggerSearch({ resetCursor: false });
	}

	toggleContextLines() {
		this.queryEditorWidget.toggleContextLines();
	}

	modifyContextLines(increase: boolean) {
		this.queryEditorWidget.modifyContextLines(increase);
	}

	toggleQueryDetails(shouldShow?: boolean) {
		this.toggleIncludesExcludes(shouldShow);
	}

	deleteResultBlock() {
		const linesToDelete = new Set<number>();

		const selections = this.searchResultEditor.getSelections();
		const model = this.searchResultEditor.getModel();
		if (!(selections && model)) { return; }

		const maxLine = model.getLineCount();
		const minLine = 1;

		const deleteUp = (start: number) => {
			for (let cursor = start; cursor >= minLine; cursor--) {
				const line = model.getLineContent(cursor);
				linesToDelete.add(cursor);
				if (line[0] !== undefined && line[0] !== ' ') {
					break;
				}
			}
		};

		const deleteDown = (start: number): number | undefined => {
			linesToDelete.add(start);
			for (let cursor = start + 1; cursor <= maxLine; cursor++) {
				const line = model.getLineContent(cursor);
				if (line[0] !== undefined && line[0] !== ' ') {
					return cursor;
				}
				linesToDelete.add(cursor);
			}
			return;
		};

		const endingCursorLines: Array<number | undefined> = [];
		for (const selection of selections) {
			const lineNumber = selection.startLineNumber;
			endingCursorLines.push(deleteDown(lineNumber));
			deleteUp(lineNumber);
			for (let inner = selection.startLineNumber; inner <= selection.endLineNumber; inner++) {
				linesToDelete.add(inner);
			}
		}

		if (endingCursorLines.length === 0) { endingCursorLines.push(1); }

		const isDefined = <T>(x: T | undefined): x is T => x !== undefined;

		model.pushEditOperations(this.searchResultEditor.getSelections(),
			[...linesToDelete].map(line => ({ range: new Range(line, 1, line + 1, 1), text: '' })),
			() => endingCursorLines.filter(isDefined).map(line => new Selection(line, 1, line, 1)));
	}

	cleanState() {
		this.getInput()?.setDirty(false);
	}

	private get searchConfig(): ISearchConfigurationProperties {
		return this.configurationService.getValue<ISearchConfigurationProperties>('search');
	}

	private iterateThroughMatches(reverse: boolean) {
		const model = this.searchResultEditor.getModel();
		if (!model) { return; }

		const lastLine = model.getLineCount() ?? 1;
		const lastColumn = model.getLineLength(lastLine);

		const fallbackStart = reverse ? new Position(lastLine, lastColumn) : new Position(1, 1);

		const currentPosition = this.searchResultEditor.getSelection()?.getStartPosition() ?? fallbackStart;

		const matchRanges = this.getInput()?.getMatchRanges();
		if (!matchRanges) { return; }

		const matchRange = (reverse ? findPrevRange : findNextRange)(matchRanges, currentPosition);
		if (!matchRange) { return; }

		this.searchResultEditor.setSelection(matchRange);
		this.searchResultEditor.revealLineInCenterIfOutsideViewport(matchRange.startLineNumber);
		this.searchResultEditor.focus();

		const matchLineText = model.getLineContent(matchRange.startLineNumber);
		const matchText = model.getValueInRange(matchRange);
		let file = '';
		for (let line = matchRange.startLineNumber; line >= 1; line--) {
			const lineText = model.getValueInRange(new Range(line, 1, line, 2));
			if (lineText !== ' ') { file = model.getLineContent(line); break; }
		}
		alert(localize('searchResultItem', "Matched {0} at {1} in file {2}", matchText, matchLineText, file.slice(0, file.length - 1)));
	}

	focusNextResult() {
		this.iterateThroughMatches(false);
	}

	focusPreviousResult() {
		this.iterateThroughMatches(true);
	}

	focusAllResults() {
		this.searchResultEditor
			.setSelections((this.getInput()?.getMatchRanges() ?? []).map(
				range => new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)));
		this.searchResultEditor.focus();
	}

	async triggerSearch(_options?: { resetCursor?: boolean; delay?: number; focusResults?: boolean }) {
		const focusResults = this.searchConfig.searchEditor.focusResultsOnSearch;

		// If _options don't define focusResult field, then use the setting
		if (_options === undefined) {
			_options = { focusResults: focusResults };
		} else if (_options.focusResults === undefined) {
			_options.focusResults = focusResults;
		}

		const options = { resetCursor: true, delay: 0, ..._options };

		if (!(this.queryEditorWidget.searchInput?.inputBox.isInputValid())) {
			return;
		}

		if (!this.pauseSearching) {
			await this.runSearchDelayer.trigger(async () => {
				this.toggleRunAgainMessage(false);
				await this.doRunSearch();
				if (options.resetCursor) {
					this.searchResultEditor.setPosition(new Position(1, 1));
					this.searchResultEditor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
				}
				if (options.focusResults) {
					this.searchResultEditor.focus();
				}
			}, options.delay);
		}
	}

	private readConfigFromWidget(): SearchConfiguration {
		return {
			isCaseSensitive: this.queryEditorWidget.searchInput?.getCaseSensitive() ?? false,
			contextLines: this.queryEditorWidget.getContextLines(),
			filesToExclude: this.inputPatternExcludes.getValue(),
			filesToInclude: this.inputPatternIncludes.getValue(),
			query: this.queryEditorWidget.searchInput?.getValue() ?? '',
			isRegexp: this.queryEditorWidget.searchInput?.getRegex() ?? false,
			matchWholeWord: this.queryEditorWidget.searchInput?.getWholeWords() ?? false,
			useExcludeSettingsAndIgnoreFiles: this.inputPatternExcludes.useExcludesAndIgnoreFiles(),
			onlyOpenEditors: this.inputPatternIncludes.onlySearchInOpenEditors(),
			showIncludesExcludes: this.showingIncludesExcludes,
			notebookSearchConfig: {
				includeMarkupInput: this.queryEditorWidget.getNotebookFilters().markupInput,
				includeMarkupPreview: this.queryEditorWidget.getNotebookFilters().markupPreview,
				includeCodeInput: this.queryEditorWidget.getNotebookFilters().codeInput,
				includeOutput: this.queryEditorWidget.getNotebookFilters().codeOutput,
			}
		};
	}

	private async doRunSearch() {
		this.searchModel.cancelSearch(true);

		const startInput = this.getInput();
		if (!startInput) { return; }

		this.searchHistoryDelayer.trigger(() => {
			this.queryEditorWidget.searchInput?.onSearchSubmit();
			this.inputPatternExcludes.onSearchSubmit();
			this.inputPatternIncludes.onSearchSubmit();
		});

		const config = this.readConfigFromWidget();

		if (!config.query) { return; }

		const content: IPatternInfo = {
			pattern: config.query,
			isRegExp: config.isRegexp,
			isCaseSensitive: config.isCaseSensitive,
			isWordMatch: config.matchWholeWord,
		};

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchEditor',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			maxResults: this.searchConfig.maxResults ?? undefined,
			disregardIgnoreFiles: !config.useExcludeSettingsAndIgnoreFiles || undefined,
			disregardExcludeSettings: !config.useExcludeSettingsAndIgnoreFiles || undefined,
			excludePattern: [{ pattern: config.filesToExclude }],
			includePattern: config.filesToInclude,
			onlyOpenEditors: config.onlyOpenEditors,
			previewOptions: {
				matchLines: 1,
				charsPerLine: 1000
			},
			surroundingContext: config.contextLines,
			isSmartCase: this.searchConfig.smartCase,
			expandPatterns: true,
			notebookSearchConfig: {
				includeMarkupInput: config.notebookSearchConfig.includeMarkupInput,
				includeMarkupPreview: config.notebookSearchConfig.includeMarkupPreview,
				includeCodeInput: config.notebookSearchConfig.includeCodeInput,
				includeOutput: config.notebookSearchConfig.includeOutput,
			}
		};

		const folderResources = this.contextService.getWorkspace().folders;
		let query: ITextQuery;
		try {
			const queryBuilder = this.instantiationService.createInstance(QueryBuilder);
			query = queryBuilder.text(content, folderResources.map(folder => folder.uri), options);
		}
		catch (err) {
			return;
		}

		this.searchOperation.start(500);
		this.ongoingOperations++;

		const { configurationModel } = await startInput.resolveModels();
		configurationModel.updateConfig(config);
		const result = this.searchModel.search(query);
		startInput.ongoingSearchOperation = result.asyncResults.finally(() => {
			this.ongoingOperations--;
			if (this.ongoingOperations === 0) {
				this.searchOperation.stop();
			}
		});

		const searchOperation = await startInput.ongoingSearchOperation;
		await this.onSearchComplete(searchOperation, config, startInput);
	}

	private async onSearchComplete(searchOperation: ISearchComplete, startConfig: SearchConfiguration, startInput: SearchEditorInput) {
		const input = this.getInput();
		if (!input ||
			input !== startInput ||
			JSON.stringify(startConfig) !== JSON.stringify(this.readConfigFromWidget())) {
			return;
		}

		input.ongoingSearchOperation = undefined;

		const sortOrder = this.searchConfig.sortOrder;
		if (sortOrder === SearchSortOrder.Modified) {
			await this.retrieveFileStats(this.searchModel.searchResult);
		}

		const controller = ReferencesController.get(this.searchResultEditor);
		controller?.closeWidget(false);
		const labelFormatter = (uri: URI): string => this.labelService.getUriLabel(uri, { relative: true });
		const results = serializeSearchResultForEditor(this.searchModel.searchResult, startConfig.filesToInclude, startConfig.filesToExclude, startConfig.contextLines, labelFormatter, sortOrder, searchOperation?.limitHit);
		const { resultsModel } = await input.resolveModels();
		this.updatingModelForSearch = true;
		this.modelService.updateModel(resultsModel, results.text);
		this.updatingModelForSearch = false;

		if (searchOperation && searchOperation.messages) {
			for (const message of searchOperation.messages) {
				this.addMessage(message);
			}
		}
		this.reLayout();

		input.setDirty(!input.hasCapability(EditorInputCapabilities.Untitled));
		input.setMatchRanges(results.matchRanges);
	}

	private addMessage(message: TextSearchCompleteMessage) {
		let messageBox: HTMLElement;
		if (this.messageBox.firstChild) {
			messageBox = this.messageBox.firstChild as HTMLElement;
		} else {
			messageBox = DOM.append(this.messageBox, DOM.$('.message'));
		}

		DOM.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerSearch()));
	}

	private async retrieveFileStats(searchResult: ISearchResult): Promise<void> {
		const files = searchResult.matches().filter(f => !f.fileStat).map(f => f.resolveFileStat(this.fileService));
		await Promise.all(files);
	}

	override layout(dimension: DOM.Dimension) {
		this.dimension = dimension;
		this.reLayout();
	}

	getSelected() {
		const selection = this.searchResultEditor.getSelection();
		if (selection) {
			return this.searchResultEditor.getModel()?.getValueInRange(selection) ?? '';
		}
		return '';
	}

	private reLayout() {
		if (this.dimension) {
			this.queryEditorWidget.setWidth(this.dimension.width - 28 /* container margin */);
			this.searchResultEditor.layout({ height: this.dimension.height - DOM.getTotalHeight(this.queryEditorContainer), width: this.dimension.width });
			this.inputPatternExcludes.setWidth(this.dimension.width - 28 /* container margin */);
			this.inputPatternIncludes.setWidth(this.dimension.width - 28 /* container margin */);
		}
	}

	private getInput(): SearchEditorInput | undefined {
		return this.input as SearchEditorInput;
	}

	private priorConfig: Partial<Readonly<SearchConfiguration>> | undefined;
	setSearchConfig(config: Partial<Readonly<SearchConfiguration>>) {
		this.priorConfig = config;
		if (config.query !== undefined) { this.queryEditorWidget.setValue(config.query); }
		if (config.isCaseSensitive !== undefined) { this.queryEditorWidget.searchInput?.setCaseSensitive(config.isCaseSensitive); }
		if (config.isRegexp !== undefined) { this.queryEditorWidget.searchInput?.setRegex(config.isRegexp); }
		if (config.matchWholeWord !== undefined) { this.queryEditorWidget.searchInput?.setWholeWords(config.matchWholeWord); }
		if (config.contextLines !== undefined) { this.queryEditorWidget.setContextLines(config.contextLines); }
		if (config.filesToExclude !== undefined) { this.inputPatternExcludes.setValue(config.filesToExclude); }
		if (config.filesToInclude !== undefined) { this.inputPatternIncludes.setValue(config.filesToInclude); }
		if (config.onlyOpenEditors !== undefined) { this.inputPatternIncludes.setOnlySearchInOpenEditors(config.onlyOpenEditors); }
		if (config.useExcludeSettingsAndIgnoreFiles !== undefined) { this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(config.useExcludeSettingsAndIgnoreFiles); }
		if (config.showIncludesExcludes !== undefined) { this.toggleIncludesExcludes(config.showIncludesExcludes); }
	}

	override async setInput(newInput: SearchEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(newInput, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		const { configurationModel, resultsModel } = await newInput.resolveModels();
		if (token.isCancellationRequested) { return; }

		this.searchResultEditor.setModel(resultsModel);
		this.pauseSearching = true;

		this.toggleRunAgainMessage(!newInput.ongoingSearchOperation && resultsModel.getLineCount() === 1 && resultsModel.getValueLength() === 0 && configurationModel.config.query !== '');

		this.setSearchConfig(configurationModel.config);

		this._register(configurationModel.onConfigDidUpdate(newConfig => {
			if (newConfig !== this.priorConfig) {
				this.pauseSearching = true;
				this.setSearchConfig(newConfig);
				this.pauseSearching = false;
			}
		}));

		this.restoreViewState(context);

		if (!options?.preserveFocus) {
			this.focus();
		}

		this.pauseSearching = false;

		if (newInput.ongoingSearchOperation) {
			const existingConfig = this.readConfigFromWidget();
			newInput.ongoingSearchOperation.then(complete => {
				this.onSearchComplete(complete, existingConfig, newInput);
			});
		}
	}

	private toggleIncludesExcludes(_shouldShow?: boolean): void {
		const cls = 'expanded';
		const shouldShow = _shouldShow ?? !this.includesExcludesContainer.classList.contains(cls);

		if (shouldShow) {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
			this.includesExcludesContainer.classList.add(cls);
		} else {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'false');
			this.includesExcludesContainer.classList.remove(cls);
		}

		this.showingIncludesExcludes = this.includesExcludesContainer.classList.contains(cls);

		this.reLayout();
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		if (input.typeId === SearchEditorInputTypeId) {
			return (input as SearchEditorInput).modelUri;
		}

		return undefined;
	}

	protected override computeEditorViewState(resource: URI): SearchEditorViewState | undefined {
		const control = this.getControl();
		const editorViewState = control.saveViewState();
		if (!editorViewState) { return undefined; }
		if (resource.toString() !== this.getInput()?.modelUri.toString()) { return undefined; }

		return { ...editorViewState, focused: this.searchResultEditor.hasWidgetFocus() ? 'editor' : 'input' };
	}

	protected tracksEditorViewState(input: EditorInput): boolean {
		return input.typeId === SearchEditorInputTypeId;
	}

	private restoreViewState(context: IEditorOpenContext) {
		const viewState = this.loadEditorViewState(this.getInput(), context);
		if (viewState) { this.searchResultEditor.restoreViewState(viewState); }
	}

	getAriaLabel() {
		return this.getInput()?.getName() ?? localize('searchEditor', "Search");
	}
}

const searchEditorTextInputBorder = registerColor('searchEditor.textInputBorder', inputBorder, localize('textInputBoxBorder', "Search editor text input box border."));

function findNextRange(matchRanges: Range[], currentPosition: Position) {
	for (const matchRange of matchRanges) {
		if (Position.isBefore(currentPosition, matchRange.getStartPosition())) {
			return matchRange;
		}
	}
	return matchRanges[0];
}

function findPrevRange(matchRanges: Range[], currentPosition: Position) {
	for (let i = matchRanges.length - 1; i >= 0; i--) {
		const matchRange = matchRanges[i];
		if (Position.isBefore(matchRange.getStartPosition(), currentPosition)) {
			{
				return matchRange;
			}
		}
	}
	return matchRanges[matchRanges.length - 1];
}
