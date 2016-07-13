/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./../browser/media/repl';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import dom = require('vs/base/browser/dom');
import platform = require('vs/base/common/platform');
import tree = require('vs/base/parts/tree/browser/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import { IEventService } from 'vs/platform/event/common/event';
import { EventType, CompositeEvent } from 'vs/workbench/common/events';
import viewer = require('vs/workbench/parts/debug/electron-browser/replViewer');
import debug = require('vs/workbench/parts/debug/common/debug');
import { Expression } from 'vs/workbench/parts/debug/common/debugModel';
import debugactions = require('vs/workbench/parts/debug/browser/debugActions');
import replhistory = require('vs/workbench/parts/debug/common/replHistory');
import { Panel } from 'vs/workbench/browser/panel';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

const $ = dom.emmet;

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
	private replInput: HTMLInputElement;
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
		@IEventService private eventService: IEventService
	) {
		super(debug.REPL_ID, telemetryService);

		this.toDispose = [];
		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getModel().onDidChangeReplElements(() => {
			this.onReplElementsUpdated();
		}));
		this.toDispose.push(this.eventService.addListener2(EventType.COMPOSITE_OPENED, (e: CompositeEvent) => {
			if (e.compositeId === debug.REPL_ID) {
				const elements = this.debugService.getModel().getReplElements();
				if (elements.length > 0) {
					return this.reveal(elements[elements.length - 1]);
				}
			}
		}));
	}

	private onReplElementsUpdated(): void {
		if (this.tree) {
			if (this.refreshTimeoutHandle) {
				return; // refresh already triggered
			}

			this.refreshTimeoutHandle = setTimeout(() => {
				this.refreshTimeoutHandle = null;

				const scrollPosition = this.tree.getScrollPosition();
				this.tree.refresh().then(() => {
					if (scrollPosition === 0 || scrollPosition === 1) {
						this.tree.setScrollPosition(1); // keep scrolling to the end unless user scrolled up
					}

					// If the last repl element has children - auto expand it #6019
					const elements = this.debugService.getModel().getReplElements();
					const lastElement = elements.length > 0 ? elements[elements.length - 1] : null;
					if (lastElement instanceof Expression && lastElement.reference > 0) {
						return this.tree.expand(elements[elements.length - 1]).then(() =>
							this.tree.reveal(elements[elements.length - 1], 0)
						);
					}
				}, errors.onUnexpectedError);
			}, Repl.REFRESH_DELAY);
		}
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		const container = dom.append(parent.getHTMLElement(), $('.repl'));
		this.treeContainer = dom.append(container, $('.repl-tree'));
		const replInputContainer = dom.append(container, $('.repl-input-wrapper'));
		this.replInput = <HTMLInputElement>dom.append(replInputContainer, $('input.repl-input'));
		this.replInput.type = 'text';

		this.toDispose.push(dom.addStandardDisposableListener(this.replInput, 'keydown', (e: IKeyboardEvent) => {
			if (e.equals(CommonKeybindings.ENTER)) {
				this.debugService.addReplExpression(this.replInput.value);
				Repl.HISTORY.evaluated(this.replInput.value);
				this.replInput.value = '';
				e.preventDefault();
			} else if (e.equals(CommonKeybindings.UP_ARROW) || e.equals(CommonKeybindings.DOWN_ARROW)) {
				const historyInput = e.equals(CommonKeybindings.UP_ARROW) ? Repl.HISTORY.previous() : Repl.HISTORY.next();
				if (historyInput) {
					Repl.HISTORY.remember(this.replInput.value, e.equals(CommonKeybindings.UP_ARROW));
					this.replInput.value = historyInput;
					// always leave cursor at the end.
					e.preventDefault();
				}
			}
		}));
		this.toDispose.push(dom.addStandardDisposableListener(this.replInput, dom.EventType.FOCUS, () => dom.addClass(replInputContainer, 'synthetic-focus')));
		this.toDispose.push(dom.addStandardDisposableListener(this.replInput, dom.EventType.BLUR, () => dom.removeClass(replInputContainer, 'synthetic-focus')));

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
	}

	public focus(): void {
		this.replInput.focus();
	}

	public reveal(element: debug.ITreeElement): TPromise<void> {
		return this.tree.reveal(element);
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

	public dispose(): void {
		// destroy container
		this.toDispose = lifecycle.dispose(this.toDispose);

		super.dispose();
	}
}
