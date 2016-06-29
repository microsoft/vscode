/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import paths = require('vs/base/common/paths');
import async = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import { isMacintosh } from 'vs/base/common/platform';
import dom = require('vs/base/browser/dom');
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
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
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';

const $ = dom.emmet;
const booleanRegex = /^true|false$/i;
const stringRegex = /^(['"]).*\1$/;
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export function renderExpressionValue(expressionOrValue: debug.IExpression | string, container: HTMLElement, showChanged: boolean, maxValueRenderLength?: number): void {
	let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

	// remove stale classes
	container.className = 'value';
	// when resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || ((expressionOrValue instanceof model.Expression || expressionOrValue instanceof model.Variable) && !expressionOrValue.available)) {
		dom.addClass(container, 'unavailable');
		if (value !== model.Expression.DEFAULT_VALUE) {
			dom.addClass(container, 'error');
		}
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

	if (maxValueRenderLength && value.length > maxValueRenderLength) {
		value = value.substr(0, maxValueRenderLength) + '...';
	}
	container.textContent = value;
	container.title = value;
}

export function renderVariable(tree: tree.ITree, variable: model.Variable, data: IVariableTemplateData, showChanged: boolean): void {
	if (variable.available) {
		data.name.textContent = variable.name + ':';
		data.name.title = variable.type ? variable.type : '';
	}

	if (variable.value) {
		renderExpressionValue(variable, data.value, showChanged, MAX_VALUE_RENDER_LENGTH_IN_VIEWLET);
		data.expression.title = variable.value;
	} else {
		data.value.textContent = '';
		data.value.title = '';
	}
}

interface IRenameBoxOptions {
	initialValue: string;
	ariaLabel: string;
	placeholder?: string;
	validationOptions?: inputbox.IInputValidationOptions;
}

function renderRenameBox(debugService: debug.IDebugService, contextViewService: IContextViewService, tree: tree.ITree, element: any, container: HTMLElement, options: IRenameBoxOptions): void {
	let inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
	let inputBox = new inputbox.InputBox(inputBoxContainer, contextViewService, {
		validationOptions: options.validationOptions,
		placeholder: options.placeholder,
		ariaLabel: options.ariaLabel
	});

	inputBox.value = options.initialValue ? options.initialValue : '';
	inputBox.focus();

	let disposed = false;
	const toDispose: [lifecycle.IDisposable] = [inputBox];

	const wrapUp = async.once((renamed: boolean) => {
		if (!disposed) {
			disposed = true;
			if (element instanceof model.Expression && renamed && inputBox.value) {
				debugService.renameWatchExpression(element.getId(), inputBox.value).done(null, errors.onUnexpectedError);
			} else if (element instanceof model.Expression && !element.name) {
				debugService.removeWatchExpressions(element.getId());
			} else if (element instanceof model.FunctionBreakpoint && renamed && inputBox.value) {
				debugService.renameFunctionBreakpoint(element.getId(), inputBox.value).done(null, errors.onUnexpectedError);
			} else if (element instanceof model.FunctionBreakpoint && !element.name) {
				debugService.removeFunctionBreakpoints(element.getId()).done(null, errors.onUnexpectedError);
			} else if (element instanceof model.Variable) {
				(<model.Variable>element).errorMessage = null;
				if (renamed) {
					debugService.setVariable(element, inputBox.value)
						// if everything went fine we need to refresh that tree element since his value updated
						.done(() => tree.refresh(element, false), errors.onUnexpectedError);
				}
			}

			tree.clearHighlight();
			tree.DOMFocus();
			tree.setFocus(element);

			// need to remove the input box since this template will be reused.
			container.removeChild(inputBoxContainer);
			lifecycle.dispose(toDispose);
		}
	});

	toDispose.push(dom.addStandardDisposableListener(inputBox.inputElement, 'keydown', (e: IKeyboardEvent) => {
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

function getSourceName(source: Source, contextService: IWorkspaceContextService): string {
	if (source.inMemory) {
		return source.name;
	}

	return labels.getPathLabel(paths.basename(source.uri.fsPath), contextService);
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

	protected onDelete(tree: tree.ITree, event: IKeyboardEvent): boolean {
		return false;
	}
}

// call stack

export class CallStackController extends BaseDebugController {

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (typeof element === 'number') {
			return this.showMoreStackFrames(tree, element);
		}
		if (element instanceof model.StackFrame) {
			this.focusStackFrame(element, event, true);
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onEnter(tree: tree.ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (typeof element === 'number') {
			return this.showMoreStackFrames(tree, element);
		}
		if (element instanceof model.StackFrame) {
			this.focusStackFrame(element, event, false);
		}

		return super.onEnter(tree, event);
	}

	protected onUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onUp(tree, event);
		this.focusStackFrame(tree.getFocus(), event, true);

		return true;
	}

	protected onPageUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageUp(tree, event);
		this.focusStackFrame(tree.getFocus(), event, true);

		return true;
	}

	protected onDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onDown(tree, event);
		this.focusStackFrame(tree.getFocus(), event, true);

		return true;
	}

	protected onPageDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageDown(tree, event);
		this.focusStackFrame(tree.getFocus(), event, true);

		return true;
	}

	// user clicked / pressed on 'Load More Stack Frames', get those stack frames and refresh the tree.
	private showMoreStackFrames(tree: tree.ITree, threadId: number): boolean {
		const thread = this.debugService.getModel().getThreads()[threadId];
		if (thread) {
			thread.getCallStack(this.debugService, true)
				.done(() => tree.refresh(), errors.onUnexpectedError);
		}

		return true;
	}

	private focusStackFrame(stackFrame: debug.IStackFrame, event: IKeyboardEvent | IMouseEvent, preserveFocus: boolean): void {
		this.debugService.setFocusedStackFrameAndEvaluate(stackFrame).done(null, errors.onUnexpectedError);

		const sideBySide = (event && (event.ctrlKey || event.metaKey));
		this.debugService.openOrRevealSource(stackFrame.source, stackFrame.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
	}
}


export class CallStackActionProvider implements renderer.IActionProvider {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Thread;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		const actions: actions.Action[] = [];
		const thread = <model.Thread>element;
		if (thread.stopped) {
			actions.push(this.instantiationService.createInstance(debugactions.ContinueAction, debugactions.ContinueAction.ID, debugactions.ContinueAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.StepOverDebugAction, debugactions.StepOverDebugAction.ID, debugactions.StepOverDebugAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.StepIntoDebugAction, debugactions.StepIntoDebugAction.ID, debugactions.StepIntoDebugAction.LABEL));
			actions.push(this.instantiationService.createInstance(debugactions.StepOutDebugAction, debugactions.StepOutDebugAction.ID, debugactions.StepOutDebugAction.LABEL));
		} else {
			actions.push(this.instantiationService.createInstance(debugactions.PauseAction, debugactions.PauseAction.ID, debugactions.PauseAction.LABEL));
		}

		return TPromise.as(actions);
	}

	public getActionItem(tree: tree.ITree, element: any, action: actions.IAction): actionbar.IActionItem {
		return null;
	}
}

export class CallStackDataSource implements tree.IDataSource {

	constructor( @debug.IDebugService private debugService: debug.IDebugService) {
		// noop
	}

	public getId(tree: tree.ITree, element: any): string {
		if (typeof element === 'number') {
			return element.toString();
		}
		if (typeof element === 'string') {
			return element;
		}

		return element.getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Model || (element instanceof model.Thread && (<model.Thread>element).stopped);
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof model.Thread) {
			return this.getThreadChildren(element);
		}

		const threads = (<model.Model>element).getThreads();
		return TPromise.as(Object.keys(threads).map(ref => threads[ref]));
	}

	private getThreadChildren(thread: debug.IThread): TPromise<any> {
		return thread.getCallStack(this.debugService).then((callStack: any[]) => {
			if (thread.stoppedDetails.framesErrorMessage) {
				return callStack.concat([thread.stoppedDetails.framesErrorMessage]);
			}
			if (thread.stoppedDetails && thread.stoppedDetails.totalFrames > callStack.length) {
				return callStack.concat([thread.threadId]);
			}

			return callStack;
		});
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IThreadTemplateData {
	thread: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
}

interface IErrorTemplateData {
	label: HTMLElement;
}

interface ILoadMoreTemplateData {
	label: HTMLElement;
}

interface IStackFrameTemplateData {
	stackFrame: HTMLElement;
	label: HTMLElement;
	file: HTMLElement;
	fileName: HTMLElement;
	lineNumber: HTMLElement;
}

export class CallStackRenderer implements tree.IRenderer {

	private static THREAD_TEMPLATE_ID = 'thread';
	private static STACK_FRAME_TEMPLATE_ID = 'stackFrame';
	private static ERROR_TEMPLATE_ID = 'error';
	private static LOAD_MORE_TEMPLATE_ID = 'loadMore';

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Thread) {
			return CallStackRenderer.THREAD_TEMPLATE_ID;
		}
		if (element instanceof model.StackFrame) {
			return CallStackRenderer.STACK_FRAME_TEMPLATE_ID;
		}
		if (typeof element === 'string') {
			return CallStackRenderer.ERROR_TEMPLATE_ID;
		}

		return CallStackRenderer.LOAD_MORE_TEMPLATE_ID;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === CallStackRenderer.LOAD_MORE_TEMPLATE_ID) {
			let data: ILoadMoreTemplateData = Object.create(null);
			data.label = dom.append(container, $('.load-more'));

			return data;
		}
		if (templateId === CallStackRenderer.ERROR_TEMPLATE_ID) {
			let data: ILoadMoreTemplateData = Object.create(null);
			data.label = dom.append(container, $('.error'));

			return data;
		}
		if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			let data: IThreadTemplateData = Object.create(null);
			data.thread = dom.append(container, $('.thread'));
			data.name = dom.append(data.thread, $('.name'));
			data.state = dom.append(data.thread, $('.state'));
			data.stateLabel = dom.append(data.state, $('span.label'));

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
		} else if (templateId === CallStackRenderer.STACK_FRAME_TEMPLATE_ID) {
			this.renderStackFrame(element, templateData);
		} else if (templateId === CallStackRenderer.ERROR_TEMPLATE_ID) {
			this.renderError(element, templateData);
		} else {
			this.renderLoadMore(element, templateData);
		}
	}

	private renderThread(thread: debug.IThread, data: IThreadTemplateData): void {
		data.thread.title = nls.localize('thread', "Thread");
		data.name.textContent = thread.name;
		data.stateLabel.textContent = thread.stopped ? nls.localize('paused', "paused")
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "running");
	}

	private renderError(element: string, data: IErrorTemplateData) {
		data.label.textContent = element;
		data.label.title = element;
	}

	private renderLoadMore(element: any, data: ILoadMoreTemplateData): void {
		data.label.textContent = nls.localize('loadMoreStackFrames', "Load More Stack Frames");
	}

	private renderStackFrame(stackFrame: debug.IStackFrame, data: IStackFrameTemplateData): void {
		stackFrame.source.available ? dom.removeClass(data.stackFrame, 'disabled') : dom.addClass(data.stackFrame, 'disabled');
		data.file.title = stackFrame.source.uri.fsPath;
		data.label.textContent = stackFrame.name;
		data.label.title = stackFrame.name;
		data.fileName.textContent = getSourceName(stackFrame.source, this.contextService);
		if (stackFrame.source.available && stackFrame.lineNumber !== undefined) {
			data.lineNumber.textContent = `${stackFrame.lineNumber}`;
			dom.removeClass(data.lineNumber, 'unavailable');
		} else {
			dom.addClass(data.lineNumber, 'unavailable');
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class CallstackAccessibilityProvider implements tree.IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof model.Thread) {
			return nls.localize('threadAriaLabel', "Thread {0}, callstack, debug", (<model.Thread>element).name);
		}
		if (element instanceof model.StackFrame) {
			return nls.localize('stackFrameAriaLabel', "Stack Frame {0} line {1} {2}, callstack, debug", (<model.StackFrame>element).name, (<model.StackFrame>element).lineNumber, getSourceName((<model.StackFrame>element).source, this.contextService));
		}

		return null;
	}
}

// variables

export class VariablesActionProvider implements renderer.IActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof model.Variable;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		let actions: actions.Action[] = [];
		const variable = <model.Variable>element;
		if (variable.reference === 0) {
			actions.push(this.instantiationService.createInstance(debugactions.SetValueAction, debugactions.SetValueAction.ID, debugactions.SetValueAction.LABEL, variable));
			actions.push(this.instantiationService.createInstance(debugactions.CopyValueAction, debugactions.CopyValueAction.ID, debugactions.CopyValueAction.LABEL, variable));
			actions.push(new actionbar.Separator());
		}

		actions.push(this.instantiationService.createInstance(debugactions.AddToWatchExpressionsAction, debugactions.AddToWatchExpressionsAction.ID, debugactions.AddToWatchExpressionsAction.LABEL, variable));
		return TPromise.as(actions);
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

		let variable = <model.Variable>element;
		return variable.reference !== 0 && !strings.equalsIgnoreCase(variable.value, 'null');
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof viewmodel.ViewModel) {
			let focusedStackFrame = (<viewmodel.ViewModel>element).getFocusedStackFrame();
			return focusedStackFrame ? focusedStackFrame.getScopes(this.debugService) : TPromise.as([]);
		}

		let scope = <model.Scope>element;
		return scope.getChildren(this.debugService);
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
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

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof model.Scope) {
			return VariablesRenderer.SCOPE_TEMPLATE_ID;
		}
		if (element instanceof model.Variable) {
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
			const variable = <model.Variable>element;
			if (variable === this.debugService.getViewModel().getSelectedExpression() || variable.errorMessage) {
				renderRenameBox(this.debugService, this.contextViewService, tree, variable, (<IVariableTemplateData>templateData).expression, {
					initialValue: variable.value,
					ariaLabel: nls.localize('variableValueAriaLabel', "Type new variable value"),
					validationOptions: {
						validation: (value: string) => variable.errorMessage ? ({ content: variable.errorMessage }) : null
					}
				});
			} else {
				renderVariable(tree, variable, templateData, true);
			}
		}
	}

	private renderScope(scope: model.Scope, data: IScopeTemplateData): void {
		data.name.textContent = scope.name;
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class VariablesAccessibilityProvider implements tree.IAccessibilityProvider {

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof model.Scope) {
			return nls.localize('variableScopeAriaLabel', "Scope {0}, variables, debug", (<model.Scope>element).name);
		}
		if (element instanceof model.Variable) {
			return nls.localize('variableAriaLabel', "{0} value {1}, variables, debug", (<model.Variable>element).name, (<model.Variable>element).value);
		}

		return null;
	}
}

export class VariablesController extends BaseDebugController {

	constructor(debugService: debug.IDebugService, contextMenuService: IContextMenuService, actionProvider: renderer.IActionProvider) {
		super(debugService, contextMenuService, actionProvider);
		this.downKeyBindingDispatcher.set(CommonKeybindings.ENTER, this.setSelectedExpression.bind(this));
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to set the value
		if (element instanceof model.Variable && event.detail === 2) {
			const expression = <debug.IExpression>element;
			if (expression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(expression);
			}
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected setSelectedExpression(tree: tree.ITree, event: KeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Variable && element.reference === 0) {
			this.debugService.getViewModel().setSelectedExpression(element);
			return true;
		}

		return false;
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

	public getActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		return TPromise.as(this.getExpressionActions());
	}

	public getExpressionActions(): actions.IAction[] {
		return [this.instantiationService.createInstance(debugactions.RemoveWatchExpressionAction, debugactions.RemoveWatchExpressionAction.ID, debugactions.RemoveWatchExpressionAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		const actions: actions.Action[] = [];
		if (element instanceof model.Expression) {
			const expression = <model.Expression>element;
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
				const variable = <model.Variable>element;
				if (variable.reference === 0) {
					actions.push(this.instantiationService.createInstance(debugactions.CopyValueAction, debugactions.CopyValueAction.ID, debugactions.CopyValueAction.LABEL, variable.value));
				}
				actions.push(new actionbar.Separator());
			}
			actions.push(this.instantiationService.createInstance(debugactions.RemoveAllWatchExpressionsAction, debugactions.RemoveAllWatchExpressionsAction.ID, debugactions.RemoveAllWatchExpressionsAction.LABEL));
		}

		return TPromise.as(actions);
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

		const watchExpression = <model.Expression>element;
		return watchExpression.reference !== 0 && !strings.equalsIgnoreCase(watchExpression.value, 'null');
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof model.Model) {
			return TPromise.as((<model.Model>element).getWatchExpressions());
		}

		let expression = <model.Expression>element;
		return expression.getChildren(this.debugService);
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
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
		this.actionProvider = <WatchExpressionsActionProvider>actionProvider;
	}

	public getHeight(tree: tree.ITree, element: any): number {
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
			data.actionBar.push(this.actionProvider.getExpressionActions(), { icon: true, label: false });
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
			renderVariable(tree, element, templateData, true);
		}
	}

	private renderWatchExpression(tree: tree.ITree, watchExpression: debug.IExpression, data: IWatchExpressionTemplateData): void {
		let selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((selectedExpression instanceof model.Expression && selectedExpression.getId() === watchExpression.getId()) || (watchExpression instanceof model.Expression && !watchExpression.name)) {
			renderRenameBox(this.debugService, this.contextViewService, tree, watchExpression, data.expression, {
				initialValue: watchExpression.name,
				placeholder: nls.localize('watchExpressionPlaceholder', "Expression to watch"),
				ariaLabel: nls.localize('watchExpressionInputAriaLabel', "Type watch expression")
			});
		}
		data.actionBar.context = watchExpression;

		data.name.textContent = `${watchExpression.name}:`;
		if (watchExpression.value) {
			renderExpressionValue(watchExpression, data.value, true, MAX_VALUE_RENDER_LENGTH_IN_VIEWLET);
			data.expression.title = watchExpression.value;
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (templateId === WatchExpressionsRenderer.WATCH_EXPRESSION_TEMPLATE_ID) {
			(<IWatchExpressionTemplateData>templateData).actionBar.dispose();
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export class WatchExpressionsAccessibilityProvider implements tree.IAccessibilityProvider {

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof model.Expression) {
			return nls.localize('watchExpressionAriaLabel', "{0} value {1}, watch, debug", (<model.Expression>element).name, (<model.Expression>element).value);
		}
		if (element instanceof model.Variable) {
			return nls.localize('watchVariableAriaLabel', "{0} value {1}, watch, debug", (<model.Variable>element).name, (<model.Variable>element).value);
		}

		return null;
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

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof model.Expression && event.detail === 2) {
			const expression = <debug.IExpression>element;
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
			const watchExpression = <model.Expression>element;
			if (watchExpression.reference === 0) {
				this.debugService.getViewModel().setSelectedExpression(watchExpression);
			}
			return true;
		}

		return false;
	}

	protected onDelete(tree: tree.ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Expression) {
			const we = <model.Expression>element;
			this.debugService.removeWatchExpressions(we.getId());

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
			return TPromise.as(this.getBreakpointActions());
		}

		return TPromise.as([]);
	}

	public getBreakpointActions(): actions.IAction[] {
		return [this.instantiationService.createInstance(debugactions.RemoveBreakpointAction, debugactions.RemoveBreakpointAction.ID, debugactions.RemoveBreakpointAction.LABEL)];
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<actions.IAction[]> {
		const actions: actions.Action[] = [this.instantiationService.createInstance(debugactions.ToggleEnablementAction, debugactions.ToggleEnablementAction.ID, debugactions.ToggleEnablementAction.LABEL)];
		actions.push(new actionbar.Separator());

		if (element instanceof model.Breakpoint || element instanceof model.FunctionBreakpoint) {
			actions.push(this.instantiationService.createInstance(debugactions.RemoveBreakpointAction, debugactions.RemoveBreakpointAction.ID, debugactions.RemoveBreakpointAction.LABEL));
		}
		actions.push(this.instantiationService.createInstance(debugactions.RemoveAllBreakpointsAction, debugactions.RemoveAllBreakpointsAction.ID, debugactions.RemoveAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.ToggleBreakpointsActivatedAction, debugactions.ToggleBreakpointsActivatedAction.ID, debugactions.ToggleBreakpointsActivatedAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.EnableAllBreakpointsAction, debugactions.EnableAllBreakpointsAction.ID, debugactions.EnableAllBreakpointsAction.LABEL));
		actions.push(this.instantiationService.createInstance(debugactions.DisableAllBreakpointsAction, debugactions.DisableAllBreakpointsAction.ID, debugactions.DisableAllBreakpointsAction.LABEL));
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.AddFunctionBreakpointAction, debugactions.AddFunctionBreakpointAction.ID, debugactions.AddFunctionBreakpointAction.LABEL));
		if (element instanceof model.FunctionBreakpoint) {
			actions.push(this.instantiationService.createInstance(debugactions.RenameFunctionBreakpointAction, debugactions.RenameFunctionBreakpointAction.ID, debugactions.RenameFunctionBreakpointAction.LABEL));
		}
		actions.push(new actionbar.Separator());

		actions.push(this.instantiationService.createInstance(debugactions.ReapplyBreakpointsAction, debugactions.ReapplyBreakpointsAction.ID, debugactions.ReapplyBreakpointsAction.LABEL));

		return TPromise.as(actions);
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

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		const model = <model.Model>element;
		const exBreakpoints = <debug.IEnablement[]>model.getExceptionBreakpoints();

		return TPromise.as(exBreakpoints.concat(model.getFunctionBreakpoints()).concat(model.getBreakpoints()));
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
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

	public getHeight(tree: tree.ITree, element: any): number {
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

		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		if (!isMacintosh) {
			data.checkbox.className = 'checkbox-win-linux';
		}

		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
			data.lineNumber = dom.append(data.breakpoint, $('span.line-number'));
			data.filePath = dom.append(data.breakpoint, $('span.file-path'));
		}

		return data;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		templateData.toDisposeBeforeRender = lifecycle.dispose(templateData.toDisposeBeforeRender);
		templateData.toDisposeBeforeRender.push(dom.addStandardDisposableListener(templateData.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!element.enabled, element);
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
		data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;;
		data.checkbox.checked = exceptionBreakpoint.enabled;
	}

	private renderFunctionBreakpoint(tree: tree.ITree, functionBreakpoint: debug.IFunctionBreakpoint, data: IFunctionBreakpointTemplateData): void {
		const selected = this.debugService.getViewModel().getSelectedFunctionBreakpoint();
		if (!functionBreakpoint.name || (selected && selected.getId() === functionBreakpoint.getId())) {
			renderRenameBox(this.debugService, this.contextViewService, tree, functionBreakpoint, data.breakpoint, {
				initialValue: functionBreakpoint.name,
				placeholder: nls.localize('functionBreakpointPlaceholder', "Function to break on"),
				ariaLabel: nls.localize('functionBreakPointInputAriaLabel', "Type function breakpoint")
			});
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

		const debugActive = this.debugService.state === debug.State.Running || this.debugService.state === debug.State.Stopped || this.debugService.state === debug.State.Initializing;
		if (debugActive && !breakpoint.verified) {
			tree.addTraits('disabled', [breakpoint]);
			if (breakpoint.message) {
				data.breakpoint.title = breakpoint.message;
			}
		} else if (breakpoint.condition) {
			data.breakpoint.title = breakpoint.condition;
		}
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID || templateId === BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID) {
			templateData.actionBar.dispose();
		}
	}
}

export class BreakpointsAccessibilityProvider implements tree.IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof model.Breakpoint) {
			return nls.localize('breakpointAriaLabel', "Breakpoint line {0} {1}, breakpoints, debug", (<model.Breakpoint>element).lineNumber, getSourceName((<model.Breakpoint>element).source, this.contextService));
		}
		if (element instanceof model.FunctionBreakpoint) {
			return nls.localize('functionBreakpointAriaLabel', "Function breakpoint {0}, breakpoints, debug", (<model.FunctionBreakpoint>element).name);
		}
		if (element instanceof model.ExceptionBreakpoint) {
			return nls.localize('exceptionBreakpointAriaLabel', "Exception breakpoint {0}, breakpoints, debug", (<model.ExceptionBreakpoint>element).filter);
		}

		return null;
	}
}

export class BreakpointsController extends BaseDebugController {

	constructor(debugService: debug.IDebugService, contextMenuService: IContextMenuService, actionProvider: renderer.IActionProvider) {
		super(debugService, contextMenuService, actionProvider);
		if (isMacintosh) {
			this.downKeyBindingDispatcher.set(CommonKeybindings.ENTER, this.onRename.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(CommonKeybindings.F2, this.onRename.bind(this));
		}
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (element instanceof model.FunctionBreakpoint && event.detail === 2) {
			this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
			return true;
		}
		if (element instanceof model.Breakpoint) {
			this.openBreakpointSource(element, event, true);
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: tree.ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.FunctionBreakpoint && element.name) {
			this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
			return true;
		}
		if (element instanceof model.Breakpoint) {
			this.openBreakpointSource(element, event, false);
		}

		return super.onEnter(tree, event);
	}

	protected onSpace(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onSpace(tree, event);
		const element = <debug.IEnablement>tree.getFocus();
		this.debugService.enableOrDisableBreakpoints(!element.enabled, element).done(null, errors.onUnexpectedError);

		return true;
	}

	protected onDelete(tree: tree.ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof model.Breakpoint) {
			this.debugService.removeBreakpoints((<model.Breakpoint>element).getId()).done(null, errors.onUnexpectedError);
			return true;
		} else if (element instanceof model.FunctionBreakpoint) {
			const fbp = <model.FunctionBreakpoint>element;
			this.debugService.removeFunctionBreakpoints(fbp.getId()).done(null, errors.onUnexpectedError);

			return true;
		}

		return false;
	}

	private openBreakpointSource(breakpoint: debug.IBreakpoint, event: IKeyboardEvent | IMouseEvent, preserveFocus: boolean): void {
		if (!breakpoint.source.inMemory) {
			const sideBySide = (event && (event.ctrlKey || event.metaKey));
			this.debugService.openOrRevealSource(breakpoint.source, breakpoint.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
		}
	}
}
