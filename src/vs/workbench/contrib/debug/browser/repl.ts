/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { memoize } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { HistoryNavigator } from 'vs/base/common/history';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { URI as uri } from 'vs/base/common/uri';
import 'vs/css!./media/repl';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemKinds, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfiguration';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { localize } from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorForeground, resolveColorValue } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewAction, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { FocusSessionActionViewItem } from 'vs/workbench/contrib/debug/browser/debugActionViewItems';
import { debugConsoleClearAll, debugConsoleEvaluationPrompt } from 'vs/workbench/contrib/debug/browser/debugIcons';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { ReplFilter, ReplFilterActionViewItem, ReplFilterState } from 'vs/workbench/contrib/debug/browser/replFilter';
import { ReplAccessibilityProvider, ReplDataSource, ReplDelegate, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplGroupRenderer, ReplRawObjectsRenderer, ReplSimpleElementsRenderer, ReplVariablesRenderer } from 'vs/workbench/contrib/debug/browser/replViewer';
import { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_REPL, CONTEXT_MULTI_SESSION_REPL, DEBUG_SCHEME, getStateLabel, IDebugConfiguration, IDebugService, IDebugSession, IReplConfiguration, IReplElement, IReplOptions, REPL_VIEW_ID, State } from 'vs/workbench/contrib/debug/common/debug';
import { Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { ReplGroup } from 'vs/workbench/contrib/debug/common/replModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const $ = dom.$;

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const FILTER_HISTORY_STORAGE_KEY = 'debug.repl.filterHistory';
const FILTER_VALUE_STORAGE_KEY = 'debug.repl.filterValue';
const DECORATION_KEY = 'replinputdecoration';
const FILTER_ACTION_ID = `workbench.actions.treeView.repl.filter`;

function revealLastElement(tree: WorkbenchAsyncDataTree<any, any, any>) {
	tree.scrollTop = tree.scrollHeight - tree.renderHeight;
	// tree.scrollTop = 1e6;
}

const sessionsToIgnore = new Set<IDebugSession>();
const identityProvider = { getId: (element: IReplElement) => element.getId() };

export class Repl extends ViewPane implements IHistoryNavigationWidget {
	declare readonly _serviceBrand: undefined;

	private static readonly REFRESH_DELAY = 50; // delay in ms to refresh the repl for new elements to show
	private static readonly URI = uri.parse(`${DEBUG_SCHEME}:replinput`);

	private history: HistoryNavigator<string>;
	private tree!: WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>;
	private replOptions: ReplOptions;
	private previousTreeScrollHeight: number = 0;
	private replDelegate!: ReplDelegate;
	private container!: HTMLElement;
	private treeContainer!: HTMLElement;
	private replInput!: CodeEditorWidget;
	private replInputContainer!: HTMLElement;
	private dimension!: dom.Dimension;
	private replInputLineCount = 1;
	private model: ITextModel | undefined;
	private setHistoryNavigationEnablement!: (enabled: boolean) => void;
	private scopedInstantiationService!: IInstantiationService;
	private replElementsChangeListener: IDisposable | undefined;
	private styleElement: HTMLStyleElement | undefined;
	private completionItemProvider: IDisposable | undefined;
	private modelChangeListener: IDisposable = Disposable.None;
	private filter: ReplFilter;
	private filterState: ReplFilterState;
	private filterActionViewItem: ReplFilterActionViewItem | undefined;
	private multiSessionRepl: IContextKey<boolean>;
	private menu: IMenu;

	constructor(
		options: IViewPaneOptions,
		@IDebugService private readonly debugService: IDebugService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMenuService menuService: IMenuService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this.menu = menuService.createMenu(MenuId.DebugConsoleContext, contextKeyService);
		this._register(this.menu);
		this.history = new HistoryNavigator(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')), 50);
		this.filter = new ReplFilter();
		this.filterState = new ReplFilterState(this);
		this.filter.filterQuery = this.filterState.filterText = this.storageService.get(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE, '');
		this.multiSessionRepl = CONTEXT_MULTI_SESSION_REPL.bindTo(contextKeyService);
		this.replOptions = this._register(this.instantiationService.createInstance(ReplOptions, this.id, () => this.getBackgroundColor()));
		this._register(this.replOptions.onDidChange(() => this.onDidStyleChange()));

		codeEditorService.registerDecorationType('repl-decoration', DECORATION_KEY, {});
		this.multiSessionRepl.set(this.isMultiSessionView);
		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.debugService.getViewModel().focusedSession) {
			this.onDidFocusSession(this.debugService.getViewModel().focusedSession);
		}

		this._register(this.debugService.getViewModel().onDidFocusSession(async session => this.onDidFocusSession(session)));
		this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async e => {
			if (e instanceof Variable && this.tree.hasNode(e)) {
				await this.tree.updateChildren(e, false, true);
				await this.tree.expand(e);
			}
		}));
		this._register(this.debugService.onWillNewSession(async newSession => {
			// Need to listen to output events for sessions which are not yet fully initialised
			const input = this.tree.getInput();
			if (!input || input.state === State.Inactive) {
				await this.selectSession(newSession);
			}
			this.multiSessionRepl.set(this.isMultiSessionView);
		}));
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.refreshReplElements(false);
			if (this.isVisible()) {
				this.updateInputDecoration();
			}
		}));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				if (!this.model) {
					this.model = this.modelService.getModel(Repl.URI) || this.modelService.createModel('', null, Repl.URI, true);
				}
				this.setMode();
				this.replInput.setModel(this.model);
				this.updateInputDecoration();
				this.refreshReplElements(true);
				this.layoutBody(this.dimension.height, this.dimension.width);
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.console.wordWrap')) {
				this.tree.dispose();
				this.treeContainer.innerText = '';
				dom.clearNode(this.treeContainer);
				this.createReplTree();
			}
			if (e.affectsConfiguration('debug.console.acceptSuggestionOnEnter')) {
				const config = this.configurationService.getValue<IDebugConfiguration>('debug');
				this.replInput.updateOptions({
					acceptSuggestionOnEnter: config.console.acceptSuggestionOnEnter === 'on' ? 'on' : 'off'
				});
			}
		}));

		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.setMode();
		}));

		this._register(this.filterState.onDidChange(() => {
			this.filter.filterQuery = this.filterState.filterText;
			this.tree.refilter();
			revealLastElement(this.tree);
		}));
	}

	private async onDidFocusSession(session: IDebugSession | undefined): Promise<void> {
		if (session) {
			sessionsToIgnore.delete(session);
			this.completionItemProvider?.dispose();
			if (session.capabilities.supportsCompletionsRequest) {
				this.completionItemProvider = this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, pattern: '**/replinput', hasAccessToAllModels: true }, {
					triggerCharacters: session.capabilities.completionTriggerCharacters || ['.'],
					provideCompletionItems: async (_: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList> => {
						// Disable history navigation because up and down are used to navigate through the suggest widget
						this.setHistoryNavigationEnablement(false);

						const model = this.replInput.getModel();
						if (model) {
							const word = model.getWordAtPosition(position);
							const overwriteBefore = word ? word.word.length : 0;
							const text = model.getValue();
							const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
							const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;
							const response = await session.completions(frameId, focusedStackFrame?.thread.threadId || 0, text, position, overwriteBefore, token);

							const suggestions: CompletionItem[] = [];
							const computeRange = (length: number) => Range.fromPositions(position.delta(0, -length), position);
							if (response && response.body && response.body.targets) {
								response.body.targets.forEach(item => {
									if (item && item.label) {
										let insertTextRules: CompletionItemInsertTextRule | undefined = undefined;
										let insertText = item.text || item.label;
										if (typeof item.selectionStart === 'number') {
											// If a debug completion item sets a selection we need to use snippets to make sure the selection is selected #90974
											insertTextRules = CompletionItemInsertTextRule.InsertAsSnippet;
											const selectionLength = typeof item.selectionLength === 'number' ? item.selectionLength : 0;
											const placeholder = selectionLength > 0 ? '${1:' + insertText.substring(item.selectionStart, item.selectionStart + selectionLength) + '}$0' : '$0';
											insertText = insertText.substring(0, item.selectionStart) + placeholder + insertText.substring(item.selectionStart + selectionLength);
										}

										suggestions.push({
											label: item.label,
											insertText,
											detail: item.detail,
											kind: CompletionItemKinds.fromString(item.type || 'property'),
											filterText: (item.start && item.length) ? text.substring(item.start, item.start + item.length).concat(item.label) : undefined,
											range: computeRange(item.length || overwriteBefore),
											sortText: item.sortText,
											insertTextRules
										});
									}
								});
							}

							if (this.configurationService.getValue<IDebugConfiguration>('debug').console.historySuggestions) {
								const history = this.history.getHistory();
								history.forEach(h => suggestions.push({
									label: h,
									insertText: h,
									kind: CompletionItemKind.Text,
									range: computeRange(h.length),
									sortText: 'ZZZ'
								}));
							}

							return { suggestions };
						}

						return Promise.resolve({ suggestions: [] });
					}
				});
			}
		}

		await this.selectSession();
	}

	getFilterStats(): { total: number; filtered: number } {
		// This could be called before the tree is created when setting this.filterState.filterText value
		return {
			total: this.tree?.getNode().children.length ?? 0,
			filtered: this.tree?.getNode().children.filter(c => c.visible).length ?? 0
		};
	}

	get isReadonly(): boolean {
		// Do not allow to edit inactive sessions
		const session = this.tree.getInput();
		if (session && session.state !== State.Inactive) {
			return false;
		}

		return true;
	}

	showPreviousValue(): void {
		if (!this.isReadonly) {
			this.navigateHistory(true);
		}
	}

	showNextValue(): void {
		if (!this.isReadonly) {
			this.navigateHistory(false);
		}
	}

	focusFilter(): void {
		this.filterActionViewItem?.focus();
	}

	private setMode(): void {
		if (!this.isVisible()) {
			return;
		}

		const activeEditorControl = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditorControl)) {
			this.modelChangeListener.dispose();
			this.modelChangeListener = activeEditorControl.onDidChangeModelLanguage(() => this.setMode());
			if (this.model && activeEditorControl.hasModel()) {
				this.model.setMode(activeEditorControl.getModel().getLanguageId());
			}
		}
	}

	private onDidStyleChange(): void {
		if (this.styleElement) {
			this.replInput.updateOptions({
				fontSize: this.replOptions.replConfiguration.fontSize,
				lineHeight: this.replOptions.replConfiguration.lineHeight,
				fontFamily: this.replOptions.replConfiguration.fontFamily === 'default' ? EDITOR_FONT_DEFAULTS.fontFamily : this.replOptions.replConfiguration.fontFamily
			});

			const replInputLineHeight = this.replInput.getOption(EditorOption.lineHeight);

			// Set the font size, font family, line height and align the twistie to be centered, and input theme color
			this.styleElement.textContent = `
				.repl .repl-input-wrapper .repl-input-chevron {
					line-height: ${replInputLineHeight}px
				}

				.repl .repl-input-wrapper .monaco-editor .lines-content {
					background-color: ${this.replOptions.replConfiguration.backgroundColor};
				}
			`;
			const cssFontFamily = this.replOptions.replConfiguration.fontFamily === 'default' ? 'var(--monaco-monospace-font)' : this.replOptions.replConfiguration.fontFamily;
			this.container.style.setProperty(`--vscode-repl-font-family`, cssFontFamily);
			this.container.style.setProperty(`--vscode-repl-font-size`, `${this.replOptions.replConfiguration.fontSize}px`);
			this.container.style.setProperty(`--vscode-repl-font-size-for-twistie`, `${this.replOptions.replConfiguration.fontSizeForTwistie}px`);
			this.container.style.setProperty(`--vscode-repl-line-height`, this.replOptions.replConfiguration.cssLineHeight);

			this.tree.rerender();

			if (this.dimension) {
				this.layoutBody(this.dimension.height, this.dimension.width);
			}
		}
	}

	private navigateHistory(previous: boolean): void {
		const historyInput = previous ? this.history.previous() : this.history.next();
		if (historyInput) {
			this.replInput.setValue(historyInput);
			aria.status(historyInput);
			// always leave cursor at the end.
			this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
			this.setHistoryNavigationEnablement(true);
		}
	}

	async selectSession(session?: IDebugSession): Promise<void> {
		const treeInput = this.tree && this.tree.getInput();
		if (!session) {
			const focusedSession = this.debugService.getViewModel().focusedSession;
			// If there is a focusedSession focus on that one, otherwise just show any other not ignored session
			if (focusedSession) {
				session = focusedSession;
			} else if (!treeInput || sessionsToIgnore.has(treeInput)) {
				session = this.debugService.getModel().getSessions(true).find(s => !sessionsToIgnore.has(s));
			}
		}
		if (session) {
			this.replElementsChangeListener?.dispose();
			this.replElementsChangeListener = session.onDidChangeReplElements(() => {
				this.refreshReplElements(session!.getReplElements().length === 0);
			});

			if (this.tree && treeInput !== session) {
				await this.tree.setInput(session);
				revealLastElement(this.tree);
			}
		}

		this.replInput?.updateOptions({ readOnly: this.isReadonly });
		this.updateInputDecoration();
	}

	async clearRepl(): Promise<void> {
		const session = this.tree.getInput();
		if (session) {
			session.removeReplExpressions();
			if (session.state === State.Inactive) {
				// Ignore inactive sessions which got cleared - so they are not shown any more
				sessionsToIgnore.add(session);
				await this.selectSession();
				this.multiSessionRepl.set(this.isMultiSessionView);
			}
		}
		this.replInput.focus();
	}

	acceptReplInput(): void {
		const session = this.tree.getInput();
		if (session && !this.isReadonly) {
			session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
			revealLastElement(this.tree);
			this.history.add(this.replInput.getValue());
			this.replInput.setValue('');
			const shouldRelayout = this.replInputLineCount > 1;
			this.replInputLineCount = 1;
			if (shouldRelayout) {
				// Trigger a layout to shrink a potential multi line input
				this.layoutBody(this.dimension.height, this.dimension.width);
			}
		}
	}

	getVisibleContent(): string {
		let text = '';
		if (this.model) {
			const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
			const traverseAndAppend = (node: ITreeNode<IReplElement, FuzzyScore>) => {
				node.children.forEach(child => {
					if (child.visible) {
						text += child.element.toString().trimRight() + lineDelimiter;
						if (!child.collapsed && child.children.length) {
							traverseAndAppend(child);
						}
					}
				});
			};
			traverseAndAppend(this.tree.getNode());
		}

		return removeAnsiEscapeCodes(text);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.dimension = new dom.Dimension(width, height);
		const replInputHeight = Math.min(this.replInput.getContentHeight(), height);
		if (this.tree) {
			const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
			const treeHeight = height - replInputHeight;
			this.tree.getHTMLElement().style.height = `${treeHeight}px`;
			this.tree.layout(treeHeight, width);
			if (lastElementVisible) {
				revealLastElement(this.tree);
			}
		}
		this.replInputContainer.style.height = `${replInputHeight}px`;

		this.replInput.layout({ width: width - 30, height: replInputHeight });
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	getReplInput(): CodeEditorWidget {
		return this.replInput;
	}

	override focus(): void {
		setTimeout(() => this.replInput.focus(), 0);
	}

	override getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === selectReplCommandId) {
			const session = (this.tree ? this.tree.getInput() : undefined) ?? this.debugService.getViewModel().focusedSession;
			return this.instantiationService.createInstance(SelectReplActionViewItem, action, session);
		} else if (action.id === FILTER_ACTION_ID) {
			const filterHistory = JSON.parse(this.storageService.get(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')) as string[];
			this.filterActionViewItem = this.instantiationService.createInstance(ReplFilterActionViewItem, action,
				localize({ key: 'workbench.debug.filter.placeholder', comment: ['Text in the brackets after e.g. is not localizable'] }, "Filter (e.g. text, !exclude)"), this.filterState, filterHistory, () => showHistoryKeybindingHint(this.keybindingService));
			return this.filterActionViewItem;
		}

		return super.getActionViewItem(action);
	}

	private get isMultiSessionView(): boolean {
		return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1;
	}

	// --- Cached locals

	@memoize
	private get refreshScheduler(): RunOnceScheduler {
		const autoExpanded = new Set<string>();
		return new RunOnceScheduler(async () => {
			if (!this.tree.getInput()) {
				return;
			}

			await this.tree.updateChildren(undefined, true, false, { diffIdentityProvider: identityProvider });

			const session = this.tree.getInput();
			if (session) {
				// Automatically expand repl group elements when specified
				const autoExpandElements = async (elements: IReplElement[]) => {
					for (const element of elements) {
						if (element instanceof ReplGroup) {
							if (element.autoExpand && !autoExpanded.has(element.getId())) {
								autoExpanded.add(element.getId());
								await this.tree.expand(element);
							}
							if (!this.tree.isCollapsed(element)) {
								// Repl groups can have children which are repl groups thus we might need to expand those as well
								await autoExpandElements(element.getChildren());
							}
						}
					}
				};
				await autoExpandElements(session.getReplElements());
			}
			// Repl elements count changed, need to update filter stats on the badge
			this.filterState.updateFilterStats();
		}, Repl.REFRESH_DELAY);
	}

	// --- Creation

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		this.container = dom.append(parent, $('.repl'));
		this.treeContainer = dom.append(this.container, $(`.repl-tree.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
		this.createReplInput(this.container);
		this.createReplTree();
	}

	private createReplTree(): void {
		this.replDelegate = new ReplDelegate(this.configurationService, this.replOptions);
		const wordWrap = this.configurationService.getValue<IDebugConfiguration>('debug').console.wordWrap;
		this.treeContainer.classList.toggle('word-wrap', wordWrap);
		const linkDetector = this.instantiationService.createInstance(LinkDetector);
		this.tree = <WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>>this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'DebugRepl',
			this.treeContainer,
			this.replDelegate,
			[
				this.instantiationService.createInstance(ReplVariablesRenderer, linkDetector),
				this.instantiationService.createInstance(ReplSimpleElementsRenderer, linkDetector),
				new ReplEvaluationInputsRenderer(),
				this.instantiationService.createInstance(ReplGroupRenderer, linkDetector),
				new ReplEvaluationResultsRenderer(linkDetector),
				new ReplRawObjectsRenderer(linkDetector),
			],
			// https://github.com/microsoft/TypeScript/issues/32526
			new ReplDataSource() as IAsyncDataSource<IDebugSession, IReplElement>,
			{
				filter: this.filter,
				accessibilityProvider: new ReplAccessibilityProvider(),
				identityProvider,
				mouseSupport: false,
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IReplElement) => e.toString(true) },
				horizontalScrolling: !wordWrap,
				setRowLineHeight: false,
				supportDynamicHeights: wordWrap,
				overrideStyles: {
					listBackground: this.getBackgroundColor()
				}
			});

		this._register(this.tree.onDidChangeContentHeight(() => {
			if (this.tree.scrollHeight !== this.previousTreeScrollHeight) {
				// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
				// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
				const lastElementWasVisible = this.tree.scrollTop + this.tree.renderHeight >= this.previousTreeScrollHeight - 2;
				if (lastElementWasVisible) {
					setTimeout(() => {
						// Can't set scrollTop during this event listener, the list might overwrite the change
						revealLastElement(this.tree);
					}, 0);
				}
			}

			this.previousTreeScrollHeight = this.tree.scrollHeight;
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		let lastSelectedString: string;
		this._register(this.tree.onMouseClick(() => {
			const selection = window.getSelection();
			if (!selection || selection.type !== 'Range' || lastSelectedString === selection.toString()) {
				// only focus the input if the user is not currently selecting.
				this.replInput.focus();
			}
			lastSelectedString = selection ? selection.toString() : '';
		}));
		// Make sure to select the session if debugging is already active
		this.selectSession();
		this.styleElement = dom.createStyleSheet(this.container);
		this.onDidStyleChange();
	}

	private createReplInput(container: HTMLElement): void {
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));
		dom.append(this.replInputContainer, $('.repl-input-chevron' + ThemeIcon.asCSSSelector(debugConsoleEvaluationPrompt)));

		const { scopedContextKeyService, historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(this.contextKeyService, this));
		this.setHistoryNavigationEnablement = enabled => {
			historyNavigationBackwardsEnablement.set(enabled);
			historyNavigationForwardsEnablement.set(enabled);
		};
		CONTEXT_IN_DEBUG_REPL.bindTo(scopedContextKeyService).set(true);

		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]));
		const options = getSimpleEditorOptions();
		options.readOnly = true;
		options.suggest = { showStatusBar: true };
		const config = this.configurationService.getValue<IDebugConfiguration>('debug');
		options.acceptSuggestionOnEnter = config.console.acceptSuggestionOnEnter === 'on' ? 'on' : 'off';
		options.ariaLabel = localize('debugConsole', "Debug Console");

		this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());

		this._register(this.replInput.onDidChangeModelContent(() => {
			const model = this.replInput.getModel();
			this.setHistoryNavigationEnablement(!!model && model.getValue() === '');
			const lineCount = model ? Math.min(10, model.getLineCount()) : 1;
			if (lineCount !== this.replInputLineCount) {
				this.replInputLineCount = lineCount;
				this.layoutBody(this.dimension.height, this.dimension.width);
			}
		}));
		// We add the input decoration only when the focus is in the input #61126
		this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
		this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));

		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => this.replInputContainer.classList.add('synthetic-focus')));
		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => this.replInputContainer.classList.remove('synthetic-focus')));
	}

	private onContextMenu(e: ITreeContextMenuEvent<IReplElement>): void {
		const actions: IAction[] = [];
		createAndFillInContextMenuActions(this.menu, { arg: e.element, shouldForwardArgs: false }, actions);
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => e.element
		});
	}

	// --- Update

	private refreshReplElements(noDelay: boolean): void {
		if (this.tree && this.isVisible()) {
			if (this.refreshScheduler.isScheduled()) {
				return;
			}

			this.refreshScheduler.schedule(noDelay ? 0 : undefined);
		}
	}

	private updateInputDecoration(): void {
		if (!this.replInput) {
			return;
		}

		const decorations: IDecorationOptions[] = [];
		if (this.isReadonly && this.replInput.hasTextFocus() && !this.replInput.getValue()) {
			const transparentForeground = resolveColorValue(editorForeground, this.themeService.getColorTheme())?.transparent(0.4);
			decorations.push({
				range: {
					startLineNumber: 0,
					endLineNumber: 0,
					startColumn: 0,
					endColumn: 1
				},
				renderOptions: {
					after: {
						contentText: localize('startDebugFirst', "Please start a debug session to evaluate expressions"),
						color: transparentForeground ? transparentForeground.toString() : undefined
					}
				}
			});
		}

		this.replInput.setDecorationsByType('repl-decoration', DECORATION_KEY, decorations);
	}

	override saveState(): void {
		const replHistory = this.history.getHistory();
		if (replHistory.length) {
			this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), StorageScope.WORKSPACE, StorageTarget.USER);
		} else {
			this.storageService.remove(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		}
		if (this.filterActionViewItem) {
			const filterHistory = this.filterActionViewItem.getHistory();
			if (filterHistory.length) {
				this.storageService.store(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(filterHistory), StorageScope.WORKSPACE, StorageTarget.USER);
			} else {
				this.storageService.remove(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
			}
			const filterValue = this.filterState.filterText;
			if (filterValue) {
				this.storageService.store(FILTER_VALUE_STORAGE_KEY, filterValue, StorageScope.WORKSPACE, StorageTarget.USER);
			} else {
				this.storageService.remove(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE);
			}
		}

		super.saveState();
	}

	override dispose(): void {
		this.replInput.dispose();
		this.replElementsChangeListener?.dispose();
		this.refreshScheduler.dispose();
		this.modelChangeListener.dispose();
		super.dispose();
	}
}

class ReplOptions extends Disposable implements IReplOptions {
	private static readonly lineHeightEm = 1.4;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _replConfig!: IReplConfiguration;
	public get replConfiguration(): IReplConfiguration {
		return this._replConfig;
	}

	constructor(
		viewId: string,
		private readonly backgroundColorDelegate: () => string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService
	) {
		super();

		this._register(this.themeService.onDidColorThemeChange(e => this.update()));
		this._register(this.viewDescriptorService.onDidChangeLocation(e => {
			if (e.views.some(v => v.id === viewId)) {
				this.update();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.console.lineHeight') || e.affectsConfiguration('debug.console.fontSize') || e.affectsConfiguration('debug.console.fontFamily')) {
				this.update();
			}
		}));
		this.update();
	}

	private update() {
		const debugConsole = this.configurationService.getValue<IDebugConfiguration>('debug').console;
		this._replConfig = {
			fontSize: debugConsole.fontSize,
			fontFamily: debugConsole.fontFamily,
			lineHeight: debugConsole.lineHeight ? debugConsole.lineHeight : ReplOptions.lineHeightEm * debugConsole.fontSize,
			cssLineHeight: debugConsole.lineHeight ? `${debugConsole.lineHeight}px` : `${ReplOptions.lineHeightEm}em`,
			backgroundColor: this.themeService.getColorTheme().getColor(this.backgroundColorDelegate()),
			fontSizeForTwistie: debugConsole.fontSize * ReplOptions.lineHeightEm / 2 - 8
		};
		this._onDidChange.fire();
	}
}

// Repl actions and commands

class AcceptReplInputAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.acceptInput',
			label: localize({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "REPL Accept Input"),
			alias: 'REPL Accept Input',
			precondition: CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		SuggestController.get(editor)?.cancelSuggestWidget();
		const repl = getReplView(accessor.get(IViewsService));
		repl?.acceptReplInput();
	}
}

class FilterReplAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.filter',
			label: localize('repl.action.filter', "REPL Focus Content to Filter"),
			alias: 'REPL Filter',
			precondition: CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		const repl = getReplView(accessor.get(IViewsService));
		repl?.focusFilter();
	}
}

class ReplCopyAllAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.copyAll',
			label: localize('actions.repl.copyAll', "Debug: Console Copy All"),
			alias: 'Debug Console Copy All',
			precondition: CONTEXT_IN_DEBUG_REPL,
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const repl = getReplView(accessor.get(IViewsService));
		if (repl) {
			return clipboardService.writeText(repl.getVisibleContent());
		}
	}
}

registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);
registerEditorAction(FilterReplAction);

class SelectReplActionViewItem extends FocusSessionActionViewItem {

	protected override getSessions(): ReadonlyArray<IDebugSession> {
		return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s));
	}

	protected override mapFocusedSessionToSelected(focusedSession: IDebugSession): IDebugSession {
		while (focusedSession.parentSession && !focusedSession.hasSeparateRepl()) {
			focusedSession = focusedSession.parentSession;
		}
		return focusedSession;
	}
}

function getReplView(viewsService: IViewsService): Repl | undefined {
	return viewsService.getActiveViewWithId(REPL_VIEW_ID) as Repl ?? undefined;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FILTER_ACTION_ID,
			title: localize('filter', "Filter"),
			f1: false,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
				order: 10
			}
		});
	}

	run(_accessor: ServicesAccessor) {
		// noop this action is just a placeholder for the filter action view item
	}
});

const selectReplCommandId = 'workbench.action.debug.selectRepl';
registerAction2(class extends ViewAction<Repl> {
	constructor() {
		super({
			id: selectReplCommandId,
			viewId: REPL_VIEW_ID,
			title: localize('selectRepl', "Select Debug Console"),
			f1: false,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', REPL_VIEW_ID), CONTEXT_MULTI_SESSION_REPL),
				order: 20
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: Repl, session: IDebugSession | undefined) {
		const debugService = accessor.get(IDebugService);
		// If session is already the focused session we need to manualy update the tree since view model will not send a focused change event
		if (session && session.state !== State.Inactive && session !== debugService.getViewModel().focusedSession) {
			if (session.state !== State.Stopped) {
				// Focus child session instead if it is stopped #112595
				const stopppedChildSession = debugService.getModel().getSessions().find(s => s.parentSession === session && s.state === State.Stopped);
				if (stopppedChildSession) {
					session = stopppedChildSession;
				}
			}
			await debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
		}
		// Need to select the session in the view since the focussed session might not have changed
		await view.selectSession(session);
	}
});

registerAction2(class extends ViewAction<Repl> {
	constructor() {
		super({
			id: 'workbench.debug.panel.action.clearReplAction',
			viewId: REPL_VIEW_ID,
			title: { value: localize('clearRepl', "Clear Console"), original: 'Clear Console' },
			f1: true,
			icon: debugConsoleClearAll,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
				order: 30
			}, {
				id: MenuId.DebugConsoleContext,
				group: 'z_commands',
				order: 20
			}]
		});
	}

	runInView(_accessor: ServicesAccessor, view: Repl): void {
		view.clearRepl();
		aria.status(localize('debugConsoleCleared', "Debug console was cleared"));
	}
});

registerAction2(class extends ViewAction<Repl> {
	constructor() {
		super({
			id: 'debug.collapseRepl',
			title: localize('collapse', "Collapse All"),
			viewId: REPL_VIEW_ID,
			menu: {
				id: MenuId.DebugConsoleContext,
				group: 'z_commands',
				order: 10
			}
		});
	}

	runInView(_accessor: ServicesAccessor, view: Repl): void {
		view.collapseAll();
		view.focus();
	}
});

registerAction2(class extends ViewAction<Repl> {
	constructor() {
		super({
			id: 'debug.replPaste',
			title: localize('paste', "Paste"),
			viewId: REPL_VIEW_ID,
			precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Inactive)),
			menu: {
				id: MenuId.DebugConsoleContext,
				group: '2_cutcopypaste',
				order: 30
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: Repl): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const clipboardText = await clipboardService.readText();
		if (clipboardText) {
			const replInput = view.getReplInput();
			replInput.setValue(replInput.getValue().concat(clipboardText));
			view.focus();
			const model = replInput.getModel();
			const lineNumber = model ? model.getLineCount() : 0;
			const column = model?.getLineMaxColumn(lineNumber);
			if (typeof lineNumber === 'number' && typeof column === 'number') {
				replInput.setPosition({ lineNumber, column });
			}
		}
	}
});

registerAction2(class extends ViewAction<Repl> {
	constructor() {
		super({
			id: 'workbench.debug.action.copyAll',
			title: localize('copyAll', "Copy All"),
			viewId: REPL_VIEW_ID,
			menu: {
				id: MenuId.DebugConsoleContext,
				group: '2_cutcopypaste',
				order: 20
			}
		});
	}

	async runInView(accessor: ServicesAccessor, view: Repl): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		await clipboardService.writeText(view.getVisibleContent());
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'debug.replCopy',
			title: localize('copy', "Copy"),
			menu: {
				id: MenuId.DebugConsoleContext,
				group: '2_cutcopypaste',
				order: 10
			}
		});
	}

	async run(accessor: ServicesAccessor, element: IReplElement): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const nativeSelection = window.getSelection();
		const selectedText = nativeSelection?.toString();
		if (selectedText && selectedText.length > 0) {
			await clipboardService.writeText(selectedText);
		} else if (element) {
			await clipboardService.writeText(element.toString());
		}
	}
});
