/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HighlightedLabel, IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { AsyncDataTree, IAsyncDataTreeViewState } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { ITreeContextMenuEvent, ITreeMouseEvent, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { FuzzyScore, createMatches } from '../../../../base/common/filters.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, DebugVisualizationType, IDebugService, IDebugViewWithVariables, IExpression, IScope, IStackFrame, IViewModel, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from '../common/debug.js';
import { getContextForVariable } from '../common/debugContext.js';
import { ErrorScope, Expression, Scope, StackFrame, Variable, VisualizedExpression, getUriForDebugMemory } from '../common/debugModel.js';
import { DebugVisualizer, IDebugVisualizerService } from '../common/debugVisualizers.js';
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, IExpressionTemplateData, IInputBoxOptions, renderViewTree } from './baseDebugView.js';
import { ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_VALUE_ID, COPY_VALUE_LABEL, setDataBreakpointInfoResponse } from './debugCommands.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';

const $ = dom.$;
let forgetScopes = true;

let variableInternalContext: Variable | undefined;

interface IVariablesContext {
	sessionId: string | undefined;
	container: DebugProtocol.Variable | DebugProtocol.Scope | DebugProtocol.EvaluateArguments;
	variable: DebugProtocol.Variable;
}

export class VariablesView extends ViewPane implements IDebugViewWithVariables {

	private updateTreeScheduler: RunOnceScheduler;
	private needsRefresh = false;
	private tree!: WorkbenchAsyncDataTree<IStackFrame | null, IExpression | IScope, FuzzyScore>;
	private savedViewState = new Map<string, IAsyncDataTreeViewState>();
	private autoExpandedScopes = new Set<string>();

	public get treeSelection() {
		return this.tree.getSelection();
	}

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Use scheduler to prevent unnecessary flashing
		this.updateTreeScheduler = new RunOnceScheduler(async () => {
			const stackFrame = this.debugService.getViewModel().focusedStackFrame;

			this.needsRefresh = false;
			const input = this.tree.getInput();
			if (input) {
				this.savedViewState.set(input.getId(), this.tree.getViewState());
			}
			if (!stackFrame) {
				await this.tree.setInput(null);
				return;
			}

			const viewState = this.savedViewState.get(stackFrame.getId());
			await this.tree.setInput(stackFrame, viewState);

			// Automatically expand the first non-expensive scope
			const scopes = await stackFrame.getScopes();
			const toExpand = scopes.find(s => !s.expensive);

			// A race condition could be present causing the scopes here to be different from the scopes that the tree just retrieved.
			// If that happened, don't try to reveal anything, it will be straightened out on the next update
			if (toExpand && this.tree.hasNode(toExpand)) {
				this.autoExpandedScopes.add(toExpand.getId());
				await this.tree.expand(toExpand);
			}
		}, 400);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.element.classList.add('debug-pane');
		container.classList.add('debug-variables');
		const treeContainer = renderViewTree(container);
		const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree<IStackFrame | null, IExpression | IScope, FuzzyScore>, 'VariablesView', treeContainer, new VariablesDelegate(),
			[
				this.instantiationService.createInstance(VariablesRenderer, expressionRenderer),
				this.instantiationService.createInstance(VisualizedVariableRenderer, expressionRenderer),
				new ScopesRenderer(),
				new ScopeErrorRenderer(),
			],
			this.instantiationService.createInstance(VariablesDataSource), {
			accessibilityProvider: new VariablesAccessibilityProvider(),
			identityProvider: { getId: (element: IExpression | IScope) => element.getId() },
			keyboardNavigationLabelProvider: expressionAndScopeLabelProvider,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles
		});

		this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
		this.tree.setInput(this.debugService.getViewModel().focusedStackFrame ?? null);

		CONTEXT_VARIABLES_FOCUSED.bindTo(this.tree.contextKeyService);

		this._register(this.debugService.getViewModel().onDidFocusStackFrame(sf => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			// Refresh the tree immediately if the user explictly changed stack frames.
			// Otherwise postpone the refresh until user stops stepping.
			const timeout = sf.explicit ? 0 : undefined;
			this.updateTreeScheduler.schedule(timeout);
		}));
		this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
			const stackFrame = this.debugService.getViewModel().focusedStackFrame;
			if (stackFrame && forgetScopes) {
				stackFrame.forgetScopes();
			}
			forgetScopes = true;
			this.tree.updateChildren();
		}));
		this._register(this.tree);
		this._register(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));
		this._register(this.tree.onContextMenu(async e => await this.onContextMenu(e)));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.updateTreeScheduler.schedule();
			}
		}));
		let horizontalScrolling: boolean | undefined;
		this._register(this.debugService.getViewModel().onDidSelectExpression(e => {
			const variable = e?.expression;
			if (variable && this.tree.hasNode(variable)) {
				horizontalScrolling = this.tree.options.horizontalScrolling;
				if (horizontalScrolling) {
					this.tree.updateOptions({ horizontalScrolling: false });
				}

				this.tree.rerender(variable);
			} else if (!e && horizontalScrolling !== undefined) {
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
		this._register(this.debugService.onDidEndSession(() => {
			this.savedViewState.clear();
			this.autoExpandedScopes.clear();
		}));
	}

	protected override layoutBody(width: number, height: number): void {
		super.layoutBody(height, width);
		this.tree.layout(width, height);
	}

	override focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	private onMouseDblClick(e: ITreeMouseEvent<IExpression | IScope>): void {
		if (this.canSetExpressionValue(e.element)) {
			this.debugService.getViewModel().setSelectedExpression(e.element, false);
		}
	}

	private canSetExpressionValue(e: IExpression | IScope | null): e is IExpression {
		const session = this.debugService.getViewModel().focusedSession;
		if (!session) {
			return false;
		}

		if (e instanceof VisualizedExpression) {
			return !!e.treeItem.canEdit;
		}

		if (!session.capabilities?.supportsSetVariable && !session.capabilities?.supportsSetExpression) {
			return false;
		}

		return e instanceof Variable && !e.presentationHint?.attributes?.includes('readOnly') && !e.presentationHint?.lazy;
	}

	private async onContextMenu(e: ITreeContextMenuEvent<IExpression | IScope>): Promise<void> {
		const variable = e.element;
		if (!(variable instanceof Variable) || !variable.value) {
			return;
		}

		return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugVariablesContext, e);
	}
}

export async function openContextMenuForVariableTreeElement(parentContextKeyService: IContextKeyService, menuService: IMenuService, contextMenuService: IContextMenuService, menuId: MenuId, e: ITreeContextMenuEvent<IExpression | IScope>) {
	const variable = e.element;
	if (!(variable instanceof Variable) || !variable.value) {
		return;
	}

	const contextKeyService = await getContextForVariableMenuWithDataAccess(parentContextKeyService, variable);
	const context: IVariablesContext = getVariablesContext(variable);
	const menu = menuService.getMenuActions(menuId, contextKeyService, { arg: context, shouldForwardArgs: false });

	const { secondary } = getContextMenuActions(menu, 'inline');
	contextMenuService.showContextMenu({
		getAnchor: () => e.anchor,
		getActions: () => secondary
	});
}

const getVariablesContext = (variable: Variable): IVariablesContext => ({
	sessionId: variable.getSession()?.getId(),
	container: variable.parent instanceof Expression
		? { expression: variable.parent.name }
		: (variable.parent as (Variable | Scope)).toDebugProtocolObject(),
	variable: variable.toDebugProtocolObject()
});

/**
 * Gets a context key overlay that has context for the given variable, including data access info.
 */
async function getContextForVariableMenuWithDataAccess(parentContext: IContextKeyService, variable: Variable) {
	const session = variable.getSession();
	if (!session || !session.capabilities.supportsDataBreakpoints) {
		return getContextForVariableMenuBase(parentContext, variable);
	}

	const contextKeys: [string, unknown][] = [];
	const dataBreakpointInfoResponse = await session.dataBreakpointInfo(variable.name, variable.parent.reference);
	const dataBreakpointId = dataBreakpointInfoResponse?.dataId;
	const dataBreakpointAccessTypes = dataBreakpointInfoResponse?.accessTypes;
	setDataBreakpointInfoResponse(dataBreakpointInfoResponse);

	if (!dataBreakpointAccessTypes) {
		contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
	} else {
		for (const accessType of dataBreakpointAccessTypes) {
			switch (accessType) {
				case 'read':
					contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED.key, !!dataBreakpointId]);
					break;
				case 'write':
					contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
					break;
				case 'readWrite':
					contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED.key, !!dataBreakpointId]);
					break;
			}
		}
	}

	return getContextForVariableMenuBase(parentContext, variable, contextKeys);
}

/**
 * Gets a context key overlay that has context for the given variable.
 */
function getContextForVariableMenuBase(parentContext: IContextKeyService, variable: Variable, additionalContext: [string, unknown][] = []) {
	variableInternalContext = variable;
	return getContextForVariable(parentContext, variable, additionalContext);
}

function isStackFrame(obj: any): obj is IStackFrame {
	return obj instanceof StackFrame;
}

class VariablesDataSource extends AbstractExpressionDataSource<IStackFrame | null, IExpression | IScope> {

	public override hasChildren(element: IStackFrame | null | IExpression | IScope): boolean {
		if (!element) {
			return false;
		}
		if (isStackFrame(element)) {
			return true;
		}

		return element.hasChildren;
	}

	protected override doGetChildren(element: IStackFrame | IExpression | IScope): Promise<(IExpression | IScope)[]> {
		if (isStackFrame(element)) {
			return element.getScopes();
		}

		return element.getChildren();
	}
}

interface IScopeTemplateData {
	name: HTMLElement;
	label: HighlightedLabel;
}

class VariablesDelegate implements IListVirtualDelegate<IExpression | IScope> {

	getHeight(element: IExpression | IScope): number {
		return 22;
	}

	getTemplateId(element: IExpression | IScope): string {
		if (element instanceof ErrorScope) {
			return ScopeErrorRenderer.ID;
		}

		if (element instanceof Scope) {
			return ScopesRenderer.ID;
		}

		if (element instanceof VisualizedExpression) {
			return VisualizedVariableRenderer.ID;
		}

		return VariablesRenderer.ID;
	}
}

class ScopesRenderer implements ITreeRenderer<IScope, FuzzyScore, IScopeTemplateData> {

	static readonly ID = 'scope';

	get templateId(): string {
		return ScopesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IScopeTemplateData {
		const name = dom.append(container, $('.scope'));
		const label = new HighlightedLabel(name);

		return { name, label };
	}

	renderElement(element: ITreeNode<IScope, FuzzyScore>, index: number, templateData: IScopeTemplateData): void {
		templateData.label.set(element.element.name, createMatches(element.filterData));
	}

	disposeTemplate(templateData: IScopeTemplateData): void {
		templateData.label.dispose();
	}
}

interface IScopeErrorTemplateData {
	error: HTMLElement;
}

class ScopeErrorRenderer implements ITreeRenderer<IScope, FuzzyScore, IScopeErrorTemplateData> {

	static readonly ID = 'scopeError';

	get templateId(): string {
		return ScopeErrorRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IScopeErrorTemplateData {
		const wrapper = dom.append(container, $('.scope'));
		const error = dom.append(wrapper, $('.error'));
		return { error };
	}

	renderElement(element: ITreeNode<IScope, FuzzyScore>, index: number, templateData: IScopeErrorTemplateData): void {
		templateData.error.innerText = element.element.name;
	}

	disposeTemplate(): void {
		// noop
	}
}

export class VisualizedVariableRenderer extends AbstractExpressionsRenderer {
	public static readonly ID = 'viz';

	/**
	 * Registers a helper that rerenders the tree when visualization is requested
	 * or cancelled./
	 */
	public static rendererOnVisualizationRange(model: IViewModel, tree: AsyncDataTree<any, any, any>): IDisposable {
		return model.onDidChangeVisualization(({ original }) => {
			if (!tree.hasNode(original)) {
				return;
			}

			const parent: IExpression = tree.getParentElement(original);
			tree.updateChildren(parent, false, false);
		});

	}

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(debugService, contextViewService, hoverService);
	}

	public override get templateId(): string {
		return VisualizedVariableRenderer.ID;
	}

	public override renderElement(node: ITreeNode<IExpression, FuzzyScore>, index: number, data: IExpressionTemplateData): void {
		data.elementDisposable.clear();
		super.renderExpressionElement(node.element, node, data);
	}

	protected override renderExpression(expression: IExpression, data: IExpressionTemplateData, highlights: IHighlight[]): void {
		const viz = expression as VisualizedExpression;

		let text = viz.name;
		if (viz.value && typeof viz.name === 'string') {
			text += ':';
		}
		data.label.set(text, highlights, viz.name);
		data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, viz, {
			showChanged: false,
			maxValueLength: 1024,
			colorize: true,
			session: expression.getSession(),
		}));
	}

	protected override getInputBoxOptions(expression: IExpression): IInputBoxOptions | undefined {
		const viz = <VisualizedExpression>expression;
		return {
			initialValue: expression.value,
			ariaLabel: localize('variableValueAriaLabel', "Type new variable value"),
			validationOptions: {
				validation: () => viz.errorMessage ? ({ content: viz.errorMessage }) : null
			},
			onFinish: (value: string, success: boolean) => {
				viz.errorMessage = undefined;
				if (success) {
					viz.edit(value).then(() => {
						// Do not refresh scopes due to a node limitation #15520
						forgetScopes = false;
						this.debugService.getViewModel().updateViews();
					});
				}
			}
		};
	}

	protected override renderActionBar(actionBar: ActionBar, expression: IExpression, _data: IExpressionTemplateData) {
		const viz = expression as VisualizedExpression;
		const contextKeyService = viz.original ? getContextForVariableMenuBase(this.contextKeyService, viz.original) : this.contextKeyService;
		const context = viz.original ? getVariablesContext(viz.original) : undefined;
		const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });

		const { primary } = getContextMenuActions(menu, 'inline');

		if (viz.original) {
			const action = toAction({
				id: 'debugViz', label: localize('removeVisualizer', 'Remove Visualizer'), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.debugService.getViewModel().setVisualizedExpression(viz.original!, undefined)
			});
			action.checked = true;
			primary.push(action);
			actionBar.domNode.style.display = 'initial';
		}
		actionBar.clear();
		actionBar.context = context;
		actionBar.push(primary, { icon: true, label: false });
	}
}

export class VariablesRenderer extends AbstractExpressionsRenderer {

	static readonly ID = 'variable';

	constructor(
		private readonly expressionRenderer: DebugExpressionRenderer,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IDebugVisualizerService private readonly visualization: IDebugVisualizerService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
	) {
		super(debugService, contextViewService, hoverService);
	}

	get templateId(): string {
		return VariablesRenderer.ID;
	}

	protected renderExpression(expression: IExpression, data: IExpressionTemplateData, highlights: IHighlight[]): void {
		data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression as Variable, {
			highlights,
			showChanged: true,
		}));
	}

	public override renderElement(node: ITreeNode<IExpression, FuzzyScore>, index: number, data: IExpressionTemplateData): void {
		data.elementDisposable.clear();
		super.renderExpressionElement(node.element, node, data);
	}

	protected getInputBoxOptions(expression: IExpression): IInputBoxOptions {
		const variable = <Variable>expression;
		return {
			initialValue: expression.value,
			ariaLabel: localize('variableValueAriaLabel', "Type new variable value"),
			validationOptions: {
				validation: () => variable.errorMessage ? ({ content: variable.errorMessage }) : null
			},
			onFinish: (value: string, success: boolean) => {
				variable.errorMessage = undefined;
				const focusedStackFrame = this.debugService.getViewModel().focusedStackFrame;
				if (success && variable.value !== value && focusedStackFrame) {
					variable.setVariable(value, focusedStackFrame)
						// Need to force watch expressions and variables to update since a variable change can have an effect on both
						.then(() => {
							// Do not refresh scopes due to a node limitation #15520
							forgetScopes = false;
							this.debugService.getViewModel().updateViews();
						});
				}
			}
		};
	}

	protected override renderActionBar(actionBar: ActionBar, expression: IExpression, data: IExpressionTemplateData) {
		const variable = expression as Variable;
		const contextKeyService = getContextForVariableMenuBase(this.contextKeyService, variable);

		const context = getVariablesContext(variable);
		const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
		const { primary } = getContextMenuActions(menu, 'inline');

		actionBar.clear();
		actionBar.context = context;
		actionBar.push(primary, { icon: true, label: false });

		const cts = new CancellationTokenSource();
		data.elementDisposable.add(toDisposable(() => cts.dispose(true)));
		this.visualization.getApplicableFor(expression, cts.token).then(result => {
			data.elementDisposable.add(result);

			const originalExpression = (expression instanceof VisualizedExpression && expression.original) || expression;
			const actions = result.object.map(v => toAction({ id: 'debugViz', label: v.name, class: v.iconClass || 'debug-viz-icon', run: this.useVisualizer(v, originalExpression, cts.token) }));
			if (actions.length === 0) {
				// no-op
			} else if (actions.length === 1) {
				actionBar.push(actions[0], { icon: true, label: false });
			} else {
				actionBar.push(toAction({ id: 'debugViz', label: localize('useVisualizer', 'Visualize Variable...'), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.pickVisualizer(actions, originalExpression, data) }), { icon: true, label: false });
			}
		});
	}

	private pickVisualizer(actions: IAction[], expression: IExpression, data: IExpressionTemplateData) {
		this.contextMenuService.showContextMenu({
			getAnchor: () => data.actionBar!.getContainer(),
			getActions: () => actions,
		});
	}

	private useVisualizer(viz: DebugVisualizer, expression: IExpression, token: CancellationToken) {
		return async () => {
			const resolved = await viz.resolve(token);
			if (token.isCancellationRequested) {
				return;
			}

			if (resolved.type === DebugVisualizationType.Command) {
				viz.execute();
			} else {
				const replacement = await this.visualization.getVisualizedNodeFor(resolved.id, expression);
				if (replacement) {
					this.debugService.getViewModel().setVisualizedExpression(expression, replacement);
				}
			}
		};
	}
}

class VariablesAccessibilityProvider implements IListAccessibilityProvider<IExpression | IScope> {

	getWidgetAriaLabel(): string {
		return localize('variablesAriaTreeLabel', "Debug Variables");
	}

	getAriaLabel(element: IExpression | IScope): string | null {
		if (element instanceof Scope) {
			return localize('variableScopeAriaLabel', "Scope {0}", element.name);
		}
		if (element instanceof Variable) {
			return localize({ key: 'variableAriaLabel', comment: ['Placeholders are variable name and variable value respectivly. They should not be translated.'] }, "{0}, value {1}", element.name, element.value);
		}

		return null;
	}
}

export const SET_VARIABLE_ID = 'debug.setVariable';
CommandsRegistry.registerCommand({
	id: SET_VARIABLE_ID,
	handler: (accessor: ServicesAccessor) => {
		const debugService = accessor.get(IDebugService);
		debugService.getViewModel().setSelectedExpression(variableInternalContext, false);
	}
});

CommandsRegistry.registerCommand({
	metadata: {
		description: COPY_VALUE_LABEL,
	},
	id: COPY_VALUE_ID,
	handler: async (accessor: ServicesAccessor, arg: Variable | Expression | IVariablesContext | undefined, ctx?: (Variable | Expression)[]) => {
		const debugService = accessor.get(IDebugService);
		const clipboardService = accessor.get(IClipboardService);
		let elementContext = '';
		let elements: (Variable | Expression)[];
		if (!arg) {
			const viewService = accessor.get(IViewsService);
			const focusedView = viewService.getFocusedView();
			let view: IDebugViewWithVariables | null | undefined;
			if (focusedView?.id === WATCH_VIEW_ID) {
				view = viewService.getActiveViewWithId<IDebugViewWithVariables>(WATCH_VIEW_ID);
				elementContext = 'watch';
			} else if (focusedView?.id === VARIABLES_VIEW_ID) {
				view = viewService.getActiveViewWithId<IDebugViewWithVariables>(VARIABLES_VIEW_ID);
				elementContext = 'variables';
			}
			if (!view) {
				return;
			}
			elements = view.treeSelection.filter(e => e instanceof Expression || e instanceof Variable);
		} else if (arg instanceof Variable || arg instanceof Expression) {
			elementContext = 'watch';
			elements = [arg];
		} else {
			elementContext = 'variables';
			elements = variableInternalContext ? [variableInternalContext] : [];
		}

		const stackFrame = debugService.getViewModel().focusedStackFrame;
		const session = debugService.getViewModel().focusedSession;
		if (!stackFrame || !session || elements.length === 0) {
			return;
		}

		const evalContext = session.capabilities.supportsClipboardContext ? 'clipboard' : elementContext;
		const toEvaluate = elements.map(element => element instanceof Variable ? (element.evaluateName || element.value) : element.name);

		try {
			const evaluations = await Promise.all(toEvaluate.map(expr => session.evaluate(expr, stackFrame.frameId, evalContext)));
			const result = coalesce(evaluations).map(evaluation => evaluation.body.result);
			if (result.length) {
				clipboardService.writeText(result.join('\n'));
			}
		} catch (e) {
			const result = elements.map(element => element.value);
			clipboardService.writeText(result.join('\n'));
		}
	}
});

export const VIEW_MEMORY_ID = 'workbench.debug.viewlet.action.viewMemory';

const HEX_EDITOR_EXTENSION_ID = 'ms-vscode.hexeditor';
const HEX_EDITOR_EDITOR_ID = 'hexEditor.hexedit';

CommandsRegistry.registerCommand({
	id: VIEW_MEMORY_ID,
	handler: async (accessor: ServicesAccessor, arg: IVariablesContext | IExpression, ctx?: (Variable | Expression)[]) => {
		const debugService = accessor.get(IDebugService);
		let sessionId: string;
		let memoryReference: string;
		if ('sessionId' in arg) { // IVariablesContext
			if (!arg.sessionId || !arg.variable.memoryReference) {
				return;
			}
			sessionId = arg.sessionId;
			memoryReference = arg.variable.memoryReference;
		} else { // IExpression
			if (!arg.memoryReference) {
				return;
			}
			const focused = debugService.getViewModel().focusedSession;
			if (!focused) {
				return;
			}

			sessionId = focused.getId();
			memoryReference = arg.memoryReference;
		}

		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const extensionService = accessor.get(IExtensionService);
		const telemetryService = accessor.get(ITelemetryService);

		const ext = await extensionService.getExtension(HEX_EDITOR_EXTENSION_ID);
		if (ext || await tryInstallHexEditor(extensionsWorkbenchService, notificationService)) {
			/* __GDPR__
				"debug/didViewMemory" : {
					"owner": "connor4312",
					"debugType" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			telemetryService.publicLog('debug/didViewMemory', {
				debugType: debugService.getModel().getSession(sessionId)?.configuration.type,
			});

			await editorService.openEditor({
				resource: getUriForDebugMemory(sessionId, memoryReference),
				options: {
					revealIfOpened: true,
					override: HEX_EDITOR_EDITOR_ID,
				},
			}, SIDE_GROUP);
		}
	}
});

async function tryInstallHexEditor(extensionsWorkbenchService: IExtensionsWorkbenchService, notificationService: INotificationService): Promise<boolean> {
	try {
		await extensionsWorkbenchService.install(HEX_EDITOR_EXTENSION_ID, {
			justification: localize("viewMemory.prompt", "Inspecting binary data requires this extension."),
			enable: true
		}, ProgressLocation.Notification);
		return true;
	} catch (error) {
		notificationService.error(error);
		return false;
	}
}

CommandsRegistry.registerCommand({
	metadata: {
		description: COPY_EVALUATE_PATH_LABEL,
	},
	id: COPY_EVALUATE_PATH_ID,
	handler: async (accessor: ServicesAccessor, context: IVariablesContext | Variable) => {
		const clipboardService = accessor.get(IClipboardService);
		if (context instanceof Variable) {
			await clipboardService.writeText(context.evaluateName!);
		} else {
			await clipboardService.writeText(context.variable.evaluateName!);
		}
	}
});

CommandsRegistry.registerCommand({
	metadata: {
		description: ADD_TO_WATCH_LABEL,
	},
	id: ADD_TO_WATCH_ID,
	handler: async (accessor: ServicesAccessor, context: IVariablesContext) => {
		const debugService = accessor.get(IDebugService);
		debugService.addWatchExpression(context.variable.evaluateName);
	}
});

registerAction2(class extends ViewAction<VariablesView> {
	constructor() {
		super({
			id: 'variables.collapse',
			viewId: VARIABLES_VIEW_ID,
			title: localize('collapse', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', VARIABLES_VIEW_ID)
			}
		});
	}

	runInView(_accessor: ServicesAccessor, view: VariablesView) {
		view.collapseAll();
	}
});
