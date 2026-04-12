/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var VisualizedVariableRenderer_1, VariablesRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { toAction } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createMatches } from '../../../../base/common/filters.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
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
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLES_FOCUSED, IDebugService, VARIABLES_VIEW_ID, WATCH_VIEW_ID } from '../common/debug.js';
import { getContextForVariable } from '../common/debugContext.js';
import { ErrorScope, Expression, Scope, StackFrame, Variable, VisualizedExpression, getUriForDebugMemory } from '../common/debugModel.js';
import { IDebugVisualizerService } from '../common/debugVisualizers.js';
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from './baseDebugView.js';
import { ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_VALUE_ID, COPY_VALUE_LABEL, setDataBreakpointInfoResponse } from './debugCommands.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
const $ = dom.$;
let forgetScopes = true;
let variableInternalContext;
let VariablesView = class VariablesView extends ViewPane {
    get treeSelection() {
        return this.tree.getSelection();
    }
    constructor(options, contextMenuService, debugService, keybindingService, configurationService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService, menuService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.debugService = debugService;
        this.menuService = menuService;
        this.needsRefresh = false;
        this.savedViewState = new Map();
        this.autoExpandedScopes = new Set();
        // Use scheduler to prevent unnecessary flashing
        this.updateTreeScheduler = this._register(new RunOnceScheduler(async () => {
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
        }, 400));
    }
    renderBody(container) {
        super.renderBody(container);
        this.element.classList.add('debug-pane');
        container.classList.add('debug-variables');
        const treeContainer = renderViewTree(container);
        const expressionRenderer = this.instantiationService.createInstance(DebugExpressionRenderer);
        this.tree = this.instantiationService.createInstance((WorkbenchAsyncDataTree), 'VariablesView', treeContainer, new VariablesDelegate(), [
            this.instantiationService.createInstance(VariablesRenderer, expressionRenderer),
            this.instantiationService.createInstance(VisualizedVariableRenderer, expressionRenderer),
            new ScopesRenderer(),
            new ScopeErrorRenderer(),
        ], this.instantiationService.createInstance(VariablesDataSource), {
            accessibilityProvider: new VariablesAccessibilityProvider(),
            identityProvider: { getId: (element) => element.getId() },
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
        this._register(this.tree.onContextMenu(async (e) => await this.onContextMenu(e)));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible && this.needsRefresh) {
                this.updateTreeScheduler.schedule();
            }
        }));
        let horizontalScrolling;
        this._register(this.debugService.getViewModel().onDidSelectExpression(e => {
            const variable = e?.expression;
            if (variable && this.tree.hasNode(variable)) {
                horizontalScrolling = this.tree.options.horizontalScrolling;
                if (horizontalScrolling) {
                    this.tree.updateOptions({ horizontalScrolling: false });
                }
                this.tree.rerender(variable);
            }
            else if (!e && horizontalScrolling !== undefined) {
                this.tree.updateOptions({ horizontalScrolling: horizontalScrolling });
                horizontalScrolling = undefined;
            }
        }));
        this._register(this.debugService.getViewModel().onDidEvaluateLazyExpression(async (e) => {
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
    layoutBody(width, height) {
        super.layoutBody(height, width);
        this.tree.layout(width, height);
    }
    focus() {
        super.focus();
        this.tree.domFocus();
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    onMouseDblClick(e) {
        if (this.canSetExpressionValue(e.element)) {
            this.debugService.getViewModel().setSelectedExpression(e.element, false);
        }
    }
    canSetExpressionValue(e) {
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
    async onContextMenu(e) {
        const element = e.element;
        // Handle scope context menu
        if (element instanceof Scope) {
            return this.openContextMenuForScope(e, element);
        }
        // Handle variable context menu
        if (!(element instanceof Variable) || !element.value) {
            return;
        }
        return openContextMenuForVariableTreeElement(this.contextKeyService, this.menuService, this.contextMenuService, MenuId.DebugVariablesContext, e);
    }
    openContextMenuForScope(e, scope) {
        const context = { scope: { name: scope.name } };
        const menu = this.menuService.getMenuActions(MenuId.DebugScopesContext, this.contextKeyService, { arg: context, shouldForwardArgs: false });
        const { secondary } = getContextMenuActions(menu, 'inline');
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => secondary
        });
    }
};
VariablesView = __decorate([
    __param(1, IContextMenuService),
    __param(2, IDebugService),
    __param(3, IKeybindingService),
    __param(4, IConfigurationService),
    __param(5, IInstantiationService),
    __param(6, IViewDescriptorService),
    __param(7, IContextKeyService),
    __param(8, IOpenerService),
    __param(9, IThemeService),
    __param(10, IHoverService),
    __param(11, IMenuService)
], VariablesView);
export { VariablesView };
export async function openContextMenuForVariableTreeElement(parentContextKeyService, menuService, contextMenuService, menuId, e) {
    const variable = e.element;
    if (!(variable instanceof Variable) || !variable.value) {
        return;
    }
    const contextKeyService = await getContextForVariableMenuWithDataAccess(parentContextKeyService, variable);
    const context = getVariablesContext(variable);
    const menu = menuService.getMenuActions(menuId, contextKeyService, { arg: context, shouldForwardArgs: false });
    const { secondary } = getContextMenuActions(menu, 'inline');
    contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => secondary
    });
}
const getVariablesContext = (variable) => ({
    sessionId: variable.getSession()?.getId(),
    container: variable.parent instanceof Expression
        ? { expression: variable.parent.name }
        : variable.parent.toDebugProtocolObject(),
    variable: variable.toDebugProtocolObject()
});
/**
 * Gets a context key overlay that has context for the given variable, including data access info.
 */
async function getContextForVariableMenuWithDataAccess(parentContext, variable) {
    const session = variable.getSession();
    if (!session || !session.capabilities.supportsDataBreakpoints) {
        return getContextForVariableMenuBase(parentContext, variable);
    }
    const contextKeys = [];
    const dataBreakpointInfoResponse = await session.dataBreakpointInfo(variable.name, variable.parent.reference);
    const dataBreakpointId = dataBreakpointInfoResponse?.dataId;
    const dataBreakpointAccessTypes = dataBreakpointInfoResponse?.accessTypes;
    setDataBreakpointInfoResponse(dataBreakpointInfoResponse);
    if (!dataBreakpointAccessTypes) {
        contextKeys.push([CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED.key, !!dataBreakpointId]);
    }
    else {
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
function getContextForVariableMenuBase(parentContext, variable, additionalContext = []) {
    variableInternalContext = variable;
    return getContextForVariable(parentContext, variable, additionalContext);
}
function isStackFrame(obj) {
    return obj instanceof StackFrame;
}
class VariablesDataSource extends AbstractExpressionDataSource {
    hasChildren(element) {
        if (!element) {
            return false;
        }
        if (isStackFrame(element)) {
            return true;
        }
        return element.hasChildren;
    }
    doGetChildren(element) {
        if (isStackFrame(element)) {
            return element.getScopes();
        }
        return element.getChildren();
    }
}
class VariablesDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
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
class ScopesRenderer {
    static { this.ID = 'scope'; }
    get templateId() {
        return ScopesRenderer.ID;
    }
    renderTemplate(container) {
        const name = dom.append(container, $('.scope'));
        const label = new HighlightedLabel(name);
        return { name, label };
    }
    renderElement(element, index, templateData) {
        templateData.label.set(element.element.name, createMatches(element.filterData));
    }
    disposeTemplate(templateData) {
        templateData.label.dispose();
    }
}
class ScopeErrorRenderer {
    static { this.ID = 'scopeError'; }
    get templateId() {
        return ScopeErrorRenderer.ID;
    }
    renderTemplate(container) {
        const wrapper = dom.append(container, $('.scope'));
        const error = dom.append(wrapper, $('.error'));
        return { error };
    }
    renderElement(element, index, templateData) {
        templateData.error.innerText = element.element.name;
    }
    disposeTemplate() {
        // noop
    }
}
let VisualizedVariableRenderer = class VisualizedVariableRenderer extends AbstractExpressionsRenderer {
    static { VisualizedVariableRenderer_1 = this; }
    static { this.ID = 'viz'; }
    /**
     * Registers a helper that rerenders the tree when visualization is requested
     * or cancelled./
     */
    static rendererOnVisualizationRange(model, tree) {
        return model.onDidChangeVisualization(({ original }) => {
            if (!tree.hasNode(original)) {
                return;
            }
            const parent = tree.getParentElement(original);
            tree.updateChildren(parent, false, false);
        });
    }
    constructor(expressionRenderer, debugService, contextViewService, hoverService, menuService, contextKeyService) {
        super(debugService, contextViewService, hoverService);
        this.expressionRenderer = expressionRenderer;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
    }
    get templateId() {
        return VisualizedVariableRenderer_1.ID;
    }
    renderElement(node, index, data) {
        data.elementDisposable.clear();
        super.renderExpressionElement(node.element, node, data);
    }
    renderExpression(expression, data, highlights) {
        const viz = expression;
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
    getInputBoxOptions(expression) {
        const viz = expression;
        return {
            initialValue: expression.value,
            ariaLabel: localize('variableValueAriaLabel', "Type new variable value"),
            validationOptions: {
                validation: () => viz.errorMessage ? ({ content: viz.errorMessage }) : null
            },
            onFinish: (value, success) => {
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
    renderActionBar(actionBar, expression, _data) {
        const viz = expression;
        const contextKeyService = viz.original ? getContextForVariableMenuBase(this.contextKeyService, viz.original) : this.contextKeyService;
        const context = viz.original ? getVariablesContext(viz.original) : undefined;
        const menu = this.menuService.getMenuActions(MenuId.DebugVariablesContext, contextKeyService, { arg: context, shouldForwardArgs: false });
        const { primary } = getContextMenuActions(menu, 'inline');
        if (viz.original) {
            const action = toAction({
                id: 'debugViz', label: localize('removeVisualizer', 'Remove Visualizer'), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.debugService.getViewModel().setVisualizedExpression(viz.original, undefined)
            });
            action.checked = true;
            primary.push(action);
            actionBar.domNode.style.display = 'initial';
        }
        actionBar.clear();
        actionBar.context = context;
        actionBar.push(primary, { icon: true, label: false });
    }
};
VisualizedVariableRenderer = VisualizedVariableRenderer_1 = __decorate([
    __param(1, IDebugService),
    __param(2, IContextViewService),
    __param(3, IHoverService),
    __param(4, IMenuService),
    __param(5, IContextKeyService)
], VisualizedVariableRenderer);
export { VisualizedVariableRenderer };
let VariablesRenderer = class VariablesRenderer extends AbstractExpressionsRenderer {
    static { VariablesRenderer_1 = this; }
    static { this.ID = 'variable'; }
    constructor(expressionRenderer, menuService, contextKeyService, visualization, contextMenuService, debugService, contextViewService, hoverService) {
        super(debugService, contextViewService, hoverService);
        this.expressionRenderer = expressionRenderer;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.visualization = visualization;
        this.contextMenuService = contextMenuService;
    }
    get templateId() {
        return VariablesRenderer_1.ID;
    }
    renderExpression(expression, data, highlights) {
        data.elementDisposable.add(this.expressionRenderer.renderVariable(data, expression, {
            highlights,
            showChanged: true,
        }));
    }
    renderElement(node, index, data) {
        data.elementDisposable.clear();
        super.renderExpressionElement(node.element, node, data);
    }
    getInputBoxOptions(expression) {
        const variable = expression;
        return {
            initialValue: expression.value,
            ariaLabel: localize('variableValueAriaLabel', "Type new variable value"),
            validationOptions: {
                validation: () => variable.errorMessage ? ({ content: variable.errorMessage }) : null
            },
            onFinish: (value, success) => {
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
    renderActionBar(actionBar, expression, data) {
        const variable = expression;
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
            }
            else if (actions.length === 1) {
                actionBar.push(actions[0], { icon: true, label: false });
            }
            else {
                actionBar.push(toAction({ id: 'debugViz', label: localize('useVisualizer', 'Visualize Variable...'), class: ThemeIcon.asClassName(Codicon.eye), run: () => this.pickVisualizer(actions, originalExpression, data) }), { icon: true, label: false });
            }
        });
    }
    pickVisualizer(actions, expression, data) {
        this.contextMenuService.showContextMenu({
            getAnchor: () => data.actionBar.getContainer(),
            getActions: () => actions,
        });
    }
    useVisualizer(viz, expression, token) {
        return async () => {
            const resolved = await viz.resolve(token);
            if (token.isCancellationRequested) {
                return;
            }
            if (resolved.type === 0 /* DebugVisualizationType.Command */) {
                viz.execute();
            }
            else {
                const replacement = await this.visualization.getVisualizedNodeFor(resolved.id, expression);
                if (replacement) {
                    this.debugService.getViewModel().setVisualizedExpression(expression, replacement);
                }
            }
        };
    }
};
VariablesRenderer = VariablesRenderer_1 = __decorate([
    __param(1, IMenuService),
    __param(2, IContextKeyService),
    __param(3, IDebugVisualizerService),
    __param(4, IContextMenuService),
    __param(5, IDebugService),
    __param(6, IContextViewService),
    __param(7, IHoverService)
], VariablesRenderer);
export { VariablesRenderer };
class VariablesAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('variablesAriaTreeLabel', "Debug Variables");
    }
    getAriaLabel(element) {
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
    handler: (accessor) => {
        const debugService = accessor.get(IDebugService);
        debugService.getViewModel().setSelectedExpression(variableInternalContext, false);
    }
});
CommandsRegistry.registerCommand({
    metadata: {
        description: COPY_VALUE_LABEL,
    },
    id: COPY_VALUE_ID,
    handler: async (accessor, arg, ctx) => {
        const debugService = accessor.get(IDebugService);
        const clipboardService = accessor.get(IClipboardService);
        let elementContext = '';
        let elements;
        if (!arg) {
            const viewService = accessor.get(IViewsService);
            const focusedView = viewService.getFocusedView();
            let view;
            if (focusedView?.id === WATCH_VIEW_ID) {
                view = viewService.getActiveViewWithId(WATCH_VIEW_ID);
                elementContext = 'watch';
            }
            else if (focusedView?.id === VARIABLES_VIEW_ID) {
                view = viewService.getActiveViewWithId(VARIABLES_VIEW_ID);
                elementContext = 'variables';
            }
            if (!view) {
                return;
            }
            elements = view.treeSelection.filter(e => e instanceof Expression || e instanceof Variable);
        }
        else if (arg instanceof Variable || arg instanceof Expression) {
            elementContext = 'watch';
            elements = [arg];
        }
        else {
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
        }
        catch (e) {
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
    handler: async (accessor, arg, ctx) => {
        const debugService = accessor.get(IDebugService);
        let sessionId;
        let memoryReference;
        if ('sessionId' in arg) { // IVariablesContext
            if (!arg.sessionId || !arg.variable.memoryReference) {
                return;
            }
            sessionId = arg.sessionId;
            memoryReference = arg.variable.memoryReference;
        }
        else { // IExpression
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
async function tryInstallHexEditor(extensionsWorkbenchService, notificationService) {
    try {
        await extensionsWorkbenchService.install(HEX_EDITOR_EXTENSION_ID, {
            justification: localize("viewMemory.prompt", "Inspecting binary data requires this extension."),
            enable: true
        }, 15 /* ProgressLocation.Notification */);
        return true;
    }
    catch (error) {
        notificationService.error(error);
        return false;
    }
}
CommandsRegistry.registerCommand({
    metadata: {
        description: COPY_EVALUATE_PATH_LABEL,
    },
    id: COPY_EVALUATE_PATH_ID,
    handler: async (accessor, context) => {
        const clipboardService = accessor.get(IClipboardService);
        if (context instanceof Variable) {
            await clipboardService.writeText(context.evaluateName);
        }
        else {
            await clipboardService.writeText(context.variable.evaluateName);
        }
    }
});
CommandsRegistry.registerCommand({
    metadata: {
        description: ADD_TO_WATCH_LABEL,
    },
    id: ADD_TO_WATCH_ID,
    handler: async (accessor, context) => {
        const debugService = accessor.get(IDebugService);
        debugService.addWatchExpression(context.variable.evaluateName);
    }
});
registerAction2(class extends ViewAction {
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
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFyaWFibGVzVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvdmFyaWFibGVzVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUV2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQWMsTUFBTSxrRUFBa0UsQ0FBQztBQUtoSCxPQUFPLEVBQVcsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9FLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxxQkFB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