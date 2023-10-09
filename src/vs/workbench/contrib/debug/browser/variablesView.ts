/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { HighlightedLabel, IHighlight } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IAsyncDataTreeViewState } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeMouseEvent, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { coalesce } from 'vs/base/common/arrays';
import { RunOnceScheduler, timeout } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewAction, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { AbstractExpressionsRenderer, IExpressionTemplateData, IInputBoxOptions, renderVariable, renderViewTree } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_DEBUG_PROTOCOL_VARIABLE_MENU_CONTEXT, CONTEXT_VARIABLES_FOCUSED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_VARIABLE_IS_READONLY, IDataBreakpointInfoResponse, IDebugService, IExpression, IScope, IStackFrame, VARIABLES_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';
import { ErrorScope, Expression, getUriForDebugMemory, Scope, StackFrame, Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

const $ = dom.$;
let forgetScopes = true;

let variableInternalContext: Variable | undefined;
let dataBreakpointInfoResponse: IDataBreakpointInfoResponse | undefined;

interface IVariablesContext {
	sessionId: string | undefined;
	container: DebugProtocol.Variable | DebugProtocol.Scope | DebugProtocol.EvaluateArguments;
	variable: DebugProtocol.Variable;
}

export class VariablesView extends ViewPane {

	private updateTreeScheduler: RunOnceScheduler;
	private needsRefresh = false;
	private tree!: WorkbenchAsyncDataTree<IStackFrame | null, IExpression | IScope, FuzzyScore>;
	private savedViewState = new Map<string, IAsyncDataTreeViewState>();
	private autoExpandedScopes = new Set<string>();

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
		@ITelemetryService telemetryService: ITelemetryService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

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
		const linkeDetector = this.instantiationService.createInstance(LinkDetector);
		this.tree = <WorkbenchAsyncDataTree<IStackFrame | null, IExpression | IScope, FuzzyScore>>this.instantiationService.createInstance(WorkbenchAsyncDataTree, 'VariablesView', treeContainer, new VariablesDelegate(),
			[this.instantiationService.createInstance(VariablesRenderer, linkeDetector), new ScopesRenderer(), new ScopeErrorRenderer()],
			new VariablesDataSource(), {
			accessibilityProvider: new VariablesAccessibilityProvider(),
			identityProvider: { getId: (element: IExpression | IScope) => element.getId() },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e: IExpression | IScope) => e.name },
			overrideStyles: {
				listBackground: this.getBackgroundColor()
			}
		});

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
			if (variable instanceof Variable && !e?.settingWatch) {
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
		this.tree.domFocus();
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	private onMouseDblClick(e: ITreeMouseEvent<IExpression | IScope>): void {
		const session = this.debugService.getViewModel().focusedSession;
		if (session && e.element instanceof Variable && session.capabilities.supportsSetVariable && !e.element.presentationHint?.attributes?.includes('readOnly') && !e.element.presentationHint?.lazy) {
			this.debugService.getViewModel().setSelectedExpression(e.element, false);
		}
	}

	private async onContextMenu(e: ITreeContextMenuEvent<IExpression | IScope>): Promise<void> {
		const variable = e.element;
		if (!(variable instanceof Variable) || !variable.value) {
			return;
		}

		const toDispose = new DisposableStore();

		try {
			const contextKeyService = await getContextForVariableMenuWithDataAccess(this.contextKeyService, variable);
			const menu = toDispose.add(this.menuService.createMenu(MenuId.DebugVariablesContext, contextKeyService));

			const context: IVariablesContext = getVariablesContext(variable);
			const secondary: IAction[] = [];
			createAndFillInContextMenuActions(menu, { arg: context, shouldForwardArgs: false }, { primary: [], secondary }, 'inline');
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => secondary
			});
		} finally {
			toDispose.dispose();
		}
	}
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
		return getContextForVariableMenu(parentContext, variable);
	}

	const contextKeys: [string, unknown][] = [];
	dataBreakpointInfoResponse = await session.dataBreakpointInfo(variable.name, variable.parent.reference);
	const dataBreakpointId = dataBreakpointInfoResponse?.dataId;
	const dataBreakpointAccessTypes = dataBreakpointInfoResponse?.accessTypes;

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

	return getContextForVariableMenu(parentContext, variable, contextKeys);
}

/**
 * Gets a context key overlay that has context for the given variable.
 */
function getContextForVariableMenu(parentContext: IContextKeyService, variable: Variable, additionalContext: [string, unknown][] = []) {
	const session = variable.getSession();
	const contextKeys: [string, unknown][] = [
		[CONTEXT_DEBUG_PROTOCOL_VARIABLE_MENU_CONTEXT.key, variable.variableMenuContext || ''],
		[CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT.key, !!variable.evaluateName],
		[CONTEXT_CAN_VIEW_MEMORY.key, !!session?.capabilities.supportsReadMemoryRequest && variable.memoryReference !== undefined],
		[CONTEXT_VARIABLE_IS_READONLY.key, !!variable.presentationHint?.attributes?.includes('readOnly') || variable.presentationHint?.lazy],
		...additionalContext,
	];

	variableInternalContext = variable;

	return parentContext.createOverlay(contextKeys);
}

function isStackFrame(obj: any): obj is IStackFrame {
	return obj instanceof StackFrame;
}

class VariablesDataSource implements IAsyncDataSource<IStackFrame | null, IExpression | IScope> {

	hasChildren(element: IStackFrame | null | IExpression | IScope): boolean {
		if (!element) {
			return false;
		}
		if (isStackFrame(element)) {
			return true;
		}

		return element.hasChildren;
	}

	getChildren(element: IStackFrame | IExpression | IScope): Promise<(IExpression | IScope)[]> {
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
		// noop
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

export class VariablesRenderer extends AbstractExpressionsRenderer {

	static readonly ID = 'variable';

	constructor(
		private readonly linkDetector: LinkDetector,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IDebugService debugService: IDebugService,
		@IContextViewService contextViewService: IContextViewService,
	) {
		super(debugService, contextViewService);
	}

	get templateId(): string {
		return VariablesRenderer.ID;
	}

	protected renderExpression(expression: IExpression, data: IExpressionTemplateData, highlights: IHighlight[]): void {
		renderVariable(expression as Variable, data, true, highlights, this.linkDetector);
	}

	public override renderElement(node: ITreeNode<IExpression, FuzzyScore>, index: number, data: IExpressionTemplateData): void {
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

	protected override renderActionBar(actionBar: ActionBar, expression: IExpression) {
		const variable = expression as Variable;
		const contextKeyService = getContextForVariableMenu(this.contextKeyService, variable);
		const menu = this.menuService.createMenu(MenuId.DebugVariablesContext, contextKeyService);

		const primary: IAction[] = [];
		const context = getVariablesContext(variable);
		createAndFillInContextMenuActions(menu, { arg: context, shouldForwardArgs: false }, { primary, secondary: [] }, 'inline');

		actionBar.clear();
		actionBar.context = context;
		actionBar.push(primary, { icon: true, label: false });
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

export const COPY_VALUE_ID = 'workbench.debug.viewlet.action.copyValue';
CommandsRegistry.registerCommand({
	id: COPY_VALUE_ID,
	handler: async (accessor: ServicesAccessor, arg: Variable | Expression | IVariablesContext, ctx?: (Variable | Expression)[]) => {
		const debugService = accessor.get(IDebugService);
		const clipboardService = accessor.get(IClipboardService);
		let elementContext = '';
		let elements: (Variable | Expression)[];
		if (arg instanceof Variable || arg instanceof Expression) {
			elementContext = 'watch';
			elements = ctx ? ctx : [];
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

		const commandService = accessor.get(ICommandService);
		const editorService = accessor.get(IEditorService);
		const notifications = accessor.get(INotificationService);
		const progressService = accessor.get(IProgressService);
		const extensionService = accessor.get(IExtensionService);
		const telemetryService = accessor.get(ITelemetryService);

		const ext = await extensionService.getExtension(HEX_EDITOR_EXTENSION_ID);
		if (ext || await tryInstallHexEditor(notifications, progressService, extensionService, commandService)) {
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

function tryInstallHexEditor(notifications: INotificationService, progressService: IProgressService, extensionService: IExtensionService, commandService: ICommandService) {
	return new Promise<boolean>(resolve => {
		let installing = false;

		const handle = notifications.prompt(
			Severity.Info,
			localize("viewMemory.prompt", "Inspecting binary data requires the Hex Editor extension. Would you like to install it now?"), [
			{
				label: localize("cancel", "Cancel"),
				run: () => resolve(false),
			},
			{
				label: localize("install", "Install"),
				run: async () => {
					installing = true;
					try {
						await progressService.withProgress(
							{
								location: ProgressLocation.Notification,
								title: localize("viewMemory.install.progress", "Installing the Hex Editor..."),
							},
							async () => {
								await commandService.executeCommand('workbench.extensions.installExtension', HEX_EDITOR_EXTENSION_ID);
								// it seems like the extension is not registered immediately on install --
								// wait for it to appear before returning.
								while (!(await extensionService.getExtension(HEX_EDITOR_EXTENSION_ID))) {
									await timeout(30);
								}
							},
						);
						resolve(true);
					} catch (e) {
						notifications.error(e as Error);
						resolve(false);
					}
				}
			},
		],
			{ sticky: true },
		);

		handle.onDidClose(e => {
			if (!installing) {
				resolve(false);
			}
		});
	});
}

export const BREAK_WHEN_VALUE_CHANGES_ID = 'debug.breakWhenValueChanges';
CommandsRegistry.registerCommand({
	id: BREAK_WHEN_VALUE_CHANGES_ID,
	handler: async (accessor: ServicesAccessor) => {
		const debugService = accessor.get(IDebugService);
		if (dataBreakpointInfoResponse) {
			await debugService.addDataBreakpoint(dataBreakpointInfoResponse.description, dataBreakpointInfoResponse.dataId!, !!dataBreakpointInfoResponse.canPersist, dataBreakpointInfoResponse.accessTypes, 'write');
		}
	}
});

export const BREAK_WHEN_VALUE_IS_ACCESSED_ID = 'debug.breakWhenValueIsAccessed';
CommandsRegistry.registerCommand({
	id: BREAK_WHEN_VALUE_IS_ACCESSED_ID,
	handler: async (accessor: ServicesAccessor) => {
		const debugService = accessor.get(IDebugService);
		if (dataBreakpointInfoResponse) {
			await debugService.addDataBreakpoint(dataBreakpointInfoResponse.description, dataBreakpointInfoResponse.dataId!, !!dataBreakpointInfoResponse.canPersist, dataBreakpointInfoResponse.accessTypes, 'readWrite');
		}
	}
});

export const BREAK_WHEN_VALUE_IS_READ_ID = 'debug.breakWhenValueIsRead';
CommandsRegistry.registerCommand({
	id: BREAK_WHEN_VALUE_IS_READ_ID,
	handler: async (accessor: ServicesAccessor) => {
		const debugService = accessor.get(IDebugService);
		if (dataBreakpointInfoResponse) {
			await debugService.addDataBreakpoint(dataBreakpointInfoResponse.description, dataBreakpointInfoResponse.dataId!, !!dataBreakpointInfoResponse.canPersist, dataBreakpointInfoResponse.accessTypes, 'read');
		}
	}
});

export const COPY_EVALUATE_PATH_ID = 'debug.copyEvaluatePath';
CommandsRegistry.registerCommand({
	id: COPY_EVALUATE_PATH_ID,
	handler: async (accessor: ServicesAccessor, context: IVariablesContext) => {
		const clipboardService = accessor.get(IClipboardService);
		await clipboardService.writeText(context.variable.evaluateName!);
	}
});

export const ADD_TO_WATCH_ID = 'debug.addToWatchExpressions';
CommandsRegistry.registerCommand({
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
