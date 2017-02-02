/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as lifecycle from 'vs/base/common/lifecycle';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as paths from 'vs/base/common/paths';
import * as errors from 'vs/base/common/errors';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { isMacintosh } from 'vs/base/common/platform';
import * as dom from 'vs/base/browser/dom';
import { IMouseEvent, DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { getPathLabel } from 'vs/base/common/labels';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ITree, IAccessibilityProvider, ContextMenuEvent, IDataSource, IRenderer, DRAG_OVER_REJECT, IDragAndDropData, IDragOverReaction } from 'vs/base/parts/tree/browser/tree';
import { InputBox, IInputValidationOptions } from 'vs/base/browser/ui/inputbox/inputBox';
import { DefaultController, DefaultDragAndDrop } from 'vs/base/parts/tree/browser/treeDefaults';
import { IActionProvider } from 'vs/base/parts/tree/browser/actionsRenderer';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import * as debug from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, FunctionBreakpoint, StackFrame, Thread, Process, Breakpoint, ExceptionBreakpoint, Model, Scope } from 'vs/workbench/parts/debug/common/debugModel';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { ContinueAction, StepOverAction, PauseAction, ReapplyBreakpointsAction, DisableAllBreakpointsAction, RemoveBreakpointAction, RemoveWatchExpressionAction, AddWatchExpressionAction, RemoveAllBreakpointsAction, EnableAllBreakpointsAction, StepOutAction, StepIntoAction, SetValueAction, RemoveAllWatchExpressionsAction, RestartFrameAction, AddToWatchExpressionsAction, StopAction, RestartAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { CopyValueAction, CopyStackTraceAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { Source } from 'vs/workbench/parts/debug/common/debugSource';
import { once } from 'vs/base/common/functional';

const $ = dom.$;
const booleanRegex = /^true|false$/i;
const stringRegex = /^(['"]).*\1$/;
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export interface IRenderValueOptions {
	preserveWhitespace?: boolean;
	showChanged?: boolean;
	maxValueLength?: number;
	showHover?: boolean;
}

function replaceWhitespace(value: string): string {
	const map = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
	return value.replace(/[\n\r\t]/g, char => map[char]);
}

export function renderExpressionValue(expressionOrValue: debug.IExpression | string, container: HTMLElement, options: IRenderValueOptions): void {
	let value = typeof expressionOrValue === 'string' ? expressionOrValue : expressionOrValue.value;

	// remove stale classes
	container.className = 'value';
	// when resolving expressions we represent errors from the server as a variable with name === null.
	if (value === null || ((expressionOrValue instanceof Expression || expressionOrValue instanceof Variable) && !expressionOrValue.available)) {
		dom.addClass(container, 'unavailable');
		if (value !== Expression.DEFAULT_VALUE) {
			dom.addClass(container, 'error');
		}
	} else if (!isNaN(+value)) {
		dom.addClass(container, 'number');
	} else if (booleanRegex.test(value)) {
		dom.addClass(container, 'boolean');
	} else if (stringRegex.test(value)) {
		dom.addClass(container, 'string');
	}

	if (options.showChanged && (<any>expressionOrValue).valueChanged && value !== Expression.DEFAULT_VALUE) {
		// value changed color has priority over other colors.
		container.className = 'value changed';
	}

	if (options.maxValueLength && value.length > options.maxValueLength) {
		value = value.substr(0, options.maxValueLength) + '...';
	}
	if (value && !options.preserveWhitespace) {
		container.textContent = replaceWhitespace(value);
	} else {
		container.textContent = value;
	}
	if (options.showHover) {
		container.title = value;
	}
}

export function renderVariable(tree: ITree, variable: Variable, data: IVariableTemplateData, showChanged: boolean): void {
	if (variable.available) {
		data.name.textContent = replaceWhitespace(variable.name);
		data.name.title = variable.type ? variable.type : variable.name;
	}

	if (variable.value) {
		data.name.textContent += variable.name ? ':' : '';
		renderExpressionValue(variable, data.value, {
			showChanged,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
			preserveWhitespace: false,
			showHover: true
		});
	} else {
		data.value.textContent = '';
		data.value.title = '';
	}
}

interface IRenameBoxOptions {
	initialValue: string;
	ariaLabel: string;
	placeholder?: string;
	validationOptions?: IInputValidationOptions;
}

function renderRenameBox(debugService: debug.IDebugService, contextViewService: IContextViewService, tree: ITree, element: any, container: HTMLElement, options: IRenameBoxOptions): void {
	let inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
	let inputBox = new InputBox(inputBoxContainer, contextViewService, {
		validationOptions: options.validationOptions,
		placeholder: options.placeholder,
		ariaLabel: options.ariaLabel
	});

	inputBox.value = options.initialValue ? options.initialValue : '';
	inputBox.focus();
	inputBox.select();

	let disposed = false;
	const toDispose: [lifecycle.IDisposable] = [inputBox];

	const wrapUp = once((renamed: boolean) => {
		if (!disposed) {
			disposed = true;
			if (element instanceof Expression && renamed && inputBox.value) {
				debugService.renameWatchExpression(element.getId(), inputBox.value).done(null, errors.onUnexpectedError);
			} else if (element instanceof Expression && !element.name) {
				debugService.removeWatchExpressions(element.getId());
			} else if (element instanceof FunctionBreakpoint && inputBox.value) {
				debugService.renameFunctionBreakpoint(element.getId(), renamed ? inputBox.value : element.name).done(null, errors.onUnexpectedError);
			} else if (element instanceof FunctionBreakpoint && !element.name) {
				debugService.removeFunctionBreakpoints(element.getId()).done(null, errors.onUnexpectedError);
			} else if (element instanceof Variable) {
				element.errorMessage = null;
				if (renamed && element.value !== inputBox.value) {
					element.setVariable(inputBox.value)
						// if everything went fine we need to refresh ui elements since the variable update can change watch and variables view
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
		const isEscape = e.equals(KeyCode.Escape);
		const isEnter = e.equals(KeyCode.Enter);
		if (isEscape || isEnter) {
			e.preventDefault();
			e.stopPropagation();
			wrapUp(isEnter);
		}
	}));
	toDispose.push(dom.addDisposableListener(inputBox.inputElement, 'blur', () => {
		wrapUp(true);
	}));
}

function getSourceName(source: Source, contextService: IWorkspaceContextService): string {
	if (source.name) {
		return source.name;
	}

	return getPathLabel(paths.basename(source.uri.fsPath), contextService);
}

export class BaseDebugController extends DefaultController {

	private contributedContextMenu: IMenu;

	constructor(
		private actionProvider: IActionProvider,
		menuId: MenuId,
		@debug.IDebugService protected debugService: debug.IDebugService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService
	) {
		super();

		this.contributedContextMenu = menuService.createMenu(menuId, contextKeyService);
		if (isMacintosh) {
			this.downKeyBindingDispatcher.set(KeyMod.CtrlCmd | KeyCode.Backspace, this.onDelete.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(KeyCode.Delete, this.onDelete.bind(this));
			this.downKeyBindingDispatcher.set(KeyMod.Shift | KeyCode.Delete, this.onDelete.bind(this));
		}
		if (isMacintosh) {
			this.downKeyBindingDispatcher.set(KeyCode.Enter, this.onRename.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(KeyCode.F2, this.onRename.bind(this));
		}
	}

	public onContextMenu(tree: ITree, element: debug.IEnablement, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);

		if (this.actionProvider.hasSecondaryActions(tree, element)) {
			const anchor = { x: event.posx + 1, y: event.posy };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this.actionProvider.getSecondaryActions(tree, element).then(actions => {
					fillInActions(this.contributedContextMenu, this.getContext(element), actions);
					return actions;
				}),
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

	protected onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		return false;
	}

	protected onRename(tree: ITree, event: IKeyboardEvent): boolean {
		return false;
	}

	protected getContext(element: any): any {
		return undefined;
	}
}

// call stack

class ThreadAndProcessIds implements debug.ITreeElement {
	constructor(public processId: string, public threadId: number) { }

	public getId(): string {
		return `${this.processId}:${this.threadId}`;
	}
}

export class CallStackController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		if (element instanceof ThreadAndProcessIds) {
			return this.showMoreStackFrames(tree, element);
		}
		if (element instanceof StackFrame) {
			this.focusStackFrame(element, event, true);
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onEnter(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof ThreadAndProcessIds) {
			return this.showMoreStackFrames(tree, element);
		}
		if (element instanceof StackFrame) {
			this.focusStackFrame(element, event, false);
		}

		return super.onEnter(tree, event);
	}

	protected getContext(element: any): any {
		if (element instanceof StackFrame) {
			if (element.source.inMemory) {
				return element.source.raw.path || element.source.reference;
			}

			return element.source.uri.toString();
		}
	}

	// user clicked / pressed on 'Load More Stack Frames', get those stack frames and refresh the tree.
	private showMoreStackFrames(tree: ITree, threadAndProcessIds: ThreadAndProcessIds): boolean {
		const process = this.debugService.getModel().getProcesses().filter(p => p.getId() === threadAndProcessIds.processId).pop();
		const thread = process && process.getThread(threadAndProcessIds.threadId);
		if (thread) {
			(<Thread>thread).fetchCallStack(true)
				.done(() => tree.refresh(), errors.onUnexpectedError);
		}

		return true;
	}

	private focusStackFrame(stackFrame: debug.IStackFrame, event: IKeyboardEvent | IMouseEvent, preserveFocus: boolean): void {
		this.debugService.focusStackFrameAndEvaluate(stackFrame).then(() => {
			const sideBySide = (event && (event.ctrlKey || event.metaKey));
			return stackFrame.openInEditor(this.editorService, preserveFocus, sideBySide);
		}, errors.onUnexpectedError);
	}
}


export class CallStackActionProvider implements IActionProvider {

	constructor( @IInstantiationService private instantiationService: IInstantiationService, @debug.IDebugService private debugService: debug.IDebugService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return element !== tree.getInput();
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		if (element instanceof Process) {
			actions.push(this.instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL));
			actions.push(this.instantiationService.createInstance(StopAction, StopAction.ID, StopAction.LABEL));
		} else if (element instanceof Thread) {
			const thread = <Thread>element;
			if (thread.stopped) {
				actions.push(this.instantiationService.createInstance(ContinueAction, ContinueAction.ID, ContinueAction.LABEL));
				actions.push(this.instantiationService.createInstance(StepOverAction, StepOverAction.ID, StepOverAction.LABEL));
				actions.push(this.instantiationService.createInstance(StepIntoAction, StepIntoAction.ID, StepIntoAction.LABEL));
				actions.push(this.instantiationService.createInstance(StepOutAction, StepOutAction.ID, StepOutAction.LABEL));
			} else {
				actions.push(this.instantiationService.createInstance(PauseAction, PauseAction.ID, PauseAction.LABEL));
			}
		} else if (element instanceof StackFrame) {
			if (element.thread.process.session.configuration.capabilities.supportsRestartFrame) {
				actions.push(this.instantiationService.createInstance(RestartFrameAction, RestartFrameAction.ID, RestartFrameAction.LABEL));
			}
			actions.push(new CopyStackTraceAction(CopyStackTraceAction.ID, CopyStackTraceAction.LABEL));
		}

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

export class CallStackDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		if (typeof element === 'string') {
			return element;
		}

		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof Model || element instanceof Process || (element instanceof Thread && (<Thread>element).stopped);
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof Thread) {
			return this.getThreadChildren(element);
		}
		if (element instanceof Model) {
			return TPromise.as(element.getProcesses());
		}

		const process = <debug.IProcess>element;
		return TPromise.as(process.getAllThreads());
	}

	private getThreadChildren(thread: Thread): TPromise<any> {
		return thread.fetchCallStack().then((callStack: any[]) => {
			if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
				return callStack.concat([thread.stoppedDetails.framesErrorMessage]);
			}
			if (thread.stoppedDetails && thread.stoppedDetails.totalFrames > callStack.length) {
				return callStack.concat([new ThreadAndProcessIds(thread.process.getId(), thread.threadId)]);
			}

			return callStack;
		});
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IThreadTemplateData {
	thread: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
}

interface IProcessTemplateData {
	process: HTMLElement;
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

export class CallStackRenderer implements IRenderer {

	private static THREAD_TEMPLATE_ID = 'thread';
	private static STACK_FRAME_TEMPLATE_ID = 'stackFrame';
	private static ERROR_TEMPLATE_ID = 'error';
	private static LOAD_MORE_TEMPLATE_ID = 'loadMore';
	private static PROCESS_TEMPLATE_ID = 'process';

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Process) {
			return CallStackRenderer.PROCESS_TEMPLATE_ID;
		}
		if (element instanceof Thread) {
			return CallStackRenderer.THREAD_TEMPLATE_ID;
		}
		if (element instanceof StackFrame) {
			return CallStackRenderer.STACK_FRAME_TEMPLATE_ID;
		}
		if (typeof element === 'string') {
			return CallStackRenderer.ERROR_TEMPLATE_ID;
		}

		return CallStackRenderer.LOAD_MORE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === CallStackRenderer.PROCESS_TEMPLATE_ID) {
			let data: IProcessTemplateData = Object.create(null);
			data.process = dom.append(container, $('.process'));
			data.name = dom.append(data.process, $('.name'));
			data.state = dom.append(data.process, $('.state'));
			data.stateLabel = dom.append(data.state, $('span.label'));

			return data;
		}

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
		data.label = dom.append(data.stackFrame, $('span.label.expression'));
		data.file = dom.append(data.stackFrame, $('.file'));
		data.fileName = dom.append(data.file, $('span.file-name'));
		data.lineNumber = dom.append(data.file, $('span.line-number'));

		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === CallStackRenderer.PROCESS_TEMPLATE_ID) {
			this.renderProcess(element, templateData);
		} else if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			this.renderThread(element, templateData);
		} else if (templateId === CallStackRenderer.STACK_FRAME_TEMPLATE_ID) {
			this.renderStackFrame(element, templateData);
		} else if (templateId === CallStackRenderer.ERROR_TEMPLATE_ID) {
			this.renderError(element, templateData);
		} else if (templateId === CallStackRenderer.LOAD_MORE_TEMPLATE_ID) {
			this.renderLoadMore(element, templateData);
		}
	}

	private renderProcess(process: debug.IProcess, data: IProcessTemplateData): void {
		data.process.title = nls.localize({ key: 'process', comment: ['Process is a noun'] }, "Process");
		data.name.textContent = process.name;
		const stoppedThread = process.getAllThreads().filter(t => t.stopped).pop();

		data.stateLabel.textContent = stoppedThread ? nls.localize('paused', "Paused")
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	private renderThread(thread: debug.IThread, data: IThreadTemplateData): void {
		data.thread.title = nls.localize('thread', "Thread");
		data.name.textContent = thread.name;

		data.stateLabel.textContent = thread.stopped ? nls.localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", thread.stoppedDetails.reason)
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	private renderError(element: string, data: IErrorTemplateData) {
		data.label.textContent = element;
		data.label.title = element;
	}

	private renderLoadMore(element: any, data: ILoadMoreTemplateData): void {
		data.label.textContent = nls.localize('loadMoreStackFrames', "Load More Stack Frames");
	}

	private renderStackFrame(stackFrame: debug.IStackFrame, data: IStackFrameTemplateData): void {
		stackFrame.source.deemphasize ? dom.addClass(data.stackFrame, 'disabled') : dom.removeClass(data.stackFrame, 'disabled');
		data.file.title = stackFrame.source.raw.path || stackFrame.source.name;
		if (stackFrame.source.raw.origin) {
			data.file.title += `\n${stackFrame.source.raw.origin}`;
		}
		data.label.textContent = stackFrame.name;
		data.label.title = stackFrame.name;
		data.fileName.textContent = getSourceName(stackFrame.source, this.contextService);
		if (stackFrame.lineNumber !== undefined) {
			data.lineNumber.textContent = `${stackFrame.lineNumber}`;
			dom.removeClass(data.lineNumber, 'unavailable');
		} else {
			dom.addClass(data.lineNumber, 'unavailable');
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class CallstackAccessibilityProvider implements IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Thread) {
			return nls.localize('threadAriaLabel', "Thread {0}, callstack, debug", (<Thread>element).name);
		}
		if (element instanceof StackFrame) {
			return nls.localize('stackFrameAriaLabel', "Stack Frame {0} line {1} {2}, callstack, debug", (<StackFrame>element).name, (<StackFrame>element).lineNumber, getSourceName((<StackFrame>element).source, this.contextService));
		}

		return null;
	}
}

// variables

export class VariablesActionProvider implements IActionProvider {

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return element instanceof Variable;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		const variable = <Variable>element;
		actions.push(this.instantiationService.createInstance(SetValueAction, SetValueAction.ID, SetValueAction.LABEL, variable));
		actions.push(this.instantiationService.createInstance(CopyValueAction, CopyValueAction.ID, CopyValueAction.LABEL, variable));
		actions.push(new Separator());
		actions.push(this.instantiationService.createInstance(AddToWatchExpressionsAction, AddToWatchExpressionsAction.ID, AddToWatchExpressionsAction.LABEL, variable));

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

export class VariablesDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		if (element instanceof ViewModel || element instanceof Scope) {
			return true;
		}

		let variable = <Variable>element;
		return variable.hasChildren && !equalsIgnoreCase(variable.value, 'null');
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof ViewModel) {
			const focusedStackFrame = (<ViewModel>element).focusedStackFrame;
			return focusedStackFrame ? focusedStackFrame.getScopes() : TPromise.as([]);
		}

		let scope = <Scope>element;
		return scope.getChildren();
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
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

export class VariablesRenderer implements IRenderer {

	private static SCOPE_TEMPLATE_ID = 'scope';
	private static VARIABLE_TEMPLATE_ID = 'variable';

	constructor(
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		// noop
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Scope) {
			return VariablesRenderer.SCOPE_TEMPLATE_ID;
		}
		if (element instanceof Variable) {
			return VariablesRenderer.VARIABLE_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === VariablesRenderer.SCOPE_TEMPLATE_ID) {
			let data: IScopeTemplateData = Object.create(null);
			data.name = dom.append(container, $('.scope'));

			return data;
		}

		let data: IVariableTemplateData = Object.create(null);
		data.expression = dom.append(container, $('.expression'));
		data.name = dom.append(data.expression, $('span.name'));
		data.value = dom.append(data.expression, $('span.value'));

		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === VariablesRenderer.SCOPE_TEMPLATE_ID) {
			this.renderScope(element, templateData);
		} else {
			const variable = <Variable>element;
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

	private renderScope(scope: Scope, data: IScopeTemplateData): void {
		data.name.textContent = scope.name;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class VariablesAccessibilityProvider implements IAccessibilityProvider {

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Scope) {
			return nls.localize('variableScopeAriaLabel', "Scope {0}, variables, debug", (<Scope>element).name);
		}
		if (element instanceof Variable) {
			return nls.localize('variableAriaLabel', "{0} value {1}, variables, debug", (<Variable>element).name, (<Variable>element).value);
		}

		return null;
	}
}

export class VariablesController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to set the value
		if (element instanceof Variable && event.detail === 2) {
			const expression = <debug.IExpression>element;
			if (!expression.hasChildren) {
				this.debugService.getViewModel().setSelectedExpression(expression);
			}
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof Variable) {
			this.debugService.getViewModel().setSelectedExpression(element);
			return true;
		}

		return false;
	}
}

// watch expressions

export class WatchExpressionsActionProvider implements IActionProvider {

	private instantiationService: IInstantiationService;

	constructor(instantiationService: IInstantiationService) {
		this.instantiationService = instantiationService;
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
			actions.push(this.instantiationService.createInstance(AddWatchExpressionAction, AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL));
			if (!expression.hasChildren) {
				actions.push(this.instantiationService.createInstance(CopyValueAction, CopyValueAction.ID, CopyValueAction.LABEL, expression.value));
			}
			actions.push(new Separator());

			actions.push(this.instantiationService.createInstance(RemoveWatchExpressionAction, RemoveWatchExpressionAction.ID, RemoveWatchExpressionAction.LABEL));
			actions.push(this.instantiationService.createInstance(RemoveAllWatchExpressionsAction, RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL));
		} else {
			actions.push(this.instantiationService.createInstance(AddWatchExpressionAction, AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL));
			if (element instanceof Variable) {
				const variable = <Variable>element;
				if (!variable.hasChildren) {
					actions.push(this.instantiationService.createInstance(CopyValueAction, CopyValueAction.ID, CopyValueAction.LABEL, variable.value));
				}
				actions.push(new Separator());
			}
			actions.push(this.instantiationService.createInstance(RemoveAllWatchExpressionsAction, RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL));
		}

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

export class WatchExpressionsDataSource implements IDataSource {

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
			return TPromise.as((<Model>element).getWatchExpressions());
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

export class WatchExpressionsRenderer implements IRenderer {

	private static WATCH_EXPRESSION_TEMPLATE_ID = 'watchExpression';
	private static VARIABLE_TEMPLATE_ID = 'variables';
	private toDispose: lifecycle.IDisposable[];
	private actionProvider: WatchExpressionsActionProvider;

	constructor(
		actionProvider: IActionProvider,
		private actionRunner: IActionRunner,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		this.toDispose = [];
		this.actionProvider = <WatchExpressionsActionProvider>actionProvider;
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

	private renderWatchExpression(tree: ITree, watchExpression: debug.IExpression, data: IWatchExpressionTemplateData): void {
		let selectedExpression = this.debugService.getViewModel().getSelectedExpression();
		if ((selectedExpression instanceof Expression && selectedExpression.getId() === watchExpression.getId()) || (watchExpression instanceof Expression && !watchExpression.name)) {
			renderRenameBox(this.debugService, this.contextViewService, tree, watchExpression, data.expression, {
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
				showHover: true
			});
			data.name.title = watchExpression.type ? watchExpression.type : watchExpression.value;
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export class WatchExpressionsAccessibilityProvider implements IAccessibilityProvider {

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

export class WatchExpressionsController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to select and copy value.
		if (element instanceof Expression && event.detail === 2) {
			const expression = <debug.IExpression>element;
			if (!expression.hasChildren) {
				this.debugService.getViewModel().setSelectedExpression(expression);
			}
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof Expression) {
			const watchExpression = <Expression>element;
			if (!watchExpression.hasChildren) {
				this.debugService.getViewModel().setSelectedExpression(watchExpression);
			}
			return true;
		}

		return false;
	}

	protected onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof Expression) {
			const we = <Expression>element;
			this.debugService.removeWatchExpressions(we.getId());

			return true;
		}

		return false;
	}
}

export class WatchExpressionsDragAndDrop extends DefaultDragAndDrop {

	constructor( @debug.IDebugService private debugService: debug.IDebugService) {
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

// breakpoints

export class BreakpointsActionProvider implements IActionProvider {

	constructor(private instantiationService: IInstantiationService, private debugService: debug.IDebugService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;;
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return element instanceof Breakpoint || element instanceof ExceptionBreakpoint || element instanceof FunctionBreakpoint;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];

		if (element instanceof Breakpoint || element instanceof FunctionBreakpoint) {
			actions.push(this.instantiationService.createInstance(RemoveBreakpointAction, RemoveBreakpointAction.ID, RemoveBreakpointAction.LABEL));
		}
		if (this.debugService.getModel().getBreakpoints().length + this.debugService.getModel().getFunctionBreakpoints().length > 1) {
			actions.push(this.instantiationService.createInstance(RemoveAllBreakpointsAction, RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL));
			actions.push(new Separator());

			actions.push(this.instantiationService.createInstance(EnableAllBreakpointsAction, EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL));
			actions.push(this.instantiationService.createInstance(DisableAllBreakpointsAction, DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL));
		}

		actions.push(new Separator());
		actions.push(this.instantiationService.createInstance(ReapplyBreakpointsAction, ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL));

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

export class BreakpointsDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof Model;
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		const model = <Model>element;
		const exBreakpoints = <debug.IEnablement[]>model.getExceptionBreakpoints();

		return TPromise.as(exBreakpoints.concat(model.getFunctionBreakpoints()).concat(model.getBreakpoints()));
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IBaseBreakpointTemplateData {
	breakpoint: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: debug.IEnablement;
	toDispose: lifecycle.IDisposable[];
}

interface IBreakpointTemplateData extends IBaseBreakpointTemplateData {
	lineNumber: HTMLElement;
	filePath: HTMLElement;
}

export class BreakpointsRenderer implements IRenderer {

	private static EXCEPTION_BREAKPOINT_TEMPLATE_ID = 'exceptionBreakpoint';
	private static FUNCTION_BREAKPOINT_TEMPLATE_ID = 'functionBreakpoint';
	private static BREAKPOINT_TEMPLATE_ID = 'breakpoint';

	constructor(
		private actionProvider: BreakpointsActionProvider,
		private actionRunner: IActionRunner,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@debug.IDebugService private debugService: debug.IDebugService,
		@IContextViewService private contextViewService: IContextViewService
	) {
		// noop
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof Breakpoint) {
			return BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID;
		}
		if (element instanceof FunctionBreakpoint) {
			return BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID;
		}
		if (element instanceof ExceptionBreakpoint) {
			return BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID;
		}

		return null;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		const data: IBreakpointTemplateData = Object.create(null);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDispose = [];
		data.toDispose.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		if (templateId === BreakpointsRenderer.BREAKPOINT_TEMPLATE_ID) {
			data.filePath = dom.append(data.breakpoint, $('span.file-path'));
			const lineNumberContainer = dom.append(data.breakpoint, $('.line-number-container'));
			data.lineNumber = dom.append(lineNumberContainer, $('span.line-number'));
		}
		if (templateId === BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID) {
			dom.addClass(data.breakpoint, 'exception');
		}

		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		templateData.context = element;
		if (templateId === BreakpointsRenderer.EXCEPTION_BREAKPOINT_TEMPLATE_ID) {
			this.renderExceptionBreakpoint(element, templateData);
		} else if (templateId === BreakpointsRenderer.FUNCTION_BREAKPOINT_TEMPLATE_ID) {
			this.renderFunctionBreakpoint(tree, element, templateData);
		} else {
			this.renderBreakpoint(tree, element, templateData);
		}
	}

	private renderExceptionBreakpoint(exceptionBreakpoint: debug.IExceptionBreakpoint, data: IBaseBreakpointTemplateData): void {
		data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;;
		data.breakpoint.title = data.name.textContent;
		data.checkbox.checked = exceptionBreakpoint.enabled;
	}

	private renderFunctionBreakpoint(tree: ITree, functionBreakpoint: debug.IFunctionBreakpoint, data: IBaseBreakpointTemplateData): void {
		const selected = this.debugService.getViewModel().getSelectedFunctionBreakpoint();
		if (!functionBreakpoint.name || (selected && selected.getId() === functionBreakpoint.getId())) {
			data.name.textContent = '';
			renderRenameBox(this.debugService, this.contextViewService, tree, functionBreakpoint, data.breakpoint, {
				initialValue: functionBreakpoint.name,
				placeholder: nls.localize('functionBreakpointPlaceholder', "Function to break on"),
				ariaLabel: nls.localize('functionBreakPointInputAriaLabel', "Type function breakpoint")
			});
		} else {
			data.name.textContent = functionBreakpoint.name;
			data.checkbox.checked = functionBreakpoint.enabled;
			data.breakpoint.title = functionBreakpoint.name;

			// Mark function breakpoints as disabled if deactivated or if debug type does not support them #9099
			const process = this.debugService.getViewModel().focusedProcess;
			if ((process && !process.session.configuration.capabilities.supportsFunctionBreakpoints) || !this.debugService.getModel().areBreakpointsActivated()) {
				tree.addTraits('disabled', [functionBreakpoint]);
				if (process && !process.session.configuration.capabilities.supportsFunctionBreakpoints) {
					data.breakpoint.title = nls.localize('functionBreakpointsNotSupported', "Function breakpoints are not supported by this debug type");
				}
			} else {
				tree.removeTraits('disabled', [functionBreakpoint]);
			}
		}
	}

	private renderBreakpoint(tree: ITree, breakpoint: debug.IBreakpoint, data: IBreakpointTemplateData): void {
		this.debugService.getModel().areBreakpointsActivated() ? tree.removeTraits('disabled', [breakpoint]) : tree.addTraits('disabled', [breakpoint]);

		data.name.textContent = getPathLabel(paths.basename(breakpoint.uri.fsPath), this.contextService);
		data.lineNumber.textContent = breakpoint.lineNumber.toString();
		if (breakpoint.column) {
			data.lineNumber.textContent += `:${breakpoint.column}`;
		}
		data.filePath.textContent = getPathLabel(paths.dirname(breakpoint.uri.fsPath), this.contextService);
		data.checkbox.checked = breakpoint.enabled;

		const debugActive = this.debugService.state === debug.State.Running || this.debugService.state === debug.State.Stopped || this.debugService.state === debug.State.Initializing;
		if (debugActive && !breakpoint.verified) {
			tree.addTraits('disabled', [breakpoint]);
			if (breakpoint.message) {
				data.breakpoint.title = breakpoint.message;
			}
		} else if (breakpoint.condition || breakpoint.hitCondition) {
			data.breakpoint.title = breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition;
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		lifecycle.dispose(templateData.toDispose);
	}
}

export class BreakpointsAccessibilityProvider implements IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Breakpoint) {
			return nls.localize('breakpointAriaLabel', "Breakpoint line {0} {1}, breakpoints, debug", (<Breakpoint>element).lineNumber, getPathLabel(paths.basename((<Breakpoint>element).uri.fsPath), this.contextService), this.contextService);
		}
		if (element instanceof FunctionBreakpoint) {
			return nls.localize('functionBreakpointAriaLabel', "Function breakpoint {0}, breakpoints, debug", (<FunctionBreakpoint>element).name);
		}
		if (element instanceof ExceptionBreakpoint) {
			return nls.localize('exceptionBreakpointAriaLabel', "Exception breakpoint {0}, breakpoints, debug", (<ExceptionBreakpoint>element).filter);
		}

		return null;
	}
}

export class BreakpointsController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		if (element instanceof FunctionBreakpoint && event.detail === 2) {
			this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
			return true;
		}
		if (element instanceof Breakpoint) {
			this.openBreakpointSource(element, event, true);
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onRename(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof FunctionBreakpoint && element.name) {
			this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
			return true;
		}

		return false;
	}

	protected onEnter(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof Breakpoint) {
			this.openBreakpointSource(element, event, false);
			return true;
		}

		return super.onEnter(tree, event);
	}

	protected onSpace(tree: ITree, event: IKeyboardEvent): boolean {
		super.onSpace(tree, event);
		const element = <debug.IEnablement>tree.getFocus();
		this.debugService.enableOrDisableBreakpoints(!element.enabled, element).done(null, errors.onUnexpectedError);

		return true;
	}

	protected onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		const element = tree.getFocus();
		if (element instanceof Breakpoint) {
			this.debugService.removeBreakpoints((<Breakpoint>element).getId()).done(null, errors.onUnexpectedError);
			return true;
		} else if (element instanceof FunctionBreakpoint) {
			const fbp = <FunctionBreakpoint>element;
			this.debugService.removeFunctionBreakpoints(fbp.getId()).done(null, errors.onUnexpectedError);

			return true;
		}

		return false;
	}

	private openBreakpointSource(breakpoint: Breakpoint, event: IKeyboardEvent | IMouseEvent, preserveFocus: boolean): void {
		const sideBySide = (event && (event.ctrlKey || event.metaKey));
		this.editorService.openEditor({
			resource: breakpoint.uri,
			options: {
				preserveFocus,
				selection: { startLineNumber: breakpoint.lineNumber, startColumn: 1 },
				revealIfVisible: true,
				revealInCenterIfOutsideViewport: true
			}
		}, sideBySide).done(undefined, errors.onUnexpectedError);
	}
}
