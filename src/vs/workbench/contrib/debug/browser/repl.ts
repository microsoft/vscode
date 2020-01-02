/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/contrib/debug/browser/media/repl';
import { URI as uri } from 'vs/base/common/uri';
import { IAction, IActionViewItem, Action } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { ITextModel } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { registerEditorAction, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Panel } from 'vs/workbench/browser/panel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { memoize } from 'vs/base/common/decorators';
import { dispose, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDebugService, REPL_ID, DEBUG_SCHEME, CONTEXT_IN_DEBUG_REPL, IDebugSession, State, IReplElement, IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { HistoryNavigator } from 'vs/base/common/history';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { createAndBindHistoryNavigationWidgetScopedContextKeyService } from 'vs/platform/browser/contextScopedHistoryWidget';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getSimpleEditorOptions, getSimpleCodeEditorWidgetOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { transparent, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { FocusSessionActionViewItem } from 'vs/workbench/contrib/debug/browser/debugActionViewItems';
import { CompletionContext, CompletionList, CompletionProviderRegistry, CompletionItem, completionKindFromString, CompletionItemKind } from 'vs/editor/common/modes';
import { first } from 'vs/base/common/arrays';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITreeNode, ITreeContextMenuEvent, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfigurationService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { FuzzyScore } from 'vs/base/common/filters';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { PANEL_BACKGROUND } from 'vs/workbench/common/theme';
import { ReplDelegate, ReplVariablesRenderer, ReplSimpleElementsRenderer, ReplEvaluationInputsRenderer, ReplEvaluationResultsRenderer, ReplRawObjectsRenderer, ReplDataSource, ReplAccessibilityProvider } from 'vs/workbench/contrib/debug/browser/replViewer';
import { localize } from 'vs/nls';

const $ = dom.$;

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const IPrivateReplService = createDecorator<IPrivateReplService>('privateReplService');
const DECORATION_KEY = 'replinputdecoration';

interface IPrivateReplService {
	_serviceBrand: undefined;
	acceptReplInput(): void;
	getVisibleContent(): string;
	selectSession(session?: IDebugSession): Promise<void>;
	clearRepl(): Promise<void>;
	focusRepl(): void;
}

function revealLastElement(tree: WorkbenchAsyncDataTree<any, any, any>) {
	tree.scrollTop = tree.scrollHeight - tree.renderHeight;
}

const sessionsToIgnore = new Set<IDebugSession>();
export class Repl extends Panel implements IPrivateReplService, IHistoryNavigationWidget {
	_serviceBrand: undefined;

	private static readonly REFRESH_DELAY = 100; // delay in ms to refresh the repl for new elements to show
	private static readonly REPL_INPUT_LINE_HEIGHT = 19;

	private history: HistoryNavigator<string>;
	private tree!: WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>;
	private replDelegate!: ReplDelegate;
	private container!: HTMLElement;
	private replInput!: CodeEditorWidget;
	private replInputContainer!: HTMLElement;
	private dimension!: dom.Dimension;
	private replInputLineCount = 1;
	private model!: ITextModel;
	private historyNavigationEnablement!: IContextKey<boolean>;
	private scopedInstantiationService!: IInstantiationService;
	private replElementsChangeListener: IDisposable | undefined;
	private styleElement: HTMLStyleElement | undefined;
	private completionItemProvider: IDisposable | undefined;
	private modelChangeListener: IDisposable = Disposable.None;

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IThemeService protected themeService: IThemeService,
		@IModelService private readonly modelService: IModelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(REPL_ID, telemetryService, themeService, storageService);

		this.history = new HistoryNavigator(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')), 50);
		codeEditorService.registerDecorationType(DECORATION_KEY, {});
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.debugService.getViewModel().onDidFocusSession(async session => {
			if (session) {
				sessionsToIgnore.delete(session);
				if (this.completionItemProvider) {
					this.completionItemProvider.dispose();
				}
				if (session.capabilities.supportsCompletionsRequest) {
					this.completionItemProvider = CompletionProviderRegistry.register({ scheme: DEBUG_SCHEME, pattern: '**/replinput', hasAccessToAllModels: true }, {
						triggerCharacters: session.capabilities.completionTriggerCharacters || ['.'],
						provideCompletionItems: async (_: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList> => {
							// Disable history navigation because up and down are used to navigate through the suggest widget
							this.historyNavigationEnablement.set(false);

							const model = this.replInput.getModel();
							if (model) {
								const word = model.getWordAtPosition(position);
								const overwriteBefore = word ? word.word.length : 0;
								const text = model.getValue();
								const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
								const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;
								const response = await session.completions(frameId, text, position, overwriteBefore, token);

								const suggestions: CompletionItem[] = [];
								const computeRange = (length: number) => Range.fromPositions(position.delta(0, -length), position);
								if (response && response.body && response.body.targets) {
									response.body.targets.forEach(item => {
										if (item && item.label) {
											suggestions.push({
												label: item.label,
												insertText: item.text || item.label,
												kind: completionKindFromString(item.type || 'property'),
												filterText: (item.start && item.length) ? text.substr(item.start, item.length).concat(item.label) : undefined,
												range: computeRange(item.length || overwriteBefore),
												sortText: item.sortText
											});
										}
									});
								}

								const history = this.history.getHistory();
								history.forEach(h => suggestions.push({
									label: h,
									insertText: h,
									kind: CompletionItemKind.Text,
									range: computeRange(h.length),
									sortText: 'ZZZ'
								}));

								return { suggestions };
							}

							return Promise.resolve({ suggestions: [] });
						}
					});
				}
			}

			await this.selectSession();
		}));
		this._register(this.debugService.onWillNewSession(async newSession => {
			// Need to listen to output events for sessions which are not yet fully initialised
			const input = this.tree.getInput();
			if (!input || input.state === State.Inactive) {
				await this.selectSession(newSession);
			}
			this.updateTitleArea();
		}));
		this._register(this.themeService.onThemeChange(() => {
			this.refreshReplElements(false);
			if (this.isVisible()) {
				this.updateInputDecoration();
			}
		}));
		this._register(this.onDidChangeVisibility(visible => {
			if (!visible) {
				dispose(this.model);
			} else {
				this.model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:replinput`), true);
				this.setMode();
				this.replInput.setModel(this.model);
				this.updateInputDecoration();
				this.refreshReplElements(true);
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.console.lineHeight') || e.affectsConfiguration('debug.console.fontSize') || e.affectsConfiguration('debug.console.fontFamily')) {
				this.onDidFontChange();
			}
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => {
			this.setMode();
		}));
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
		this.navigateHistory(true);
	}

	showNextValue(): void {
		this.navigateHistory(false);
	}

	focusRepl(): void {
		this.tree.domFocus();
	}

	private setMode(): void {
		if (!this.isVisible()) {
			return;
		}

		const activeEditor = this.editorService.activeTextEditorWidget;
		if (isCodeEditor(activeEditor)) {
			this.modelChangeListener.dispose();
			this.modelChangeListener = activeEditor.onDidChangeModelLanguage(() => this.setMode());
			if (activeEditor.hasModel()) {
				this.model.setMode(activeEditor.getModel().getLanguageIdentifier());
			}
		}
	}

	private onDidFontChange(): void {
		if (this.styleElement) {
			const debugConsole = this.configurationService.getValue<IDebugConfiguration>('debug').console;
			const fontSize = debugConsole.fontSize;
			const fontFamily = debugConsole.fontFamily === 'default' ? 'var(--monaco-monospace-font)' : debugConsole.fontFamily;
			const lineHeight = debugConsole.lineHeight ? `${debugConsole.lineHeight}px` : '1.4em';

			// Set the font size, font family, line height and align the twistie to be centered
			this.styleElement.innerHTML = `
				.repl .repl-tree .expression {
					font-size: ${fontSize}px;
					font-family: ${fontFamily};
				}

				.repl .repl-tree .expression {
					line-height: ${lineHeight};
				}

				.repl .repl-tree .monaco-tl-twistie {
					background-position-y: calc(100% - ${fontSize * 1.4 / 2 - 8}px);
				}
			`;

			this.tree.rerender();
		}
	}

	private navigateHistory(previous: boolean): void {
		const historyInput = previous ? this.history.previous() : this.history.next();
		if (historyInput) {
			this.replInput.setValue(historyInput);
			aria.status(historyInput);
			// always leave cursor at the end.
			this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
			this.historyNavigationEnablement.set(true);
		}
	}

	async selectSession(session?: IDebugSession): Promise<void> {
		const treeInput = this.tree.getInput();
		if (!session) {
			const focusedSession = this.debugService.getViewModel().focusedSession;
			// If there is a focusedSession focus on that one, otherwise just show any other not ignored session
			if (focusedSession) {
				session = focusedSession;
			} else if (!treeInput || sessionsToIgnore.has(treeInput)) {
				session = first(this.debugService.getModel().getSessions(true), s => !sessionsToIgnore.has(s)) || undefined;
			}
		}
		if (session) {
			if (this.replElementsChangeListener) {
				this.replElementsChangeListener.dispose();
			}
			this.replElementsChangeListener = session.onDidChangeReplElements(() => {
				this.refreshReplElements(session!.getReplElements().length === 0);
			});

			if (this.tree && treeInput !== session) {
				await this.tree.setInput(session);
				revealLastElement(this.tree);
			}
		}

		this.replInput.updateOptions({ readOnly: this.isReadonly });
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
				this.updateTitleArea();
			}
		}
		this.replInput.focus();
	}

	acceptReplInput(): void {
		const session = this.tree.getInput();
		if (session) {
			session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
			revealLastElement(this.tree);
			this.history.add(this.replInput.getValue());
			this.replInput.setValue('');
			const shouldRelayout = this.replInputLineCount > 1;
			this.replInputLineCount = 1;
			if (shouldRelayout) {
				// Trigger a layout to shrink a potential multi line input
				this.layout(this.dimension);
			}
		}
	}

	getVisibleContent(): string {
		let text = '';
		const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
		const traverseAndAppend = (node: ITreeNode<IReplElement, FuzzyScore>) => {
			node.children.forEach(child => {
				text += child.element.toString().trimRight() + lineDelimiter;
				if (!child.collapsed && child.children.length) {
					traverseAndAppend(child);
				}
			});
		};
		traverseAndAppend(this.tree.getNode());

		return removeAnsiEscapeCodes(text);
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		const replInputHeight = Repl.REPL_INPUT_LINE_HEIGHT * this.replInputLineCount;
		if (this.tree) {
			const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
			const treeHeight = dimension.height - replInputHeight;
			this.tree.getHTMLElement().style.height = `${treeHeight}px`;
			this.tree.layout(treeHeight, dimension.width);
			if (lastElementVisible) {
				revealLastElement(this.tree);
			}
		}
		this.replInputContainer.style.height = `${replInputHeight}px`;

		this.replInput.layout({ width: dimension.width - 20, height: replInputHeight });
	}

	focus(): void {
		setTimeout(() => this.replInput.focus(), 0);
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === SelectReplAction.ID) {
			return this.instantiationService.createInstance(SelectReplActionViewItem, this.selectReplAction);
		}

		return undefined;
	}

	getActions(): IAction[] {
		const result: IAction[] = [];
		if (this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s)).length > 1) {
			result.push(this.selectReplAction);
		}
		result.push(this.clearReplAction);

		result.forEach(a => this._register(a));

		return result;
	}

	// --- Cached locals
	@memoize
	private get selectReplAction(): SelectReplAction {
		return this.scopedInstantiationService.createInstance(SelectReplAction, SelectReplAction.ID, SelectReplAction.LABEL);
	}

	@memoize
	private get clearReplAction(): ClearReplAction {
		return this.scopedInstantiationService.createInstance(ClearReplAction, ClearReplAction.ID, ClearReplAction.LABEL);
	}

	@memoize
	private get refreshScheduler(): RunOnceScheduler {
		return new RunOnceScheduler(async () => {
			if (!this.tree.getInput()) {
				return;
			}

			const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
			await this.tree.updateChildren();
			if (lastElementVisible) {
				// Only scroll if we were scrolled all the way down before tree refreshed #10486
				revealLastElement(this.tree);
			}
		}, Repl.REFRESH_DELAY);
	}

	// --- Creation

	create(parent: HTMLElement): void {
		super.create(parent);
		this.container = dom.append(parent, $('.repl'));
		const treeContainer = dom.append(this.container, $('.repl-tree'));
		this.createReplInput(this.container);

		this.replDelegate = new ReplDelegate(this.configurationService);
		const wordWrap = this.configurationService.getValue<IDebugConfiguration>('debug').console.wordWrap;
		dom.toggleClass(treeContainer, 'word-wrap', wordWrap);
		const linkDetector = this.instantiationService.createInstance(LinkDetector);
		this.tree = this.instantiationService.createInstance<typeof WorkbenchAsyncDataTree, WorkbenchAsyncDataTree<IDebugSession, IReplElement, FuzzyScore>>(
			WorkbenchAsyncDataTree,
			'DebugRepl',
			treeContainer,
			this.replDelegate,
			[
				this.instantiationService.createInstance(ReplVariablesRenderer, linkDetector),
				this.instantiationService.createInstance(ReplSimpleElementsRenderer, linkDetector),
				new ReplEvaluationInputsRenderer(),
				new ReplEvaluationResultsRenderer(linkDetector),
				new ReplRawObjectsRenderer(linkDetector),
			],
			// https://github.com/microsoft/TypeScript/issues/32526
			new ReplDataSource() as IAsyncDataSource<IDebugSession, IReplElement>,
			{
				ariaLabel: localize('replAriaLabel', "Read Eval Print Loop Panel"),
				accessibilityProvider: new ReplAccessibilityProvider(),
				identityProvider: { getId: (element: IReplElement) => element.getId() },
				mouseSupport: false,
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IReplElement) => e },
				horizontalScrolling: !wordWrap,
				setRowLineHeight: false,
				supportDynamicHeights: wordWrap,
				overrideStyles: {
					listBackground: PANEL_BACKGROUND
				}
			});
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
		this.onDidFontChange();
	}

	private createReplInput(container: HTMLElement): void {
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));

		const { scopedContextKeyService, historyNavigationEnablement } = createAndBindHistoryNavigationWidgetScopedContextKeyService(this.contextKeyService, { target: this.replInputContainer, historyNavigator: this });
		this.historyNavigationEnablement = historyNavigationEnablement;
		this._register(scopedContextKeyService);
		CONTEXT_IN_DEBUG_REPL.bindTo(scopedContextKeyService).set(true);

		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService], [IPrivateReplService, this]));
		const options = getSimpleEditorOptions();
		options.readOnly = true;
		options.ariaLabel = localize('debugConsole', "Debug Console");

		this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());

		this._register(this.replInput.onDidChangeModelContent(() => {
			const model = this.replInput.getModel();
			this.historyNavigationEnablement.set(!!model && model.getValue() === '');
			const lineCount = model ? Math.min(10, model.getLineCount()) : 1;
			if (lineCount !== this.replInputLineCount) {
				this.replInputLineCount = lineCount;
				this.layout(this.dimension);
			}
		}));
		// We add the input decoration only when the focus is in the input #61126
		this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
		this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));

		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => dom.addClass(this.replInputContainer, 'synthetic-focus')));
		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => dom.removeClass(this.replInputContainer, 'synthetic-focus')));
	}

	private onContextMenu(e: ITreeContextMenuEvent<IReplElement>): void {
		const actions: IAction[] = [];
		actions.push(new Action('debug.replCopy', localize('copy', "Copy"), undefined, true, async () => {
			const nativeSelection = window.getSelection();
			if (nativeSelection) {
				await this.clipboardService.writeText(nativeSelection.toString());
			}
			return Promise.resolve();
		}));
		actions.push(new Action('workbench.debug.action.copyAll', localize('copyAll', "Copy All"), undefined, true, async () => {
			await this.clipboardService.writeText(this.getVisibleContent());
			return Promise.resolve();
		}));
		actions.push(new Action('debug.collapseRepl', localize('collapse', "Collapse All"), undefined, true, () => {
			this.tree.collapseAll();
			this.replInput.focus();
			return Promise.resolve();
		}));
		actions.push(new Separator());
		actions.push(this.clearReplAction);

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => e.element,
			onHide: () => dispose(actions)
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
			const transparentForeground = transparent(editorForeground, 0.4)(this.themeService.getTheme());
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

		this.replInput.setDecorations(DECORATION_KEY, decorations);
	}

	protected saveState(): void {
		const replHistory = this.history.getHistory();
		if (replHistory.length) {
			this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(replHistory), StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
		}

		super.saveState();
	}

	dispose(): void {
		this.replInput.dispose();
		if (this.replElementsChangeListener) {
			this.replElementsChangeListener.dispose();
		}
		this.refreshScheduler.dispose();
		this.modelChangeListener.dispose();
		super.dispose();
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
		SuggestController.get(editor).acceptSelectedSuggestion(false, true);
		accessor.get(IPrivateReplService).acceptReplInput();
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
				primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		SuggestController.get(editor).acceptSelectedSuggestion(false, true);
		accessor.get(IPrivateReplService).focusRepl();
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
		return clipboardService.writeText(accessor.get(IPrivateReplService).getVisibleContent());
	}
}

registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);
registerEditorAction(FilterReplAction);

class SelectReplActionViewItem extends FocusSessionActionViewItem {

	protected getSessions(): ReadonlyArray<IDebugSession> {
		return this.debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl() && !sessionsToIgnore.has(s));
	}

	protected mapFocusedSessionToSelected(focusedSession: IDebugSession): IDebugSession {
		while (focusedSession.parentSession && !focusedSession.hasSeparateRepl()) {
			focusedSession = focusedSession.parentSession;
		}
		return focusedSession;
	}
}

class SelectReplAction extends Action {

	static readonly ID = 'workbench.action.debug.selectRepl';
	static readonly LABEL = localize('selectRepl', "Select Debug Console");

	constructor(id: string, label: string,
		@IDebugService private readonly debugService: IDebugService,
		@IPrivateReplService private readonly replService: IPrivateReplService
	) {
		super(id, label);
	}

	async run(session: IDebugSession): Promise<any> {
		// If session is already the focused session we need to manualy update the tree since view model will not send a focused change event
		if (session && session.state !== State.Inactive && session !== this.debugService.getViewModel().focusedSession) {
			await this.debugService.focusStackFrame(undefined, undefined, session, true);
		} else {
			await this.replService.selectSession(session);
		}

		return Promise.resolve(undefined);
	}
}

export class ClearReplAction extends Action {
	static readonly ID = 'workbench.debug.panel.action.clearReplAction';
	static readonly LABEL = localize('clearRepl', "Clear Console");

	constructor(id: string, label: string,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'debug-action codicon-clear-all');
	}

	async run(): Promise<any> {
		const repl = <Repl>this.panelService.openPanel(REPL_ID);
		await repl.clearRepl();
		aria.status(localize('debugConsoleCleared', "Debug console was cleared"));
	}
}
