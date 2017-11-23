/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { prepareActions } from 'vs/workbench/browser/actions';
import { IHighlightEvent } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IExpression, CONTEXT_WATCH_EXPRESSIONS_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { Expression } from 'vs/workbench/parts/debug/common/debugModel';
import * as viewer from 'vs/workbench/parts/debug/electron-browser/debugViewer';
import { AddWatchExpressionAction, RemoveAllWatchExpressionsAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IListService } from 'vs/platform/list/browser/listService';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { once } from 'vs/base/common/event';

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

const twistiePixels = 20;

export class WatchExpressionsView extends ViewsViewletPanel {

	private static readonly MEMENTO = 'watchexpressionsview.memento';
	private onWatchExpressionsUpdatedScheduler: RunOnceScheduler;
	private toReveal: IExpression;
	private watchExpressionsFocusedContext: IContextKey<boolean>;
	private settings: any;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService private listService: IListService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('expressionsSection', "Expressions Section") }, keybindingService, contextMenuService);
		this.settings = options.viewletSettings;

		this.disposables.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			// only expand when a new watch expression is added.
			if (we instanceof Expression) {
				this.setExpanded(true);
			}
		}));
		this.watchExpressionsFocusedContext = CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(contextKeyService);

		this.onWatchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.tree.refresh().done(() => {
				return this.toReveal instanceof Expression ? this.tree.reveal(this.toReveal) : TPromise.as(true);
			}, errors.onUnexpectedError);
		}, 50);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-watch');
		this.treeContainer = renderViewTree(container);

		const actionProvider = new viewer.WatchExpressionsActionProvider(this.debugService, this.keybindingService);
		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.WatchExpressionsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.WatchExpressionsRenderer),
			accessibilityProvider: new viewer.WatchExpressionsAccessibilityProvider(),
			controller: this.instantiationService.createInstance(viewer.WatchExpressionsController, actionProvider, MenuId.DebugWatchContext),
			dnd: this.instantiationService.createInstance(viewer.WatchExpressionsDragAndDrop)
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions"),
				twistiePixels,
				keyboardSupport: false
			});

		this.disposables.push(attachListStyler(this.tree, this.themeService));
		this.disposables.push(this.listService.register(this.tree, [this.watchExpressionsFocusedContext]));

		this.tree.setInput(this.debugService.getModel());

		const addWatchExpressionAction = new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService);
		const collapseAction = new CollapseAction(this.tree, true, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService);
		this.toolbar.setActions(prepareActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction]))();

		this.disposables.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			if (!this.onWatchExpressionsUpdatedScheduler.isScheduled()) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
			this.toReveal = we;
		}));

		this.disposables.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (!expression || !(expression instanceof Expression)) {
				return;
			}

			this.tree.refresh(expression, false).then(() => {
				this.tree.setHighlight(expression);
				once(this.tree.onDidChangeHighlight)((e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedExpression(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}
