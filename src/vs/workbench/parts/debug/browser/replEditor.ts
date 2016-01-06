/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/repl';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import platform = require('vs/base/common/platform');
import tree = require('vs/base/parts/tree/common/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import wbeditorcommon = require('vs/workbench/common/editor');
import baseeditor = require('vs/workbench/browser/parts/editor/baseEditor');
import editorinputs = require('vs/workbench/parts/debug/browser/debugEditorInputs');
import viewer = require('vs/workbench/parts/debug/browser/replViewer');
import debug = require('vs/workbench/parts/debug/common/debug');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import replhistory = require('vs/workbench/parts/debug/common/replHistory');
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, INullService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { CommonKeybindings } from 'vs/base/common/keyCodes';

const $ = dom.emmet;

const replTreeOptions = {
	indentPixels: 8,
	twistiePixels: 20,
	paddingOnRow: false
};

const HISTORY_STORAGE_KEY = 'debug.repl.history';

export class Repl extends baseeditor.BaseEditor {

	public static ID = 'workbench.editors.replEditor';
	private static HALF_WIDTH_TYPICAL = 'n';

	private static HISTORY: replhistory.ReplHistory;
	private static REFRESH_DELAY = 500; // delay in ms to refresh the repl for new elements to show

	private toDispose: lifecycle.IDisposable[];
	private tree: tree.ITree;
	private renderer: viewer.ReplExpressionsRenderer;
	private characterWidthSurveyor: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: HTMLInputElement;
	private refreshTimeoutHandle: number;

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super(Repl.ID, telemetryService);

		this.toDispose = [];

		this.registerListeners(lifecycleService);
	}

	private registerListeners(lifecycleService: ILifecycleService): void {
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.REPL_ELEMENTS_UPDATED, (re: debug.ITreeElement|debug.ITreeElement[]) => {
			this.onReplElementsUpdated(re);
		}));
		lifecycleService.onShutdown(this.onShutdown, this);
	}

	private onReplElementsUpdated(re: debug.ITreeElement | debug.ITreeElement[]): void {
		if (this.tree) {
			if (this.refreshTimeoutHandle) {
				return; // refresh already triggered
			}

			this.refreshTimeoutHandle = setTimeout(() => {
				delete this.refreshTimeoutHandle;

				const scrollPosition = this.tree.getScrollPosition();
				this.tree.refresh().then(() => {
					if (scrollPosition === 0 || scrollPosition === 1) {
						return this.tree.setScrollPosition(1); // keep scrolling to the end unless user scrolled up
					}
				}, errors.onUnexpectedError);
			}, Repl.REFRESH_DELAY);
		}
	}

	public createEditor(parent: builder.Builder): void {
		const container = dom.append(parent.getHTMLElement(), $('.repl'));
		// inherit the background color from selected theme.
		dom.addClass(container, 'monaco-editor-background');
		this.treeContainer = dom.append(container, $('.repl-tree'));
		const replInputContainer = dom.append(container, $(platform.isWindows ? '.repl-input-wrapper.windows' : platform.isMacintosh ? '.repl-input-wrapper.mac' : '.repl-input-wrapper.linux'));
		this.replInput = <HTMLInputElement>dom.append(replInputContainer, $('input.repl-input'));

		dom.addStandardDisposableListener(this.replInput, 'keydown', (e: dom.IKeyboardEvent) => {
			let trimmedValue = this.replInput.value.trim();

			if (e.equals(CommonKeybindings.ENTER) && trimmedValue) {
				this.debugService.addReplExpression(trimmedValue);
				Repl.HISTORY.evaluated(trimmedValue);
				this.replInput.value = '';
			} else if (e.equals(CommonKeybindings.UP_ARROW) || e.equals(CommonKeybindings.DOWN_ARROW)) {
				const historyInput = e.equals(CommonKeybindings.UP_ARROW) ? Repl.HISTORY.previous() : Repl.HISTORY.next();
				if (historyInput) {
					Repl.HISTORY.remember(this.replInput.value, e.equals(CommonKeybindings.UP_ARROW));
					this.replInput.value = historyInput;
					// always leave cursor at the end.
					e.preventDefault();
				}
			}
		});

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
			controller: new viewer.ReplExpressionsController(this.debugService, this.contextMenuService, new viewer.ReplExpressionsActionProvider(this.instantiationService), this.replInput, false)
		}, replTreeOptions);

		if (!Repl.HISTORY) {
			Repl.HISTORY = new replhistory.ReplHistory(JSON.parse(this.storageService.get(HISTORY_STORAGE_KEY, StorageScope.WORKSPACE, '[]')));
		}
	}

	public setInput(input: wbeditorcommon.EditorInput, options: wbeditorcommon.EditorOptions) : TPromise<void> {
		return super.setInput(input, options).then(() => {
			if (!this.tree) {
				return;
			}

			if (!this.tree.getInput()) {
				this.tree.setInput(this.debugService.getModel())
			}
		});
	}

	public layout(dimension: builder.Dimension): void {
		if (this.tree) {
			this.renderer.setWidth(dimension.width - 20, this.characterWidthSurveyor.clientWidth / this.characterWidthSurveyor.textContent.length);
			this.tree.layout(this.treeContainer.clientHeight);
			this.tree.refresh().done(null, errors.onUnexpectedError);
		}
	}

	public focus(): void {
		this.replInput.focus();
	}

	public reveal(element: debug.ITreeElement): Promise {
		return this.tree.reveal(element);
	}

	private onShutdown(): void {
		this.storageService.store(HISTORY_STORAGE_KEY, JSON.stringify(Repl.HISTORY.save()), StorageScope.WORKSPACE);
	}

	public dispose(): void {
		// destroy container
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}
}

export class ReplEditorActionContributor extends baseeditor.EditorInputActionContributor {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActionsForEditorInput(context: baseeditor.IEditorInputActionContext): boolean {
		return context.input instanceof editorinputs.ReplEditorInput;
	}

	public getActionsForEditorInput(context: baseeditor.IEditorInputActionContext): baseeditor.IEditorInputAction[] {
		return [this.instantiationService.createInstance(debugactions.ClearReplAction)];
	}
}

export class ReplInputFactory implements baseeditor.IEditorInputFactory {

	constructor(@INullService ns) {
		// noop
	}

	public serialize(editorInput: wbeditorcommon.EditorInput): string {
		return editorInput.getId();
	}

	public deserialize(instantiationService: IInstantiationService, resourceRaw: string): wbeditorcommon.EditorInput {
		return editorinputs.ReplEditorInput.getInstance();
	}
}
