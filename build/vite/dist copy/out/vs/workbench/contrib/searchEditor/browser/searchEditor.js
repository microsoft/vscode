/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SearchEditor_1;
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Delayer } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import './media/searchEditor.css';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ReferencesController } from '../../../../editor/contrib/gotoSymbol/browser/peek/referencesController.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
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
import { ExcludePatternInputWidget, IncludePatternInputWidget } from '../../search/browser/patternInputWidget.js';
import { SearchWidget } from '../../search/browser/searchWidget.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { getOutOfWorkspaceEditorResources } from '../../search/common/search.js';
import { SearchModelImpl } from '../../search/browser/searchTreeModel/searchModel.js';
import { InSearchEditor, SearchEditorID, SearchEditorInputTypeId } from './constants.js';
import { serializeSearchResultForEditor } from './searchEditorSerialization.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { searchDetailsIcon } from '../../search/browser/searchIcons.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { renderSearchMessage } from '../../search/browser/searchMessage.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { UnusualLineTerminatorsDetector } from '../../../../editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js';
import { defaultToggleStyles, getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SearchContext } from '../../search/common/constants.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
const RESULT_LINE_REGEX = /^(\s+)(\d+)(: |  )(\s*)(.*)$/;
const FILE_LINE_REGEX = /^(\S.*):$/;
let SearchEditor = class SearchEditor extends AbstractTextCodeEditor {
    static { SearchEditor_1 = this; }
    static { this.ID = SearchEditorID; }
    static { this.SEARCH_EDITOR_VIEW_STATE_PREFERENCE_KEY = 'searchEditorViewState'; }
    get searchResultEditor() { return this.editorControl; }
    constructor(group, telemetryService, themeService, storageService, modelService, contextService, labelService, instantiationService, contextViewService, commandService, openerService, notificationService, progressService, textResourceService, editorGroupService, editorService, configurationService, fileService, logService, hoverService) {
        super(SearchEditor_1.ID, group, telemetryService, instantiationService, storageService, textResourceService, themeService, editorService, editorGroupService, fileService);
        this.modelService = modelService;
        this.contextService = contextService;
        this.labelService = labelService;
        this.contextViewService = contextViewService;
        this.commandService = commandService;
        this.openerService = openerService;
        this.notificationService = notificationService;
        this.configurationService = configurationService;
        this.logService = logService;
        this.hoverService = hoverService;
        this.runSearchDelayer = this._register(new Delayer(0));
        this.pauseSearching = false;
        this.showingIncludesExcludes = false;
        this.ongoingOperations = 0;
        this.updatingModelForSearch = false;
        this.container = DOM.$('.search-editor');
        this.searchOperation = this._register(new LongRunningOperation(progressService));
        this._register(this.messageDisposables = new DisposableStore());
        this.searchHistoryDelayer = this._register(new Delayer(2000));
        this.searchModel = this._register(this.instantiationService.createInstance(SearchModelImpl));
    }
    createEditor(parent) {
        DOM.append(parent, this.container);
        this.queryEditorContainer = DOM.append(this.container, DOM.$('.query-container'));
        const searchResultContainer = DOM.append(this.container, DOM.$('.search-results'));
        super.createEditor(searchResultContainer);
        this.registerEditorListeners();
        const scopedContextKeyService = assertReturnsDefined(this.scopedContextKeyService);
        InSearchEditor.bindTo(scopedContextKeyService).set(true);
        this.createQueryEditor(this.queryEditorContainer, this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))), SearchContext.InputBoxFocusedKey.bindTo(scopedContextKeyService));
    }
    createQueryEditor(container, scopedInstantiationService, inputBoxFocusedContextKey) {
        const searchEditorInputboxStyles = getInputBoxStyle({ inputBorder: searchEditorTextInputBorder });
        this.queryEditorWidget = this._register(scopedInstantiationService.createInstance(SearchWidget, container, { _hideReplaceToggle: true, showContextToggle: true, inputBoxStyles: searchEditorInputboxStyles, toggleStyles: defaultToggleStyles }));
        this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
        this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
        this._register(this.queryEditorWidget.onSearchSubmit(({ delay }) => this.triggerSearch({ delay })));
        if (this.queryEditorWidget.searchInput) {
            this._register(this.queryEditorWidget.searchInput.onDidOptionChange(() => this.triggerSearch({ resetCursor: false })));
        }
        else {
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
        this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_UP, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                DOM.EventHelper.stop(e);
                this.toggleIncludesExcludes();
            }
        }));
        this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */)) {
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
        this._register(this.inputPatternIncludes.onSubmit(triggeredOnType => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
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
    toggleRunAgainMessage(show) {
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
    _getContributions() {
        const skipContributions = [UnusualLineTerminatorsDetector.ID];
        return EditorExtensionsRegistry.getEditorContributions().filter(c => skipContributions.indexOf(c.id) === -1);
    }
    getCodeEditorWidgetOptions() {
        return { contributions: this._getContributions() };
    }
    registerEditorListeners() {
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
            }
            else if (e.event.detail === 2) {
                const behaviour = this.searchConfig.searchEditor.doubleClickBehaviour;
                const position = e.target.position;
                if (position && behaviour !== 'selectWord') {
                    const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? '';
                    if (line.match(RESULT_LINE_REGEX)) {
                        this.searchResultEditor.setSelection(Range.fromPositions(position));
                        this.commandService.executeCommand(behaviour === 'goToLocation' ? 'editor.action.goToDeclaration' : 'editor.action.openDeclarationToTheSide');
                    }
                    else if (line.match(FILE_LINE_REGEX)) {
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
    getControl() {
        return this.searchResultEditor;
    }
    focus() {
        super.focus();
        const viewState = this.loadEditorViewState(this.getInput());
        if (viewState && viewState.focused === 'editor') {
            this.searchResultEditor.focus();
        }
        else {
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
            }
            else {
                this.searchResultEditor.focus();
            }
        }
        else if (this.inputPatternIncludes.inputHasFocus()) {
            this.inputPatternExcludes.focus();
        }
        else if (this.inputPatternExcludes.inputHasFocus()) {
            this.searchResultEditor.focus();
        }
        else if (this.searchResultEditor.hasWidgetFocus()) {
            // pass
        }
    }
    focusPrevInput() {
        if (this.queryEditorWidget.searchInputHasFocus()) {
            this.searchResultEditor.focus(); // wrap
        }
        else if (this.inputPatternIncludes.inputHasFocus()) {
            this.queryEditorWidget.searchInput?.focus();
        }
        else if (this.inputPatternExcludes.inputHasFocus()) {
            this.inputPatternIncludes.focus();
        }
        else if (this.searchResultEditor.hasWidgetFocus()) {
            // unreachable.
        }
    }
    setQuery(query) {
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
    modifyContextLines(increase) {
        this.queryEditorWidget.modifyContextLines(increase);
    }
    toggleQueryDetails(shouldShow) {
        this.toggleIncludesExcludes(shouldShow);
    }
    deleteResultBlock() {
        const linesToDelete = new Set();
        const selections = this.searchResultEditor.getSelections();
        const model = this.searchResultEditor.getModel();
        if (!(selections && model)) {
            return;
        }
        const maxLine = model.getLineCount();
        const minLine = 1;
        const deleteUp = (start) => {
            for (let cursor = start; cursor >= minLine; cursor--) {
                const line = model.getLineContent(cursor);
                linesToDelete.add(cursor);
                if (line[0] !== undefined && line[0] !== ' ') {
                    break;
                }
            }
        };
        const deleteDown = (start) => {
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
        const endingCursorLines = [];
        for (const selection of selections) {
            const lineNumber = selection.startLineNumber;
            endingCursorLines.push(deleteDown(lineNumber));
            deleteUp(lineNumber);
            for (let inner = selection.startLineNumber; inner <= selection.endLineNumber; inner++) {
                linesToDelete.add(inner);
            }
        }
        if (endingCursorLines.length === 0) {
            endingCursorLines.push(1);
        }
        const isDefined = (x) => x !== undefined;
        model.pushEditOperations(this.searchResultEditor.getSelections(), [...linesToDelete].map(line => ({ range: new Range(line, 1, line + 1, 1), text: '' })), () => endingCursorLines.filter(isDefined).map(line => new Selection(line, 1, line, 1)));
    }
    cleanState() {
        this.getInput()?.setDirty(false);
    }
    get searchConfig() {
        return this.configurationService.getValue('search');
    }
    iterateThroughMatches(reverse) {
        const model = this.searchResultEditor.getModel();
        if (!model) {
            return;
        }
        const lastLine = model.getLineCount() ?? 1;
        const lastColumn = model.getLineLength(lastLine);
        const fallbackStart = reverse ? new Position(lastLine, lastColumn) : new Position(1, 1);
        const currentPosition = this.searchResultEditor.getSelection()?.getStartPosition() ?? fallbackStart;
        const matchRanges = this.getInput()?.getMatchRanges();
        if (!matchRanges) {
            return;
        }
        const matchRange = (reverse ? findPrevRange : findNextRange)(matchRanges, currentPosition);
        if (!matchRange) {
            return;
        }
        this.searchResultEditor.setSelection(matchRange);
        this.searchResultEditor.revealLineInCenterIfOutsideViewport(matchRange.startLineNumber);
        this.searchResultEditor.focus();
        const matchLineText = model.getLineContent(matchRange.startLineNumber);
        const matchText = model.getValueInRange(matchRange);
        let file = '';
        for (let line = matchRange.startLineNumber; line >= 1; line--) {
            const lineText = model.getValueInRange(new Range(line, 1, line, 2));
            if (lineText !== ' ') {
                file = model.getLineContent(line);
                break;
            }
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
            .setSelections((this.getInput()?.getMatchRanges() ?? []).map(range => new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)));
        this.searchResultEditor.focus();
    }
    async triggerSearch(_options) {
        const focusResults = this.searchConfig.searchEditor.focusResultsOnSearch;
        // If _options don't define focusResult field, then use the setting
        if (_options === undefined) {
            _options = { focusResults: focusResults };
        }
        else if (_options.focusResults === undefined) {
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
    readConfigFromWidget() {
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
    async doRunSearch() {
        this.searchModel.cancelSearch(true);
        const startInput = this.getInput();
        if (!startInput) {
            return;
        }
        this.searchHistoryDelayer.trigger(() => {
            this.queryEditorWidget.searchInput?.onSearchSubmit();
            this.inputPatternExcludes.onSearchSubmit();
            this.inputPatternIncludes.onSearchSubmit();
        });
        const config = this.readConfigFromWidget();
        if (!config.query) {
            return;
        }
        const content = {
            pattern: config.query,
            isRegExp: config.isRegexp,
            isCaseSensitive: config.isCaseSensitive,
            isWordMatch: config.matchWholeWord,
        };
        const options = {
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
        let query;
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
    async onSearchComplete(searchOperation, startConfig, startInput) {
        const input = this.getInput();
        if (!input ||
            input !== startInput ||
            JSON.stringify(startConfig) !== JSON.stringify(this.readConfigFromWidget())) {
            return;
        }
        input.ongoingSearchOperation = undefined;
        const sortOrder = this.searchConfig.sortOrder;
        if (sortOrder === "modified" /* SearchSortOrder.Modified */) {
            await this.retrieveFileStats(this.searchModel.searchResult);
        }
        const controller = ReferencesController.get(this.searchResultEditor);
        controller?.closeWidget(false);
        const labelFormatter = (uri) => this.labelService.getUriLabel(uri, { relative: true });
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
        input.setDirty(!input.hasCapability(4 /* EditorInputCapabilities.Untitled */));
        input.setMatchRanges(results.matchRanges);
    }
    addMessage(message) {
        let messageBox;
        if (this.messageBox.firstChild) {
            messageBox = this.messageBox.firstChild;
        }
        else {
            messageBox = DOM.append(this.messageBox, DOM.$('.message'));
        }
        DOM.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerSearch()));
    }
    async retrieveFileStats(searchResult) {
        const files = searchResult.matches().filter(f => !f.fileStat).map(f => f.resolveFileStat(this.fileService));
        await Promise.all(files);
    }
    layout(dimension) {
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
    reLayout() {
        if (this.dimension) {
            this.queryEditorWidget.setWidth(this.dimension.width - 28 /* container margin */);
            this.searchResultEditor.layout({ height: this.dimension.height - DOM.getTotalHeight(this.queryEditorContainer), width: this.dimension.width });
            this.inputPatternExcludes.setWidth(this.dimension.width - 28 /* container margin */);
            this.inputPatternIncludes.setWidth(this.dimension.width - 28 /* container margin */);
        }
    }
    getInput() {
        return this.input;
    }
    setSearchConfig(config) {
        this.priorConfig = config;
        if (config.query !== undefined) {
            this.queryEditorWidget.setValue(config.query);
        }
        if (config.isCaseSensitive !== undefined) {
            this.queryEditorWidget.searchInput?.setCaseSensitive(config.isCaseSensitive);
        }
        if (config.isRegexp !== undefined) {
            this.queryEditorWidget.searchInput?.setRegex(config.isRegexp);
        }
        if (config.matchWholeWord !== undefined) {
            this.queryEditorWidget.searchInput?.setWholeWords(config.matchWholeWord);
        }
        if (config.contextLines !== undefined) {
            this.queryEditorWidget.setContextLines(config.contextLines);
        }
        if (config.filesToExclude !== undefined) {
            this.inputPatternExcludes.setValue(config.filesToExclude);
        }
        if (config.filesToInclude !== undefined) {
            this.inputPatternIncludes.setValue(config.filesToInclude);
        }
        if (config.onlyOpenEditors !== undefined) {
            this.inputPatternIncludes.setOnlySearchInOpenEditors(config.onlyOpenEditors);
        }
        if (config.useExcludeSettingsAndIgnoreFiles !== undefined) {
            this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(config.useExcludeSettingsAndIgnoreFiles);
        }
        if (config.showIncludesExcludes !== undefined) {
            this.toggleIncludesExcludes(config.showIncludesExcludes);
        }
    }
    async setInput(newInput, options, context, token) {
        await super.setInput(newInput, options, context, token);
        if (token.isCancellationRequested) {
            return;
        }
        const { configurationModel, resultsModel } = await newInput.resolveModels();
        if (token.isCancellationRequested) {
            return;
        }
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
    toggleIncludesExcludes(_shouldShow) {
        const cls = 'expanded';
        const shouldShow = _shouldShow ?? !this.includesExcludesContainer.classList.contains(cls);
        if (shouldShow) {
            this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
            this.includesExcludesContainer.classList.add(cls);
        }
        else {
            this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'false');
            this.includesExcludesContainer.classList.remove(cls);
        }
        this.showingIncludesExcludes = this.includesExcludesContainer.classList.contains(cls);
        this.reLayout();
    }
    toEditorViewStateResource(input) {
        if (input.typeId === SearchEditorInputTypeId) {
            return input.modelUri;
        }
        return undefined;
    }
    computeEditorViewState(resource) {
        const control = this.getControl();
        const editorViewState = control.saveViewState();
        if (!editorViewState) {
            return undefined;
        }
        if (resource.toString() !== this.getInput()?.modelUri.toString()) {
            return undefined;
        }
        return { ...editorViewState, focused: this.searchResultEditor.hasWidgetFocus() ? 'editor' : 'input' };
    }
    tracksEditorViewState(input) {
        return input.typeId === SearchEditorInputTypeId;
    }
    restoreViewState(context) {
        const viewState = this.loadEditorViewState(this.getInput(), context);
        if (viewState) {
            this.searchResultEditor.restoreViewState(viewState);
        }
    }
    getAriaLabel() {
        return this.getInput()?.getName() ?? localize('searchEditor', "Search");
    }
};
SearchEditor = SearchEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IModelService),
    __param(5, IWorkspaceContextService),
    __param(6, ILabelService),
    __param(7, IInstantiationService),
    __param(8, IContextViewService),
    __param(9, ICommandService),
    __param(10, IOpenerService),
    __param(11, INotificationService),
    __param(12, IEditorProgressService),
    __param(13, ITextResourceConfigurationService),
    __param(14, IEditorGroupsService),
    __param(15, IEditorService),
    __param(16, IConfigurationService),
    __param(17, IFileService),
    __param(18, ILogService),
    __param(19, IHoverService)
], SearchEditor);
export { SearchEditor };
const searchEditorTextInputBorder = registerColor('searchEditor.textInputBorder', inputBorder, localize('textInputBoxBorder', "Search editor text input box border."));
function findNextRange(matchRanges, currentPosition) {
    for (const matchRange of matchRanges) {
        if (Position.isBefore(currentPosition, matchRange.getStartPosition())) {
            return matchRange;
        }
    }
    return matchRanges[0];
}
function findPrevRange(matchRanges, currentPosition) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhFLE9BQU8sMEJBQTBCLENBQUM7QUFFbEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDRFQUE0RSxDQUFDO0FBQ2xILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFl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