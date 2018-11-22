/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { CollapseAction2 } from 'vs/workbench/browser/viewlet';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IExpression, IDebugModel } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, DebugModel } from 'vs/workbench/parts/debug/common/debugModel';
import { AddWatchExpressionAction, RemoveAllWatchExpressionsAction, EditWatchExpressionAction, RemoveWatchExpressionAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IAction } from 'vs/base/common/actions';
import { CopyValueAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IVariableTemplateData, renderVariable, renderExpressionValue, renderViewTree } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { DataTree, IDataSource } from 'vs/base/browser/ui/tree/dataTree';
import { ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeContextMenuEvent, ITreeMouseEvent } from 'vs/base/browser/ui/tree/abstractTree';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';

const $ = dom.$;
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export class WatchExpressionsView extends ViewletPanel {

	private onWatchExpressionsUpdatedScheduler: RunOnceScheduler;
	private needsRefresh: boolean;
	private tree: DataTree<any>;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('watchExpressionsSection', "Watch Expressions Section") }, keybindingService, contextMenuService, configurationService);

		this.onWatchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.needsRefresh = false;
			this.tree.refresh(null);
		}, 50);
	}

	renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-watch');
		const treeContainer = renderViewTree(container);

		const expressionsRenderer = this.instantiationService.createInstance(ExpressionsRenderer);
		this.disposables.push(expressionsRenderer);
		this.tree = new DataTree(treeContainer, new WatchExpressionsDelegate(), [expressionsRenderer, new VariablesRenderer()],
			new WatchExpressionsDataSource(this.debugService), {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions"),
				accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
			});

		// TODO@Isidor
		// CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);

		this.tree.refresh(null);

		const addWatchExpressionAction = new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService);
		const collapseAction = new CollapseAction2(this.tree, true, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService);
		this.toolbar.setActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction])();

		this.disposables.push(this.tree.onContextMenu(e => this.onContextMenu(e)));
		this.disposables.push(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));
		this.disposables.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			if (!this.isExpanded() || !this.isVisible()) {
				this.needsRefresh = true;
			} else {
				this.tree.refresh(null).then();
			}
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
	}

	layoutBody(size: number): void {
		this.tree.layout(size);
	}

	setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		if (expanded && this.needsRefresh) {
			this.onWatchExpressionsUpdatedScheduler.schedule();
		}
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (visible && this.needsRefresh) {
			this.onWatchExpressionsUpdatedScheduler.schedule();
		}
	}

	private onMouseDblClick(e: ITreeMouseEvent<IExpression>): void {
		const element = e.element;
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof Expression) {
			this.debugService.getViewModel().setSelectedExpression(element);
		} else if (element instanceof DebugModel) {
			// Double click in watch panel triggers to add a new watch expression
			this.debugService.addWatchExpression();
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<IExpression>): void {
		const element = e.element;
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
					actions.push(new CopyValueAction(CopyValueAction.ID, CopyValueAction.LABEL, variable, this.debugService));
				}
				actions.push(new Separator());
			}
			actions.push(new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService));
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element
		});
	}
}

class WatchExpressionsDelegate implements IListVirtualDelegate<IExpression> {

	getHeight(element: IExpression): number {
		return 22;
	}

	getTemplateId(element: IExpression): string {
		if (element instanceof Expression) {
			return ExpressionsRenderer.ID;
		}
		if (element instanceof Variable) {
			return VariablesRenderer.ID;
		}

		return undefined;
	}
}

class WatchExpressionsDataSource implements IDataSource<IExpression | IDebugModel> {

	constructor(private debugService: IDebugService) { }

	hasChildren(element: IExpression | IDebugModel | null): boolean {
		if (element === null) {
			return true;
		}
		if (element instanceof DebugModel) {
			return true;
		}

		return (<IExpression>element).hasChildren;
	}

	getChildren(element: IExpression | null): Thenable<(IExpression | IDebugModel)[]> {
		if (element === null) {
			const watchExpressions = this.debugService.getModel().getWatchExpressions();
			const viewModel = this.debugService.getViewModel();
			return Promise.all(watchExpressions.map(we => !!we.name
				? we.evaluate(viewModel.focusedSession, viewModel.focusedStackFrame, 'watch').then(() => we)
				: Promise.resolve(we)));
		}

		return element.getChildren();
	}
}

interface IWatchExpressionTemplateData {
	expression: HTMLElement;
	name: HTMLSpanElement;
	value: HTMLSpanElement;
	inputBoxContainer: HTMLElement;
	enableInputBox(expression: IExpression);
	toDispose: IDisposable[];
}

class ExpressionsRenderer implements ITreeRenderer<Expression, void, IWatchExpressionTemplateData>, IDisposable {

	static readonly ID = 'watchExpression';

	private renderedExpressions = new Map<IExpression, IWatchExpressionTemplateData>();
	private toDispose: IDisposable[];

	constructor(
		@IDebugService private debugService: IDebugService,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
	) {
		this.toDispose = [];

		this.toDispose.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			const template = this.renderedExpressions.get(expression);
			if (template) {
				template.enableInputBox(expression);
			}
		}));
	}

	get templateId() {
		return ExpressionsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IWatchExpressionTemplateData {
		const data: IWatchExpressionTemplateData = Object.create(null);
		data.expression = dom.append(container, $('.expression'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));
		data.inputBoxContainer = dom.append(data.expression, $('.inputBoxContainer'));

		data.enableInputBox = (expression: IExpression) => {
			data.name.style.display = 'none';
			data.value.style.display = 'none';
			data.inputBoxContainer.style.display = 'initial';

			const inputBox = new InputBox(data.inputBoxContainer, this.contextViewService, {
				placeholder: nls.localize('watchExpressionPlaceholder', "Expression to watch"),
				ariaLabel: nls.localize('watchExpressionInputAriaLabel', "Type watch expression")
			});
			const styler = attachInputBoxStyler(inputBox, this.themeService);

			inputBox.value = expression.name ? expression.name : '';
			inputBox.focus();
			inputBox.select();

			let disposed = false;
			data.toDispose = [inputBox, styler];

			const wrapUp = (renamed: boolean) => {
				if (!disposed) {
					disposed = true;
					this.debugService.getViewModel().setSelectedExpression(undefined);
					if (renamed && inputBox.value) {
						this.debugService.renameWatchExpression(expression.getId(), inputBox.value);
					} else if (!expression.name) {
						this.debugService.removeWatchExpressions(expression.getId());
					}

					// need to remove the input box since this template will be reused.
					data.inputBoxContainer.removeChild(inputBox.element);
					data.name.style.display = 'initial';
					data.value.style.display = 'initial';
					data.inputBoxContainer.style.display = 'none';
					dispose(data.toDispose);
				}
			};

			data.toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
				const isEscape = e.equals(KeyCode.Escape);
				const isEnter = e.equals(KeyCode.Enter);
				if (isEscape || isEnter) {
					e.preventDefault();
					e.stopPropagation();
					wrapUp(isEnter);
				}
			}));
			data.toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
				wrapUp(true);
			}));
		};

		return data;
	}

	renderElement({ element }: ITreeNode<Expression>, index: number, data: IWatchExpressionTemplateData): void {
		this.renderedExpressions.set(element, data);
		if (element === this.debugService.getViewModel().getSelectedExpression()) {
			data.enableInputBox(element);
		} else {
			data.name.textContent = element.name;
			renderExpressionValue(element, data.value, {
				showChanged: true,
				maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
				preserveWhitespace: false,
				showHover: true,
				colorize: true
			});
			data.name.title = element.type ? element.type : element.value;

			if (typeof element.value === 'string') {
				data.name.textContent += ':';
			}
		}
	}

	disposeTemplate(templateData: IWatchExpressionTemplateData): void {
		dispose(templateData.toDispose);
	}

	disposeElement(element: ITreeNode<Expression, void>): void {
		this.renderedExpressions.delete(element.element);
	}

	dispose(): void {
		this.renderedExpressions = undefined;
		dispose(this.toDispose);
	}
}

class VariablesRenderer implements ITreeRenderer<Variable, void, IVariableTemplateData> {

	static readonly ID = 'variable';

	get templateId() {
		return VariablesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IVariableTemplateData {
		const data: IVariableTemplateData = Object.create(null);
		data.expression = dom.append(container, $('.expression'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));

		return data;
	}

	renderElement({ element }: ITreeNode<Variable, void>, index: number, templateData: IVariableTemplateData): void {
		renderVariable(element, templateData, false);
	}

	disposeElement(): void {
		// noop
	}

	disposeTemplate(): void {
		// noop
	}
}

class WatchExpressionsAccessibilityProvider implements IAccessibilityProvider<IExpression> {
	getAriaLabel(element: IExpression): string {
		if (element instanceof Expression) {
			return nls.localize('watchExpressionAriaLabel', "{0} value {1}, watch, debug", (<Expression>element).name, (<Expression>element).value);
		}
		if (element instanceof Variable) {
			return nls.localize('watchVariableAriaLabel', "{0} value {1}, watch, debug", (<Variable>element).name, (<Variable>element).value);
		}

		return null;
	}
}

// TODO@Isidor
// class WatchExpressionsDragAndDrop extends DefaultDragAndDrop {

// 	constructor(private debugService: IDebugService) {
// 		super();
// 	}

// 	getDragURI(tree: ITree, element: Expression): string {
// 		if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()) {
// 			return null;
// 		}

// 		return element.getId();
// 	}

// 	getDragLabel(tree: ITree, elements: Expression[]): string {
// 		if (elements.length > 1) {
// 			return String(elements.length);
// 		}

// 		return elements[0].name;
// 	}

// 	onDragOver(tree: ITree, data: IDragAndDropData, target: Expression | DebugModel, originalEvent: DragMouseEvent): IDragOverReaction {
// 		if (target instanceof Expression || target instanceof DebugModel) {
// 			return {
// 				accept: true,
// 				autoExpand: false
// 			};
// 		}

// 		return DRAG_OVER_REJECT;
// 	}

// 	drop(tree: ITree, data: IDragAndDropData, target: Expression | DebugModel, originalEvent: DragMouseEvent): void {
// 		const draggedData = data.getData();
// 		if (Array.isArray(draggedData)) {
// 			const draggedElement = <Expression>draggedData[0];
// 			const watches = this.debugService.getModel().getWatchExpressions();
// 			const position = target instanceof DebugModel ? watches.length - 1 : watches.indexOf(target);
// 			this.debugService.moveWatchExpression(draggedElement.getId(), position);
// 		}
// 	}
// }
