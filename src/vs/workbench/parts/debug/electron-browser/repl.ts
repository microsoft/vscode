/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./../browser/media/repl';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import platform = require('vs/base/common/platform');
import tree = require('vs/base/parts/tree/browser/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {Model} from 'vs/editor/common/model/model';
import {CodeEditor} from 'vs/editor/browser/codeEditor';
import viewer = require('vs/workbench/parts/debug/electron-browser/replViewer');
import debug = require('vs/workbench/parts/debug/common/debug');
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import replhistory = require('vs/workbench/parts/debug/common/replHistory');
import {Panel} from 'vs/workbench/browser/panel';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {CommonKeybindings} from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

const $ = dom.$;

const replTreeOptions: tree.ITreeOptions = {
	indentPixels: 8,
	twistiePixels: 20,
	paddingOnRow: false,
	ariaLabel: nls.localize('replAriaLabel', "Read Eval Print Loop Panel")
};

const HISTORY_STORAGE_KEY = 'debug.repl.history';

export class Repl extends Panel {

	private static HALF_WIDTH_TYPICAL = 'n';

	private static HISTORY: replhistory.ReplHistory;
	private static REFRESH_DELAY = 500; // delay in ms to refresh the repl for new elements to show

	private toDispose: lifecycle.IDisposable[];
	private tree: tree.ITree;
	private renderer: viewer.ReplExpressionsRenderer;
	private characterWidthSurveyor: HTMLElement;
	private treeContainer: HTMLElement;
	private replInput: CodeEditor;
	private refreshTimeoutHandle: number;
	private actions: actions.IAction[];

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService,
		@IStorageService private storageService: IStorageService,
		@IPanelService private panelService: IPanelService,
		@IThemeService private themeService: IThemeService
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
		const replInputContainer = dom.append(container, $('.repl-input-wrapper'));
		this.replInput = this.instantiationService.createInstance(CodeEditor, replInputContainer, this.getReplInputOptions());
		this.replInput.setModel(Model.createFromString(''));

		this.toDispose.push(dom.addStandardDisposableListener(this.replInput.getDomNode(), 'keydown', (e: IKeyboardEvent) => {
			// Prevent enter and up / down from moving to new lines, so we always have a one-line editor
			if (e.equals(CommonKeybindings.ENTER)) {
				e.preventDefault();
				e.stopPropagation();
				this.debugService.addReplExpression(this.replInput.getValue());
				Repl.HISTORY.evaluated(this.replInput.getValue());
				this.replInput.setValue('');
			} else if (e.equals(CommonKeybindings.UP_ARROW) || e.equals(CommonKeybindings.DOWN_ARROW)) {
				e.preventDefault();
				e.stopPropagation();
				const historyInput = e.equals(CommonKeybindings.UP_ARROW) ? Repl.HISTORY.previous() : Repl.HISTORY.next();
				if (historyInput) {
					Repl.HISTORY.remember(this.replInput.getValue(), e.equals(CommonKeybindings.UP_ARROW));
					this.replInput.setValue(historyInput);
					// always leave cursor at the end.
					this.replInput.setPosition({ lineNumber: 1, column: historyInput.length + 1 });
				}
			} else if (e.equals(CommonKeybindings.TAB)) {
				// Tab needs to move focus, stop propagating to the editor so it does not get eaten up #10326
				e.stopPropagation();
			}
		}));
		this.toDispose.push(dom.addStandardDisposableListener(replInputContainer, dom.EventType.FOCUS, () => dom.addClass(replInputContainer, 'synthetic-focus')));
		this.toDispose.push(dom.addStandardDisposableListener(replInputContainer, dom.EventType.BLUR, () => dom.removeClass(replInputContainer, 'synthetic-focus')));


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

	public layout(dimension: builder.Dimension): void {
		if (this.tree) {
			this.renderer.setWidth(dimension.width - 25, this.characterWidthSurveyor.clientWidth / this.characterWidthSurveyor.textContent.length);
			this.tree.layout(dimension.height - 22);
			// refresh the tree because layout might require some elements be word wrapped differently
			this.tree.refresh().done(undefined, errors.onUnexpectedError);
		}

		this.replInput.layout({ width: dimension.width - 20, height: 21 });
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
