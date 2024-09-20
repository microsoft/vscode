/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../../../base/browser/dnd.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../base/browser/ui/list/listView.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { ITreeContextMenuEvent, ITreeDragAndDrop, ITreeDragOverReaction, ITreeMouseEvent, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { IAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { localize } from '../../../../nls.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { CONTEXT_CAN_VIEW_MEMORY, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_WATCH_EXPRESSIONS_EXIST, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_WATCH_ITEM_TYPE, IDebugConfiguration, IDebugService, IExpression, WATCH_VIEW_ID } from '../common/debug.js';
import { Expression, Variable, VisualizedExpression } from '../common/debugModel.js';
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, IExpressionTemplateData, IInputBoxOptions, renderViewTree } from './baseDebugView.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
import { watchExpressionsAdd, watchExpressionsRemoveAll } from './debugIcons.js';
import { VariablesRenderer, VisualizedVariableRenderer } from './variablesView.js';

const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
let ignoreViewUpdates = false;
let useCachedEvaluation = false;

export class WatchExpressionsView extends ViewPane {

	private watchExpressionsUpdatedScheduler: RunOnceScheduler;
	private needsRefresh = false;
	private tree!: WorkbenchAsyncDataTree<IDebugService | IExpression, IExpression, FuzzyScore>;
	private watchExpressionsExist: IContextKey<boolean>;
	private watchItemType: IContextKey<string | undefined>;
	private variableReadonly: IContextKey<boolean>;
	private menu: IMenu;
	private expressionRenderer: DebugExpressionRenderer;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IMenuService menuService: IMenuService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.menu = menuService.createMenu(MenuId.DebugWatchContext, contextKeyService);
		this._register(this.menu);
		this.watchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.needsRefresh = false;
			this.tree.updateChildren();
		}, 50);
		this.watchExpressionsExist = CONTEXT_WATCH_EXPRESSIONS_EXIST.bindTo(contextKeyService);
		this.variableReadonly = CONTEXT_VARIABLE_IS_READONLY.bindTo(contextKeyService);
		this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
		this.watchItemType = CONTEXT_WATCH_ITEM_TYPE.bindTo(contextKeyService);
		this.expressionRenderer = instantiationService.createInstance(DebugExpressionRenderer);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.element.classList.add('debug-pane');
		container.classList.add('debug-watch');
		const treeContainer = renderViewTree(container);

		const expressionsRenderer = this.instantiationService.createInstance(WatchExpressionsRenderer, this.expressionRenderer);
		this.tree = <WorkbenchAsyncDataTree<IDebugService | IExpression, IExpression, FuzzyScore>>this.instantiationService.createInstance(WorkbenchAsyncDataTree, 'WatchExpressions', treeContainer, new WatchExpressionsDelegate(),
			[
				expressionsRenderer,
				this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
				this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer),
			],
			this.instantiationService.createInstance(WatchExpressionsDataSource), {
			accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
			identityProvider: { getId: (element: IExpression) => element.getId() },
			keyboardNavigationLabelProvider: {
				getKeyboardNavigationLabel: (e: IExpression) => {
					if (e === this.debugService.getViewModel().getSelectedExpression()?.expression) {
						// Don't filter input box
						return undefined;
					}

					return e.name;
				}
			},
			dnd: new WatchExpressionsDragAndDrop(this.debugService),
			overrideStyles: this.getLocationBasedColors().listOverrideStyles
		});
		this.tree.setInput(this.debugService);
		CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);

		this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
		this._register(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));
		this._register(this.debugService.getModel().onDidChangeWatchExpressions(async we => {
			this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
			} else {
				if (we && !we.name) {
					// We are adding a new input box, no need to re-evaluate watch expressions
					useCachedEvaluation = true;
				}
				await this.tree.updateChildren();
				useCachedEvaluation = false;
				if (we instanceof Expression) {
					this.tree.reveal(we);
				}
			}
		}));
		this._register(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.watchExpressionsUpdatedScheduler.isScheduled()) {
				this.watchExpressionsUpdatedScheduler.schedule();
			}
		}));
		this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
			if (!ignoreViewUpdates) {
				this.tree.updateChildren();
			}
		}));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.watchExpressionsUpdatedScheduler.schedule();
			}
		}));
		let horizontalScrolling: boolean | undefined;
		this._register(this.debugService.getViewModel().onDidSelectExpression(e => {
			const expression = e?.expression;
			if (expression && this.tree.hasNode(expression)) {
				horizontalScrolling = this.tree.options.horizontalScrolling;
				if (horizontalScrolling) {
					this.tree.updateOptions({ horizontalScrolling: false });
				}

				if (expression.name) {
					// Only rerender if the input is already done since otherwise the tree is not yet aware of the new element
					this.tree.rerender(expression);
				}
			} else if (!expression && horizontalScrolling !== undefined) {
				this.tree.updateOptions({ horizontalScrolling: horizontalScrolling });
				horizontalScrolling = undefined;
			}
		}));

		this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async e => {
			if (e instanceof Variable && this.tree.hasNode(e)) {
				await this.tree.updateChildren(e, false, true);
				await this.tree.expand(e);
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	private onMouseDblClick(e: ITreeMouseEvent<IExpression>): void {
		if ((e.browserEvent.target as HTMLElement).className.indexOf('twistie') >= 0) {
			// Ignore double click events on twistie
			return;
		}

		const element = e.element;
		// double click on primitive value: open input box to be able to select and copy value.
		const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((element instanceof Expression && element !== selectedExpression?.expression) || (element instanceof VisualizedExpression && element.treeItem.canEdit)) {
			this.debugService.getViewModel().setSelectedExpression(element, false);
		} else if (!element) {
			// Double click in watch panel triggers to add a new watch expression
			this.debugService.addWatchExpression();
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<IExpression>): void {
		const element = e.element;
		const selection = this.tree.getSelection();

		this.watchItemType.set(element instanceof Expression ? 'expression' : element instanceof Variable ? 'variable' : undefined);
		const actions: IAction[] = [];
		const attributes = element instanceof Variable ? element.presentationHint?.attributes : undefined;
		this.variableReadonly.set(!!attributes && attributes.indexOf('readOnly') >= 0 || !!element?.presentationHint?.lazy);
		createAndFillInContextMenuActions(this.menu, { arg: element, shouldForwardArgs: true }, actions);
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element && selection.includes(element) ? selection : element ? [element] : [],
		});
	}
}

class WatchExpressionsDelegate implements IListVirtualDelegate<IExpression> {

	getHeight(_element: IExpression): number {
		return 22;
	}

	getTemplateId(element: IExpression): string {
		if (element instanceof Expression) {
			return WatchExpressionsRenderer.ID;
		}

		if (element instanceof VisualizedExpression) {
			return VisualizedVariableRenderer.ID;
		}

		// Variable
		return VariablesRenderer.ID;
	}
}

function isDebugService(element: any): element is IDebugService {
	return typeof element.getConfigurationManager === 'function';
}

class WatchExpressionsDataSource extends AbstractExpressionDataSource<IDebugService, IExpression> {

	public override hasChildren(element: IExpression | IDebugService): boolean {
		return isDebugService(element) || element.hasChildren;
	}

	protected override doGetChildren(element: IDebugService | IExpression): Promise<Array<IExpression>> {
		if (isDebugService(element)) {
			const debugService = element as IDebugService;
			const watchExpressions = debugService.getModel().getWatchExpressions();
			const viewModel = debugService.getViewModel();
			return Promise.all(watchExpressions.map(we => !!we.name && !useCachedEvaluation
				? we.evaluate(viewModel.focusedSession!, viewModel.focusedStackFrame!, 'watch').then(() => we)
				: Promise.resolve(we)));
		}

		return element.getChildren();
	}
}


export class WatchExpressionsRenderer extends AbstractExpressionsRenderer {

	static readonly ID = 'watchexpression';

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super(debugService, contextViewService, hoverService);
	}

	get templateId() {
		return WatchExpressionsRenderer.ID;
	}

	public override renderElement(node: ITreeNode<IExpression, FuzzyScore>, index: number, data: IExpressionTemplateData): void {
		data.elementDisposable.clear();
		data.elementDisposable.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('debug.showVariableTypes')) {
				super.renderExpressionElement(node.element, node, data);
			}
		}));
		super.renderExpressionElement(node.element, node, data);
	}

	protected renderExpression(expression: IExpression, data: IExpressionTemplateData, highlights: IHighlight[]): void {
		let text: string;
		data.type.textContent = '';
		const showType = this.configurationService.getValue<IDebugConfiguration>('debug').showVariableTypes;
		if (showType && expression.type) {
			text = typeof expression.value === 'string' ? `${expression.name}: ` : expression.name;
			//render type
			data.type.textContent = expression.type + ' =';
		} else {
			text = typeof expression.value === 'string' ? `${expression.name} =` : expression.name;
		}

		let title: string;
		if (expression.type) {
			if (showType) {
				title = `${expression.name}`;
			} else {
				title = expression.type === expression.value ?
					expression.type :
					`${expression.type}`;
			}
		} else {
			title = expression.value;
		}

		data.label.set(text, highlights, title);
		data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, expression, {
			showChanged: true,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
			colorize: true,
			session: expression.getSession(),
		}));
	}

	protected getInputBoxOptions(expression: IExpression, settingValue: boolean): IInputBoxOptions {
		if (settingValue) {
			return {
				initialValue: expression.value,
				ariaLabel: localize('typeNewValue', "Type new value"),
				onFinish: async (value: string, success: boolean) => {
					if (success && value) {
						const focusedFrame = this.debugService.getViewModel().focusedStackFrame;
						if (focusedFrame && (expression instanceof Variable || expression instanceof Expression)) {
							await expression.setExpression(value, focusedFrame);
							this.debugService.getViewModel().updateViews();
						}
					}
				}
			};
		}

		return {
			initialValue: expression.name ? expression.name : '',
			ariaLabel: localize('watchExpressionInputAriaLabel', "Type watch expression"),
			placeholder: localize('watchExpressionPlaceholder', "Expression to watch"),
			onFinish: (value: string, success: boolean) => {
				if (success && value) {
					this.debugService.renameWatchExpression(expression.getId(), value);
					ignoreViewUpdates = true;
					this.debugService.getViewModel().updateViews();
					ignoreViewUpdates = false;
				} else if (!expression.name) {
					this.debugService.removeWatchExpressions(expression.getId());
				}
			}
		};
	}

	protected override renderActionBar(actionBar: ActionBar, expression: IExpression) {
		const contextKeyService = getContextForWatchExpressionMenu(this.contextKeyService, expression);
		const context = expression;
		const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: context, shouldForwardArgs: false });

		const primary: IAction[] = [];
		createAndFillInContextMenuActions(menu, { primary, secondary: [] }, 'inline');

		actionBar.clear();
		actionBar.context = context;
		actionBar.push(primary, { icon: true, label: false });
	}
}

/**
 * Gets a context key overlay that has context for the given expression.
 */
function getContextForWatchExpressionMenu(parentContext: IContextKeyService, expression: IExpression) {
	return parentContext.createOverlay([
		[CONTEXT_CAN_VIEW_MEMORY.key, expression.memoryReference !== undefined],
		[CONTEXT_WATCH_ITEM_TYPE.key, 'expression']
	]);
}

class WatchExpressionsAccessibilityProvider implements IListAccessibilityProvider<IExpression> {

	getWidgetAriaLabel(): string {
		return localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions");
	}

	getAriaLabel(element: IExpression): string {
		if (element instanceof Expression) {
			return localize('watchExpressionAriaLabel', "{0}, value {1}", (<Expression>element).name, (<Expression>element).value);
		}

		// Variable
		return localize('watchVariableAriaLabel', "{0}, value {1}", (<Variable>element).name, (<Variable>element).value);
	}
}

class WatchExpressionsDragAndDrop implements ITreeDragAndDrop<IExpression> {

	constructor(private debugService: IDebugService) { }

	onDragOver(data: IDragAndDropData, targetElement: IExpression | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		if (!(data instanceof ElementsDragAndDropData)) {
			return false;
		}

		const expressions = (data as ElementsDragAndDropData<IExpression>).elements;
		if (!(expressions.length > 0 && expressions[0] instanceof Expression)) {
			return false;
		}

		let dropEffectPosition: ListDragOverEffectPosition | undefined = undefined;
		if (targetIndex === undefined) {
			// Hovering over the list
			dropEffectPosition = ListDragOverEffectPosition.After;
			targetIndex = -1;
		} else {
			// Hovering over an element
			switch (targetSector) {
				case ListViewTargetSector.TOP:
				case ListViewTargetSector.CENTER_TOP:
					dropEffectPosition = ListDragOverEffectPosition.Before; break;
				case ListViewTargetSector.CENTER_BOTTOM:
				case ListViewTargetSector.BOTTOM:
					dropEffectPosition = ListDragOverEffectPosition.After; break;
			}
		}

		return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition }, feedback: [targetIndex] } satisfies ITreeDragOverReaction;
	}

	getDragURI(element: IExpression): string | null {
		if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()?.expression) {
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

	drop(data: IDragAndDropData, targetElement: IExpression, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		if (!(data instanceof ElementsDragAndDropData)) {
			return;
		}

		const draggedElement = (data as ElementsDragAndDropData<IExpression>).elements[0];
		if (!(draggedElement instanceof Expression)) {
			throw new Error('Invalid dragged element');
		}

		const watches = this.debugService.getModel().getWatchExpressions();
		const sourcePosition = watches.indexOf(draggedElement);

		let targetPosition;
		if (targetElement instanceof Expression) {
			targetPosition = watches.indexOf(targetElement);

			switch (targetSector) {
				case ListViewTargetSector.BOTTOM:
				case ListViewTargetSector.CENTER_BOTTOM:
					targetPosition++; break;
			}

			if (sourcePosition < targetPosition) {
				targetPosition--;
			}
		} else {
			targetPosition = watches.length - 1;
		}

		this.debugService.moveWatchExpression(draggedElement.getId(), targetPosition);
	}

	dispose(): void { }
}

registerAction2(class Collapse extends ViewAction<WatchExpressionsView> {
	constructor() {
		super({
			id: 'watch.collapse',
			viewId: WATCH_VIEW_ID,
			title: localize('collapse', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
			menu: {
				id: MenuId.ViewTitle,
				order: 30,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
			}
		});
	}

	runInView(_accessor: ServicesAccessor, view: WatchExpressionsView) {
		view.collapseAll();
	}
});

export const ADD_WATCH_ID = 'workbench.debug.viewlet.action.addWatchExpression'; // Use old and long id for backwards compatibility
export const ADD_WATCH_LABEL = localize('addWatchExpression', "Add Expression");

registerAction2(class AddWatchExpressionAction extends Action2 {
	constructor() {
		super({
			id: ADD_WATCH_ID,
			title: ADD_WATCH_LABEL,
			f1: false,
			icon: watchExpressionsAdd,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const debugService = accessor.get(IDebugService);
		debugService.addWatchExpression();
	}
});

export const REMOVE_WATCH_EXPRESSIONS_COMMAND_ID = 'workbench.debug.viewlet.action.removeAllWatchExpressions';
export const REMOVE_WATCH_EXPRESSIONS_LABEL = localize('removeAllWatchExpressions', "Remove All Expressions");
registerAction2(class RemoveAllWatchExpressionsAction extends Action2 {
	constructor() {
		super({
			id: REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, // Use old and long id for backwards compatibility
			title: REMOVE_WATCH_EXPRESSIONS_LABEL,
			f1: false,
			icon: watchExpressionsRemoveAll,
			precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
			menu: {
				id: MenuId.ViewTitle,
				order: 20,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const debugService = accessor.get(IDebugService);
		debugService.removeWatchExpressions();
	}
});
