/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { CollapseAction2 } from 'vs/workbench/browser/viewlet';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IExpression, CONTEXT_WATCH_EXPRESSIONS_FOCUSED } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable } from 'vs/workbench/parts/debug/common/debugModel';
import { AddWatchExpressionAction, RemoveAllWatchExpressionsAction, EditWatchExpressionAction, RemoveWatchExpressionAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IAction } from 'vs/base/common/actions';
import { CopyValueAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { renderExpressionValue, renderViewTree, IInputBoxOptions, AbstractExpressionsRenderer, IExpressionTemplateData } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { VariablesRenderer, variableSetEmitter } from 'vs/workbench/parts/debug/electron-browser/variablesView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { WorkbenchAsyncDataTree, IListService } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IAsyncDataSource, ITreeMouseEvent, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeDragOverReaction } from 'vs/base/browser/ui/tree/tree';
import { IDragAndDropData } from 'vs/base/browser/dnd';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';

const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export class WatchExpressionsView extends ViewletPanel {

	private onWatchExpressionsUpdatedScheduler: RunOnceScheduler;
	private needsRefresh: boolean;
	private tree: WorkbenchAsyncDataTree<IDebugService, IExpression>;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IListService private readonly listService: IListService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('watchExpressionsSection', "Watch Expressions Section") }, keybindingService, contextMenuService, configurationService);

		this.onWatchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.needsRefresh = false;
			this.tree.refresh();
		}, 50);
	}

	renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-watch');
		const treeContainer = renderViewTree(container);
		CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.contextKeyService.createScoped(treeContainer));

		const expressionsRenderer = this.instantiationService.createInstance(WatchExpressionsRenderer);
		this.disposables.push(expressionsRenderer);
		this.tree = new WorkbenchAsyncDataTree(treeContainer, new WatchExpressionsDelegate(), [expressionsRenderer, this.instantiationService.createInstance(VariablesRenderer)],
			new WatchExpressionsDataSource(), {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions"),
				accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
				identityProvider: { getId: element => element.getId() },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: e => e },
				dnd: new WatchExpressionsDragAndDrop(this.debugService),
			}, this.contextKeyService, this.listService, this.themeService, this.configurationService, this.keybindingService);

		this.tree.setInput(this.debugService).then(undefined, onUnexpectedError);

		const addWatchExpressionAction = new AddWatchExpressionAction(AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL, this.debugService, this.keybindingService);
		const collapseAction = new CollapseAction2(this.tree, true, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = new RemoveAllWatchExpressionsAction(RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL, this.debugService, this.keybindingService);
		this.toolbar.setActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction])();

		this.disposables.push(this.tree.onContextMenu(e => this.onContextMenu(e)));
		this.disposables.push(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));
		this.disposables.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
			} else {
				this.tree.refresh();
			}
		}));
		this.disposables.push(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.onWatchExpressionsUpdatedScheduler.isScheduled()) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
		}));
		this.disposables.push(variableSetEmitter.event(() => this.tree.refresh()));

		this.disposables.push(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
		}));
	}

	layoutBody(size: number): void {
		this.tree.layout(size);
	}

	private onMouseDblClick(e: ITreeMouseEvent<IExpression>): void {
		if ((e.browserEvent.target as HTMLElement).className.indexOf('twistie') >= 0) {
			// Ignore double click events on twistie
			return;
		}

		const element = e.element;
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof Expression && element !== this.debugService.getViewModel().getSelectedExpression()) {
			this.debugService.getViewModel().setSelectedExpression(element);
		} else if (!element) {
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
			return WatchExpressionsRenderer.ID;
		}
		if (element instanceof Variable) {
			return VariablesRenderer.ID;
		}

		return undefined;
	}
}

function isDebugService(element: any): element is IDebugService {
	return typeof element.getConfigurationManager === 'function';
}

class WatchExpressionsDataSource implements IAsyncDataSource<IDebugService, IExpression> {

	hasChildren(element: IExpression | null): boolean {
		return isDebugService(element) || element.hasChildren;
	}

	getChildren(element: IDebugService | IExpression): Promise<Array<IExpression>> {
		if (isDebugService(element)) {
			const debugService = element as IDebugService;
			const watchExpressions = debugService.getModel().getWatchExpressions();
			const viewModel = debugService.getViewModel();
			return Promise.all(watchExpressions.map(we => !!we.name
				? we.evaluate(viewModel.focusedSession, viewModel.focusedStackFrame, 'watch').then(() => we)
				: Promise.resolve(we)));
		}

		return element.getChildren();
	}
}


export class WatchExpressionsRenderer extends AbstractExpressionsRenderer {

	static readonly ID = 'watchexpression';

	get templateId() {
		return WatchExpressionsRenderer.ID;
	}

	protected renderExpression(expression: IExpression, data: IExpressionTemplateData): void {
		data.name.textContent = expression.name;
		renderExpressionValue(expression, data.value, {
			showChanged: true,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
			preserveWhitespace: false,
			showHover: true,
			colorize: true
		});
		data.name.title = expression.type ? expression.type : expression.value;

		if (typeof expression.value === 'string') {
			data.name.textContent += ':';
		}
	}

	protected getInputBoxOptions(expression: IExpression): IInputBoxOptions {
		return {
			initialValue: expression.name ? expression.name : '',
			ariaLabel: nls.localize('watchExpressionInputAriaLabel', "Type watch expression"),
			placeholder: nls.localize('watchExpressionPlaceholder', "Expression to watch"),
			onFinish: (value: string, success: boolean) => {
				if (success && value) {
					this.debugService.renameWatchExpression(expression.getId(), value);
				} else if (!expression.name) {
					this.debugService.removeWatchExpressions(expression.getId());
				}
			}
		};
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

class WatchExpressionsDragAndDrop implements ITreeDragAndDrop<IExpression> {

	constructor(private debugService: IDebugService) { }

	onDragOver(data: IDragAndDropData): boolean | ITreeDragOverReaction {
		if (!(data instanceof ElementsDragAndDropData)) {
			return false;
		}

		const expressions = (data as ElementsDragAndDropData<IExpression>).elements;
		return expressions.length > 0 && expressions[0] instanceof Expression;
	}

	getDragURI(element: IExpression): string | null {
		if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()) {
			return null;
		}

		return element.getId();
	}

	getDragLabel(elements: IExpression[]): string | undefined {
		if (elements.length === 1) {
			return elements[0].name;
		}

		return undefined;
	}

	drop(data: IDragAndDropData, targetElement: IExpression): void {
		if (!(data instanceof ElementsDragAndDropData)) {
			return;
		}

		const draggedElement = (data as ElementsDragAndDropData<IExpression>).elements[0];
		const watches = this.debugService.getModel().getWatchExpressions();
		const position = targetElement instanceof Expression ? watches.indexOf(targetElement) : watches.length - 1;
		this.debugService.moveWatchExpression(draggedElement.getId(), position);
	}
}
