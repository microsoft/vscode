/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/parts/debug/browser/media/repl';
import * as nls from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import * as errors from 'vs/base/common/errors';
import { IAction, IActionItem, Action } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { isMacintosh } from 'vs/base/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode } from 'vs/base/common/keyCodes';
import severity from 'vs/base/common/severity';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { ITextModel } from 'vs/editor/common/model';
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
import { clipboard } from 'electron';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { memoize } from 'vs/base/common/decorators';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDebugService, REPL_ID, DEBUG_SCHEME, CONTEXT_IN_DEBUG_REPL, IDebugSession, State, IReplElement, IExpressionContainer, IExpression, IReplElementSource } from 'vs/workbench/parts/debug/common/debug';
import { HistoryNavigator } from 'vs/base/common/history';
import { IHistoryNavigationWidget } from 'vs/base/browser/history';
import { createAndBindHistoryNavigationWidgetScopedContextKeyService } from 'vs/platform/widget/browser/contextScopedHistoryWidget';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getSimpleCodeEditorWidgetOptions } from 'vs/workbench/parts/codeEditor/electron-browser/simpleEditorOptions';
import { getSimpleEditorOptions } from 'vs/workbench/parts/codeEditor/browser/simpleEditorOptions';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { transparent, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { FocusSessionActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { CompletionContext, CompletionList, CompletionProviderRegistry } from 'vs/editor/common/modes';
import { first } from 'vs/base/common/arrays';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { Variable, Expression, SimpleReplElement, RawObjectReplElement } from 'vs/workbench/parts/debug/common/debugModel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { VariablesRenderer } from 'vs/workbench/parts/debug/electron-browser/variablesView';
import { ITreeRenderer, ITreeNode, ITreeContextMenuEvent, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { renderExpressionValue } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { handleANSIOutput } from 'vs/workbench/parts/debug/browser/debugANSIHandling';
import { ILabelService } from 'vs/platform/label/common/label';
import { LinkDetector } from 'vs/workbench/parts/debug/browser/linkDetector';
import { CopyAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { ReplCollapseAllAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { removeAnsiEscapeCodes, isFullWidthCharacter, endsWith } from 'vs/base/common/strings';
import { WorkbenchAsyncDataTree, IListService } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

const $ = dom.$;

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const IPrivateReplService = createDecorator<IPrivateReplService>('privateReplService');
const DECORATION_KEY = 'replinputdecoration';

interface IPrivateReplService {
	_serviceBrand: any;
	acceptReplInput(): void;
	getVisibleContent(): string;
	selectSession(session?: IDebugSession): void;
	clearRepl(): void;
}

function revealLastElement(tree: WorkbenchAsyncDataTree<any, any>) {
	tree.scrollTop = tree.scrollHeight - tree.renderHeight;
}

const sessionsToIgnore = new Set<IDebugSession>();
export class Repl extends Panel implements IPrivateReplService, IHistoryNavigationWidget {
	_serviceBrand: any;

	private static readonly HALF_WIDTH_TYPICAL = 'n';
	private static readonly REFRESH_DELAY = 100; // delay in ms to refresh the repl for new elements to show
	private static readonly REPL_INPUT_INITIAL_HEIGHT = 19;
	private static readonly REPL_INPUT_MAX_HEIGHT = 170;

	private history: HistoryNavigator<string>;
	private tree: WorkbenchAsyncDataTree<IDebugSession, IReplElement>;
	private replDelegate: ReplDelegate;
	private container: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: CodeEditorWidget;
	private replInputContainer: HTMLElement;
	private dimension: dom.Dimension;
	private replInputHeight: number;
	private model: ITextModel;
	private historyNavigationEnablement: IContextKey<boolean>;
	private scopedInstantiationService: IInstantiationService;
	private replElementsChangeListener: IDisposable;

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
		@IListService private readonly listService: IListService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly textResourcePropertiesService: ITextResourcePropertiesService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(REPL_ID, telemetryService, themeService, storageService);

		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.history = new HistoryNavigator(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')), 50);
		codeEditorService.registerDecorationType(DECORATION_KEY, {});
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.debugService.getViewModel().onDidFocusSession(session => {
			sessionsToIgnore.delete(session);
			this.selectSession();
		}));
		this._register(this.debugService.onWillNewSession(() => {
			// Need to listen to output events for sessions which are not yet fully initialised
			const input = this.tree.getInput();
			if (!input || input.state === State.Inactive) {
				this.selectSession();
			}
			this.updateTitleArea();
		}));
		this._register(this.themeService.onThemeChange(() => {
			if (this.isVisible()) {
				this.updateInputDecoration();
			}
		}));
		this._register(this.onDidChangeVisibility(visible => {
			if (!visible) {
				dispose(this.model);
			} else {
				this.model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:replinput`), true);
				this.replInput.setModel(this.model);
				this.updateInputDecoration();
				this.refreshReplElements(true);
			}
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

	selectSession(session?: IDebugSession): void {
		if (!session) {
			const focusedSession = this.debugService.getViewModel().focusedSession;
			// If there is a focusedSession focus on that one, otherwise just show any other not ignored session
			if (focusedSession) {
				session = focusedSession;
			} else if (!this.tree.getInput() || sessionsToIgnore.has(this.tree.getInput())) {
				session = first(this.debugService.getModel().getSessions(true), s => !sessionsToIgnore.has(s));
			}
		}
		if (session) {
			if (this.replElementsChangeListener) {
				this.replElementsChangeListener.dispose();
			}
			this.replElementsChangeListener = session.onDidChangeReplElements(() => {
				this.refreshReplElements(session.getReplElements().length === 0);
			});

			if (this.tree && this.tree.getInput() !== session) {
				this.tree.setInput(session).then(() => revealLastElement(this.tree)).then(undefined, errors.onUnexpectedError);
			}
		}

		this.replInput.updateOptions({ readOnly: this.isReadonly });
		this.updateInputDecoration();
	}

	clearRepl(): void {
		const session = this.tree.getInput();
		if (session) {
			session.removeReplExpressions();
			if (session.state === State.Inactive) {
				// Ignore inactive sessions which got cleared - so they are not shown any more
				sessionsToIgnore.add(session);
				this.selectSession();
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
			const shouldRelayout = this.replInputHeight > Repl.REPL_INPUT_INITIAL_HEIGHT;
			this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
			if (shouldRelayout) {
				// Trigger a layout to shrink a potential multi line input
				this.layout(this.dimension);
			}
		}
	}

	getVisibleContent(): string {
		let text = '';
		const lineDelimiter = this.textResourcePropertiesService.getEOL(this.model.uri);
		const traverseAndAppend = (node: ITreeNode<IReplElement, void>) => {
			node.children.forEach(child => {
				text += child.element.toString() + lineDelimiter;
				if (!child.collapsed && child.children.length) {
					traverseAndAppend(child);
				}
			});
		};
		traverseAndAppend(this.tree.getNode(null));

		return removeAnsiEscapeCodes(text);
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		if (this.tree) {
			this.replDelegate.setWidth(dimension.width - 25, this.characterWidth);
			const treeHeight = dimension.height - this.replInputHeight;
			this.treeContainer.style.height = `${treeHeight}px`;
			this.tree.layout(treeHeight);
		}
		this.replInputContainer.style.height = `${this.replInputHeight}px`;

		this.replInput.layout({ width: dimension.width - 20, height: this.replInputHeight });
	}

	focus(): void {
		this.replInput.focus();
	}

	getActionItem(action: IAction): IActionItem {
		if (action.id === SelectReplAction.ID) {
			return this.instantiationService.createInstance(SelectReplActionItem, this.selectReplAction);
		}

		return undefined;
	}

	getActions(): IAction[] {
		const result: IAction[] = [];
		if (this.debugService.getModel().getSessions(true).filter(s => !sessionsToIgnore.has(s)).length > 1) {
			result.push(this.selectReplAction);
		}
		result.push(this.clearReplAction);

		result.forEach(a => this._register(a));

		return result;
	}

	// --- Cached locals
	@memoize
	private get characterWidth(): number {
		const characterWidthSurveyor = dom.append(this.container, $('.surveyor'));
		characterWidthSurveyor.textContent = Repl.HALF_WIDTH_TYPICAL;
		for (let i = 0; i < 10; i++) {
			characterWidthSurveyor.textContent += characterWidthSurveyor.textContent;
		}
		characterWidthSurveyor.style.fontSize = isMacintosh ? '12px' : '14px';

		return characterWidthSurveyor.clientWidth / characterWidthSurveyor.textContent.length;
	}

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
		return new RunOnceScheduler(() => {
			if (!this.tree.getInput()) {
				return;
			}
			const lastElementVisible = this.tree.scrollTop + this.tree.renderHeight >= this.tree.scrollHeight;
			this.tree.refresh().then(() => {
				if (lastElementVisible) {
					// Only scroll if we were scrolled all the way down before tree refreshed #10486
					revealLastElement(this.tree);
				}
			}, errors.onUnexpectedError);
		}, Repl.REFRESH_DELAY);
	}

	// --- Creation

	create(parent: HTMLElement): void {
		super.create(parent);
		this.container = dom.append(parent, $('.repl'));
		this.treeContainer = dom.append(this.container, $('.repl-tree'));
		this.createReplInput(this.container);

		this.replDelegate = new ReplDelegate();
		this.tree = new WorkbenchAsyncDataTree(this.treeContainer, this.replDelegate, [
			this.instantiationService.createInstance(VariablesRenderer),
			this.instantiationService.createInstance(ReplSimpleElementsRenderer),
			new ReplExpressionsRenderer(),
			new ReplRawObjectsRenderer()
		], new ReplDataSource(), {
				ariaLabel: nls.localize('replAriaLabel', "Read Eval Print Loop Panel"),
				accessibilityProvider: new ReplAccessibilityProvider(),
				identityProvider: { getId: element => element.getId() },
				mouseSupport: false,
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: e => e }
			}, this.contextKeyService, this.listService, this.themeService, this.configurationService, this.keybindingService);

		this.toDispose.push(this.tree.onContextMenu(e => this.onContextMenu(e)));
		// Make sure to select the session if debugging is already active
		this.selectSession();
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
		this.replInput = this.scopedInstantiationService.createInstance(CodeEditorWidget, this.replInputContainer, options, getSimpleCodeEditorWidgetOptions());

		CompletionProviderRegistry.register({ scheme: DEBUG_SCHEME, pattern: '**/replinput', hasAccessToAllModels: true }, {
			triggerCharacters: ['.'],
			provideCompletionItems: (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Promise<CompletionList> => {
				// Disable history navigation because up and down are used to navigate through the suggest widget
				this.historyNavigationEnablement.set(false);

				const focusedSession = this.debugService.getViewModel().focusedSession;
				if (focusedSession && focusedSession.capabilities.supportsCompletionsRequest) {

					const word = this.replInput.getModel().getWordAtPosition(position);
					const overwriteBefore = word ? word.word.length : 0;
					const text = this.replInput.getModel().getLineContent(position.lineNumber);
					const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
					const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;

					return focusedSession.completions(frameId, text, position, overwriteBefore).then(suggestions => {
						return { suggestions };
					}, err => {
						return { suggestions: [] };
					});
				}
				return Promise.resolve({ suggestions: [] });
			}
		});

		this._register(this.replInput.onDidScrollChange(e => {
			if (!e.scrollHeightChanged) {
				return;
			}
			this.replInputHeight = Math.max(Repl.REPL_INPUT_INITIAL_HEIGHT, Math.min(Repl.REPL_INPUT_MAX_HEIGHT, e.scrollHeight, this.dimension.height));
			this.layout(this.dimension);
		}));
		this._register(this.replInput.onDidChangeModelContent(() => {
			this.historyNavigationEnablement.set(this.replInput.getModel().getValue() === '');
		}));
		// We add the input decoration only when the focus is in the input #61126
		this._register(this.replInput.onDidFocusEditorText(() => this.updateInputDecoration()));
		this._register(this.replInput.onDidBlurEditorText(() => this.updateInputDecoration()));

		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => dom.addClass(this.replInputContainer, 'synthetic-focus')));
		this._register(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => dom.removeClass(this.replInputContainer, 'synthetic-focus')));
	}

	private onContextMenu(e: ITreeContextMenuEvent<IReplElement>): void {
		const actions: IAction[] = [];
		actions.push(new CopyAction(CopyAction.ID, CopyAction.LABEL));
		actions.push(new Action('workbench.debug.action.copyAll', nls.localize('copyAll', "Copy All"), undefined, true, () => {
			clipboard.writeText(this.getVisibleContent());
			return Promise.resolve(undefined);
		}));
		actions.push(new ReplCollapseAllAction(this.tree, this.replInput));
		actions.push(new Separator());
		actions.push(this.clearReplAction);

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
			decorations.push({
				range: {
					startLineNumber: 0,
					endLineNumber: 0,
					startColumn: 0,
					endColumn: 1
				},
				renderOptions: {
					after: {
						contentText: nls.localize('startDebugFirst', "Please start a debug session to evaluate expressions"),
						color: transparent(editorForeground, 0.4)(this.themeService.getTheme()).toString()
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
		super.dispose();
	}
}

// Repl tree

interface IExpressionTemplateData {
	input: HTMLElement;
	output: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

interface ISimpleReplElementTemplateData {
	container: HTMLElement;
	value: HTMLElement;
	source: HTMLElement;
	getReplElementSource(): IReplElementSource;
	toDispose: IDisposable[];
}

interface IRawObjectReplTemplateData {
	container: HTMLElement;
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
	annotation: HTMLElement;
}

class ReplExpressionsRenderer implements ITreeRenderer<Expression, void, IExpressionTemplateData> {
	static readonly ID = 'expressionRepl';

	get templateId(): string {
		return ReplExpressionsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IExpressionTemplateData {
		const data: IExpressionTemplateData = Object.create(null);
		dom.addClass(container, 'input-output-pair');
		data.input = dom.append(container, $('.input.expression'));
		data.output = dom.append(container, $('.output.expression'));
		data.value = dom.append(data.output, $('span.value'));
		data.annotation = dom.append(data.output, $('span'));

		return data;
	}

	renderElement(element: ITreeNode<Expression, void>, index: number, templateData: IExpressionTemplateData): void {
		const expression = element.element;
		templateData.input.textContent = expression.name;
		renderExpressionValue(expression, templateData.value, {
			preserveWhitespace: !expression.hasChildren,
			showHover: false,
			colorize: true
		});
		if (expression.hasChildren) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = nls.localize('stateCapture', "Object state is captured from first evaluation");
		}
	}

	disposeTemplate(templateData: IExpressionTemplateData): void {
		// noop
	}
}

class ReplSimpleElementsRenderer implements ITreeRenderer<SimpleReplElement, void, ISimpleReplElementTemplateData> {
	static readonly ID = 'simpleReplElement';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	get templateId(): string {
		return ReplSimpleElementsRenderer.ID;
	}

	@memoize
	get linkDetector(): LinkDetector {
		return this.instantiationService.createInstance(LinkDetector);
	}

	renderTemplate(container: HTMLElement): ISimpleReplElementTemplateData {
		const data: ISimpleReplElementTemplateData = Object.create(null);
		dom.addClass(container, 'output');
		const expression = dom.append(container, $('.output.expression.value-and-source'));

		data.container = container;
		data.value = dom.append(expression, $('span.value'));
		data.source = dom.append(expression, $('.source'));
		data.toDispose = [];
		data.toDispose.push(dom.addDisposableListener(data.source, 'click', e => {
			e.preventDefault();
			e.stopPropagation();
			const source = data.getReplElementSource();
			if (source) {
				source.source.openInEditor(this.editorService, {
					startLineNumber: source.lineNumber,
					startColumn: source.column,
					endLineNumber: source.lineNumber,
					endColumn: source.column
				});
			}
		}));

		return data;
	}

	renderElement({ element }: ITreeNode<SimpleReplElement, void>, index: number, templateData: ISimpleReplElementTemplateData): void {
		// value
		dom.clearNode(templateData.value);
		// Reset classes to clear ansi decorations since templates are reused
		templateData.value.className = 'value';
		const result = handleANSIOutput(element.value, this.linkDetector);
		templateData.value.appendChild(result);

		dom.addClass(templateData.value, (element.severity === severity.Warning) ? 'warn' : (element.severity === severity.Error) ? 'error' : (element.severity === severity.Ignore) ? 'ignore' : 'info');
		templateData.source.textContent = element.sourceData ? `${element.sourceData.source.name}:${element.sourceData.lineNumber}` : '';
		templateData.source.title = element.sourceData ? this.labelService.getUriLabel(element.sourceData.source.uri) : '';
		templateData.getReplElementSource = () => element.sourceData;
	}

	disposeTemplate(templateData: ISimpleReplElementTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class ReplRawObjectsRenderer implements ITreeRenderer<RawObjectReplElement, void, IRawObjectReplTemplateData> {
	static readonly ID = 'rawObject';

	get templateId(): string {
		return ReplRawObjectsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IRawObjectReplTemplateData {
		const data: IRawObjectReplTemplateData = Object.create(null);
		dom.addClass(container, 'output');

		data.container = container;
		data.expression = dom.append(container, $('.output.expression'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));
		data.annotation = dom.append(data.expression, $('span'));

		return data;
	}

	renderElement({ element }: ITreeNode<RawObjectReplElement, void>, index: number, templateData: IRawObjectReplTemplateData): void {
		// key
		if (element.name) {
			templateData.name.textContent = `${element.name}:`;
		} else {
			templateData.name.textContent = '';
		}

		// value
		renderExpressionValue(element.value, templateData.value, {
			preserveWhitespace: true,
			showHover: false
		});

		// annotation if any
		if (element.annotation) {
			templateData.annotation.className = 'annotation octicon octicon-info';
			templateData.annotation.title = element.annotation;
		} else {
			templateData.annotation.className = '';
			templateData.annotation.title = '';
		}
	}

	disposeTemplate(templateData: IRawObjectReplTemplateData): void {
		// noop
	}
}

class ReplDelegate implements IListVirtualDelegate<IReplElement> {

	private static readonly LINE_HEIGHT_PX = 18;

	private width: number;
	private characterWidth: number;

	getHeight(element: IReplElement): number {
		if (element instanceof Variable && (element.hasChildren || (element.name !== null))) {
			return ReplDelegate.LINE_HEIGHT_PX;
		}
		if (element instanceof Expression && element.hasChildren) {
			return 2 * ReplDelegate.LINE_HEIGHT_PX;
		}

		let availableWidth = this.width;
		if (element instanceof SimpleReplElement && element.sourceData) {
			availableWidth -= Math.ceil(`${element.sourceData.source.name}:${element.sourceData.lineNumber}`.length * this.characterWidth + 12);
		}

		return this.getHeightForString((<any>element).value, availableWidth) + (element instanceof Expression ? this.getHeightForString(element.name, availableWidth) : 0);
	}

	getTemplateId(element: IReplElement): string {
		if (element instanceof Variable && element.name) {
			return VariablesRenderer.ID;
		}
		if (element instanceof Expression) {
			return ReplExpressionsRenderer.ID;
		}
		if (element instanceof SimpleReplElement || (element instanceof Variable && !element.name)) {
			// Variable with no name is a top level variable which should be rendered like a repl element #17404
			return ReplSimpleElementsRenderer.ID;
		}
		if (element instanceof RawObjectReplElement) {
			return ReplRawObjectsRenderer.ID;
		}

		return undefined;
	}

	hasDynamicHeight?(element: IReplElement): boolean {
		// todo@isidor
		return false;
	}

	private getHeightForString(s: string, availableWidth: number): number {
		if (!s || !s.length || !availableWidth || availableWidth <= 0 || !this.characterWidth || this.characterWidth <= 0) {
			return ReplDelegate.LINE_HEIGHT_PX;
		}

		// Last new line should be ignored since the repl elements are by design split by rows
		if (endsWith(s, '\n')) {
			s = s.substr(0, s.length - 1);
		}
		const lines = removeAnsiEscapeCodes(s).split('\n');
		const numLines = lines.reduce((lineCount: number, line: string) => {
			let lineLength = 0;
			for (let i = 0; i < line.length; i++) {
				lineLength += isFullWidthCharacter(line.charCodeAt(i)) ? 2 : 1;
			}

			return lineCount + Math.floor(lineLength * this.characterWidth / availableWidth);
		}, lines.length);

		return ReplDelegate.LINE_HEIGHT_PX * numLines;
	}

	setWidth(fullWidth: number, characterWidth: number): void {
		this.width = fullWidth;
		this.characterWidth = characterWidth;
	}
}

function isDebugSession(obj: any): obj is IDebugSession {
	return typeof obj.getReplElements === 'function';
}

class ReplDataSource implements IAsyncDataSource<IDebugSession, IReplElement> {

	hasChildren(element: IReplElement | IDebugSession): boolean {
		if (isDebugSession(element)) {
			return true;
		}

		return !!(<IExpressionContainer>element).hasChildren;
	}

	getChildren(element: IReplElement | IDebugSession): Promise<IReplElement[]> {
		if (isDebugSession(element)) {
			return Promise.resolve(element.getReplElements());
		}
		if (element instanceof RawObjectReplElement) {
			return element.getChildren();
		}

		return (<IExpression>element).getChildren();
	}
}

class ReplAccessibilityProvider implements IAccessibilityProvider<IReplElement> {
	getAriaLabel(element: IReplElement): string {
		if (element instanceof Variable) {
			return nls.localize('replVariableAriaLabel', "Variable {0} has value {1}, read eval print loop, debug", element.name, element.value);
		}
		if (element instanceof Expression) {
			return nls.localize('replExpressionAriaLabel', "Expression {0} has value {1}, read eval print loop, debug", element.name, element.value);
		}
		if (element instanceof SimpleReplElement) {
			return nls.localize('replValueOutputAriaLabel', "{0}, read eval print loop, debug", element.value);
		}
		if (element instanceof RawObjectReplElement) {
			return nls.localize('replRawObjectAriaLabel', "Repl variable {0} has value {1}, read eval print loop, debug", element.name, element.value);
		}

		return null;
	}
}


// Repl actions and commands

class AcceptReplInputAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.acceptInput',
			label: nls.localize({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "REPL Accept Input"),
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
		SuggestController.get(editor).acceptSelectedSuggestion();
		accessor.get(IPrivateReplService).acceptReplInput();
	}
}

class ReplCopyAllAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.copyAll',
			label: nls.localize('actions.repl.copyAll', "Debug: Console Copy All"),
			alias: 'Debug Console Copy All',
			precondition: CONTEXT_IN_DEBUG_REPL,
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		clipboard.writeText(accessor.get(IPrivateReplService).getVisibleContent());
	}
}

registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);

class SelectReplActionItem extends FocusSessionActionItem {
	protected getSessions(): ReadonlyArray<IDebugSession> {
		return this.debugService.getModel().getSessions(true).filter(s => !sessionsToIgnore.has(s));
	}
}

class SelectReplAction extends Action {

	static readonly ID = 'workbench.action.debug.selectRepl';
	static LABEL = nls.localize('selectRepl', "Select Debug Console");

	constructor(id: string, label: string,
		@IDebugService private readonly debugService: IDebugService,
		@IPrivateReplService private readonly replService: IPrivateReplService
	) {
		super(id, label);
	}

	run(sessionName: string): Promise<any> {
		const session = this.debugService.getModel().getSessions(true).filter(p => p.getLabel() === sessionName).pop();
		// If session is already the focused session we need to manualy update the tree since view model will not send a focused change event
		if (session && session.state !== State.Inactive && session !== this.debugService.getViewModel().focusedSession) {
			this.debugService.focusStackFrame(undefined, undefined, session, true);
		} else {
			this.replService.selectSession(session);
		}

		return Promise.resolve(undefined);
	}
}

export class ClearReplAction extends Action {
	static readonly ID = 'workbench.debug.panel.action.clearReplAction';
	static LABEL = nls.localize('clearRepl', "Clear Console");

	constructor(id: string, label: string,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'debug-action clear-repl');
	}

	run(): Promise<any> {
		const repl = <Repl>this.panelService.openPanel(REPL_ID);
		repl.clearRepl();
		aria.status(nls.localize('debugConsoleCleared', "Debug console was cleared"));

		return Promise.resolve(undefined);
	}
}
