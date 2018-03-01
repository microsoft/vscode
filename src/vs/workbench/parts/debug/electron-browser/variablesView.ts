/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler, sequence } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import { IActionProvider, ITree, IDataSource, IRenderer, IAccessibilityProvider } from 'vs/base/parts/tree/browser/tree';
import { CollapseAction } from 'vs/workbench/browser/viewlet';
import { TreeViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State, CONTEXT_VARIABLES_FOCUSED, IExpression } from 'vs/workbench/parts/debug/common/debug';
import { Variable, Scope } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { twistiePixels, renderViewTree, IVariableTemplateData, BaseDebugController, renderRenameBox, renderVariable } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { SetValueAction, AddToWatchExpressionsAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { CopyValueAction, CopyEvaluatePathAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { ViewModel } from 'vs/workbench/parts/debug/common/debugViewModel';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';
import { OpenMode } from 'vs/base/parts/tree/browser/treeDefaults';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const $ = dom.$;

export class VariablesView extends TreeViewsViewletPanel {

	private static readonly MEMENTO = 'variablesview.memento';
	private onFocusStackFrameScheduler: RunOnceScheduler;
	private settings: any;
	private expandedElements: any[];
	private needsRefresh: boolean;
	private treeContainer: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: nls.localize('variablesSection', "Variables Section") }, keybindingService, contextMenuService, configurationService);

		this.settings = options.viewletSettings;
		this.expandedElements = [];
		// Use scheduler to prevent unnecessary flashing
		this.onFocusStackFrameScheduler = new RunOnceScheduler(() => {
			// Remember expanded elements when there are some (otherwise don't override/erase the previous ones)
			const expanded = this.tree.getExpandedElements();
			if (expanded.length > 0) {
				this.expandedElements = expanded;
			}

			this.needsRefresh = false;
			this.tree.refresh().then(() => {
				const stackFrame = this.debugService.getViewModel().focusedStackFrame;
				return sequence(this.expandedElements.map(e => () => this.tree.expand(e))).then(() => {
					// If there is no preserved expansion state simply expand the first scope
					if (stackFrame && this.tree.getExpandedElements().length === 0) {
						return stackFrame.getScopes().then(scopes => {
							if (scopes.length > 0 && !scopes[0].expensive) {
								return this.tree.expand(scopes[0]);
							}
							return undefined;
						});
					}
					return undefined;
				});
			}).done(null, errors.onUnexpectedError);
		}, 400);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-variables');
		this.treeContainer = renderViewTree(container);

		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new VariablesDataSource(),
			renderer: this.instantiationService.createInstance(VariablesRenderer),
			accessibilityProvider: new VariablesAccessibilityProvider(),
			controller: this.instantiationService.createInstance(VariablesController, new VariablesActionProvider(this.debugService, this.keybindingService), MenuId.DebugVariablesContext, { openMode: OpenMode.SINGLE_CLICK })
		}, {
				ariaLabel: nls.localize('variablesAriaTreeLabel', "Debug Variables"),
				twistiePixels
			});

		CONTEXT_VARIABLES_FOCUSED.bindTo(this.tree.contextKeyService);

		const viewModel = this.debugService.getViewModel();

		this.tree.setInput(viewModel);

		const collapseAction = new CollapseAction(this.tree, false, 'explorer-action collapse-explorer');
		this.toolbar.setActions([collapseAction])();

		this.disposables.push(viewModel.onDidFocusStackFrame(sf => {
			if (!this.isVisible() || !this.isExpanded()) {
				this.needsRefresh = true;
				return;
			}

			// Refresh the tree immediately if it is not visible.
			// Otherwise postpone the refresh until user stops stepping.
			if (!this.tree.getContentHeight() || sf.explicit) {
				this.onFocusStackFrameScheduler.schedule(0);
			} else {
				this.onFocusStackFrameScheduler.schedule();
			}
		}));
		this.disposables.push(this.debugService.onDidChangeState(state => {
			collapseAction.enabled = state === State.Running || state === State.Stopped;
		}));

		this.disposables.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (expression instanceof Variable) {
				this.tree.refresh(expression, false).done(null, errors.onUnexpectedError);
			}
		}));
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	public setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		if (expanded && this.needsRefresh) {
			this.onFocusStackFrameScheduler.schedule();
		}
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible && this.needsRefresh) {
				this.onFocusStackFrameScheduler.schedule();
			}
		});
	}

	public shutdown(): void {
		this.settings[VariablesView.MEMENTO] = !this.isExpanded();
		super.shutdown();
	}
}

class VariablesActionProvider implements IActionProvider {

	constructor(private debugService: IDebugService, private keybindingService: IKeybindingService) {
		// noop
	}

	public hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		// Only show context menu on "real" variables. Not on array chunk nodes.
		return element instanceof Variable && !!element.value;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		const variable = <Variable>element;
		actions.push(new SetValueAction(SetValueAction.ID, SetValueAction.LABEL, variable, this.debugService, this.keybindingService));
		actions.push(new CopyValueAction(CopyValueAction.ID, CopyValueAction.LABEL, variable, this.debugService));
		actions.push(new CopyEvaluatePathAction(CopyEvaluatePathAction.ID, CopyEvaluatePathAction.LABEL, variable));
		actions.push(new Separator());
		actions.push(new AddToWatchExpressionsAction(AddToWatchExpressionsAction.ID, AddToWatchExpressionsAction.LABEL, variable, this.debugService, this.keybindingService));

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

export class VariablesRenderer implements IRenderer {

	private static readonly SCOPE_TEMPLATE_ID = 'scope';
	private static readonly VARIABLE_TEMPLATE_ID = 'variable';

	constructor(
		@IDebugService private debugService: IDebugService,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService
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
				renderRenameBox(this.debugService, this.contextViewService, this.themeService, tree, variable, (<IVariableTemplateData>templateData).expression, {
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

class VariablesAccessibilityProvider implements IAccessibilityProvider {

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

class VariablesController extends BaseDebugController {

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		// double click on primitive value: open input box to be able to set the value
		const process = this.debugService.getViewModel().focusedProcess;
		if (element instanceof Variable && event.detail === 2 && process && process.session.capabilities.supportsSetVariable) {
			const expression = <IExpression>element;
			this.debugService.getViewModel().setSelectedExpression(expression);
			return true;
		}

		return super.onLeftClick(tree, element, event);
	}
}
