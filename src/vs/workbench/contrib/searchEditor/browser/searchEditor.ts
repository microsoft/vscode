/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Delayer } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/searchEditor';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import type { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ReferencesController } from 'vs/editor/contrib/gotoSymbol/peek/referencesController';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { IEditorProgressService, LongRunningOperation } from 'vs/platform/progress/common/progress';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { inputBorder, registerColor, searchEditorFindMatch, searchEditorFindMatchBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorOptions } from 'vs/workbench/common/editor';
import { ExcludePatternInputWidget, PatternInputWidget } from 'vs/workbench/contrib/search/browser/patternInputWidget';
import { SearchWidget } from 'vs/workbench/contrib/search/browser/searchWidget';
import { InputBoxFocusedKey } from 'vs/workbench/contrib/search/common/constants';
import { ITextQueryBuilderOptions, QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { getOutOfWorkspaceEditorResources } from 'vs/workbench/contrib/search/common/search';
import { SearchModel } from 'vs/workbench/contrib/search/common/searchModel';
import { InSearchEditor } from 'vs/workbench/contrib/searchEditor/browser/constants';
import type { SearchConfiguration, SearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { extractSearchQuery, serializeSearchConfiguration, serializeSearchResultForEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditorSerialization';
import { IPatternInfo, ISearchConfigurationProperties, ITextQuery } from 'vs/workbench/services/search/common/search';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| )(\s+)(.*)$/;
const FILE_LINE_REGEX = /^(\S.*):$/;

export class SearchEditor extends BaseEditor {
	static readonly ID: string = 'workbench.editor.searchEditor';

	private queryEditorWidget!: SearchWidget;
	private searchResultEditor!: CodeEditorWidget;
	private queryEditorContainer!: HTMLElement;
	private dimension?: DOM.Dimension;
	private inputPatternIncludes!: PatternInputWidget;
	private inputPatternExcludes!: ExcludePatternInputWidget;
	private includesExcludesContainer!: HTMLElement;
	private toggleQueryDetailsButton!: HTMLElement;
	private messageBox!: HTMLElement;

	private runSearchDelayer = new Delayer(300);
	private pauseSearching: boolean = false;
	private showingIncludesExcludes: boolean = false;
	private inSearchEditorContextKey: IContextKey<boolean>;
	private inputFocusContextKey: IContextKey<boolean>;
	private searchOperation: LongRunningOperation;
	private searchHistoryDelayer: Delayer<void>;
	private messageDisposables: IDisposable[] = [];
	private container: HTMLElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IModelService private readonly modelService: IModelService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IEditorProgressService readonly progressService: IEditorProgressService,
	) {
		super(SearchEditor.ID, telemetryService, themeService, storageService);
		this.container = DOM.$('.search-editor');

		const scopedContextKeyService = contextKeyService.createScoped(this.container);
		this.instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));

		this.inSearchEditorContextKey = InSearchEditor.bindTo(scopedContextKeyService);
		this.inSearchEditorContextKey.set(true);
		this.inputFocusContextKey = InputBoxFocusedKey.bindTo(scopedContextKeyService);
		this.searchOperation = this._register(new LongRunningOperation(progressService));
		this.searchHistoryDelayer = new Delayer<void>(2000);
	}

	createEditor(parent: HTMLElement) {
		DOM.append(parent, this.container);

		this.createQueryEditor(this.container);
		this.createResultsEditor(this.container);
	}

	private createQueryEditor(parent: HTMLElement) {
		this.queryEditorContainer = DOM.append(parent, DOM.$('.query-container'));
		this.queryEditorWidget = this._register(this.instantiationService.createInstance(SearchWidget, this.queryEditorContainer, { _hideReplaceToggle: true, showContextToggle: true }));
		this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
		this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
		this.queryEditorWidget.onSearchSubmit(() => this.runSearch(true, true)); // onSearchSubmit has an internal delayer, so skip over ours.
		this.queryEditorWidget.searchInput.onDidOptionChange(() => this.runSearch(false));
		this.queryEditorWidget.onDidToggleContext(() => this.runSearch(false));

		// Includes/Excludes Dropdown
		this.includesExcludesContainer = DOM.append(this.queryEditorContainer, DOM.$('.includes-excludes'));

		// // Toggle query details button
		this.toggleQueryDetailsButton = DOM.append(this.includesExcludesContainer, DOM.$('.expand.codicon.codicon-ellipsis', { tabindex: 0, role: 'button', title: localize('moreSearch', "Toggle Search Details") }));
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
					this.queryEditorWidget.isReplaceShown() ? this.queryEditorWidget.replaceInput.focusOnPreserve() : this.queryEditorWidget.focusRegexAction();
				}
				DOM.EventHelper.stop(e);
			}
		}));

		// // Includes
		const folderIncludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.includes'));
		const filesToIncludeTitle = localize('searchScope.includes', "files to include");
		DOM.append(folderIncludesList, DOM.$('h4', undefined, filesToIncludeTitle));
		this.inputPatternIncludes = this._register(this.instantiationService.createInstance(PatternInputWidget, folderIncludesList, this.contextViewService, {
			ariaLabel: localize('label.includes', 'Search Include Patterns'),
		}));
		this.inputPatternIncludes.onSubmit(_triggeredOnType => this.runSearch());

		// // Excludes
		const excludesList = DOM.append(this.includesExcludesContainer, DOM.$('.file-types.excludes'));
		const excludesTitle = localize('searchScope.excludes', "files to exclude");
		DOM.append(excludesList, DOM.$('h4', undefined, excludesTitle));
		this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
			ariaLabel: localize('label.excludes', 'Search Exclude Patterns'),
		}));
		this.inputPatternExcludes.onSubmit(_triggeredOnType => this.runSearch());
		this.inputPatternExcludes.onChangeIgnoreBox(() => this.runSearch());

		[this.queryEditorWidget.searchInput, this.inputPatternIncludes, this.inputPatternExcludes].map(input =>
			this._register(attachInputBoxStyler(input, this.themeService, { inputBorder: searchEditorTextInputBorder })));

		// Messages
		this.messageBox = DOM.append(this.queryEditorContainer, DOM.$('.messages'));
	}


	private toggleRunAgainMessage(show: boolean) {
		DOM.clearNode(this.messageBox);
		dispose(this.messageDisposables);
		this.messageDisposables = [];

		if (show) {
			const runAgainLink = DOM.append(this.messageBox, DOM.$('a.pointer.prominent.message', {}, localize('runSearch', "Run Search")));
			this.messageDisposables.push(DOM.addDisposableListener(runAgainLink, DOM.EventType.CLICK, async () => {
				await this.runSearch(true, true);
				this.toggleRunAgainMessage(false);
			}));
		}
	}

	private createResultsEditor(parent: HTMLElement) {
		const searchResultContainer = DOM.append(parent, DOM.$('.search-results'));
		const getSearchEditorOptions = () => this.configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: 'search-result' });
		const configuration: IEditorOptions = getSearchEditorOptions();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this.searchResultEditor.updateOptions(getSearchEditorOptions());
			}
		}));

		const options: ICodeEditorWidgetOptions = {};
		this.searchResultEditor = this._register(this.instantiationService.createInstance(CodeEditorWidget, searchResultContainer, configuration, options));
		this.searchResultEditor.onMouseUp(e => {

			if (e.event.detail === 2) {
				const behaviour = this.configurationService.getValue<ISearchConfigurationProperties>('search').searchEditorPreview.doubleClickBehaviour;
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
		});

		this._register(this.onDidBlur(() => this.saveViewState()));

		this._register(this.searchResultEditor.onKeyDown(e => e.keyCode === KeyCode.Escape && this.queryEditorWidget.searchInput.focus()));

		this._register(this.searchResultEditor.onDidChangeModelContent(() => this.getInput()?.setDirty(true)));

		[this.queryEditorWidget.searchInputFocusTracker, this.queryEditorWidget.replaceInputFocusTracker, this.inputPatternExcludes.inputFocusTracker, this.inputPatternIncludes.inputFocusTracker]
			.map(tracker => {
				this._register(tracker.onDidFocus(() => setTimeout(() => this.inputFocusContextKey.set(true), 0)));
				this._register(tracker.onDidBlur(() => this.inputFocusContextKey.set(false)));
			});
	}


	getControl() {
		return this.searchResultEditor;
	}

	focus() {
		const input = this.getInput();
		if (input && input.viewState && input.viewState.focused === 'editor') {
			this.searchResultEditor.focus();
		} else {
			this.queryEditorWidget.focus();
		}
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
			this.queryEditorWidget.searchInput.focus();
		} else if (this.inputPatternExcludes.inputHasFocus()) {
			this.inputPatternIncludes.focus();
		} else if (this.searchResultEditor.hasWidgetFocus()) {
			// unreachable.
		}
	}

	toggleWholeWords() {
		this.queryEditorWidget.searchInput.setWholeWords(!this.queryEditorWidget.searchInput.getWholeWords());
		this.runSearch(false);
	}

	toggleRegex() {
		this.queryEditorWidget.searchInput.setRegex(!this.queryEditorWidget.searchInput.getRegex());
		this.runSearch(false);
	}

	toggleCaseSensitive() {
		this.queryEditorWidget.searchInput.setCaseSensitive(!this.queryEditorWidget.searchInput.getCaseSensitive());
		this.runSearch(false);
	}

	toggleContextLines() {
		this.queryEditorWidget.toggleContextLines();
	}

	toggleQueryDetails() {
		this.toggleIncludesExcludes();
	}

	async runSearch(resetCursor = true, instant = false) {
		if (!this.pauseSearching) {
			await this.runSearchDelayer.trigger(async () => {
				await this.doRunSearch();
				if (resetCursor) {
					this.searchResultEditor.setSelection(new Range(1, 1, 1, 1));
				}
			}, instant ? 0 : undefined);
		}
	}

	private async doRunSearch() {
		const startInput = this.input;

		this.searchHistoryDelayer.trigger(() => {
			this.queryEditorWidget.searchInput.onSearchSubmit();
			this.inputPatternExcludes.onSearchSubmit();
			this.inputPatternIncludes.onSearchSubmit();
		});

		const config: SearchConfiguration = {
			caseSensitive: this.queryEditorWidget.searchInput.getCaseSensitive(),
			contextLines: this.queryEditorWidget.contextLines(),
			excludes: this.inputPatternExcludes.getValue(),
			includes: this.inputPatternIncludes.getValue(),
			query: this.queryEditorWidget.searchInput.getValue(),
			regexp: this.queryEditorWidget.searchInput.getRegex(),
			wholeWord: this.queryEditorWidget.searchInput.getWholeWords(),
			useIgnores: this.inputPatternExcludes.useExcludesAndIgnoreFiles(),
			showIncludesExcludes: this.showingIncludesExcludes
		};

		if (!config.query) { return; }

		const content: IPatternInfo = {
			pattern: config.query,
			isRegExp: config.regexp,
			isCaseSensitive: config.caseSensitive,
			isWordMatch: config.wholeWord,
		};

		const options: ITextQueryBuilderOptions = {
			_reason: 'searchEditor',
			extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
			maxResults: 10000,
			disregardIgnoreFiles: !config.useIgnores,
			disregardExcludeSettings: !config.useIgnores,
			excludePattern: config.excludes,
			includePattern: config.includes,
			previewOptions: {
				matchLines: 1,
				charsPerLine: 1000
			},
			afterContext: config.contextLines,
			beforeContext: config.contextLines,
			isSmartCase: this.configurationService.getValue<ISearchConfigurationProperties>('search').smartCase,
			expandPatterns: true
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
		const searchModel = this.instantiationService.createInstance(SearchModel);
		this.searchOperation.start(500);
		await searchModel.search(query).finally(() => this.searchOperation.stop());
		const input = this.getInput();
		if (!input || input !== startInput) {
			searchModel.dispose();
			return;
		}

		const controller = ReferencesController.get(this.searchResultEditor);
		controller.closeWidget(false);
		const labelFormatter = (uri: URI): string => this.labelService.getUriLabel(uri, { relative: true });
		const results = serializeSearchResultForEditor(searchModel.searchResult, config.includes, config.excludes, config.contextLines, labelFormatter, false);
		const { header, body } = await input.getModels();
		this.modelService.updateModel(body, results.text);
		header.setValue(serializeSearchConfiguration(config));

		input.setDirty(input.resource.scheme !== 'search-editor');
		input.setHighlights(results.matchRanges.map(range =>
			({ range, options: { className: 'searchEditorFindMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));

		searchModel.dispose();
	}

	layout(dimension: DOM.Dimension) {
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
		return this._input as SearchEditorInput;
	}

	async setInput(newInput: SearchEditorInput, options: EditorOptions | undefined, token: CancellationToken): Promise<void> {
		this.saveViewState();

		await super.setInput(newInput, options, token);

		const { body, header } = await newInput.getModels();

		this.searchResultEditor.setModel(body);
		this.pauseSearching = true;

		const config = extractSearchQuery(header);
		this.toggleRunAgainMessage(body.getLineCount() === 1 && body.getValue() === '' && config.query !== '');

		this.queryEditorWidget.setValue(config.query, true);
		this.queryEditorWidget.searchInput.setCaseSensitive(config.caseSensitive);
		this.queryEditorWidget.searchInput.setRegex(config.regexp);
		this.queryEditorWidget.searchInput.setWholeWords(config.wholeWord);
		this.queryEditorWidget.setContextLines(config.contextLines);
		this.inputPatternExcludes.setValue(config.excludes);
		this.inputPatternIncludes.setValue(config.includes);
		this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(config.useIgnores);
		this.toggleIncludesExcludes(config.showIncludesExcludes);

		this.restoreViewState();
		this.pauseSearching = false;
	}

	private toggleIncludesExcludes(_shouldShow?: boolean): void {
		const cls = 'expanded';
		const shouldShow = _shouldShow ?? !DOM.hasClass(this.includesExcludesContainer, cls);

		if (shouldShow) {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'true');
			DOM.addClass(this.includesExcludesContainer, cls);
		} else {
			this.toggleQueryDetailsButton.setAttribute('aria-expanded', 'false');
			DOM.removeClass(this.includesExcludesContainer, cls);
		}

		this.showingIncludesExcludes = DOM.hasClass(this.includesExcludesContainer, cls);

		this.reLayout();
	}

	getModel() {
		return this.searchResultEditor.getModel();
	}

	private saveViewState() {
		const input = this.getInput();
		if (!input) { return; }

		if (this.searchResultEditor.hasWidgetFocus()) {
			const viewState = this.searchResultEditor.saveViewState();
			if (viewState) {
				input.viewState = { focused: 'editor', state: viewState };
			}
		} else {
			input.viewState = { focused: 'input' };
		}
	}

	private restoreViewState() {
		const input = this.getInput();
		if (input && input.viewState && input.viewState.focused === 'editor') {
			this.searchResultEditor.restoreViewState(input.viewState.state);
			this.searchResultEditor.focus();
		} else {
			this.queryEditorWidget.focus();
		}
	}

	clearInput() {
		this.saveViewState();
		super.clearInput();
	}
}

registerThemingParticipant((theme, collector) => {
	collector.addRule(`.monaco-editor .searchEditorFindMatch { background-color: ${theme.getColor(searchEditorFindMatch)}; }`);

	const findMatchHighlightBorder = theme.getColor(searchEditorFindMatchBorder);
	if (findMatchHighlightBorder) {
		collector.addRule(`.monaco-editor .searchEditorFindMatch { border: 1px ${theme.type === 'hc' ? 'dotted' : 'solid'} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
	}
});

export const searchEditorTextInputBorder = registerColor('searchEditor.textInputBorder', { dark: inputBorder, light: inputBorder, hc: inputBorder }, localize('textInputBoxBorder', "Search editor text input box border."));
