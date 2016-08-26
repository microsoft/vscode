/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./../browser/media/repl';
import nls = require('vs/nls');
import uri from 'vs/base/common/uri';
import {wireCancellationToken} from 'vs/base/common/async';
import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import platform = require('vs/base/common/platform');
import {CancellationToken} from 'vs/base/common/cancellation';
import {KeyCode} from 'vs/base/common/keyCodes';
import tree = require('vs/base/parts/tree/browser/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import {IEditorOptions, IReadOnlyModel, EditorContextKeys, ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {Position} from 'vs/editor/common/core/position';
import * as modes from 'vs/editor/common/modes';
import {editorAction, ServicesAccessor, EditorAction} from 'vs/editor/common/editorCommonExtensions';
import {IModelService} from 'vs/editor/common/services/modelService';
import {CodeEditor} from 'vs/editor/browser/codeEditor';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import viewer = require('vs/workbench/parts/debug/electron-browser/replViewer');
import debug = require('vs/workbench/parts/debug/common/debug');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import replhistory = require('vs/workbench/parts/debug/common/replHistory');
import {Panel} from 'vs/workbench/browser/panel';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';

const $ = dom.$;

const replTreeOptions: tree.ITreeOptions = {
	indentPixels: 8,
	twistiePixels: 20,
	paddingOnRow: false,
	ariaLabel: nls.localize('replAriaLabel', "Read Eval Print Loop Panel")
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

	private static HISTORY: replhistory.ReplHistory;
	private static REFRESH_DELAY = 500; // delay in ms to refresh the repl for new elements to show

	private toDispose: lifecycle.IDisposable[];
	private tree: tree.ITree;
	private renderer: viewer.ReplExpressionsRenderer;
	private characterWidthSurveyor: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: CodeEditor;
	private replInputContainer: HTMLElement;
	private refreshTimeoutHandle: number;
	private actions: actions.IAction[];
	private dimension: builder.Dimension;

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IStorageService private storageService: IStorageService,
		@IPanelService private panelService: IPanelService,
		@IThemeService private themeService: IThemeService,
		@IModelService private modelService: IModelService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(debug.REPL_ID, telemetryService);

		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().onDidChangeReplElements(() => {
			this.onReplElementsUpdated();
		}));
		this.toDispose.push(this.panelService.onDidPanelOpen(panel => {
			if (panel.getId() === debug.REPL_ID) {
				const elements = this.debugService.getModel().getReplElements();
				if (elements.length > 0) {
					return this.tree.reveal(elements[elements.length - 1]);
				}
			}
		}));
		this.toDispose.push(this.themeService.onDidColorThemeChange(e => this.replInput.updateOptions(this.getReplInputOptions())));
	}

	private onReplElementsUpdated(): void {
		if (this.tree) {
			if (this.refreshTimeoutHandle) {
				return; // refresh already triggered
			}

			this.refreshTimeoutHandle = setTimeout(() => {
				this.refreshTimeoutHandle = null;
				this.tree.refresh().done(() => this.tree.setScrollPosition(1), errors.onUnexpectedError);
			}, Repl.REFRESH_DELAY);
		}
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		const container = dom.append(parent.getHTMLElement(), $('.repl'));
		this.treeContainer = dom.append(container, $('.repl-tree'));
		this.replInputContainer = dom.append(container, $('.repl-input-wrapper'));

		const scopedContextKeyService = this.contextKeyService.createScoped(this.replInputContainer);
		this.toDispose.push(scopedContextKeyService);
		debug.CONTEXT_IN_DEBUG_REPL.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService], [IPrivateReplService, this]));

		this.replInput = scopedInstantiationService.createInstance(CodeEditor, this.replInputContainer, this.getReplInputOptions());
		const model = this.modelService.createModel('', null, uri.parse(`${debug.DEBUG_SCHEME}:input`));
		this.replInput.setModel(model);

		modes.SuggestRegistry.register({ scheme: debug.DEBUG_SCHEME }, {
				triggerCharacters: ['.'],
				provideCompletionItems: (model: IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.ISuggestResult> => {
					const word = this.replInput.getModel().getWordAtPosition(position);
					const text = this.replInput.getModel().getLineContent(position.lineNumber);
					return wireCancellationToken(token, this.debugService.completions(text, position).then(suggestions => ({
						currentWord: word ? word.word : '',
						suggestions
					})));
				}
			},
			true
		);

		this.toDispose.push(this.replInput.onDidScrollChange(e => {
			if (!e.scrollHeightChanged) {
				return;
			}
			this.layout(this.dimension, Math.min(170, e.scrollHeight));
		}));

		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.FOCUS, () => dom.addClass(this.replInputContainer, 'synthetic-focus')));
		this.toDispose.push(dom.addStandardDisposableListener(this.replInputContainer, dom.EventType.BLUR, () => dom.removeClass(this.replInputContainer, 'synthetic-focus')));

		this.characterWidthSurveyor = dom.append(container, $('.surveyor'));
		this.characterWidthSurveyor.textContent = Repl.HALF_WIDTH_TYPICAL;
		for (let i = 0; i < 10; i++) {
			this.characterWidthSurveyor.textContent += this.characterWidthSurveyor.textContent;
		}
		this.characterWidthSurveyor.style.fontSize = platform.isMacintosh ? '12px' : '14px';

		this.renderer = this.instantiationService.createInstance(viewer.ReplExpressionsRenderer);
		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.ReplExpressionsDataSource(this.debugService),
			renderer: this.renderer,
			accessibilityProvider: new viewer.ReplExpressionsAccessibilityProvider(),
			controller: new viewer.ReplExpressionsController(this.debugService, this.contextMenuService, new viewer.ReplExpressionsActionProvider(this.instantiationService), this.replInput, false)
		}, replTreeOptions);

		if (!Repl.HISTORY) {
			Repl.HISTORY = new replhistory.ReplHistory(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')));
		}

		return this.tree.setInput(this.debugService.getModel());
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
		this.layout(this.dimension);
	}

	public layout(dimension: builder.Dimension, replInputHeight = 22): void {
		this.dimension = dimension;
		if (this.tree) {
			this.renderer.setWidth(dimension.width - 25, this.characterWidthSurveyor.clientWidth / this.characterWidthSurveyor.textContent.length);
			const treeHeight = dimension.height - replInputHeight;
			this.treeContainer.style.height = `${treeHeight}px`;
			this.tree.layout(treeHeight);
		}
		this.replInputContainer.style.height = `${replInputHeight}px`;

		this.replInput.layout({ width: dimension.width - 20, height: replInputHeight });
	}

	public focus(): void {
		this.replInput.focus();
	}

	public getActions(): actions.IAction[] {
		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(debugactions.ClearReplAction, debugactions.ClearReplAction.ID, debugactions.ClearReplAction.LABEL)
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
			wrappingColumn: 0,
			overviewRulerLanes: 0,
			glyphMargin: false,
			lineNumbers: false,
			folding: false,
			selectOnLineNumbers: false,
			selectionHighlight: false,
			scrollbar: {
				horizontal: 'hidden',
				vertical: 'hidden'
			},
			lineDecorationsWidth: 0,
			scrollBeyondLastLine: false,
			lineHeight: 21,
			theme: this.themeService.getColorTheme()
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
				kbExpr: EditorContextKeys.TextFocus,
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
				kbExpr: EditorContextKeys.TextFocus,
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
			label: nls.localize('actions.repl.acceptInput', "REPL Accept Input"),
			alias: 'REPL Accept Input',
			precondition: debug.CONTEXT_IN_DEBUG_REPL,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyCode.Enter,
				weight: 50
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void | TPromise<void> {
		accessor.get(IPrivateReplService).acceptReplInput();
	}
}
