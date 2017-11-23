/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { IAction } from 'vs/base/common/actions';
import { IHighlightEvent, ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IBreakpoint, CONTEXT_BREAKPOINTS_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { ExceptionBreakpoint, FunctionBreakpoint, Breakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import * as viewer from 'vs/workbench/parts/debug/electron-browser/debugViewer';
import { AddFunctionBreakpointAction, ToggleBreakpointsActivatedAction, RemoveAllBreakpointsAction } from 'vs/workbench/parts/debug/browser/debugActions';
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

export class BreakpointsView extends ViewsViewletPanel {

	private static readonly MAX_VISIBLE_FILES = 9;
	private static readonly MEMENTO = 'breakopintsview.memento';
	private breakpointsFocusedContext: IContextKey<boolean>;
	private settings: any;

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
		super({
			...(options as IViewOptions),
			ariaHeaderLabel: nls.localize('breakpointsSection', "Breakpoints Section")
		}, keybindingService, contextMenuService);

		this.minimumBodySize = this.maximumBodySize = this.getExpandedBodySize();
		this.settings = options.viewletSettings;
		this.breakpointsFocusedContext = CONTEXT_BREAKPOINTS_FOCUSED.bindTo(contextKeyService);
		this.disposables.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-breakpoints');
		this.treeContainer = renderViewTree(container);
		const actionProvider = new viewer.BreakpointsActionProvider(this.debugService, this.keybindingService, );
		const controller = this.instantiationService.createInstance(viewer.BreakpointsController, actionProvider, MenuId.DebugBreakpointsContext);

		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.BreakpointsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.BreakpointsRenderer),
			accessibilityProvider: this.instantiationService.createInstance(viewer.BreakpointsAccessibilityProvider),
			controller,
			sorter: {
				compare(tree: ITree, element: any, otherElement: any): number {
					const first = <IBreakpoint>element;
					const second = <IBreakpoint>otherElement;
					if (first instanceof ExceptionBreakpoint) {
						return -1;
					}
					if (second instanceof ExceptionBreakpoint) {
						return 1;
					}
					if (first instanceof FunctionBreakpoint) {
						return -1;
					}
					if (second instanceof FunctionBreakpoint) {
						return 1;
					}

					if (first.uri.toString() !== second.uri.toString()) {
						return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
					}
					if (first.lineNumber === second.lineNumber) {
						return first.column - second.column;
					}

					return first.lineNumber - second.lineNumber;
				}
			}
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'breakpointsAriaTreeLabel' }, "Debug Breakpoints"),
				twistiePixels,
				keyboardSupport: false
			});

		this.disposables.push(attachListStyler(this.tree, this.themeService));
		this.disposables.push(this.listService.register(this.tree, [this.breakpointsFocusedContext]));

		this.disposables.push(this.tree.onDidChangeSelection(event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				const element = this.tree.getFocus();
				if (element instanceof Breakpoint) {
					controller.openBreakpointSource(element, event, false);
				}
			}
		}));

		const debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.disposables.push(this.debugService.getViewModel().onDidSelectFunctionBreakpoint(fbp => {
			if (!fbp || !(fbp instanceof FunctionBreakpoint)) {
				return;
			}

			this.tree.refresh(fbp, false).then(() => {
				this.tree.setHighlight(fbp);
				once(this.tree.onDidChangeHighlight)((e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedFunctionBreakpoint(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public getActions(): IAction[] {
		return [
			new AddFunctionBreakpointAction(AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL, this.debugService, this.keybindingService),
			new ToggleBreakpointsActivatedAction(ToggleBreakpointsActivatedAction.ID, ToggleBreakpointsActivatedAction.ACTIVATE_LABEL, this.debugService, this.keybindingService),
			new RemoveAllBreakpointsAction(RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL, this.debugService, this.keybindingService)
		];
	}

	private onBreakpointsChange(): void {
		this.minimumBodySize = this.getExpandedBodySize();
		if (this.maximumBodySize < Number.POSITIVE_INFINITY) {
			this.maximumBodySize = this.minimumBodySize;
		}
		if (this.tree) {
			this.tree.refresh();
		}
	}

	private getExpandedBodySize(): number {
		const model = this.debugService.getModel();
		const length = model.getBreakpoints().length + model.getExceptionBreakpoints().length + model.getFunctionBreakpoints().length;
		return Math.min(BreakpointsView.MAX_VISIBLE_FILES, length) * 22;
	}

	public shutdown(): void {
		this.settings[BreakpointsView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}
