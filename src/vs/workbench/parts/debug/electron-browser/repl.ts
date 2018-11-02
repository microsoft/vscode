/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/parts/debug/browser/media/repl';
import * as nls from 'vs/nls';
import { URI as uri } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { IAction, IActionItem, Action } from 'vs/base/common/actions';
import * as dom from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { isMacintosh } from 'vs/base/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITree, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/suggest';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { registerEditorAction, ServicesAccessor, EditorAction, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService, ContextKeyExpr, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ReplExpressionsRenderer, ReplExpressionsController, ReplExpressionsDataSource, ReplExpressionsActionProvider, ReplExpressionsAccessibilityProvider } from 'vs/workbench/parts/debug/electron-browser/replViewer';
import { Panel } from 'vs/workbench/browser/panel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { clipboard } from 'electron';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { memoize } from 'vs/base/common/decorators';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { OpenMode, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IDebugService, REPL_ID, DEBUG_SCHEME, CONTEXT_IN_DEBUG_REPL, IDebugSession, State } from 'vs/workbench/parts/debug/common/debug';
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

const $ = dom.$;

const replTreeOptions: ITreeOptions = {
	twistiePixels: 20,
	ariaLabel: nls.localize('replAriaLabel', "Read Eval Print Loop Panel")
};

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const IPrivateReplService = createDecorator<IPrivateReplService>('privateReplService');
const DECORATION_KEY = 'replinputdecoration';

export interface IPrivateReplService {
	_serviceBrand: any;
	acceptReplInput(): void;
	getVisibleContent(): string;
	selectSession(session: IDebugSession): void;
	clearRepl(): void;
}

export class Repl extends Panel implements IPrivateReplService, IHistoryNavigationWidget {
	_serviceBrand: any;

	private static readonly HALF_WIDTH_TYPICAL = 'n';
	private static readonly REFRESH_DELAY = 500; // delay in ms to refresh the repl for new elements to show
	private static readonly REPL_INPUT_INITIAL_HEIGHT = 19;
	private static readonly REPL_INPUT_MAX_HEIGHT = 170;

	private history: HistoryNavigator<string>;
	private tree: ITree;
	private renderer: ReplExpressionsRenderer;
	private container: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: CodeEditorWidget;
	private replInputContainer: HTMLElement;
	private refreshTimeoutHandle: any;
	private dimension: dom.Dimension;
	private replInputHeight: number;
	private model: ITextModel;
	private historyNavigationEnablement: IContextKey<boolean>;
	private scopedInstantiationService: IInstantiationService;
	private replElementsChangeListener: IDisposable;

	constructor(
		@IDebugService private debugService: IDebugService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IThemeService protected themeService: IThemeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService
	) {
		super(REPL_ID, telemetryService, themeService, storageService);

		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.history = new HistoryNavigator(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')), 50);
		this.registerListeners();
		codeEditorService.registerDecorationType(DECORATION_KEY, {});
	}

	private registerListeners(): void {
		this._register(this.debugService.getViewModel().onDidFocusSession(session => {
			this.selectSession(session);
		}));
		this._register(this.debugService.onDidNewSession(() => this.updateTitleArea()));
		this._register(this.themeService.onThemeChange(() => {
			if (this.isVisible()) {
				this.updateInputDecoration();
			}
		}));
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (!visible) {
			dispose(this.model);
		} else {
			this.model = this.modelService.createModel('', null, uri.parse(`${DEBUG_SCHEME}:replinput`), true);
			this.replInput.setModel(this.model);
			this.updateInputDecoration();
			this.refreshReplElements(true);
		}
	}

	get isReadonly(): boolean {
		// Do not allow to edit inactive sessions
		const session: IDebugSession = this.tree.getInput();
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

	selectSession(session: IDebugSession): void {
		if (session) {
			if (this.replElementsChangeListener) {
				this.replElementsChangeListener.dispose();
			}
			this.replElementsChangeListener = session.onDidChangeReplElements(() => {
				this.refreshReplElements(session.getReplElements().length === 0);
			});

			if (this.tree && this.tree.getInput() !== session) {
				this.tree.setInput(session);
			}
		}

		this.replInput.updateOptions({ readOnly: this.isReadonly });
		this.updateInputDecoration();
	}

	clearRepl(): void {
		const session: IDebugSession = this.tree.getInput();
		session.removeReplExpressions();
		this.replInput.focus();
	}

	acceptReplInput(): void {
		const session: IDebugSession = this.tree.getInput();
		if (session) {
			session.addReplExpression(this.debugService.getViewModel().focusedStackFrame, this.replInput.getValue());
			this.history.add(this.replInput.getValue());
			this.replInput.setValue('');
			// Trigger a layout to shrink a potential multi line input
			this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
			this.layout(this.dimension);
		}
	}

	getVisibleContent(): string {
		let text = '';
		const navigator = this.tree.getNavigator();
		// skip first navigator element - the root node
		while (navigator.next()) {
			if (text) {
				text += `\n`;
			}
			text += navigator.current().toString();
		}

		return text;
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		if (this.tree) {
			this.renderer.setWidth(dimension.width - 25, this.characterWidth);
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
		if (this.debugService.getModel().getSessions(true).length > 1) {
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

	// --- Creation

	create(parent: HTMLElement): void {
		super.create(parent);
		this.container = dom.append(parent, $('.repl'));
		this.treeContainer = dom.append(this.container, $('.repl-tree'));
		this.createReplInput(this.container);

		this.renderer = this.instantiationService.createInstance(ReplExpressionsRenderer);
		const controller = this.instantiationService.createInstance(ReplExpressionsController, new ReplExpressionsActionProvider(this.clearReplAction, this.replInput), MenuId.DebugConsoleContext, { openMode: OpenMode.SINGLE_CLICK, clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change, to preserve focus behaviour in input field */ });
		controller.toFocusOnClick = this.replInput;

		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new ReplExpressionsDataSource(),
			renderer: this.renderer,
			accessibilityProvider: new ReplExpressionsAccessibilityProvider(),
			controller
		}, replTreeOptions);
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
			provideCompletionItems: (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken): Thenable<CompletionList> => {
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

	// --- Update

	private refreshReplElements(noDelay: boolean): void {
		if (this.tree && this.isVisible()) {
			if (this.refreshTimeoutHandle) {
				return; // refresh already triggered
			}

			const delay = noDelay ? 0 : Repl.REFRESH_DELAY;
			this.refreshTimeoutHandle = setTimeout(() => {
				this.refreshTimeoutHandle = null;
				const previousScrollPosition = this.tree.getScrollPosition();
				this.tree.refresh().then(() => {
					if (previousScrollPosition === 1) {
						// Only scroll if we were scrolled all the way down before tree refreshed #10486
						this.tree.setScrollPosition(1);
					}
				}, errors.onUnexpectedError);
			}, delay);
		}
	}

	private updateInputDecoration(): void {
		if (!this.replInput) {
			return;
		}

		const decorations: IDecorationOptions[] = [];
		if (this.isReadonly && this.replInput.hasTextFocus()) {
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

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | TPromise<void> {
		SuggestController.get(editor).acceptSelectedSuggestion();
		accessor.get(IPrivateReplService).acceptReplInput();
	}
}

export class ReplCopyAllAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.copyAll',
			label: nls.localize('actions.repl.copyAll', "Debug: Console Copy All"),
			alias: 'Debug Console Copy All',
			precondition: CONTEXT_IN_DEBUG_REPL,
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void | TPromise<void> {
		clipboard.writeText(accessor.get(IPrivateReplService).getVisibleContent());
	}
}

registerEditorAction(AcceptReplInputAction);
registerEditorAction(ReplCopyAllAction);

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);
registerEditorCommand(new SuggestCommand({
	id: 'repl.action.acceptSuggestion',
	precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_REPL, SuggestContext.Visible),
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: 50,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.RightArrow
	}
}));

class SelectReplActionItem extends FocusSessionActionItem {
	protected getSessions(): ReadonlyArray<IDebugSession> {
		return this.debugService.getModel().getSessions(true);
	}
}

class SelectReplAction extends Action {

	static readonly ID = 'workbench.action.debug.selectRepl';
	static LABEL = nls.localize('selectRepl', "Select Debug Console");

	constructor(id: string, label: string,
		@IDebugService private debugService: IDebugService,
		@IPrivateReplService private replService: IPrivateReplService
	) {
		super(id, label);
	}

	run(sessionName: string): TPromise<any> {
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

class ClearReplAction extends Action {
	static readonly ID = 'workbench.debug.panel.action.clearReplAction';
	static LABEL = nls.localize('clearRepl', "Clear Console");

	constructor(id: string, label: string,
		@IDebugService debugService: IDebugService,
		@IPrivateReplService private replService: IPrivateReplService
	) {
		super(id, label, 'debug-action clear-repl');
	}

	public run(): TPromise<any> {
		this.replService.clearRepl();
		aria.status(nls.localize('debugConsoleCleared', "Debug console was cleared"));

		// focus back to repl
		return Promise.resolve(undefined);
	}
}
