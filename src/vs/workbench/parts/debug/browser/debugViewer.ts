/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import paths = require('vs/base/common/paths');
import async = require('vs/base/common/async');
import severity from 'vs/base/common/severity';
import strings = require('vs/base/common/strings');
import { isMacintosh } from 'vs/base/common/platform';
import dom = require('vs/base/browser/dom');
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import labels = require('vs/base/common/labels');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import tree = require('vs/base/parts/tree/common/tree');
import inputbox = require('vs/base/browser/ui/inputbox/inputBox');
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import renderer = require('vs/base/parts/tree/browser/actionsRenderer');
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import viewmodel = require('vs/workbench/parts/debug/common/debugViewModel');
import dbgactions = require('vs/workbench/parts/debug/browser/debugActions');
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IMessageService } from 'vs/platform/message/common/message';
import { CommonKeybindings } from 'vs/base/common/keyCodes';

var $ = dom.emmet;
var booleanRegex = /^true|false$/i;
var stringRegex = /^(['"]).*\1$/;

export function renderExpressionValue(tree: tree.ITree, arg2: debug.IExpression|string, debugInactive: boolean, container: HTMLElement): void {
	let value = typeof arg2 === 'string' ? arg2 : arg2.value;

	// Remove stale classes
	container.className = 'value';
	// When resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || (arg2 instanceof model.Expression && !arg2.available)) {
		dom.addClass(container, 'unavailable');
		debugInactive ? dom.removeClass(container, 'error') : dom.addClass(container, 'error');
	} else if (!isNaN(+value)) {
		dom.addClass(container, 'number');
	} else if (booleanRegex.test(value)) {
		dom.addClass(container, 'boolean');
	} else if (stringRegex.test(value)) {
		dom.addClass(container, 'string');
	}

	container.textContent = value;
	container.title = value;
}

export function renderVariable(tree: tree.ITree, variable: model.Variable, data: IVariableTemplateData, debugInactive: boolean): void {
	data.name.textContent = `${variable.name}:`;
	if (variable.value) {
		renderExpressionValue(tree, variable, debugInactive, data.value);
	} else {
		data.value.textContent = '';
		data.value.title = '';
	}
}

export class SimpleActionProvider implements renderer.IActionProvider {

	constructor() {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		var result: actions.IAction[] = [];

		return Promise.as(result);
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		var result: actions.IAction[] = [];

		return Promise.as(result);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
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
			var anchor = { x: event.posx + 1, y: event.posy };
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

// Call Stack

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

		var threads = (<model.Model> element).getThreads();
		var threadsArray: debug.IThread[] = [];
		for (var reference in threads) {
			if (threads.hasOwnProperty(reference)) {
				threadsArray.push(threads[reference]);
			}
		}

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
		return 24;
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

// Variables

export class VariablesActionProvider extends SimpleActionProvider {

	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		super();
		this.instantiationService = instantiationService;
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Variable;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): Promise {
		let actions: actions.Action[] = [];
		const variable = <model.Variable> element;
		actions.push(this.instantiationService.createInstance(dbgactions.AddToWatchExpressionsAction, dbgactions.AddToWatchExpressionsAction.ID, dbgactions.AddToWatchExpressionsAction.LABEL, variable));
		if (variable.reference === 0) {
			actions.push(this.instantiationService.createInstance(dbgactions.CopyValueAction, dbgactions.CopyValueAction.ID, dbgactions.CopyValueAction.LABEL, variable));
		}

		return Promise.as(actions);
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

	public getHeight(tree:tree.ITree, element:any): number {
		return 24;
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
			renderVariable(tree, element, templateData, this.debugService.getState() === debug.State.Inactive);
		}
	}

	private renderScope(scope: model.Scope, data: IScopeTemplateData): void {
		data.name.textContent = scope.name;
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

// Watch expressions

export class WatchExpressionsActionProvider extends SimpleActionProvider {

	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		super();
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
		return [this.instantiationService.createInstance(dbgactions.RemoveWatchExpressionAction, dbgactions.RemoveWatchExpressionAction.ID, dbgactions.RemoveWatchExpressionAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): Promise {
		var actions: actions.Action[] = [];
		if (element instanceof model.Expression) {
			const expression = <model.Expression> element;
			actions.push(this.instantiationService.createInstance(dbgactions.AddWatchExpressionAction, dbgactions.AddWatchExpressionAction.ID, dbgactions.AddWatchExpressionAction.LABEL));
			actions.push(this.instantiationService.createInstance(dbgactions.RenameWatchExpressionAction, dbgactions.RenameWatchExpressionAction.ID, dbgactions.RenameWatchExpressionAction.LABEL, expression));
			if (expression.reference === 0) {
				actions.push(this.instantiationService.createInstance(dbgactions.CopyValueAction, dbgactions.CopyValueAction.ID, dbgactions.CopyValueAction.LABEL, expression.value));
			}
			actions.push(new actionbar.Separator());

			actions.push(this.instantiationService.createInstance(dbgactions.RemoveWatchExpressionAction, dbgactions.RemoveWatchExpressionAction.ID, dbgactions.RemoveWatchExpressionAction.LABEL));
			actions.push(this.instantiationService.createInstance(dbgactions.RemoveAllWatchExpressionsAction, dbgactions.RemoveAllWatchExpressionsAction.ID, dbgactions.RemoveAllWatchExpressionsAction.LABEL));
		} else {
			actions.push(this.instantiationService.createInstance(dbgactions.AddWatchExpressionAction, dbgactions.AddWatchExpressionAction.ID, dbgactions.AddWatchExpressionAction.LABEL));
			if (element instanceof model.Variable) {
				const variable = <model.Variable> element;
				if (variable.reference === 0) {
					actions.push(this.instantiationService.createInstance(dbgactions.CopyValueAction, dbgactions.CopyValueAction.ID, dbgactions.CopyValueAction.LABEL, variable.value));
				}
				actions.push(new actionbar.Separator());
			}
			actions.push(this.instantiationService.createInstance(dbgactions.RemoveAllWatchExpressionsAction, dbgactions.RemoveAllWatchExpressionsAction.ID, dbgactions.RemoveAllWatchExpressionsAction.LABEL));
		}

		return Promise.as(actions);
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

		var watchExpression = <model.Expression> element;
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
		return 24;
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
			this.renderExpression(tree, element, templateData);
		}
	}

	private renderWatchExpression(tree: tree.ITree, watchExpression: debug.IExpression, data: IWatchExpressionTemplateData): void {
		let selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((selectedExpression instanceof model.Expression && selectedExpression.getId() === watchExpression.getId()) || (watchExpression instanceof model.Expression && !watchExpression.name)) {
			this.renderRenameBox(tree, watchExpression, data);
		}
		data.actionBar.context = watchExpression;

		this.renderExpression(tree, watchExpression, data);
	}

	private renderExpression(tree: tree.ITree, expression: debug.IExpression, data: IVariableTemplateData): void {
		data.name.textContent = `${expression.name}:`;
		if (expression.value) {
			renderExpressionValue(tree, expression, this.debugService.getState() === debug.State.Inactive, data.value);
		}
	}

	private renderRenameBox(tree: tree.ITree, expression: debug.IExpression, data: IWatchExpressionTemplateData): void {
		let inputBoxContainer = dom.append(data.expression, $('.inputBoxContainer'));
		let inputBox = new inputbox.InputBox(inputBoxContainer, this.contextViewService, {
			validationOptions: {
				validation: null,
				showMessage: false
			}
		});

		inputBox.value = expression.name ? expression.name : '';
		inputBox.focus();

		var disposed = false;
		var toDispose: [lifecycle.IDisposable] = [inputBox];

		var wrapUp = async.once<any, void>((renamed: boolean) => {
			if (!disposed) {
				disposed = true;
				if (renamed && inputBox.value) {
					this.debugService.renameWatchExpression(expression.getId(), inputBox.value);
				} else if (!expression.name) {
					this.debugService.clearWatchExpressions(expression.getId());
				}
				tree.clearHighlight();
				tree.DOMFocus();
				// Need to remove the input box since this template will be reused.
				data.expression.removeChild(inputBoxContainer);
				lifecycle.disposeAll(toDispose);
			}
		});

		toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: dom.IKeyboardEvent) => {
			let isEscape = e.equals(CommonKeybindings.ESCAPE);
			let isEnter = e.equals(CommonKeybindings.ENTER);
			if (isEscape || isEnter) {
				wrapUp(isEnter);
			}
		}));
		toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
			wrapUp(true);
		}));
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
		// Doubleclick on primitive value: open input box to be able to select and copy value.
		if (element instanceof model.Expression && event.detail === 2) {
			var expression = <debug.IExpression> element;
			if (expression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(expression);
			}
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: tree.ITree, event: KeyboardEvent): boolean {
		var element = tree.getFocus();
		if (element instanceof model.Expression) {
			var watchExpression = <model.Expression> element;
			if (watchExpression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(watchExpression);
			}
			return true;
		}

		return false;
	}

	protected onDelete(tree: tree.ITree, event: keyboard.StandardKeyboardEvent): boolean {
		var element = tree.getFocus();
		if (element instanceof model.Expression) {
			var we = <model.Expression> element;
			this.debugService.clearWatchExpressions(we.getId());

			return true;
		}

		return false;
	}
}

// Breakpoints

export class BreakpointsActionProvider extends SimpleActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Breakpoint;
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Breakpoint || element instanceof model.ExceptionBreakpoint;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		if (element instanceof model.Breakpoint) {
			return Promise.as(this.getBreakpointActions());
		}

		return Promise.as([]);
	}

	public getBreakpointActions(): actions.IAction[] {
		return [this.instantiationService.createInstance(dbgactions.RemoveBreakpointAction, dbgactions.RemoveBreakpointAction.ID, dbgactions.RemoveBreakpointAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		var actions: actions.Action[] = [this.instantiationService.createInstance(dbgactions.ToggleEnablementAction, dbgactions.ToggleEnablementAction.ID, dbgactions.ToggleEnablementAction.LABEL)];
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(dbgactions.RemoveBreakpointAction, dbgactions.RemoveBreakpointAction.ID, dbgactions.RemoveBreakpointAction.LABEL));
		actions.push(this.instantiationService.createInstance(dbgactions.RemoveAllBreakpointsAction, dbgactions.RemoveAllBreakpointsAction.ID, dbgactions.RemoveAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(dbgactions.ToggleBreakpointsActivatedAction, dbgactions.ToggleBreakpointsActivatedAction.ID, dbgactions.ToggleBreakpointsActivatedAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(dbgactions.EnableAllBreakpointsAction, dbgactions.EnableAllBreakpointsAction.ID, dbgactions.EnableAllBreakpointsAction.LABEL));
		actions.push(this.instantiationService.createInstance(dbgactions.DisableAllBreakpointsAction, dbgactions.DisableAllBreakpointsAction.ID, dbgactions.DisableAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(dbgactions.ReapplyBreakpointsAction, dbgactions.ReapplyBreakpointsAction.ID, dbgactions.ReapplyBreakpointsAction.LABEL));

		return Promise.as(actions);
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
		var model = <model.Model> element;
		var exBreakpoints = <debug.IEnablement[]> model.getExceptionBreakpoints();

		return Promise.as(exBreakpoints.concat(model.getBreakpoints()));
	}

	public getParent(tree: tree.ITree, element: any): Promise {
		return Promise.as(null);
	}
}

interface IExceptionBreakpointTemplateData {
	name: HTMLElement;
	checkbox: HTMLInputElement;
	toDisposeBeforeRender: lifecycle.IDisposable[];
}

interface IBreakpointTemplateData extends IExceptionBreakpointTemplateData {
	actionBar: actionbar.ActionBar;
	lineNumber: HTMLElement;
	filePath: HTMLElement;
}

export class BreakpointsRenderer implements tree.IRenderer {

	private static EXCEPTION_BREAKPOINT_TEMPLATE_ID = 'exceptionBreakpoint';
	private static BREAKPOINT_TEMPLATE_ID = 'breakpoint';

	constructor(
		private actionProvider: BreakpointsActionProvider,
		private actionRunner: actions.IActionRunner,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@debug.IDebugService private debugService: debug.IDebugService
	) {
		// noop
	}

	public getHeight(tree:tree.ITree, element:any): number {
		return 24;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Breakpoint) {
			return BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID;
		}
		if (element instanceof model.ExceptionBreakpoint) {
			return BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		var data: IBreakpointTemplateData = Object.create(null);
		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
			data.actionBar = new actionbar.ActionBar(container, { actionRunner: this.actionRunner });
			data.actionBar.push(this.actionProvider.getBreakpointActions(), { icon: true, label: false });
		}

		var el = dom.append(container, $('.breakpoint'));
		data.toDisposeBeforeRender = [];

		data.checkbox = <HTMLInputElement> $('input');
		data.checkbox.type = 'checkbox';
		data.checkbox.className = 'checkbox';
		dom.append(el, data.checkbox);

		data.name = dom.append(el, $('span.name'));

		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
			data.lineNumber = dom.append(el, $('span.line-number'));
			data.filePath = dom.append(el, $('span.file-path'));
		}

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID) {
			this.renderExceptionBreakpoint(element, templateData);
		} else {
			this.renderBreakpoint(tree, element, templateData);
		}
	}

	private renderExceptionBreakpoint(exceptionBreakpoint: debug.IExceptionBreakpoint, data: IExceptionBreakpointTemplateData): void {
		data.toDisposeBeforeRender = lifecycle.disposeAll(data.toDisposeBeforeRender);
		var namePascalCase = exceptionBreakpoint.name.charAt(0).toUpperCase() + exceptionBreakpoint.name.slice(1);
		data.name.textContent = `${ namePascalCase} exceptions`;
		data.checkbox.checked = exceptionBreakpoint.enabled;

		data.toDisposeBeforeRender.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.toggleEnablement(exceptionBreakpoint);
		}));
	}

	private renderBreakpoint(tree: tree.ITree, breakpoint: debug.IBreakpoint, data: IBreakpointTemplateData): void {
		this.debugService.getModel().areBreakpointsActivated() ? tree.removeTraits('disabled', [breakpoint]) : tree.addTraits('disabled', [breakpoint]);

		data.toDisposeBeforeRender = lifecycle.disposeAll(data.toDisposeBeforeRender);
		data.name.textContent = labels.getPathLabel(paths.basename(breakpoint.source.uri.fsPath), this.contextService);
		data.lineNumber.textContent = breakpoint.desiredLineNumber !== breakpoint.lineNumber ? breakpoint.desiredLineNumber + ' \u2192 ' + breakpoint.lineNumber : '' + breakpoint.lineNumber;
		data.filePath.textContent = labels.getPathLabel(paths.dirname(breakpoint.source.uri.fsPath), this.contextService);
		data.checkbox.checked = breakpoint.enabled;
		data.actionBar.context = breakpoint;

		data.toDisposeBeforeRender.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.toggleEnablement(breakpoint);
		}));
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
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
			var focus = tree.getFocus();
			if (focus instanceof model.ExceptionBreakpoint) {
				tree.focusNth(2);
			}
		}

		return upSucceeded;
	}

	protected onDelete(tree: tree.ITree, event: keyboard.StandardKeyboardEvent): boolean {
		var element = tree.getFocus();
		if (element instanceof model.Breakpoint) {
			var bp = <model.Breakpoint> element;
			this.debugService.toggleBreakpoint(bp.source.uri, bp.lineNumber);

			return true;
		}

		return false;
	}
}
