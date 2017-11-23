/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler, sequence } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { prepareActions } from 'vs/workbench/browser/actions';
import { IHighlightEvent } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State, CONTEXT_VARIABLES_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { Variable } from 'vs/workbench/parts/debug/common/debugModel';
import * as viewer from 'vs/workbench/parts/debug/electron-browser/debugViewer';
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

export class VariablesView extends ViewsViewletPanel {

	private static readonly MEMENTO = 'variablesview.memento';
	private onFocusStackFrameScheduler: RunOnceScheduler;
	private variablesFocusedContext: IContextKey<boolean>;
	private settings: any;
	private expandedElements: any[];

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('variablesSection', "Variables Section") }, keybindingService, contextMenuService);

		this.settings = options.viewletSettings;
		this.variablesFocusedContext = CONTEXT_VARIABLES_FOCUSED.bindTo(contextKeyService);
		this.expandedElements = [];
		// Use scheduler to prevent unnecessary flashing
		this.onFocusStackFrameScheduler = new RunOnceScheduler(() => {
			// Remember expanded elements when there are some (otherwise don't override/erase the previous ones)
			const expanded = this.tree.getExpandedElements();
			if (expanded.length > 0) {
				this.expandedElements = expanded;
			}

			// Always clear tree highlight to avoid ending up in a broken state #12203
			this.tree.clearHighlight();
			this.tree.refresh().then(() => {
				const stackFrame = this.debugService.getViewModel().focusedStackFrame;
				return sequence(this.expandedElements.map(e => () => this.tree.expand(e))).then(() => {
					// If there is no preserved expansion state simply expand the first scope
					if (stackFrame && this.tree.getExpandedElements().length === 0) {
						return stackFrame.getScopes().then(scopes => {
							if (scopes.length > 0 && !scopes[0].expensive) {
								return this.tree.expand(scopes[0]);
							}
							return undefined;
						});
					}
					return undefined;
				});
			}).done(null, errors.onUnexpectedError);
		}, 400);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-variables');
		this.treeContainer = renderViewTree(container);

		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.VariablesDataSource(),
			renderer: this.instantiationService.createInstance(viewer.VariablesRenderer),
			accessibilityProvider: new viewer.VariablesAccessibilityProvider(),
			controller: this.instantiationService.createInstance(viewer.VariablesController, new viewer.VariablesActionProvider(this.debugService, this.keybindingService), MenuId.DebugVariablesContext)
		}, {
				ariaLabel: nls.localize('variablesAriaTreeLabel', "Debug Variables"),
				twistiePixels,
				keyboardSupport: false
			});

		this.disposables.push(attachListStyler(this.tree, this.themeService));
		this.disposables.push(this.listService.register(this.tree, [this.variablesFocusedContext]));

		const viewModel = this.debugService.getViewModel();

		this.tree.setInput(viewModel);

		const collapseAction = new CollapseAction(this.tree, false, 'explorer-action collapse-explorer');
		this.toolbar.setActions(prepareActions([collapseAction]))();

		this.disposables.push(viewModel.onDidFocusStackFrame(sf => {
			// Refresh the tree immediately if it is not visible.
			// Otherwise postpone the refresh until user stops stepping.
			if (!this.tree.getContentHeight() || sf.explicit) {
				this.onFocusStackFrameScheduler.schedule(0);
			} else {
				this.onFocusStackFrameScheduler.schedule();
			}
		}));
		this.disposables.push(this.debugService.onDidChangeState(state => {
			collapseAction.enabled = state === State.Running || state === State.Stopped;
		}));

		this.disposables.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (!expression || !(expression instanceof Variable)) {
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
		this.settings[VariablesView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}
