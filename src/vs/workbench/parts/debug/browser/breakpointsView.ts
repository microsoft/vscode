/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import * as dom from 'vs/base/browser/dom';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IAction, Action } from 'vs/base/common/actions';
import { IDebugService, IBreakpoint, CONTEXT_BREAKPOINTS_FOCUSED, EDITOR_CONTRIBUTION_ID, State, DEBUG_SCHEME, IFunctionBreakpoint, IExceptionBreakpoint, IEnablement, IDebugEditorContribution } from 'vs/workbench/parts/debug/common/debug';
import { ExceptionBreakpoint, FunctionBreakpoint, Breakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import { AddFunctionBreakpointAction, ToggleBreakpointsActivatedAction, RemoveAllBreakpointsAction, RemoveBreakpointAction, EnableAllBreakpointsAction, DisableAllBreakpointsAction, ReapplyBreakpointsAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Constants } from 'vs/editor/common/core/uint';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getPathLabel } from 'vs/base/common/labels';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/paths';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDelegate, IListContextMenuEvent, IRenderer } from 'vs/base/browser/ui/list/list';
import { IEditorService, IEditor } from 'vs/platform/editor/common/editor';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ViewsViewletPanel, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

const $ = dom.$;

export class BreakpointsView extends ViewsViewletPanel {

	private static readonly MAX_VISIBLE_FILES = 9;
	private static readonly MEMENTO = 'breakopintsview.memento';
	private settings: any;
	private list: WorkbenchList<IEnablement>;
	private needsRefresh: boolean;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IEditorService private editorService: IEditorService,
		@IContextViewService private contextViewService: IContextViewService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(options, keybindingService, contextMenuService, configurationService);

		this.minimumBodySize = this.maximumBodySize = this.getExpandedBodySize();
		this.settings = options.viewletSettings;
		this.disposables.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-breakpoints');
		const delegate = new BreakpointsDelegate(this.debugService);

		this.list = this.instantiationService.createInstance(WorkbenchList, container, delegate, [
			this.instantiationService.createInstance(BreakpointsRenderer),
			new ExceptionBreakpointsRenderer(this.debugService),
			this.instantiationService.createInstance(FunctionBreakpointsRenderer),
			new FunctionBreakpointInputRenderer(this.debugService, this.contextViewService, this.themeService)
		], {
				identityProvider: element => element.getId(),
				multipleSelectionSupport: false
			}) as WorkbenchList<IEnablement>;

		CONTEXT_BREAKPOINTS_FOCUSED.bindTo(this.list.contextKeyService);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);

		this.disposables.push(this.list.onOpen(e => {
			let isSingleClick = false;
			let isDoubleClick = false;
			let openToSide = false;

			const browserEvent = e.browserEvent;
			if (browserEvent instanceof MouseEvent) {
				isSingleClick = browserEvent.detail === 1;
				isDoubleClick = browserEvent.detail === 2;
				openToSide = (browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey);
			}

			const focused = this.list.getFocusedElements();
			const element = focused.length ? focused[0] : undefined;
			if (element instanceof Breakpoint) {
				openBreakpointSource(element, openToSide, isSingleClick, this.debugService, this.editorService).done(undefined, onUnexpectedError);
			}
			if (isDoubleClick && element instanceof FunctionBreakpoint && element !== this.debugService.getViewModel().getSelectedFunctionBreakpoint()) {
				this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
				this.onBreakpointsChange();
			}
		}));

		this.list.splice(0, this.list.length, this.elements);
	}

	protected layoutBody(size: number): void {
		if (this.list) {
			this.list.layout(size);
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<IEnablement>): void {
		const actions: IAction[] = [];
		const element = e.element;

		if (element instanceof Breakpoint) {
			actions.push(new Action('workbench.action.debug.openEditorAndEditBreakpoint', nls.localize('editConditionalBreakpoint', "Edit Breakpoint..."), undefined, true, () => {
				return openBreakpointSource(element, false, false, this.debugService, this.editorService).then(editor => {
					const codeEditor = editor.getControl();
					if (isCodeEditor(codeEditor)) {
						codeEditor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(element.lineNumber, element.column);
					}
				});
			}));
			actions.push(new Separator());
		}

		actions.push(new RemoveBreakpointAction(RemoveBreakpointAction.ID, RemoveBreakpointAction.LABEL, this.debugService, this.keybindingService));


		if (this.debugService.getModel().getBreakpoints().length + this.debugService.getModel().getFunctionBreakpoints().length > 1) {
			actions.push(new RemoveAllBreakpointsAction(RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new Separator());

			actions.push(new EnableAllBreakpointsAction(EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new DisableAllBreakpointsAction(DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
		}

		actions.push(new Separator());
		actions.push(new ReapplyBreakpointsAction(ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL, this.debugService, this.keybindingService));

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(actions),
			getActionsContext: () => element
		});
	}

	public getActions(): IAction[] {
		return [
			new AddFunctionBreakpointAction(AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL, this.debugService, this.keybindingService),
			new ToggleBreakpointsActivatedAction(ToggleBreakpointsActivatedAction.ID, ToggleBreakpointsActivatedAction.ACTIVATE_LABEL, this.debugService, this.keybindingService),
			new RemoveAllBreakpointsAction(RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL, this.debugService, this.keybindingService)
		];
	}

	public setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		if (expanded && this.needsRefresh) {
			this.onBreakpointsChange();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible && this.needsRefresh) {
				this.onBreakpointsChange();
			}
		});
	}

	private onBreakpointsChange(): void {
		if (this.isExpanded() && this.isVisible()) {
			this.minimumBodySize = this.getExpandedBodySize();
			if (this.maximumBodySize < Number.POSITIVE_INFINITY) {
				this.maximumBodySize = this.minimumBodySize;
			}
			if (this.list) {
				this.list.splice(0, this.list.length, this.elements);
				this.needsRefresh = false;
			}
		} else {
			this.needsRefresh = true;
		}
	}

	private get elements(): IEnablement[] {
		const model = this.debugService.getModel();
		const elements = (<IEnablement[]>model.getExceptionBreakpoints()).concat(model.getFunctionBreakpoints()).concat(model.getBreakpoints());

		return elements;
	}

	private getExpandedBodySize(): number {
		const model = this.debugService.getModel();
		const length = model.getBreakpoints().length + model.getExceptionBreakpoints().length + model.getFunctionBreakpoints().length;
		return Math.min(BreakpointsView.MAX_VISIBLE_FILES, length) * 22;
	}

	public shutdown(): void {
		this.settings[BreakpointsView.MEMENTO] = !this.isExpanded();
	}
}

class BreakpointsDelegate implements IDelegate<IEnablement> {

	constructor(private debugService: IDebugService) {
		// noop
	}

	getHeight(element: IEnablement): number {
		return 22;
	}

	getTemplateId(element: IEnablement): string {
		if (element instanceof Breakpoint) {
			return BreakpointsRenderer.ID;
		}
		if (element instanceof FunctionBreakpoint) {
			const selected = this.debugService.getViewModel().getSelectedFunctionBreakpoint();
			if (!element.name || (selected && selected.getId() === element.getId())) {
				return FunctionBreakpointInputRenderer.ID;
			}

			return FunctionBreakpointsRenderer.ID;
		}
		if (element instanceof ExceptionBreakpoint) {
			return ExceptionBreakpointsRenderer.ID;
		}

		return undefined;
	}
}

interface IBaseBreakpointTemplateData {
	breakpoint: HTMLElement;
	name: HTMLElement;
	checkbox: HTMLInputElement;
	context: IEnablement;
	toDispose: IDisposable[];
}

interface IBaseBreakpointWithIconTemplateData extends IBaseBreakpointTemplateData {
	icon: HTMLElement;
}

interface IBreakpointTemplateData extends IBaseBreakpointWithIconTemplateData {
	lineNumber: HTMLElement;
	filePath: HTMLElement;
}

interface IInputTemplateData {
	inputBox: InputBox;
	breakpoint: IFunctionBreakpoint;
	reactedOnEvent: boolean;
	toDispose: IDisposable[];
}

class BreakpointsRenderer implements IRenderer<IBreakpoint, IBreakpointTemplateData> {

	constructor(
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITextFileService private textFileService: ITextFileService
	) {
		// noop
	}

	static readonly ID = 'breakpoints';

	get templateId() {
		return BreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IBreakpointTemplateData {
		const data: IBreakpointTemplateData = Object.create(null);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.icon = $('.icon');
		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDispose = [];
		data.toDispose.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		data.filePath = dom.append(data.breakpoint, $('span.file-path'));
		const lineNumberContainer = dom.append(data.breakpoint, $('.line-number-container'));
		data.lineNumber = dom.append(lineNumberContainer, $('span.line-number'));

		return data;
	}

	renderElement(breakpoint: IBreakpoint, index: number, data: IBreakpointTemplateData): void {
		data.context = breakpoint;
		dom.toggleClass(data.breakpoint, 'disabled', !this.debugService.getModel().areBreakpointsActivated());

		data.name.textContent = basename(getPathLabel(breakpoint.uri, this.contextService));
		data.lineNumber.textContent = breakpoint.lineNumber.toString();
		if (breakpoint.column) {
			data.lineNumber.textContent += `:${breakpoint.column}`;
		}
		data.filePath.textContent = getPathLabel(resources.dirname(breakpoint.uri), this.contextService, this.environmentService);
		data.checkbox.checked = breakpoint.enabled;

		const { message, className } = getBreakpointMessageAndClassName(this.debugService, this.textFileService, breakpoint);
		data.icon.className = className + ' icon';
		data.icon.title = message ? message : '';

		const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
		if (debugActive && !breakpoint.verified) {
			dom.addClass(data.breakpoint, 'disabled');
			if (breakpoint.message) {
				data.breakpoint.title = breakpoint.message;
			}
		} else if (breakpoint.condition || breakpoint.hitCondition) {
			data.breakpoint.title = breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition;
		}
	}

	disposeTemplate(templateData: IBreakpointTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class ExceptionBreakpointsRenderer implements IRenderer<IExceptionBreakpoint, IBaseBreakpointTemplateData> {

	constructor(
		private debugService: IDebugService
	) {
		// noop
	}

	static readonly ID = 'exceptionbreakpoints';

	get templateId() {
		return ExceptionBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IBaseBreakpointTemplateData {
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
		dom.addClass(data.breakpoint, 'exception');

		return data;
	}

	renderElement(exceptionBreakpoint: IExceptionBreakpoint, index: number, data: IBaseBreakpointTemplateData): void {
		data.context = exceptionBreakpoint;
		data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;
		data.breakpoint.title = data.name.textContent;
		data.checkbox.checked = exceptionBreakpoint.enabled;
	}

	disposeTemplate(templateData: IBaseBreakpointTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class FunctionBreakpointsRenderer implements IRenderer<FunctionBreakpoint, IBaseBreakpointWithIconTemplateData> {

	constructor(
		@IDebugService private debugService: IDebugService,
		@ITextFileService private textFileService: ITextFileService
	) {
		// noop
	}

	static readonly ID = 'functionbreakpoints';

	get templateId() {
		return FunctionBreakpointsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IBaseBreakpointWithIconTemplateData {
		const data: IBreakpointTemplateData = Object.create(null);
		data.breakpoint = dom.append(container, $('.breakpoint'));

		data.icon = $('.icon');
		data.checkbox = <HTMLInputElement>$('input');
		data.checkbox.type = 'checkbox';
		data.toDispose = [];
		data.toDispose.push(dom.addStandardDisposableListener(data.checkbox, 'change', (e) => {
			this.debugService.enableOrDisableBreakpoints(!data.context.enabled, data.context);
		}));

		dom.append(data.breakpoint, data.icon);
		dom.append(data.breakpoint, data.checkbox);

		data.name = dom.append(data.breakpoint, $('span.name'));

		return data;
	}

	renderElement(functionBreakpoint: FunctionBreakpoint, index: number, data: IBaseBreakpointWithIconTemplateData): void {
		data.context = functionBreakpoint;
		data.name.textContent = functionBreakpoint.name;
		const { className, message } = getBreakpointMessageAndClassName(this.debugService, this.textFileService, functionBreakpoint);
		data.icon.className = className + ' icon';
		data.icon.title = message ? message : '';
		data.checkbox.checked = functionBreakpoint.enabled;
		data.breakpoint.title = functionBreakpoint.name;

		// Mark function breakpoints as disabled if deactivated or if debug type does not support them #9099
		const process = this.debugService.getViewModel().focusedProcess;
		dom.toggleClass(data.breakpoint, 'disalbed', (process && !process.session.capabilities.supportsFunctionBreakpoints) || !this.debugService.getModel().areBreakpointsActivated());
		if (process && !process.session.capabilities.supportsFunctionBreakpoints) {
			data.breakpoint.title = nls.localize('functionBreakpointsNotSupported', "Function breakpoints are not supported by this debug type");
		}
	}

	disposeTemplate(templateData: IBaseBreakpointWithIconTemplateData): void {
		dispose(templateData.toDispose);
	}
}

class FunctionBreakpointInputRenderer implements IRenderer<IFunctionBreakpoint, IInputTemplateData> {

	constructor(
		private debugService: IDebugService,
		private contextViewService: IContextViewService,
		private themeService: IThemeService
	) {
		// noop
	}

	static readonly ID = 'functionbreakpointinput';

	get templateId() {
		return FunctionBreakpointInputRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IInputTemplateData {
		const template: IInputTemplateData = Object.create(null);
		const inputBoxContainer = dom.append(container, $('.inputBoxContainer'));
		const inputBox = new InputBox(inputBoxContainer, this.contextViewService, {
			placeholder: nls.localize('functionBreakpointPlaceholder', "Function to break on"),
			ariaLabel: nls.localize('functionBreakPointInputAriaLabel', "Type function breakpoint")
		});
		const styler = attachInputBoxStyler(inputBox, this.themeService);
		const toDispose: IDisposable[] = [inputBox, styler];

		const wrapUp = (renamed: boolean) => {
			if (!template.reactedOnEvent) {
				template.reactedOnEvent = true;
				this.debugService.getViewModel().setSelectedFunctionBreakpoint(undefined);
				if (inputBox.value && (renamed || template.breakpoint.name)) {
					this.debugService.renameFunctionBreakpoint(template.breakpoint.getId(), renamed ? inputBox.value : template.breakpoint.name).done(null, onUnexpectedError);
				} else {
					this.debugService.removeFunctionBreakpoints(template.breakpoint.getId()).done(null, onUnexpectedError);
				}
			}
		};

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

		template.inputBox = inputBox;
		template.toDispose = toDispose;
		return template;
	}

	renderElement(functionBreakpoint: IFunctionBreakpoint, index: number, data: IInputTemplateData): void {
		data.breakpoint = functionBreakpoint;
		data.reactedOnEvent = false;
		data.inputBox.value = functionBreakpoint.name || '';
		data.inputBox.focus();
		data.inputBox.select();
	}

	disposeTemplate(templateData: IInputTemplateData): void {
		dispose(templateData.toDispose);
	}
}

export function openBreakpointSource(breakpoint: Breakpoint, sideBySide: boolean, preserveFocus: boolean, debugService: IDebugService, editorService: IEditorService): TPromise<IEditor> {
	if (breakpoint.uri.scheme === DEBUG_SCHEME && debugService.state === State.Inactive) {
		return TPromise.as(null);
	}

	const selection = breakpoint.endLineNumber ? {
		startLineNumber: breakpoint.lineNumber,
		endLineNumber: breakpoint.endLineNumber,
		startColumn: breakpoint.column,
		endColumn: breakpoint.endColumn
	} : {
			startLineNumber: breakpoint.lineNumber,
			startColumn: breakpoint.column || 1,
			endLineNumber: breakpoint.lineNumber,
			endColumn: breakpoint.column || Constants.MAX_SAFE_SMALL_INTEGER
		};

	return editorService.openEditor({
		resource: breakpoint.uri,
		options: {
			preserveFocus,
			selection,
			revealIfVisible: true,
			revealInCenterIfOutsideViewport: true,
			pinned: !preserveFocus
		}
	}, sideBySide);
}

export function getBreakpointMessageAndClassName(debugService: IDebugService, textFileService: ITextFileService, breakpoint: IBreakpoint | FunctionBreakpoint): { message?: string, className: string } {
	const state = debugService.state;
	const debugActive = state === State.Running || state === State.Stopped;

	if (!breakpoint.enabled || !debugService.getModel().areBreakpointsActivated()) {
		return {
			className: 'debug-breakpoint-disabled-glyph',
			message: nls.localize('breakpointDisabledHover', "Disabled breakpoint"),
		};
	}

	const appendMessage = (text: string): string => {
		return !(breakpoint instanceof FunctionBreakpoint) && breakpoint.message ? text.concat(', ' + breakpoint.message) : text;
	};
	if (debugActive && !breakpoint.verified) {
		return {
			className: 'debug-breakpoint-unverified-glyph',
			message: appendMessage(nls.localize('breakpointUnverifieddHover', "Unverified breakpoint")),
		};
	}

	const process = debugService.getViewModel().focusedProcess;
	if (breakpoint instanceof FunctionBreakpoint) {
		if (process && !process.session.capabilities.supportsFunctionBreakpoints) {
			return {
				className: 'debug-breakpoint-unsupported-glyph',
				message: nls.localize('functionBreakpointUnsupported', "Function breakpoints not supported by this debug type"),
			};
		}

		return {
			className: 'debug-breakpoint-glyph',
		};
	}

	if (debugActive && textFileService.isDirty(breakpoint.uri)) {
		return {
			className: 'debug-breakpoint-unverified-glyph',
			message: appendMessage(nls.localize('breakpointDirtydHover', "Unverified breakpoint. File is modified, please restart debug session.")),
		};
	}

	if (breakpoint.condition || breakpoint.hitCondition) {
		if (process && breakpoint.condition && !process.session.capabilities.supportsConditionalBreakpoints) {
			return {
				className: 'debug-breakpoint-unsupported-glyph',
				message: nls.localize('conditionalBreakpointUnsupported', "Conditional breakpoints not supported by this debug type"),
			};
		}
		if (process && breakpoint.hitCondition && !process.session.capabilities.supportsHitConditionalBreakpoints) {
			return {
				className: 'debug-breakpoint-unsupported-glyph',
				message: nls.localize('hitBreakpointUnsupported', "Hit conditional breakpoints not supported by this debug type"),
			};
		}

		if (breakpoint.condition && breakpoint.hitCondition) {
			return {
				className: 'debug-breakpoint-conditional-glyph',
				message: appendMessage(`Expression: ${breakpoint.condition}\nHitCount: ${breakpoint.hitCondition}`)
			};
		}

		return {
			className: 'debug-breakpoint-conditional-glyph',
			message: appendMessage(breakpoint.condition ? breakpoint.condition : breakpoint.hitCondition)
		};
	}

	return {
		className: 'debug-breakpoint-glyph',
		message: breakpoint.message
	};
}
