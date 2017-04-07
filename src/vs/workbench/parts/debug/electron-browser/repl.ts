/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/workbench/parts/debug/browser/media/repl';
import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { wireCancellationToken } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import * as lifecycle from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { Dimension, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { isMacintosh } from 'vs/base/common/platform';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ITree, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { IEditorOptions, IReadOnlyModel, EditorContextKeys, ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import * as modes from 'vs/editor/common/modes';
import { editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ReplExpressionsRenderer, ReplExpressionsController, ReplExpressionsDataSource, ReplExpressionsActionProvider, ReplExpressionsAccessibilityProvider } from 'vs/workbench/parts/debug/electron-browser/replViewer';
import { ReplInputEditor } from 'vs/workbench/parts/debug/electron-browser/replEditor';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { ClearReplAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { ReplHistory } from 'vs/workbench/parts/debug/common/replHistory';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IListService } from 'vs/platform/list/browser/listService';

const $ = dom.$;

const replTreeOptions: ITreeOptions = {
	twistiePixels: 20,
	ariaLabel: nls.localize('replAriaLabel', "Read Eval Print Loop Panel"),
	keyboardSupport: false
};

const HISTORY_STORAGE_KEY = 'debug.repl.history';
const IPrivateReplService = createDecorator<IPrivateReplService>('privateReplService');

export interface IPrivateReplService {
	_serviceBrand: any;
	navigateHistory(previous: boolean): void;
	acceptReplInput(): void;
}

export class Repl extends Panel implements IPrivateReplService {
	public _serviceBrand: any;

	private static HALF_WIDTH_TYPICAL = 'n';

	private static HISTORY: ReplHistory;
	private static REFRESH_DELAY = 500; // delay in ms to refresh the repl for new elements to show
	private static REPL_INPUT_INITIAL_HEIGHT = 19;
	private static REPL_INPUT_MAX_HEIGHT = 170;

	private toDispose: lifecycle.IDisposable[];
	private tree: ITree;
	private renderer: ReplExpressionsRenderer;
	private characterWidthSurveyor: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: ReplInputEditor;
	private replInputContainer: HTMLElement;
	private refreshTimeoutHandle: number;
	private actions: IAction[];
	private dimension: Dimension;
	private replInputHeight: number;

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IStorageService private storageService: IStorageService,
		@IPanelService private panelService: IPanelService,
		@IWorkbenchThemeService protected themeService: IWorkbenchThemeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IListService private listService: IListService
	) {
		super(debug.REPL_ID, telemetryService, themeService);

		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().onDidChangeReplElements(() => {
			this.refreshReplElements(this.debugService.getModel().getReplElements().length === 0);
		}));
		this.toDispose.push(this.themeService.onDidColorThemeChange(e => this.replInput.updateOptions(this.getReplInputOptions()))); // TODO@theme this should be done from the editor itself and not from the outside
		this.toDispose.push(this.panelService.onDidPanelOpen(panel => this.refreshReplElements(true)));
	}

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
					if (previousScrollPosition === 1 || previousScrollPosition === 0) {
						// Only scroll if we were scrolled all the way down before tree refreshed #10486
						this.tree.setScrollPosition(1);
					}
				}, errors.onUnexpectedError);
			}, delay);
		}
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);
		const container = dom.append(parent.getHTMLElement(), $('.repl'));
		this.treeContainer = dom.append(container, $('.repl-tree'));
		this.createReplInput(container);

		this.characterWidthSurveyor = dom.append(container, $('.surveyor'));
		this.characterWidthSurveyor.textContent = Repl.HALF_WIDTH_TYPICAL;
		for (let i = 0; i < 10; i++) {
			this.characterWidthSurveyor.textContent += this.characterWidthSurveyor.textContent;
		}
		this.characterWidthSurveyor.style.fontSize = isMacintosh ? '12px' : '14px';

		this.renderer = this.instantiationService.createInstance(ReplExpressionsRenderer);
		const controller = this.instantiationService.createInstance(ReplExpressionsController, new ReplExpressionsActionProvider(this.instantiationService), MenuId.DebugConsoleContext);
		controller.toFocusOnClick = this.replInput;

		this.tree = new Tree(this.treeContainer, {
			dataSource: new ReplExpressionsDataSource(),
			renderer: this.renderer,
			accessibilityProvider: new ReplExpressionsAccessibilityProvider(),
			controller
		}, replTreeOptions);

		this.toDispose.push(this.listService.register(this.tree));

		if (!Repl.HISTORY) {
			Repl.HISTORY = new ReplHistory(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')));
		}

		return this.tree.setInput(this.debugService.getModel());
	}

	private createReplInput(container: HTMLElement): void {
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));

		const scopedContextKeyService = this.contextKeyService.createScoped(this.replInputContainer);
		this.toDispose.push(scopedContextKeyService);
		debug.CONTEXT_IN_DEBUG_REPL.bindTo(scopedContextKeyService).set(true);
		const onFirstReplLine = debug.CONTEXT_ON_FIRST_DEBUG_REPL_LINE.bindTo(scopedContextKeyService);
		onFirstReplLine.set(true);
		const onLastReplLine = debug.CONTEXT_ON_LAST_DEBUG_REPL_LINE.bindTo(scopedContextKeyService);
		onLastReplLine.set(true);

		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService], [IPrivateReplService, this]));
		this.replInput = scopedInstantiationService.createInstance(ReplInputEditor, this.replInputContainer, this.getReplInputOptions());
		const model = this.modelService.createModel('', null, uri.parse(`${debug.DEBUG_SCHEME}:input`));
		this.replInput.setModel(model);

		modes.SuggestRegistry.register({ scheme: debug.DEBUG_SCHEME }, {
			triggerCharacters: ['.'],
			provideCompletionItems: (model: IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.ISuggestResult> => {
				const word = this.replInput.getModel().getWordAtPosition(position);
				const overwriteBefore = word ? word.word.length : 0;
				const text = this.replInput.getModel().getLineContent(position.lineNumber);
				const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
				const frameId = focusedStackFrame ? focusedStackFrame.frameId : undefined;
				const focusedProcess = this.debugService.getViewModel().focusedProcess;
				const completions = focusedProcess ? focusedProcess.completions(frameId, text, position, overwriteBefore) : TPromise.as([]);
				return wireCancellationToken(token, completions.then(suggestions => ({
					suggestions
				})));
			}
		});

		this.toDispose.push(this.replInput.onDidScrollChange(e => {
			if (!e.scrollHeightChanged) {
				return;
			}
			this.replInputHeight = Math.max(Repl.REPL_INPUT_INITIAL_HEIGHT, Math.min(Repl.REPL_INPUT_MAX_HEIGHT, e.scrollHeight, this.dimension.height));
			this.layout(this.dimension);
		}));
		this.toDispose.push(this.replInput.onDidChangeCursorPosition(e => {
			onFirstReplLine.set(e.position.lineNumber === 1);
			onLastReplLine.set(e.position.lineNumber === this.replInput.getModel().getLineCount());
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => dom.addClass(this.replInputContainer, 'synthetic-focus')));
		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => dom.removeClass(this.replInputContainer, 'synthetic-focus')));
	}

	public navigateHistory(previous: boolean): void {
		const historyInput = previous ? Repl.HISTORY.previous() : Repl.HISTORY.next();
		if (historyInput) {
			Repl.HISTORY.remember(this.replInput.getValue(), previous);
			this.replInput.setValue(historyInput);
			// always leave cursor at the end.
			this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
		}
	}

	public acceptReplInput(): void {
		this.debugService.addReplExpression(this.replInput.getValue());
		Repl.HISTORY.evaluated(this.replInput.getValue());
		this.replInput.setValue('');
		// Trigger a layout to shrink a potential multi line input
		this.replInputHeight = Repl.REPL_INPUT_INITIAL_HEIGHT;
		this.layout(this.dimension);
	}

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.tree) {
			this.renderer.setWidth(dimension.width - 25, this.characterWidthSurveyor.clientWidth / this.characterWidthSurveyor.textContent.length);
			const treeHeight = dimension.height - this.replInputHeight;
			this.treeContainer.style.height = `${treeHeight}px`;
			this.tree.layout(treeHeight);
		}
		this.replInputContainer.style.height = `${this.replInputHeight}px`;

		this.replInput.layout({ width: dimension.width - 20, height: this.replInputHeight });
	}

	public focus(): void {
		this.replInput.focus();
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(ClearReplAction, ClearReplAction.ID, ClearReplAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public shutdown(): void {
		this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(Repl.HISTORY.save()), StorageScope.WORKSPACE);
	}

	private getReplInputOptions(): IEditorOptions {
		return {
			wordWrap: 'on',
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: 'off',
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			scrollbar: {
				horizontal: 'hidden'
			},
			lineDecorationsWidth: 0,
			scrollBeyondLastLine: false,
			theme: this.themeService.getColorTheme().id,
			renderLineHighlight: 'none',
			fixedOverflowWidgets: true
		};
	}

	public dispose(): void {
		this.replInput.destroy();
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}

@editorAction
class ReplHistoryPreviousAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.historyPrevious',
			label: nls.localize('actions.repl.historyPrevious', "History Previous"),
			alias: 'History Previous',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, debug.CONTEXT_ON_FIRST_DEBUG_REPL_LINE),
				primary: KeyCode.UpArrow,
				weight: 50
			},
			menuOpts: {
				group: 'debug'
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).navigateHistory(true);
	}
}

@editorAction
class ReplHistoryNextAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.historyNext',
			label: nls.localize('actions.repl.historyNext', "History Next"),
			alias: 'History Next',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, debug.CONTEXT_ON_LAST_DEBUG_REPL_LINE),
				primary: KeyCode.DownArrow,
				weight: 50
			},
			menuOpts: {
				group: 'debug'
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).navigateHistory(false);
	}
}

@editorAction
class AcceptReplInputAction extends EditorAction {

	constructor() {
		super({
			id: 'repl.action.acceptInput',
			label: nls.localize({ key: 'actions.repl.acceptInput', comment: ['Apply input from the debug console input box'] }, "REPL Accept Input"),
			alias: 'REPL Accept Input',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyCode.Enter
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		SuggestController.get(editor).acceptSelectedSuggestion();
		accessor.get(IPrivateReplService).acceptReplInput();
	}
}

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);
CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'repl.action.acceptSuggestion',
	precondition: ContextKeyExpr.and(debug.CONTEXT_IN_DEBUG_REPL, SuggestContext.Visible),
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: 50,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.RightArrow
	}
}));
