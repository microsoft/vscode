/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { IActionProvider, ITree, IDataSource, IRenderer, IAccessibilityProvider, IDragAndDropData, IDragOverReaction, DRAG_OVER_REJECT } from 'vs/base/parts/tree/browser/tree';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { TreeViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IExpression, CONTEXT_WATCH_EXPRESSIONS_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, Model } from 'vs/workbench/parts/debug/common/debugModel';
import { AddWatchExpressionAction, RemoveAllWatchExpressionsAction, EditWatchExpressionAction, RemoveWatchExpressionAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { CopyValueAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IMouseEvent, DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { DefaultDragAndDrop, OpenMode, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { IVariableTemplateData, renderVariable, renderRenameBox, renderExpressionValue, BaseDebugController, twistiePixels, renderViewTree } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const $ = dom.$;
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export class WatchExpressionsView extends TreeViewsViewletPanel {

	private static readonly MEMENTO = 'watchexpressionsview.memento';
	private onWatchExpressionsUpdatedScheduler: RunOnceScheduler;
	private treeContainer: HTMLElement;
	private settings: any;
	private needsRefresh: boolean;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('expressionsSection', "Expressions Section") }, keybindingService, contextMenuService, configurationService);
		this.settings = options.viewletSettings;

		this.onWatchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.needsRefresh = false;
			this.tree.refresh().done(undefined, errors.onUnexpectedError);
		}, 50);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-watch');
		this.treeContainer = renderViewTree(container);

		const actionProvider = new WatchExpressionsActionProvider(this.debugService, this.keybindingService);
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new WatchExpressionsDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(WatchExpressionsRenderer),
			accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
			controller: this.instantiationService.createInstance(WatchExpressionsController, actionProvider, MenuId.DebugWatchContext, { clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, openMode: OpenMode.SINGLE_CLICK }),
			dnd: new WatchExpressionsDragAndDrop(this.debugService)
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions"),
				twistiePixels
			});

		CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);

		this.tree.setInput(this.debugService.getModel());

		const addWatchExpressionAction = new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService);
		const collapseAction = new CollapseAction(this.tree, true, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService);
		this.toolbar.setActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction])();

		this.disposables.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			if (!this.isExpanded() || !this.isVisible()) {
				this.needsRefresh = true;
				return;
			}

			this.tree.refresh().done(() => {
				return we instanceof Expression ? this.tree.reveal(we) : TPromise.as(true);
			}, errors.onUnexpectedError);
		}));
		this.disposables.push(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			if (!this.isExpanded() || !this.isVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.onWatchExpressionsUpdatedScheduler.isScheduled()) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
		}));

		this.disposables.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (expression instanceof Expression) {
				this.tree.refresh(expression, false).done(null, errors.onUnexpectedError);
			}
		}));
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	public setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		if (expanded && this.needsRefresh) {
			this.onWatchExpressionsUpdatedScheduler.schedule();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible && this.needsRefresh) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
		});
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}


class WatchExpressionsActionProvider implements IActionProvider {

	constructor(private debugService: IDebugService, private keybindingService: IKeybindingService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return element instanceof Expression && !!element.name;
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return true;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		if (element instanceof Expression) {
			const expression = <Expression>element;
			actions.push(new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new EditWatchExpressionAction(EditWatchExpressionAction.ID, EditWatchExpressionAction.LABEL, this.debugService, this.keybindingService));
			if (!expression.hasChildren) {
				actions.push(new CopyValueAction(CopyValueAction.ID, CopyValueAction.LABEL, expression.value, this.debugService));
			}
			actions.push(new Separator());

			actions.push(new RemoveWatchExpressionAction(RemoveWatchExpressionAction.ID, RemoveWatchExpressionAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService));
		} else {
			actions.push(new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService));
			if (element instanceof Variable) {
				const variable = <Variable>element;
				if (!variable.hasChildren) {
					actions.push(new CopyValueAction(CopyValueAction.ID, CopyValueAction.LABEL, variable.value, this.debugService));
				}
				actions.push(new Separator());
			}
			actions.push(new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService));
		}

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

class WatchExpressionsDataSource implements IDataSource {

	constructor(private debugService: IDebugService) {
		// noop
	}

	public getId(tree: ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		if (element instanceof Model) {
			return true;
		}

		const watchExpression = <Expression>element;
		return watchExpression.hasChildren && !equalsIgnoreCase(watchExpression.value, 'null');
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof Model) {
			const viewModel = this.debugService.getViewModel();
			return TPromise.join(element.getWatchExpressions().map(we =>
				we.name ? we.evaluate(viewModel.focusedProcess, viewModel.focusedStackFrame, 'watch').then(() => we) : TPromise.as(we)));
		}

		let expression = <Expression>element;
		return expression.getChildren();
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IWatchExpressionTemplateData {
	watchExpression: HTMLElement;
	expression: HTMLElement;
	name: HTMLSpanElement;
	value: HTMLSpanElement;
}

class WatchExpressionsRenderer implements IRenderer {

	private static readonly WATCH_EXPRESSION_TEMPLATE_ID = 'watchExpression';
	private static readonly VARIABLE_TEMPLATE_ID = 'variables';
	private toDispose: IDisposable[];

	constructor(
		@IDebugService private debugService: IDebugService,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) {
		this.toDispose = [];
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Expression) {
			return WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID;
		}

		return WatchExpressionsRenderer.VARIABLE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		const createVariableTemplate = ((data: IVariableTemplateData, container: HTMLElement) => {
			data.expression = dom.append(container, $('.expression'));
			data.name = dom.append(data.expression, $('span.name'));
			data.value = dom.append(data.expression, $('span.value'));
		});

		if (templateId === WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID) {
			const data: IWatchExpressionTemplateData = Object.create(null);
			data.watchExpression = dom.append(container, $('.watch-expression'));
			createVariableTemplate(data, data.watchExpression);

			return data;
		}

		const data: IVariableTemplateData = Object.create(null);
		createVariableTemplate(data, container);

		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID) {
			this.renderWatchExpression(tree, element, templateData);
		} else {
			renderVariable(tree, element, templateData, true);
		}
	}

	private renderWatchExpression(tree: ITree, watchExpression: IExpression, data: IWatchExpressionTemplateData): void {
		let selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((selectedExpression instanceof Expression && selectedExpression.getId() === watchExpression.getId())) {
			renderRenameBox(this.debugService, this.contextViewService, this.themeService, tree, watchExpression, data.expression, {
				initialValue: watchExpression.name,
				placeholder: nls.localize('watchExpressionPlaceholder', "Expression to watch"),
				ariaLabel: nls.localize('watchExpressionInputAriaLabel', "Type watch expression")
			});
		}

		data.name.textContent = watchExpression.name;
		if (watchExpression.value) {
			data.name.textContent += ':';
			renderExpressionValue(watchExpression, data.value, {
				showChanged: true,
				maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
				preserveWhitespace: false,
				showHover: true,
				colorize: true
			});
			data.name.title = watchExpression.type ? watchExpression.type : watchExpression.value;
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

class WatchExpressionsAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Expression) {
			return nls.localize('watchExpressionAriaLabel', "{0} value {1}, watch, debug", (<Expression>element).name, (<Expression>element).value);
		}
		if (element instanceof Variable) {
			return nls.localize('watchVariableAriaLabel', "{0} value {1}, watch, debug", (<Variable>element).name, (<Variable>element).value);
		}

		return null;
	}
}

class WatchExpressionsController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof Expression && event.detail === 2) {
			const expression = <IExpression>element;
			this.debugService.getViewModel().setSelectedExpression(expression);
			return true;
		} else if (element instanceof Model && event.detail === 2) {
			// Double click in watch panel triggers to add a new watch expression
			this.debugService.addWatchExpression();
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}
}

class WatchExpressionsDragAndDrop extends DefaultDragAndDrop {

	constructor(private debugService: IDebugService) {
		super();
	}

	public getDragURI(tree: ITree, element: Expression): string {
		if (!(element instanceof Expression)) {
			return null;
		}

		return element.getId();
	}

	public getDragLabel(tree: ITree, elements: Expression[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		return elements[0].name;
	}

	public onDragOver(tree: ITree, data: IDragAndDropData, target: Expression | Model, originalEvent: DragMouseEvent): IDragOverReaction {
		if (target instanceof Expression || target instanceof Model) {
			return {
				accept: true,
				autoExpand: false
			};
		}

		return DRAG_OVER_REJECT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: Expression | Model, originalEvent: DragMouseEvent): void {
		const draggedData = data.getData();
		if (Array.isArray(draggedData)) {
			const draggedElement = <Expression>draggedData[0];
			const watches = this.debugService.getModel().getWatchExpressions();
			const position = target instanceof Model ? watches.length - 1 : watches.indexOf(target);
			this.debugService.moveWatchExpression(draggedElement.getId(), position);
		}
	}
}
