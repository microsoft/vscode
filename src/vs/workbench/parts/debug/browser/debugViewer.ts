/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import paths = require('vs/base/common/paths');
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import { isMacintosh } from 'vs/base/common/platform';
import dom = require('vs/base/browser/dom');
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import labels = require('vs/base/common/labels');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import tree = require('vs/base/parts/tree/browser/tree');
import inputbox = require('vs/base/browser/ui/inputbox/inputBox');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import renderer = require('vs/base/parts/tree/browser/actionsRenderer');
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import viewmodel = require('vs/workbench/parts/debug/common/debugViewModel');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IMessageService } from 'vs/platform/message/common/message';

const $ = dom.emmet;
const booleanRegex = /^true|false$/i;
const stringRegex = /^(['"]).*\1$/;

export function renderExpressionValue(expressionOrValue: debug.IExpression|string, debugInactive: boolean, container: HTMLElement, showChanged: boolean): void {
	let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

	// remove stale classes
	container.className = 'value';
	// when resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || ((expressionOrValue instanceof model.Expression || expressionOrValue instanceof model.Variable) && !expressionOrValue.available)) {
		dom.addClass(container, 'unavailable');
		debugInactive ? dom.removeClass(container, 'error') : dom.addClass(container, 'error');
	} else if (!isNaN(+value)) {
		dom.addClass(container, 'number');
	} else if (booleanRegex.test(value)) {
		dom.addClass(container, 'boolean');
	} else if (stringRegex.test(value)) {
		dom.addClass(container, 'string');
	}

	if (showChanged && (<any>expressionOrValue).valueChanged) {
		// value changed color has priority over other colors.
		container.className = 'value changed';
	}
	container.textContent = value;
	container.title = value;
}

export function renderVariable(tree: tree.ITree, variable: model.Variable, data: IVariableTemplateData, debugInactive: boolean, showChanged: boolean): void {
	if (variable.available) {
		data.name.textContent = `${variable.name}:`;
	}

	if (variable.value) {
		renderExpressionValue(variable, debugInactive, data.value, showChanged);
	} else {
		data.value.textContent = '';
		data.value.title = '';
	}
}

function renderRenameBox(debugService: debug.IDebugService, contextViewService: IContextViewService, tree: tree.ITree, element: any, container: HTMLElement, placeholder: string): void {
	let inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
	let inputBox = new inputbox.InputBox(inputBoxContainer, contextViewService, {
		validationOptions: {
			validation: null,
			showMessage: false
		},
		placeholder: placeholder
	});

	inputBox.value = element.name ? element.name : '';
	inputBox.focus();

	let disposed = false;
	const toDispose: [lifecycle.IDisposable] = [inputBox];

	const wrapUp = async.once<any, void>((renamed: boolean) => {
		if (!disposed) {
			disposed = true;
			if (element instanceof model.Expression && renamed && inputBox.value) {
				debugService.renameWatchExpression(element.getId(), inputBox.value).done(null, errors.onUnexpectedError);
			} else if (element instanceof model.Expression && !element.name) {
				debugService.clearWatchExpressions(element.getId());
			} else if (element instanceof model.FunctionBreakpoint && renamed && inputBox.value) {
				debugService.renameFunctionBreakpoint(element.getId(), inputBox.value).done(null, errors.onUnexpectedError);
			} else if (element instanceof model.FunctionBreakpoint && !element.name) {
				debugService.removeFunctionBreakpoints(element.getId()).done(null, errors.onUnexpectedError);
			}

			tree.clearHighlight();
			tree.DOMFocus();
			// need to remove the input box since this template will be reused.
			container.removeChild(inputBoxContainer);
			lifecycle.disposeAll(toDispose);
		}
	});

	toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: dom.IKeyboardEvent) => {
		const isEscape = e.equals(CommonKeybindings.ESCAPE);
		const isEnter = e.equals(CommonKeybindings.ENTER);
		if (isEscape || isEnter) {
			wrapUp(isEnter);
		}
	}));
	toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
		wrapUp(true);
	}));
}

export class BaseDebugController extends treedefaults.DefaultController {

	constructor(protected debugService: debug.IDebugService, private contextMenuService: IContextMenuService, private actionProvider: renderer.IActionProvider, private focusOnContextMenu = true) {
		super();

		if (isMacintosh) {
			this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_BACKSPACE, this.onDelete.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(CommonKeybindings.DELETE, this.onDelete.bind(this));
			this.downKeyBindingDispatcher.set(CommonKeybindings.SHIFT_DELETE, this.onDelete.bind(this));
		}
	}

	public onContextMenu(tree: tree.ITree, element: debug.IEnablement, event: tree.ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		if (this.focusOnContextMenu) {
			tree.setFocus(element);
		}

		if (this.actionProvider.hasSecondaryActions(tree, element)) {
			const anchor = { x: event.posx + 1, y: event.posy };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this.actionProvider.getSecondaryActions(tree, element),
				onHide: (wasCancelled?: boolean) => {
					if (wasCancelled) {
						tree.DOMFocus();
					}
				},
				getActionsContext: () => element
			});

			return true;
		}

		return false;
	}

	protected onDelete(tree: tree.ITree, event: keyboard.StandardKeyboardEvent): boolean {
		return false;
	}
}

// call stack

export class CallStackDataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Model || element instanceof model.Thread;
	}

	public getChildren(tree: tree.ITree, element: any): Promise {
		if (element instanceof model.Thread) {
			return Promise.as((<model.Thread> element).callStack);
		}

		const threads = (<model.Model> element).getThreads();
		const threadsArray: debug.IThread[] = [];
		Object.keys(threads).forEach(threadId => {
			threadsArray.push(threads[threadId]);
		});

		if (threadsArray.length === 1) {
			return Promise.as(threadsArray[0].callStack);
		} else {
			return Promise.as(threadsArray);
		}
	}

	public getParent(tree: tree.ITree, element: any): Promise {
		return Promise.as(null);
	}
}

interface IThreadTemplateData {
	name: HTMLElement;
}

interface IStackFrameTemplateData {
	stackFrame: HTMLElement;
	label : HTMLElement;
	file : HTMLElement;
	fileName : HTMLElement;
	lineNumber : HTMLElement;
}

export class CallStackRenderer implements tree.IRenderer {

	private static THREAD_TEMPLATE_ID = 'thread';
	private static STACK_FRAME_TEMPLATE_ID = 'stackFrame';

	constructor(@IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getHeight(tree:tree.ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Thread) {
			return CallStackRenderer.THREAD_TEMPLATE_ID;
		}
		if (element instanceof model.StackFrame) {
			return CallStackRenderer.STACK_FRAME_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			let data: IThreadTemplateData = Object.create(null);
			data.name = dom.append(container, $('.thread'));

			return data;
		}

		let data: IStackFrameTemplateData = Object.create(null);
		data.stackFrame = dom.append(container, $('.stack-frame'));
		data.label = dom.append(data.stackFrame, $('span.label'));
		data.file = dom.append(data.stackFrame, $('.file'));
		data.fileName = dom.append(data.file, $('span.file-name'));
		data.lineNumber = dom.append(data.file, $('span.line-number'));

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			this.renderThread(element, templateData);
		} else {
			this.renderStackFrame(element, templateData);
		}
	}

	private renderThread(thread: debug.IThread, data: IThreadTemplateData): void {
		data.name.textContent = thread.name;
	}

	private renderStackFrame(stackFrame: debug.IStackFrame, data: IStackFrameTemplateData): void {
		stackFrame.source.available ? dom.removeClass(data.stackFrame, 'disabled') : dom.addClass(data.stackFrame, 'disabled');
		data.file.title = stackFrame.source.uri.fsPath;
		data.label.textContent = stackFrame.name;
		if (stackFrame.source.inMemory) {
			data.fileName.textContent = stackFrame.source.name;
		} else {
			data.fileName.textContent = labels.getPathLabel(paths.basename(stackFrame.source.uri.fsPath), this.contextService);
		}
		data.lineNumber.textContent = stackFrame.lineNumber !== undefined ? `${ stackFrame.lineNumber }` : '';
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

// variables

export class VariablesActionProvider implements renderer.IActionProvider {

	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		this.instantiationService = instantiationService;
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		return Promise.as([]);
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Variable;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): Promise {
		let actions: actions.Action[] = [];
		const variable = <model.Variable> element;
		actions.push(this.instantiationService.createInstance(debugactions.AddToWatchExpressionsAction, debugactions.AddToWatchExpressionsAction.ID, debugactions.AddToWatchExpressionsAction.LABEL, variable));
		if (variable.reference === 0) {
			actions.push(this.instantiationService.createInstance(debugactions.CopyValueAction, debugactions.CopyValueAction.ID, debugactions.CopyValueAction.LABEL, variable));
		}

		return Promise.as(actions);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

export class VariablesDataSource implements tree.IDataSource {

	constructor(private debugService: debug.IDebugService) {
		// noop
	}

	public getId(tree: tree.ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		if (element instanceof viewmodel.ViewModel || element instanceof model.Scope) {
			return true;
		}

		let variable = <model.Variable> element;
		return variable.reference !== 0 && !strings.equalsIgnoreCase(variable.value, 'null');
	}

	public getChildren(tree: tree.ITree, element: any): Promise {
		if (element instanceof viewmodel.ViewModel) {
			let focusedStackFrame = (<viewmodel.ViewModel> element).getFocusedStackFrame();
			return focusedStackFrame ? focusedStackFrame.getScopes(this.debugService) : Promise.as([]);
		}

		let scope = <model.Scope> element;
		return scope.getChildren(this.debugService);
	}

	public getParent(tree: tree.ITree, element: any): Promise {
		return Promise.as(null);
	}
}

interface IScopeTemplateData {
	name: HTMLElement;
}

export interface IVariableTemplateData {
	expression: HTMLElement;
	name: HTMLElement;
	value: HTMLElement;
}

export class VariablesRenderer implements tree.IRenderer {

	private static SCOPE_TEMPLATE_ID = 'scope';
	private static VARIABLE_TEMPLATE_ID = 'variable';

	constructor(@debug.IDebugService private debugService: debug.IDebugService) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Scope) {
			return VariablesRenderer.SCOPE_TEMPLATE_ID;
		}
		if (element instanceof model.Expression) {
			return VariablesRenderer.VARIABLE_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === VariablesRenderer.SCOPE_TEMPLATE_ID) {
			let data: IScopeTemplateData = Object.create(null);
			data.name = dom.append(container, $('.scope'));

			return data;
		}

		let data: IVariableTemplateData = Object.create(null);
		data.expression = dom.append(container, $(isMacintosh ? '.expression.mac' : '.expression.win-linux'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === VariablesRenderer.SCOPE_TEMPLATE_ID) {
			this.renderScope(element, templateData);
		} else {
			renderVariable(tree, element, templateData, this.debugService.getState() === debug.State.Inactive, true);
		}
	}

	private renderScope(scope: model.Scope, data: IScopeTemplateData): void {
		data.name.textContent = scope.name;
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

// watch expressions

export class WatchExpressionsActionProvider implements renderer.IActionProvider {

	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		this.instantiationService = instantiationService;
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Expression && element.name;
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return true;
	}

	public getActions(tree: tree.ITree, element: any): Promise {
		return Promise.as(this.getExpressionActions());
	}

	public getExpressionActions(): actions.IAction[] {
		return [this.instantiationService.createInstance(debugactions.RemoveWatchExpressionAction, debugactions.RemoveWatchExpressionAction.ID, debugactions.RemoveWatchExpressionAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): Promise {
		const actions: actions.Action[] = [];
		if (element instanceof model.Expression) {
			const expression = <model.Expression> element;
			actions.push(this.instantiationService.createInstance(debugactions.AddWatchExpressionAction, debugactions.AddWatchExpressionAction.ID, debugactions.AddWatchExpressionAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.RenameWatchExpressionAction, debugactions.RenameWatchExpressionAction.ID, debugactions.RenameWatchExpressionAction.LABEL, expression));
			if (expression.reference === 0) {
				actions.push(this.instantiationService.createInstance(debugactions.CopyValueAction, debugactions.CopyValueAction.ID, debugactions.CopyValueAction.LABEL, expression.value));
			}
			actions.push(new actionbar.Separator());

			actions.push(this.instantiationService.createInstance(debugactions.RemoveWatchExpressionAction, debugactions.RemoveWatchExpressionAction.ID, debugactions.RemoveWatchExpressionAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.RemoveAllWatchExpressionsAction, debugactions.RemoveAllWatchExpressionsAction.ID, debugactions.RemoveAllWatchExpressionsAction.LABEL));
		} else {
			actions.push(this.instantiationService.createInstance(debugactions.AddWatchExpressionAction, debugactions.AddWatchExpressionAction.ID, debugactions.AddWatchExpressionAction.LABEL));
			if (element instanceof model.Variable) {
				const variable = <model.Variable> element;
				if (variable.reference === 0) {
					actions.push(this.instantiationService.createInstance(debugactions.CopyValueAction, debugactions.CopyValueAction.ID, debugactions.CopyValueAction.LABEL, variable.value));
				}
				actions.push(new actionbar.Separator());
			}
			actions.push(this.instantiationService.createInstance(debugactions.RemoveAllWatchExpressionsAction, debugactions.RemoveAllWatchExpressionsAction.ID, debugactions.RemoveAllWatchExpressionsAction.LABEL));
		}

		return Promise.as(actions);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

export class WatchExpressionsDataSource implements tree.IDataSource {

	constructor(private debugService: debug.IDebugService) {
		// noop
	}

	public getId(tree: tree.ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		if (element instanceof model.Model) {
			return true;
		}

		const watchExpression = <model.Expression> element;
		return watchExpression.reference !== 0 && !strings.equalsIgnoreCase(watchExpression.value, 'null');
	}

	public getChildren(tree: tree.ITree, element: any): Promise {
		if (element instanceof model.Model) {
			return Promise.as((<model.Model> element).getWatchExpressions());
		}

		let expression = <model.Expression> element;
		return expression.getChildren(this.debugService);
	}

	public getParent(tree: tree.ITree, element: any): Promise {
		return Promise.as(null);
	}
}

interface IWatchExpressionTemplateData extends IVariableTemplateData {
	actionBar: actionbar.ActionBar;
}

export class WatchExpressionsRenderer implements tree.IRenderer {

	private static WATCH_EXPRESSION_TEMPLATE_ID = 'watchExpression';
	private static VARIABLE_TEMPLATE_ID = 'variables';
	private toDispose: lifecycle.IDisposable[];
	private actionProvider: WatchExpressionsActionProvider;

	constructor(actionProvider: renderer.IActionProvider, private actionRunner: actions.IActionRunner,
		@IMessageService private messageService: IMessageService,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		this.toDispose = [];
		this.actionProvider = <WatchExpressionsActionProvider> actionProvider;
	}

	public getHeight(tree:tree.ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Expression) {
			return WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID;
		}

		return WatchExpressionsRenderer.VARIABLE_TEMPLATE_ID;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		let data: IWatchExpressionTemplateData = Object.create(null);
		if (templateId === WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID) {
			data.actionBar = new actionbar.ActionBar(container, { actionRunner: this.actionRunner });
			data.actionBar.push(this.actionProvider.getExpressionActions() , { icon: true, label: false });
		}

		data.expression = dom.append(container, $(isMacintosh ? '.expression.mac' : '.expression.win-linux'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID) {
			this.renderWatchExpression(tree, element, templateData);
		} else {
			renderVariable(tree, element, templateData, this.debugService.getState() === debug.State.Inactive, true);
		}
	}

	private renderWatchExpression(tree: tree.ITree, watchExpression: debug.IExpression, data: IWatchExpressionTemplateData): void {
		let selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((selectedExpression instanceof model.Expression && selectedExpression.getId() === watchExpression.getId()) || (watchExpression instanceof model.Expression && !watchExpression.name)) {
			renderRenameBox(this.debugService, this.contextViewService, tree, watchExpression, data.expression, nls.localize('watchExpressionPlaceholder', "Expression to watch"));
		}
		data.actionBar.context = watchExpression;

		data.name.textContent = `${watchExpression.name}:`;
		if (watchExpression.value) {
			renderExpressionValue(watchExpression, this.debugService.getState() === debug.State.Inactive, data.value, true);
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}

export class WatchExpressionsController extends BaseDebugController {

	constructor(debugService: debug.IDebugService, contextMenuService: IContextMenuService, actionProvider: renderer.IActionProvider) {
		super(debugService, contextMenuService, actionProvider);

		if (isMacintosh) {
			this.downKeyBindingDispatcher.set(CommonKeybindings.ENTER, this.onRename.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(CommonKeybindings.F2, this.onRename.bind(this));
		}
	}

	/* protected */ public onLeftClick(tree: tree.ITree, element: any, event: mouse.StandardMouseEvent): boolean {
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof model.Expression && event.detail === 2) {
			const expression = <debug.IExpression> element;
			if (expression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(expression);
			}
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: tree.ITree, event: KeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Expression) {
			const watchExpression = <model.Expression> element;
			if (watchExpression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(watchExpression);
			}
			return true;
		}

		return false;
	}

	protected onDelete(tree: tree.ITree, event: keyboard.StandardKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Expression) {
			const we = <model.Expression> element;
			this.debugService.clearWatchExpressions(we.getId());

			return true;
		}

		return false;
	}
}

// breakpoints

export class BreakpointsActionProvider implements renderer.IActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Breakpoint;
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Breakpoint || element instanceof model.ExceptionBreakpoint || element instanceof model.FunctionBreakpoint;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		if (element instanceof model.Breakpoint) {
			return Promise.as(this.getBreakpointActions());
		}

		return Promise.as([]);
	}

	public getBreakpointActions(): actions.IAction[] {
		return [this.instantiationService.createInstance(debugactions.RemoveBreakpointAction, debugactions.RemoveBreakpointAction.ID, debugactions.RemoveBreakpointAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		const actions: actions.Action[] = [this.instantiationService.createInstance(debugactions.ToggleEnablementAction, debugactions.ToggleEnablementAction.ID, debugactions.ToggleEnablementAction.LABEL)];
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.RemoveBreakpointAction, debugactions.RemoveBreakpointAction.ID, debugactions.RemoveBreakpointAction.LABEL));
		actions.push(this.instantiationService.createInstance(debugactions.RemoveAllBreakpointsAction, debugactions.RemoveAllBreakpointsAction.ID, debugactions.RemoveAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.ToggleBreakpointsActivatedAction, debugactions.ToggleBreakpointsActivatedAction.ID, debugactions.ToggleBreakpointsActivatedAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.EnableAllBreakpointsAction, debugactions.EnableAllBreakpointsAction.ID, debugactions.EnableAllBreakpointsAction.LABEL));
		actions.push(this.instantiationService.createInstance(debugactions.DisableAllBreakpointsAction, debugactions.DisableAllBreakpointsAction.ID, debugactions.DisableAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		// actions.push(this.instantiationService.createInstance(debugactions.AddFunctionBreakpointAction, debugactions.AddFunctionBreakpointAction.ID, debugactions.AddFunctionBreakpointAction.LABEL));
		// actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.ReapplyBreakpointsAction, debugactions.ReapplyBreakpointsAction.ID, debugactions.ReapplyBreakpointsAction.LABEL));

		return Promise.as(actions);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

export class BreakpointsDataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Model;
	}

	public getChildren(tree: tree.ITree, element: any): Promise {
		const model = <model.Model> element;
		const exBreakpoints = <debug.IEnablement[]> model.getExceptionBreakpoints();

		return Promise.as(exBreakpoints.concat(model.getFunctionBreakpoints()).concat(model.getBreakpoints()));
	}

	public getParent(tree: tree.ITree, element: any): Promise {
		return Promise.as(null);
	}
}

interface IExceptionBreakpointTemplateData {
	breakpoint: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	toDisposeBeforeRender: lifecycle.IDisposable[];
}

interface IBreakpointTemplateData extends IExceptionBreakpointTemplateData {
	actionBar: actionbar.ActionBar;
	lineNumber: HTMLElement;
	filePath: HTMLElement;
}

interface IFunctionBreakpointTemplateData extends IExceptionBreakpointTemplateData {
	actionBar: actionbar.ActionBar;
}

export class BreakpointsRenderer implements tree.IRenderer {

	private static EXCEPTION_BREAKPOINT_TEMPLATE_ID = 'exceptionBreakpoint';
	private static FUNCTION_BREAKPOINT_TEMPLATE_ID = 'functionBreakpoint';
	private static BREAKPOINT_TEMPLATE_ID = 'breakpoint';

	constructor(
		private actionProvider: BreakpointsActionProvider,
		private actionRunner: actions.IActionRunner,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		// noop
	}

	public getHeight(tree:tree.ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Breakpoint) {
			return BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID;
		}
		if (element instanceof model.FunctionBreakpoint) {
			return BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID;
		}
		if (element instanceof model.ExceptionBreakpoint) {
			return BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		const data: IBreakpointTemplateData = Object.create(null);
		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID || templateId === BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID) {
			data.actionBar = new actionbar.ActionBar(container, { actionRunner: this.actionRunner });
			data.actionBar.push(this.actionProvider.getBreakpointActions(), { icon: true, label: false });
		}

		data.breakpoint = dom.append(container, $('.breakpoint'));
		data.toDisposeBeforeRender = [];

		data.checkbox = <HTMLInputElement> $('input');
		data.checkbox.type = 'checkbox';
		data.checkbox.className = 'checkbox';
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
			data.lineNumber = dom.append(data.breakpoint, $('span.line-number'));
			data.filePath = dom.append(data.breakpoint, $('span.file-path'));
		}

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		templateData.toDisposeBeforeRender = lifecycle.disposeAll(templateData.toDisposeBeforeRender);
		templateData.toDisposeBeforeRender.push(dom.addStandardDisposableListener(templateData.checkbox, 'change', (e) => {
			this.debugService.toggleEnablement(element);
		}));

		if (templateId === BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID) {
			this.renderExceptionBreakpoint(element, templateData);
		} else if (templateId === BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID) {
			this.renderFunctionBreakpoint(tree, element, templateData);
		} else {
			this.renderBreakpoint(tree, element, templateData);
		}
	}

	private renderExceptionBreakpoint(exceptionBreakpoint: debug.IExceptionBreakpoint, data: IExceptionBreakpointTemplateData): void {
		const namePascalCase = exceptionBreakpoint.name.charAt(0).toUpperCase() + exceptionBreakpoint.name.slice(1);
		data.name.textContent = `${ namePascalCase} exceptions`;
		data.checkbox.checked = exceptionBreakpoint.enabled;
	}

	private renderFunctionBreakpoint(tree: tree.ITree, functionBreakpoint: debug.IFunctionBreakpoint, data: IFunctionBreakpointTemplateData): void {
		if (!functionBreakpoint.name) {
			renderRenameBox(this.debugService, this.contextViewService, tree, functionBreakpoint, data.breakpoint, nls.localize('functionBreakpointPlaceholder', "Function to break on"));
		} else {
			this.debugService.getModel().areBreakpointsActivated() ? tree.removeTraits('disabled', [functionBreakpoint]) : tree.addTraits('disabled', [functionBreakpoint]);
			data.name.textContent = functionBreakpoint.name;
			data.checkbox.checked = functionBreakpoint.enabled;
		}
		data.actionBar.context = functionBreakpoint;
	}

	private renderBreakpoint(tree: tree.ITree, breakpoint: debug.IBreakpoint, data: IBreakpointTemplateData): void {
		this.debugService.getModel().areBreakpointsActivated() ? tree.removeTraits('disabled', [breakpoint]) : tree.addTraits('disabled', [breakpoint]);

		data.name.textContent = labels.getPathLabel(paths.basename(breakpoint.source.uri.fsPath), this.contextService);
		data.lineNumber.textContent = breakpoint.desiredLineNumber !== breakpoint.lineNumber ? breakpoint.desiredLineNumber + ' \u2192 ' + breakpoint.lineNumber : '' + breakpoint.lineNumber;
		data.filePath.textContent = labels.getPathLabel(paths.dirname(breakpoint.source.uri.fsPath), this.contextService);
		data.checkbox.checked = breakpoint.enabled;
		data.actionBar.context = breakpoint;
		if (breakpoint.condition) {
			data.breakpoint.title = breakpoint.condition;
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID || templateId === BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID) {
			templateData.actionBar.dispose();
		}
	}
}

export class BreakpointsController extends BaseDebugController {

	/* protected */ public onLeftClick(tree:tree.ITree, element: any, eventish:treedefaults.ICancelableEvent, origin: string = 'mouse'):boolean {
		if (element instanceof model.ExceptionBreakpoint) {
			return false;
		}

		return super.onLeftClick(tree, element, eventish, origin);
	}

	/* protected */ public onUp(tree:tree.ITree, event:keyboard.StandardKeyboardEvent): boolean {
		return this.doNotFocusExceptionBreakpoint(tree, super.onUp(tree, event));
	}

	/* protected */ public onPageUp(tree:tree.ITree, event:keyboard.StandardKeyboardEvent): boolean {
		return this.doNotFocusExceptionBreakpoint(tree, super.onPageUp(tree, event));
	}

	private doNotFocusExceptionBreakpoint(tree: tree.ITree, upSucceeded: boolean) : boolean {
		if (upSucceeded) {
			const focus = tree.getFocus();
			if (focus instanceof model.ExceptionBreakpoint) {
				tree.focusNth(2);
			}
		}

		return upSucceeded;
	}

	protected onDelete(tree: tree.ITree, event: keyboard.StandardKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Breakpoint) {
			const bp = <model.Breakpoint> element;
			this.debugService.toggleBreakpoint({ uri: bp.source.uri, lineNumber: bp.lineNumber }).done(null, errors.onUnexpectedError);

			return true;
		} else if (element instanceof model.FunctionBreakpoint) {
			const fbp = <model.FunctionBreakpoint> element;
			this.debugService.removeFunctionBreakpoints(fbp.getId()).done(null, errors.onUnexpectedError);

			return true;
		}

		return false;
	}
}
