/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { IHighlightEvent, ITree, IAccessibilityProvider, IRenderer, IDataSource, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IViewletViewOptions, IViewOptions, TreeViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, IBreakpoint, CONTEXT_BREAKPOINTS_FOCUSED, State, DEBUG_SCHEME, IFunctionBreakpoint, IExceptionBreakpoint, IEnablement } from 'vs/workbench/parts/debug/common/debug';
import { ExceptionBreakpoint, FunctionBreakpoint, Breakpoint, Model } from 'vs/workbench/parts/debug/common/debugModel';
import { AddFunctionBreakpointAction, ToggleBreakpointsActivatedAction, RemoveAllBreakpointsAction, RemoveBreakpointAction, EnableAllBreakpointsAction, DisableAllBreakpointsAction, ReapplyBreakpointsAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IListService } from 'vs/platform/list/browser/listService';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { once } from 'vs/base/common/event';
import { BaseDebugController, renderRenameBox, renderViewTree, twistiePixels } from 'vs/workbench/parts/debug/electron-browser/baseDebugView';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Constants } from 'vs/editor/common/core/uint';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { getPathLabel } from 'vs/base/common/labels';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/paths';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';

const $ = dom.$;

export class BreakpointsView extends TreeViewsViewletPanel {

	private static readonly MAX_VISIBLE_FILES = 9;
	private static readonly MEMENTO = 'breakopintsview.memento';
	private breakpointsFocusedContext: IContextKey<boolean>;
	private settings: any;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService
	) {
		super({
			...(options as IViewOptions),
			ariaHeaderLabel: nls.localize('breakpointsSection', "Breakpoints Section")
		}, keybindingService, contextMenuService);

		this.minimumBodySize = this.maximumBodySize = this.getExpandedBodySize();
		this.settings = options.viewletSettings;
		this.breakpointsFocusedContext = CONTEXT_BREAKPOINTS_FOCUSED.bindTo(contextKeyService);
		this.disposables.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-breakpoints');
		this.treeContainer = renderViewTree(container);
		const actionProvider = new BreakpointsActionProvider(this.debugService, this.keybindingService, );
		const controller = this.instantiationService.createInstance(BreakpointsController, actionProvider, MenuId.DebugBreakpointsContext);

		this.tree = new Tree(this.treeContainer, {
			dataSource: new BreakpointsDataSource(),
			renderer: this.instantiationService.createInstance(BreakpointsRenderer),
			accessibilityProvider: this.instantiationService.createInstance(BreakpointsAccessibilityProvider),
			controller,
			sorter: {
				compare(tree: ITree, element: any, otherElement: any): number {
					const first = <IBreakpoint>element;
					const second = <IBreakpoint>otherElement;
					if (first instanceof ExceptionBreakpoint) {
						return -1;
					}
					if (second instanceof ExceptionBreakpoint) {
						return 1;
					}
					if (first instanceof FunctionBreakpoint) {
						return -1;
					}
					if (second instanceof FunctionBreakpoint) {
						return 1;
					}

					if (first.uri.toString() !== second.uri.toString()) {
						return resources.basenameOrAuthority(first.uri).localeCompare(resources.basenameOrAuthority(second.uri));
					}
					if (first.lineNumber === second.lineNumber) {
						return first.column - second.column;
					}

					return first.lineNumber - second.lineNumber;
				}
			}
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'breakpointsAriaTreeLabel' }, "Debug Breakpoints"),
				twistiePixels,
				keyboardSupport: false
			});

		this.disposables.push(attachListStyler(this.tree, this.themeService));
		this.disposables.push(this.listService.register(this.tree, [this.breakpointsFocusedContext]));

		this.disposables.push(this.tree.onDidChangeSelection(event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				const element = this.tree.getFocus();
				if (element instanceof Breakpoint) {
					controller.openBreakpointSource(element, event, false);
				}
			}
		}));

		const debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.disposables.push(this.debugService.getViewModel().onDidSelectFunctionBreakpoint(fbp => {
			if (!fbp || !(fbp instanceof FunctionBreakpoint)) {
				return;
			}

			this.tree.refresh(fbp, false).then(() => {
				this.tree.setHighlight(fbp);
				once(this.tree.onDidChangeHighlight)((e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedFunctionBreakpoint(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public getActions(): IAction[] {
		return [
			new AddFunctionBreakpointAction(AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL, this.debugService, this.keybindingService),
			new ToggleBreakpointsActivatedAction(ToggleBreakpointsActivatedAction.ID, ToggleBreakpointsActivatedAction.ACTIVATE_LABEL, this.debugService, this.keybindingService),
			new RemoveAllBreakpointsAction(RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL, this.debugService, this.keybindingService)
		];
	}

	private onBreakpointsChange(): void {
		this.minimumBodySize = this.getExpandedBodySize();
		if (this.maximumBodySize < Number.POSITIVE_INFINITY) {
			this.maximumBodySize = this.minimumBodySize;
		}
		if (this.tree) {
			this.tree.refresh();
		}
	}

	private getExpandedBodySize(): number {
		const model = this.debugService.getModel();
		const length = model.getBreakpoints().length + model.getExceptionBreakpoints().length + model.getFunctionBreakpoints().length;
		return Math.min(BreakpointsView.MAX_VISIBLE_FILES, length) * 22;
	}

	public shutdown(): void {
		this.settings[BreakpointsView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}

class BreakpointsActionProvider implements IActionProvider {

	constructor(private debugService: IDebugService, private keybindingService: IKeybindingService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return element instanceof Breakpoint || element instanceof ExceptionBreakpoint || element instanceof FunctionBreakpoint;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		if (element instanceof ExceptionBreakpoint) {
			return TPromise.as([]);
		}

		const actions: IAction[] = [];
		actions.push(new RemoveBreakpointAction(RemoveBreakpointAction.ID, RemoveBreakpointAction.LABEL, this.debugService, this.keybindingService));
		if (this.debugService.getModel().getBreakpoints().length + this.debugService.getModel().getFunctionBreakpoints().length > 1) {
			actions.push(new RemoveAllBreakpointsAction(RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new Separator());

			actions.push(new EnableAllBreakpointsAction(EnableAllBreakpointsAction.ID, EnableAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
			actions.push(new DisableAllBreakpointsAction(DisableAllBreakpointsAction.ID, DisableAllBreakpointsAction.LABEL, this.debugService, this.keybindingService));
		}

		actions.push(new Separator());
		actions.push(new ReapplyBreakpointsAction(ReapplyBreakpointsAction.ID, ReapplyBreakpointsAction.LABEL, this.debugService, this.keybindingService));

		return TPromise.as(actions);
	}

	public getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

class BreakpointsDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		return element.getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof Model;
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		const model = <Model>element;
		const exBreakpoints = <IEnablement[]>model.getExceptionBreakpoints();

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
	context: IEnablement;
	toDispose: IDisposable[];
}

interface IBreakpointTemplateData extends IBaseBreakpointTemplateData {
	lineNumber: HTMLElement;
	filePath: HTMLElement;
}

class BreakpointsRenderer implements IRenderer {

	private static readonly EXCEPTION_BREAKPOINT_TEMPLATE_ID = 'exceptionBreakpoint';
	private static readonly FUNCTION_BREAKPOINT_TEMPLATE_ID = 'functionBreakpoint';
	private static readonly BREAKPOINT_TEMPLATE_ID = 'breakpoint';

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IDebugService private debugService: IDebugService,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService,
		@IEnvironmentService private environmentService: IEnvironmentService
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

	private renderExceptionBreakpoint(exceptionBreakpoint: IExceptionBreakpoint, data: IBaseBreakpointTemplateData): void {
		data.name.textContent = exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`;
		data.breakpoint.title = data.name.textContent;
		data.checkbox.checked = exceptionBreakpoint.enabled;
	}

	private renderFunctionBreakpoint(tree: ITree, functionBreakpoint: IFunctionBreakpoint, data: IBaseBreakpointTemplateData): void {
		const selected = this.debugService.getViewModel().getSelectedFunctionBreakpoint();
		if (!functionBreakpoint.name || (selected && selected.getId() === functionBreakpoint.getId())) {
			data.name.textContent = '';
			renderRenameBox(this.debugService, this.contextViewService, this.themeService, tree, functionBreakpoint, data.breakpoint, {
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
			if ((process && !process.session.capabilities.supportsFunctionBreakpoints) || !this.debugService.getModel().areBreakpointsActivated()) {
				tree.addTraits('disabled', [functionBreakpoint]);
				if (process && !process.session.capabilities.supportsFunctionBreakpoints) {
					data.breakpoint.title = nls.localize('functionBreakpointsNotSupported', "Function breakpoints are not supported by this debug type");
				}
			} else {
				tree.removeTraits('disabled', [functionBreakpoint]);
			}
		}
	}

	private renderBreakpoint(tree: ITree, breakpoint: IBreakpoint, data: IBreakpointTemplateData): void {
		this.debugService.getModel().areBreakpointsActivated() ? tree.removeTraits('disabled', [breakpoint]) : tree.addTraits('disabled', [breakpoint]);

		data.name.textContent = basename(getPathLabel(breakpoint.uri, this.contextService));
		data.lineNumber.textContent = breakpoint.lineNumber.toString();
		if (breakpoint.column) {
			data.lineNumber.textContent += `:${breakpoint.column}`;
		}
		data.filePath.textContent = getPathLabel(resources.dirname(breakpoint.uri), this.contextService, this.environmentService);
		data.checkbox.checked = breakpoint.enabled;

		const debugActive = this.debugService.state === State.Running || this.debugService.state === State.Stopped;
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
		dispose(templateData.toDispose);
	}
}

class BreakpointsAccessibilityProvider implements IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		// noop
	}

	public getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Breakpoint) {
			return nls.localize('breakpointAriaLabel', "Breakpoint line {0} {1}, breakpoints, debug", (<Breakpoint>element).lineNumber, getPathLabel(resources.basenameOrAuthority((<Breakpoint>element).uri), this.contextService), this.contextService);
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

class BreakpointsController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		if (element instanceof FunctionBreakpoint && event.detail === 2) {
			this.debugService.getViewModel().setSelectedFunctionBreakpoint(element);
			return true;
		}
		if (element instanceof Breakpoint) {
			super.onLeftClick(tree, element, event);
			this.openBreakpointSource(element, event, event.detail !== 2);
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	public openBreakpointSource(breakpoint: Breakpoint, event: any, preserveFocus: boolean): void {
		if (breakpoint.uri.scheme === DEBUG_SCHEME && this.debugService.state === State.Inactive) {
			return;
		}

		const sideBySide = (event && (event.ctrlKey || event.metaKey));
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

		this.editorService.openEditor({
			resource: breakpoint.uri,
			options: {
				preserveFocus,
				selection,
				revealIfVisible: true,
				revealInCenterIfOutsideViewport: true,
				pinned: !preserveFocus
			}
		}, sideBySide).done(undefined, errors.onUnexpectedError);
	}
}
