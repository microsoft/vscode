/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { IHistoryNavigationWidget } from '../../../../base/browser/history.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { memoize } from '../../../../base/common/decorators.js';
import { Emitter } from '../../../../base/common/event.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { HistoryNavigator } from '../../../../base/common/history.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI as uri } from '../../../../base/common/uri.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EDITOR_FONT_DEFAULTS, EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { CompletionContext, CompletionItem, CompletionItemInsertTextRule, CompletionItemKind, CompletionItemKinds, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { registerAndCreateHistoryNavigationContext } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { editorForeground, resolveColorValue } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { FilterViewPane, IViewPaneOptions, ViewAction } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../codeEditor/browser/simpleEditorOptions.js';
import { CONTEXT_DEBUG_STATE, CONTEXT_IN_DEBUG_REPL, CONTEXT_MULTI_SESSION_REPL, DEBUG_SCHEME, IDebugConfiguration, IDebugService, IDebugSession, IReplConfiguration, IReplElement, IReplOptions, REPL_VIEW_ID, State, getStateLabel } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
import { ReplEvaluationResult, ReplGroup } from '../common/replModel.js';
import { FocusSessionActionViewItem } from './debugActionViewItems.js';
import { DEBUG_COMMAND_CATEGORY, FOCUS_REPL_ID } from './debugCommands.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
import { debugConsoleClearAll, debugConsoleEvaluationPrompt } from './debugIcons.js';
import './media/repl.css';
import { ReplFilter } from './replFilter.js';
import { ReplAccessibilityProvider, ReplDataSource, ReplDelegate, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplGroupRenderer, ReplOutputElementRenderer, ReplRawObjectsRenderer, ReplVariablesRenderer } from './replViewer.js';

const $ = dom.$;

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const FILTER_HISTORY_STORAGE_KEY = 'debug.repl.filterHistory';
const FILTER_VALUE_STORAGE_KEY = 'debug.repl.filterValue';
const DECORATION_KEY = 'replinputdecoration';

function revealLastElement(tree: WorkbenchAsyncDataTree<any, any, any>) {
	tree.scrollTop = tree.scrollHeight - tree.renderHeight;
	// tree.scrollTop = 1e6;
}

const sessionsToIgnore = new Set<IDebugSession>();
const identityProvider = { getId: (element: IReplElement) => element.getId() };

export class Repl extends FilterViewPane implements IHistoryNavigationWidget {
	declare readonly _serviceBrand: undefined;

	private static readonly REFRESH_DELAY = 50; // delay in ms to refresh the repl for new elements to show
	private static readonly URI = uri.parse(`${DEBUG_SCHEME}:replinput`);

	private history: HistoryNavigator<string>;
	private tree?: WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>;
	private replOptions: ReplOptions;
	private previousTreeScrollHeight: number = 0;
	private replDelegate!: ReplDelegate;
	private container!: HTMLElement;
	private treeContainer!: HTMLElement;
	private replInput!: CodeEditorWidget;
	private replInputContainer!: HTMLElement;
	private bodyContentDimension: dom.Dimension | undefined;
	private model: ITextModel | undefined;
	private setHistoryNavigationEnablement!: (enabled: boolean) => void;
	private scopedInstantiationService!: IInstantiationService;
	private replElementsChangeListener: IDisposable | undefined;
	private styleElement: HTMLStyleElement | undefined;
	private styleChangedWhenInvisible: boolean = false;
	private completionItemProvider: IDisposable | undefined;
	private modelChangeListener: IDisposable = Disposable.None;
	private filter: ReplFilter;
	private multiSessionRepl: IContextKey<boolean>;
	private menu: IMenu;
	private replDataSource: IAsyncDataSource<IDebugSession, IReplElement> | undefined;
	private findIsOpen: boolean = false;

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
		@IConfigurationService protected override readonly configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@IEditorService private readonly editorService: IEditorService,
		@IKeybindingService protected override readonly keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILogService private readonly logService: ILogService,
	) {
		const filterText = storageService.get(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE, '');
		super({
			...options,
			filterOptions: {
				placeholder: localize({ key: 'workbench.debug.filter.placeholder', comment: ['Text in the brackets after e.g. is not localizable'] }, "Filter (e.g. text, !exclude, \\escape)"),
				text: filterText,
				history: JSON.parse(storageService.get(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')) as string[],
			}
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.menu = menuService.createMenu(MenuId.DebugConsoleContext, contextKeyService);
		this._register(this.menu);
		this.history = this._register(new HistoryNavigator(new Set(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]'))), 100));
		this.filter = new ReplFilter();
		this.filter.filterQuery = filterText;
		this.multiSessionRepl = CONTEXT_MULTI_SESSION_REPL.bindTo(contextKeyService);
		this.replOptions = this._register(this.instantiationService.createInstance(ReplOptions, this.id, () => this.getLocationBasedColors().background));
		this._register(this.replOptions.onDidChange(() => this.onDidStyleChange()));

		codeEditorService.registerDecorationType('repl-decoration', DECORATION_KEY, {});
		this.multiSessionRepl.set(this.isMultiSessionView);
		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.debugService.getViewModel().focusedSession) {
			this.onDidFocusSession(this.debugService.getViewModel().focusedSession);
		}

		this._register(this.debugService.getViewModel().onDidFocusSession(session => {
			this.onDidFocusSession(session);
		}));
		this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async e => {
			if (e instanceof Variable && this.tree?.hasNode(e)) {
				await this.tree.updateChildren(e, false, true);
				await this.tree.expand(e);
			}
		}));
		this._register(this.debugService.onWillNewSession(async newSession => {
			// Need to listen to output events for sessions which are not yet fully initialised
			const input = this.tree?.getInput();
			if (!input || input.state === State.Inactive) {
				await this.selectSession(newSession);
			}
			this.multiSessionRepl.set(this.isMultiSessionView);
		}));
		this._register(this.debugService.onDidEndSession(async () => {
			// Update view, since orphaned sessions might now be separate
			await Promise.resolve(); // allow other listeners to go first, so sessions can update parents
			this.multiSessionRepl.set(this.isMultiSessionView);
		}));
		this._register(this.themeService.onDidColorThemeChange(() => {
			this.refreshReplElements(false);
			if (this.isVisible()) {
				this.updateInputDecoration();
			}
		}));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (!visible) {
				return;
			}
			if (!this.model) {
				this.model = this.modelService.getModel(Repl.URI) || this.modelService.createModel('', null, Repl.URI, true);
			}

			const focusedSession = this.debugService.getViewModel().focusedSession;
			if (this.tree && this.tree.getInput() !== focusedSession) {
				this.onDidFocusSession(focusedSession);
			}

			this.setMode();
			this.replInput.setModel(this.model);
			this.updateInputDecoration();
			this.refreshReplElements(true);

			if (this.styleChangedWhenInvisible) {
				this.styleChangedWhenInvisible = false;
				this.tree?.updateChildren(undefined, true, false);
				this.onDidStyleChange();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.console.wordWrap') && this.tree) {
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

		this._register(this.filterWidget.onDidChangeFilterText(() => {
			this.filter.filterQuery = this.filterWidget.getFilterText();
			if (this.tree) {
				this.tree.refilter();
				revealLastElement(this.tree);
			}
		}));
	}

	private async onDidFocusSession(session: IDebugSession | undefined): Promise<void> {
		if (session) {
			sessionsToIgnore.delete(session);
			this.completionItemProvider?.dispose();
			if (session.capabilities.supportsCompletionsRequest) {
				this.completionItemProvider = this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, pattern: '**/replinput', hasAccessToAllModels: true }, {
					_debugDisplayName: 'debugConsole',
					triggerCharacters: session.capabilities.completionTriggerCharacters || ['.'],
					provideCompletionItems: async (_: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList> => {
						// Disable history navigation because up and down are used to navigate through the suggest widget
						this.setHistoryNavigationEnablement(false);

						const model = this.replInput.getModel();
						if (model) {
							const text = model.getValue();
							const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
							const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;
							const response = await session.completions(frameId, focusedStackFrame?.thread.threadId || 0, text, position, token);

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
											range: computeRange(item.length || 0),
											sortText: item.sortText,
											insertTextRules
										});
									}
								});
							}

							if (this.configurationService.getValue<IDebugConfiguration>('debug').console.historySuggestions) {
								const history = this.history.getHistory();
								const idxLength = String(history.length).length;
								history.forEach((h, i) => suggestions.push({
									label: h,
									insertText: h,
									kind: CompletionItemKind.Text,
									range: computeRange(h.length),
									sortText: 'ZZZ' + String(history.length - i).padStart(idxLength, '0')
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
		const session = this.tree?.getInput();
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
		this.filterWidget.focus();
	}

	openFind(): void {
		this.tree?.openFind();
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
				this.model.setLanguage(activeEditorControl.getModel().getLanguageId());
			}
		}
	}

	private onDidStyleChange(): void {
		if (!this.isVisible()) {
			this.styleChangedWhenInvisible = true;
			return;
		}
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

			this.tree?.rerender();

			if (this.bodyContentDimension) {
				this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
			}
		}
	}

	private navigateHistory(previous: boolean): void {
		const historyInput = (previous ?
			(this.history.previous() ?? this.history.first()) : this.history.next())
			?? '';
		this.replInput.setValue(historyInput);
		aria.status(historyInput);
		// always leave cursor at the end.
		this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
		this.setHistoryNavigationEnablement(true);
	}

	async selectSession(session?: IDebugSession): Promise<void> {
		const treeInput = this.tree?.getInput();
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
				this.refreshReplElements(session.getReplElements().length === 0);
			});

			if (this.tree && treeInput !== session) {
				try {
					await this.tree.setInput(session);
				} catch (err) {
					// Ignore error because this may happen multiple times while refreshing,
					// then changing the root may fail. Log to help with debugging if needed.
					this.logService.error(err);
				}
				revealLastElement(this.tree);
			}
		}

		this.replInput?.updateOptions({ readOnly: this.isReadonly });
		this.updateInputDecoration();
	}

	async clearRepl(): Promise<void> {
		const session = this.tree?.getInput();
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
		const session = this.tree?.getInput();
		if (session && !this.isReadonly) {
			session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
			revealLastElement(this.tree!);
			this.history.add(this.replInput.getValue());
			this.replInput.setValue('');
			if (this.bodyContentDimension) {
				// Trigger a layout to shrink a potential multi line input
				this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
			}
		}
	}

	sendReplInput(input: string): void {
		const session = this.tree?.getInput();
		if (session && !this.isReadonly) {
			session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, input);
			revealLastElement(this.tree!);
			this.history.add(input);
		}
	}

	getVisibleContent(): string {
		let text = '';
		if (this.model && this.tree) {
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

	protected layoutBodyContent(height: number, width: number): void {
		this.bodyContentDimension = new dom.Dimension(width, height);
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
		this.tree?.collapseAll();
	}

	getDebugSession(): IDebugSession | undefined {
		return this.tree?.getInput();
	}

	getReplInput(): CodeEditorWidget {
		return this.replInput;
	}

	getReplDataSource(): IAsyncDataSource<IDebugSession, IReplElement> | undefined {
		return this.replDataSource;
	}

	getFocusedElement(): IReplElement | undefined {
		return this.tree?.getFocus()?.[0];
	}

	focusTree(): void {
		this.tree?.domFocus();
	}

	override async focus(): Promise<void> {
		super.focus();
		await timeout(0); // wait a task for the repl to get attached to the DOM, #83387
		this.replInput.focus();
	}

	override createActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === selectReplCommandId) {
			const session = (this.tree ? this.tree.getInput() : undefined) ?? this.debugService.getViewModel().focusedSession;
			return this.instantiationService.createInstance(SelectReplActionViewItem, action, session);
		}

		return super.createActionViewItem(action);
	}

	private get isMultiSessionView(): boolean {
		return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1;
	}

	// --- Cached locals

	@memoize
	private get refreshScheduler(): RunOnceScheduler {
		const autoExpanded = new Set<string>();
		return new RunOnceScheduler(async () => {
			if (!this.tree || !this.tree.getInput() || !this.isVisible()) {
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
								await this.tree!.expand(element);
							}
							if (!this.tree!.isCollapsed(element)) {
								// Repl groups can have children which are repl groups thus we might need to expand those as well
								await autoExpandElements(element.getChildren());
							}
						}
					}
				};
				await autoExpandElements(session.getReplElements());
			}
			// Repl elements count changed, need to update filter stats on the badge
			const { total, filtered } = this.getFilterStats();
			this.filterWidget.updateBadge(total === filtered || total === 0 ? undefined : localize('showing filtered repl lines', "Showing {0} of {1}", filtered, total));
		}, Repl.REFRESH_DELAY);
	}

	// --- Creation

	override render(): void {
		super.render();
		this._register(registerNavigableContainer({
			name: 'repl',
			focusNotifiers: [this, this.filterWidget],
			focusNextWidget: () => {
				const element = this.tree?.getHTMLElement();
				if (this.filterWidget.hasFocus()) {
					this.tree?.domFocus();
				} else if (element && dom.isActiveElement(element)) {
					this.focus();
				}
			},
			focusPreviousWidget: () => {
				const element = this.tree?.getHTMLElement();
				if (this.replInput.hasTextFocus()) {
					this.tree?.domFocus();
				} else if (element && dom.isActiveElement(element)) {
					this.focusFilter();
				}
			}
		}));
	}

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
		const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
		this.replDataSource = new ReplDataSource();

		const tree = this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>,
			'DebugRepl',
			this.treeContainer,
			this.replDelegate,
			[
				this.instantiationService.createInstance(ReplVariablesRenderer, expressionRenderer),
				this.instantiationService.createInstance(ReplOutputElementRenderer, expressionRenderer),
				new ReplEvaluationInputsRenderer(),
				this.instantiationService.createInstance(ReplGroupRenderer, expressionRenderer),
				new ReplEvaluationResultsRenderer(expressionRenderer),
				new ReplRawObjectsRenderer(expressionRenderer),
			],
			this.replDataSource,
			{
				filter: this.filter,
				accessibilityProvider: new ReplAccessibilityProvider(),
				identityProvider,
				userSelection: true,
				mouseSupport: false,
				findWidgetEnabled: true,
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IReplElement) => e.toString(true) },
				horizontalScrolling: !wordWrap,
				setRowLineHeight: false,
				supportDynamicHeights: wordWrap,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			});

		this._register(tree.onDidChangeContentHeight(() => {
			if (tree.scrollHeight !== this.previousTreeScrollHeight) {
				// Due to rounding, the scrollTop + renderHeight will not exactly match the scrollHeight.
				// Consider the tree to be scrolled all the way down if it is within 2px of the bottom.
				const lastElementWasVisible = tree.scrollTop + tree.renderHeight >= this.previousTreeScrollHeight - 2;
				if (lastElementWasVisible) {
					setTimeout(() => {
						// Can't set scrollTop during this event listener, the list might overwrite the change
						revealLastElement(tree);
					}, 0);
				}
			}

			this.previousTreeScrollHeight = tree.scrollHeight;
		}));

		this._register(tree.onContextMenu(e => this.onContextMenu(e)));
		this._register(tree.onDidChangeFindOpenState((open) => this.findIsOpen = open));

		let lastSelectedString: string;
		this._register(tree.onMouseClick(() => {
			if (this.findIsOpen) {
				return;
			}
			const selection = dom.getWindow(this.treeContainer).getSelection();
			if (!selection || selection.type !== 'Range' || lastSelectedString === selection.toString()) {
				// only focus the input if the user is not currently selecting and find isn't open.
				this.replInput.focus();
			}
			lastSelectedString = selection ? selection.toString() : '';
		}));
		// Make sure to select the session if debugging is already active
		this.selectSession();
		this.styleElement = domStylesheetsJs.createStyleSheet(this.container);
		this.onDidStyleChange();
	}

	private createReplInput(container: HTMLElement): void {
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));
		dom.append(this.replInputContainer, $('.repl-input-chevron' + ThemeIcon.asCSSSelector(debugConsoleEvaluationPrompt)));

		const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(this.scopedContextKeyService, this));
		this.setHistoryNavigationEnablement = enabled => {
			historyNavigationBackwardsEnablement.set(enabled);
			historyNavigationForwardsEnablement.set(enabled);
		};
		CONTEXT_IN_DEBUG_REPL.bindTo(this.scopedContextKeyService).set(true);

		this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		const options = getSimpleEditorOptions(this.configurationService);
		options.readOnly = true;
		options.suggest = { showStatusBar: true };
		const config = this.configurationService.getValue<IDebugConfiguration>('debug');
		options.acceptSuggestionOnEnter = config.console.acceptSuggestionOnEnter === 'on' ? 'on' : 'off';
		options.ariaLabel = this.getAriaLabel();

		this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());

		let lastContentHeight = -1;
		this._register(this.replInput.onDidChangeModelContent(() => {
			const model = this.replInput.getModel();
			this.setHistoryNavigationEnablement(!!model && model.getValue() === '');

			const contentHeight = this.replInput.getContentHeight();
			if (contentHeight !== lastContentHeight) {
				lastContentHeight = contentHeight;
				if (this.bodyContentDimension) {
					this.layoutBodyContent(this.bodyContentDimension.height, this.bodyContentDimension.width);
				}
			}
		}));
		// We add the input decoration only when the focus is in the input #61126
		this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
		this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));

		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => this.replInputContainer.classList.add('synthetic-focus')));
		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => this.replInputContainer.classList.remove('synthetic-focus')));
	}

	private getAriaLabel(): string {
		let ariaLabel = localize('debugConsole', "Debug Console");
		if (!this.configurationService.getValue(AccessibilityVerbositySettingId.Debug)) {
			return ariaLabel;
		}
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
		if (keybinding) {
			ariaLabel = localize('commentLabelWithKeybinding', "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
		} else {
			ariaLabel = localize('commentLabelWithKeybindingNoKeybinding', "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
		}

		return ariaLabel;
	}

	private onContextMenu(e: ITreeContextMenuEvent<IReplElement>): void {
		const actions = getFlatContextMenuActions(this.menu.getActions({ arg: e.element, shouldForwardArgs: false }));
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
			this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		}
		const filterHistory = this.filterWidget.getHistory();
		if (filterHistory.length) {
			this.storageService.store(FILTER_HISTORY_STORAGE_KEY, JSON.stringify(filterHistory), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(FILTER_HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		}
		const filterValue = this.filterWidget.getFilterText();
		if (filterValue) {
			this.storageService.store(FILTER_VALUE_STORAGE_KEY, filterValue, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(FILTER_VALUE_STORAGE_KEY, StorageScope.WORKSPACE);
		}

		super.saveState();
	}

	override dispose(): void {
		this.replInput?.dispose(); // Disposed before rendered? #174558
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
			label: localize2({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "Debug Console: Accept Input"),
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

class FilterReplAction extends ViewAction<Repl> {

	constructor() {
		super({
			viewId: REPL_VIEW_ID,
			id: 'repl.action.filter',
			title: localize('repl.action.filter', "Debug Console: Focus Filter"),
			precondition: CONTEXT_IN_DEBUG_REPL,
			keybinding: [{
				when: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF,
				weight: KeybindingWeight.EditorContrib
			}]
		});
	}

	runInView(accessor: ServicesAccessor, repl: Repl): void | Promise<void> {
		repl.focusFilter();
	}
}


class FindReplAction extends ViewAction<Repl> {

	constructor() {
		super({
			viewId: REPL_VIEW_ID,
			id: 'repl.action.find',
			title: localize('repl.action.find', "Debug Console: Focus Find"),
			precondition: CONTEXT_IN_DEBUG_REPL,
			keybinding: [{
				when: ContextKeyExpr.or(CONTEXT_IN_DEBUG_REPL, ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view')),
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
				weight: KeybindingWeight.EditorContrib
			}],
			icon: Codicon.search,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', REPL_VIEW_ID),
				order: 15
			}, {
				id: MenuId.DebugConsoleContext,
				group: 'z_commands',
				order: 25
			}],
		});
	}

	runInView(accessor: ServicesAccessor, view: Repl): void | Promise<void> {
		view.openFind();
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
registerAction2(FilterReplAction);
registerAction2(FindReplAction);

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

export function getReplView(viewsService: IViewsService): Repl | undefined {
	return viewsService.getActiveViewWithId(REPL_VIEW_ID) as Repl ?? undefined;
}

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
			title: localize2('clearRepl', 'Clear Console'),
			metadata: {
				description: localize2('clearRepl.descriotion', 'Clears all program output from your debug REPL')
			},
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
			}],
			keybinding: [{
				primary: 0,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyK },
				// Weight is higher than work workbench contributions so the keybinding remains
				// highest priority when chords are registered afterwards
				weight: KeybindingWeight.WorkbenchContrib + 1,
				when: ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view')
			}],
		});
	}

	runInView(_accessor: ServicesAccessor, view: Repl): void {
		const accessibilitySignalService = _accessor.get(IAccessibilitySignalService);
		view.clearRepl();
		accessibilitySignalService.playSignal(AccessibilitySignal.clear);
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
		const debugService = accessor.get(IDebugService);
		const nativeSelection = dom.getActiveWindow().getSelection();
		const selectedText = nativeSelection?.toString();
		if (selectedText && selectedText.length > 0) {
			return clipboardService.writeText(selectedText);
		} else if (element) {
			return clipboardService.writeText(await this.tryEvaluateAndCopy(debugService, element) || element.toString());
		}
	}

	private async tryEvaluateAndCopy(debugService: IDebugService, element: IReplElement): Promise<string | undefined> {
		// todo: we should expand DAP to allow copying more types here (#187784)
		if (!(element instanceof ReplEvaluationResult)) {
			return;
		}

		const stackFrame = debugService.getViewModel().focusedStackFrame;
		const session = debugService.getViewModel().focusedSession;
		if (!stackFrame || !session || !session.capabilities.supportsClipboardContext) {
			return;
		}

		try {
			const evaluation = await session.evaluate(element.originalExpression, stackFrame.frameId, 'clipboard');
			return evaluation?.body.result;
		} catch (e) {
			return;
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: FOCUS_REPL_ID,
			category: DEBUG_COMMAND_CATEGORY,
			title: localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusConsole' }, "Focus on Debug Console View"),
		});
	}

	override async run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const repl = await viewsService.openView<Repl>(REPL_VIEW_ID);
		await repl?.focus();
	}
});
