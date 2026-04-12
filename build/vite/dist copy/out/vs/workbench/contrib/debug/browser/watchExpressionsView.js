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
var WatchExpressionsRenderer_1;
import { ElementsDragAndDropData } from '../../../../base/browser/ui/list/listView.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { getContextMenuActions, } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { CONTEXT_CAN_VIEW_MEMORY, CONTEXT_EXPRESSION_SELECTED, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_TYPE, CONTEXT_WATCH_EXPRESSIONS_EXIST, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_WATCH_ITEM_TYPE, IDebugService, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, WATCH_VIEW_ID, CONTEXT_DEBUG_TYPE } from '../common/debug.js';
import { Expression, Variable, VisualizedExpression } from '../common/debugModel.js';
import { AbstractExpressionDataSource, AbstractExpressionsRenderer, expressionAndScopeLabelProvider, renderViewTree } from './baseDebugView.js';
import { COPY_WATCH_EXPRESSION_COMMAND_ID, setDataBreakpointInfoResponse } from './debugCommands.js';
import { DebugExpressionRenderer } from './debugExpressionRenderer.js';
import { watchExpressionsAdd, watchExpressionsRemoveAll } from './debugIcons.js';
import { VariablesRenderer, VisualizedVariableRenderer } from './variablesView.js';
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;
let ignoreViewUpdates = false;
let useCachedEvaluation = false;
let WatchExpressionsView = class WatchExpressionsView extends ViewPane {
    get treeSelection() {
        return this.tree.getSelection();
    }
    constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService, logService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.debugService = debugService;
        this.menuService = menuService;
        this.logService = logService;
        this.needsRefresh = false;
        this.watchExpressionsUpdatedScheduler = this._register(new RunOnceScheduler(() => {
            this.needsRefresh = false;
            this.tree.updateChildren();
        }, 50));
        this.watchExpressionsExist = CONTEXT_WATCH_EXPRESSIONS_EXIST.bindTo(contextKeyService);
        this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
        this.expressionRenderer = instantiationService.createInstance(DebugExpressionRenderer);
    }
    renderBody(container) {
        super.renderBody(container);
        this.element.classList.add('debug-pane');
        container.classList.add('debug-watch');
        const treeContainer = renderViewTree(container);
        const expressionsRenderer = this.instantiationService.createInstance(WatchExpressionsRenderer, this.expressionRenderer);
        this.tree = this.instantiationService.createInstance((WorkbenchAsyncDataTree), 'WatchExpressions', treeContainer, new WatchExpressionsDelegate(), [
            expressionsRenderer,
            this.instantiationService.createInstance(VariablesRenderer, this.expressionRenderer),
            this.instantiationService.createInstance(VisualizedVariableRenderer, this.expressionRenderer),
        ], this.instantiationService.createInstance(WatchExpressionsDataSource), {
            accessibilityProvider: new WatchExpressionsAccessibilityProvider(),
            identityProvider: { getId: (element) => element.getId() },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (e) => {
                    if (e === this.debugService.getViewModel().getSelectedExpression()?.expression) {
                        // Don't filter input box
                        return undefined;
                    }
                    return expressionAndScopeLabelProvider.getKeyboardNavigationLabel(e);
                }
            },
            dnd: new WatchExpressionsDragAndDrop(this.debugService),
            overrideStyles: this.getLocationBasedColors().listOverrideStyles
        });
        this._register(this.tree);
        this.tree.setInput(this.debugService);
        CONTEXT_WATCH_EXPRESSIONS_FOCUSED.bindTo(this.tree.contextKeyService);
        this._register(VisualizedVariableRenderer.rendererOnVisualizationRange(this.debugService.getViewModel(), this.tree));
        this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));
        this._register(this.tree.onMouseDblClick(e => this.onMouseDblClick(e)));
        this._register(this.debugService.getModel().onDidChangeWatchExpressions(async (we) => {
            this.watchExpressionsExist.set(this.debugService.getModel().getWatchExpressions().length > 0);
            if (!this.isBodyVisible()) {
                this.needsRefresh = true;
            }
            else {
                if (we && !we.name) {
                    // We are adding a new input box, no need to re-evaluate watch expressions
                    useCachedEvaluation = true;
                }
                await this.tree.updateChildren();
                useCachedEvaluation = false;
                if (we instanceof Expression) {
                    this.tree.reveal(we);
                }
            }
        }));
        this._register(this.debugService.getViewModel().onDidFocusStackFrame(() => {
            if (!this.isBodyVisible()) {
                this.needsRefresh = true;
                return;
            }
            if (!this.watchExpressionsUpdatedScheduler.isScheduled()) {
                this.watchExpressionsUpdatedScheduler.schedule();
            }
        }));
        this._register(this.debugService.getViewModel().onWillUpdateViews(() => {
            if (!ignoreViewUpdates) {
                this.tree.updateChildren();
            }
        }));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible && this.needsRefresh) {
                this.watchExpressionsUpdatedScheduler.schedule();
            }
        }));
        let horizontalScrolling;
        this._register(this.debugService.getViewModel().onDidSelectExpression(e => {
            const expression = e?.expression;
            if (expression && this.tree.hasNode(expression)) {
                horizontalScrolling = this.tree.options.horizontalScrolling;
                if (horizontalScrolling) {
                    this.tree.updateOptions({ horizontalScrolling: false });
                }
                if (expression.name) {
                    // Only rerender if the input is already done since otherwise the tree is not yet aware of the new element
                    this.tree.rerender(expression);
                }
            }
            else if (!expression && horizontalScrolling !== undefined) {
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
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree.layout(height, width);
    }
    focus() {
        super.focus();
        this.tree.domFocus();
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    onMouseDblClick(e) {
        if (e.browserEvent.target.className.indexOf('twistie') >= 0) {
            // Ignore double click events on twistie
            return;
        }
        const element = e.element;
        // double click on primitive value: open input box to be able to select and copy value.
        const selectedExpression = this.debugService.getViewModel().getSelectedExpression();
        if ((element instanceof Expression && element !== selectedExpression?.expression) || (element instanceof VisualizedExpression && element.treeItem.canEdit)) {
            this.debugService.getViewModel().setSelectedExpression(element, false);
        }
        else if (!element) {
            // Double click in watch panel triggers to add a new watch expression
            this.debugService.addWatchExpression();
        }
    }
    async onContextMenu(e) {
        const element = e.element;
        if (!element) {
            return;
        }
        const selection = this.tree.getSelection();
        const contextKeyService = element && await getContextForWatchExpressionMenuWithDataAccess(this.contextKeyService, element, this.debugService, this.logService);
        const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: element, shouldForwardArgs: false });
        const { secondary } = getContextMenuActions(menu, 'inline');
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => secondary,
            getActionsContext: () => element && selection.includes(element) ? selection : element ? [element] : []
        });
    }
};
WatchExpressionsView = __decorate([
    __param(1, IContextMenuService),
    __param(2, IDebugService),
    __param(3, IKeybindingService),
    __param(4, IInstantiationService),
    __param(5, IViewDescriptorService),
    __param(6, IConfigurationService),
    __param(7, IContextKeyService),
    __param(8, IOpenerService),
    __param(9, IThemeService),
    __param(10, IHoverService),
    __param(11, IMenuService),
    __param(12, ILogService)
], WatchExpressionsView);
export { WatchExpressionsView };
class WatchExpressionsDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(element) {
        if (element instanceof Expression) {
            return WatchExpressionsRenderer.ID;
        }
        if (element instanceof VisualizedExpression) {
            return VisualizedVariableRenderer.ID;
        }
        // Variable
        return VariablesRenderer.ID;
    }
}
function isDebugService(element) {
    return typeof element.getConfigurationManager === 'function';
}
class WatchExpressionsDataSource extends AbstractExpressionDataSource {
    hasChildren(element) {
        return isDebugService(element) || element.hasChildren;
    }
    doGetChildren(element) {
        if (isDebugService(element)) {
            const debugService = element;
            const watchExpressions = debugService.getModel().getWatchExpressions();
            const viewModel = debugService.getViewModel();
            return Promise.all(watchExpressions.map(we => !!we.name && !useCachedEvaluation
                ? we.evaluate(viewModel.focusedSession, viewModel.focusedStackFrame, 'watch').then(() => we)
                : Promise.resolve(we)));
        }
        return element.getChildren();
    }
}
let WatchExpressionsRenderer = class WatchExpressionsRenderer extends AbstractExpressionsRenderer {
    static { WatchExpressionsRenderer_1 = this; }
    static { this.ID = 'watchexpression'; }
    constructor(expressionRenderer, menuService, contextKeyService, debugService, contextViewService, hoverService, configurationService) {
        super(debugService, contextViewService, hoverService);
        this.expressionRenderer = expressionRenderer;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
    }
    get templateId() {
        return WatchExpressionsRenderer_1.ID;
    }
    renderElement(node, index, data) {
        data.elementDisposable.clear();
        data.elementDisposable.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.showVariableTypes')) {
                super.renderExpressionElement(node.element, node, data);
            }
        }));
        super.renderExpressionElement(node.element, node, data);
    }
    renderExpression(expression, data, highlights) {
        let text;
        data.type.textContent = '';
        const showType = this.configurationService.getValue('debug').showVariableTypes;
        if (showType && expression.type) {
            text = typeof expression.value === 'string' ? `${expression.name}: ` : expression.name;
            //render type
            data.type.textContent = expression.type + ' =';
        }
        else {
            text = typeof expression.value === 'string' ? `${expression.name} =` : expression.name;
        }
        let title;
        if (expression.type) {
            if (showType) {
                title = `${expression.name}`;
            }
            else {
                title = expression.type === expression.value ?
                    expression.type :
                    `${expression.type}`;
            }
        }
        else {
            title = expression.value;
        }
        data.label.set(text, highlights, title);
        data.elementDisposable.add(this.expressionRenderer.renderValue(data.value, expression, {
            showChanged: true,
            maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET,
            colorize: true,
            session: expression.getSession(),
        }));
    }
    getInputBoxOptions(expression, settingValue) {
        if (settingValue) {
            return {
                initialValue: expression.value,
                ariaLabel: localize('typeNewValue', "Type new value"),
                onFinish: async (value, success) => {
                    if (success && value) {
                        const focusedFrame = this.debugService.getViewModel().focusedStackFrame;
                        if (focusedFrame && (expression instanceof Variable || expression instanceof Expression)) {
                            await expression.setExpression(value, focusedFrame);
                            this.debugService.getViewModel().updateViews();
                        }
                    }
                }
            };
        }
        return {
            initialValue: expression.name ? expression.name : '',
            ariaLabel: localize('watchExpressionInputAriaLabel', "Type watch expression"),
            placeholder: localize('watchExpressionPlaceholder', "Expression to watch"),
            onFinish: (value, success) => {
                if (success && value) {
                    this.debugService.renameWatchExpression(expression.getId(), value);
                    ignoreViewUpdates = true;
                    this.debugService.getViewModel().updateViews();
                    ignoreViewUpdates = false;
                }
                else if (!expression.name) {
                    this.debugService.removeWatchExpressions(expression.getId());
                }
            }
        };
    }
    renderActionBar(actionBar, expression) {
        const contextKeyService = getContextForWatchExpressionMenu(this.contextKeyService, expression);
        const context = expression;
        const menu = this.menuService.getMenuActions(MenuId.DebugWatchContext, contextKeyService, { arg: context, shouldForwardArgs: false });
        const { primary } = getContextMenuActions(menu, 'inline');
        actionBar.clear();
        actionBar.context = context;
        actionBar.push(primary, { icon: true, label: false });
    }
};
WatchExpressionsRenderer = WatchExpressionsRenderer_1 = __decorate([
    __param(1, IMenuService),
    __param(2, IContextKeyService),
    __param(3, IDebugService),
    __param(4, IContextViewService),
    __param(5, IHoverService),
    __param(6, IConfigurationService)
], WatchExpressionsRenderer);
export { WatchExpressionsRenderer };
/**
 * Gets a context key overlay that has context for the given expression.
 */
function getContextForWatchExpressionMenu(parentContext, expression, additionalContext = []) {
    const session = expression.getSession();
    return parentContext.createOverlay([
        [CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT.key, 'evaluateName' in expression],
        [CONTEXT_WATCH_ITEM_TYPE.key, expression instanceof Expression ? 'expression' : expression instanceof Variable ? 'variable' : undefined],
        [CONTEXT_CAN_VIEW_MEMORY.key, !!session?.capabilities.supportsReadMemoryRequest && expression.memoryReference !== undefined],
        [CONTEXT_VARIABLE_IS_READONLY.key, !!expression.presentationHint?.attributes?.includes('readOnly') || expression.presentationHint?.lazy],
        [CONTEXT_VARIABLE_TYPE.key, expression.type],
        [CONTEXT_DEBUG_TYPE.key, session?.configuration.type],
        ...additionalContext
    ]);
}
/**
 * Gets a context key overlay that has context for the given expression, including data access info.
 */
async function getContextForWatchExpressionMenuWithDataAccess(parentContext, expression, debugService, logService) {
    const session = expression.getSession();
    if (!session || !session.capabilities.supportsDataBreakpoints) {
        return getContextForWatchExpressionMenu(parentContext, expression);
    }
    const contextKeys = [];
    const stackFrame = debugService.getViewModel().focusedStackFrame;
    let dataBreakpointInfoResponse;
    try {
        // Per DAP spec:
        // - If evaluateName is available: use it as an expression (top-level evaluation)
        // - Otherwise, check if it's a Variable: use name + parent reference (container-relative)
        // - Otherwise: use name as an expression
        if ('evaluateName' in expression && expression.evaluateName) {
            // Use evaluateName if available (more precise for evaluation context)
            dataBreakpointInfoResponse = await session.dataBreakpointInfo(expression.evaluateName, undefined, stackFrame?.frameId);
        }
        else if (expression instanceof Variable) {
            // Variable without evaluateName: use name relative to parent container
            dataBreakpointInfoResponse = await session.dataBreakpointInfo(expression.name, expression.parent.reference, stackFrame?.frameId);
        }
        else {
            // Expression without evaluateName: use name as the expression to evaluate
            dataBreakpointInfoResponse = await session.dataBreakpointInfo(expression.name, undefined, stackFrame?.frameId);
        }
    }
    catch (error) {
        // silently continue without data breakpoint support for this item
        logService.error('Failed to get data breakpoint info for watch expression:', error);
    }
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
    return getContextForWatchExpressionMenu(parentContext, expression, contextKeys);
}
class WatchExpressionsAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions");
    }
    getAriaLabel(element) {
        if (element instanceof Expression) {
            return localize('watchExpressionAriaLabel', "{0}, value {1}", element.name, element.value);
        }
        // Variable
        return localize('watchVariableAriaLabel', "{0}, value {1}", element.name, element.value);
    }
}
class WatchExpressionsDragAndDrop {
    constructor(debugService) {
        this.debugService = debugService;
    }
    onDragStart(data, originalEvent) {
        if (data instanceof ElementsDragAndDropData) {
            originalEvent.dataTransfer.setData('text/plain', data.elements[0].name);
        }
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        if (!(data instanceof ElementsDragAndDropData)) {
            return false;
        }
        const expressions = data.elements;
        if (!(expressions.length > 0 && expressions[0] instanceof Expression)) {
            return false;
        }
        let dropEffectPosition = undefined;
        if (targetIndex === undefined) {
            // Hovering over the list
            dropEffectPosition = "drop-target-after" /* ListDragOverEffectPosition.After */;
            targetIndex = -1;
        }
        else {
            // Hovering over an element
            switch (targetSector) {
                case 0 /* ListViewTargetSector.TOP */:
                case 1 /* ListViewTargetSector.CENTER_TOP */:
                    dropEffectPosition = "drop-target-before" /* ListDragOverEffectPosition.Before */;
                    break;
                case 2 /* ListViewTargetSector.CENTER_BOTTOM */:
                case 3 /* ListViewTargetSector.BOTTOM */:
                    dropEffectPosition = "drop-target-after" /* ListDragOverEffectPosition.After */;
                    break;
            }
        }
        return { accept: true, effect: { type: 1 /* ListDragOverEffectType.Move */, position: dropEffectPosition }, feedback: [targetIndex] };
    }
    getDragURI(element) {
        if (!(element instanceof Expression) || element === this.debugService.getViewModel().getSelectedExpression()?.expression) {
            return null;
        }
        return element.getId();
    }
    getDragLabel(elements) {
        if (elements.length === 1) {
            return elements[0].name;
        }
        return undefined;
    }
    drop(data, targetElement, targetIndex, targetSector, originalEvent) {
        if (!(data instanceof ElementsDragAndDropData)) {
            return;
        }
        const draggedElement = data.elements[0];
        if (!(draggedElement instanceof Expression)) {
            throw new Error('Invalid dragged element');
        }
        const watches = this.debugService.getModel().getWatchExpressions();
        const sourcePosition = watches.indexOf(draggedElement);
        let targetPosition;
        if (targetElement instanceof Expression) {
            targetPosition = watches.indexOf(targetElement);
            switch (targetSector) {
                case 3 /* ListViewTargetSector.BOTTOM */:
                case 2 /* ListViewTargetSector.CENTER_BOTTOM */:
                    targetPosition++;
                    break;
            }
            if (sourcePosition < targetPosition) {
                targetPosition--;
            }
        }
        else {
            targetPosition = watches.length - 1;
        }
        this.debugService.moveWatchExpression(draggedElement.getId(), targetPosition);
    }
    dispose() { }
}
registerAction2(class Collapse extends ViewAction {
    constructor() {
        super({
            id: 'watch.collapse',
            viewId: WATCH_VIEW_ID,
            title: localize('collapse', "Collapse All"),
            f1: false,
            icon: Codicon.collapseAll,
            precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
            menu: {
                id: MenuId.ViewTitle,
                order: 30,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
export const ADD_WATCH_ID = 'workbench.debug.viewlet.action.addWatchExpression'; // Use old and long id for backwards compatibility
export const ADD_WATCH_LABEL = localize('addWatchExpression', "Add Expression");
registerAction2(class AddWatchExpressionAction extends Action2 {
    constructor() {
        super({
            id: ADD_WATCH_ID,
            title: ADD_WATCH_LABEL,
            f1: false,
            icon: watchExpressionsAdd,
            menu: {
                id: MenuId.ViewTitle,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
            }
        });
    }
    run(accessor) {
        const debugService = accessor.get(IDebugService);
        debugService.addWatchExpression();
    }
});
export const REMOVE_WATCH_EXPRESSIONS_COMMAND_ID = 'workbench.debug.viewlet.action.removeAllWatchExpressions';
export const REMOVE_WATCH_EXPRESSIONS_LABEL = localize('removeAllWatchExpressions', "Remove All Expressions");
registerAction2(class RemoveAllWatchExpressionsAction extends Action2 {
    constructor() {
        super({
            id: REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, // Use old and long id for backwards compatibility
            title: REMOVE_WATCH_EXPRESSIONS_LABEL,
            f1: false,
            icon: watchExpressionsRemoveAll,
            precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
            menu: {
                id: MenuId.ViewTitle,
                order: 20,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', WATCH_VIEW_ID)
            }
        });
    }
    run(accessor) {
        const debugService = accessor.get(IDebugService);
        debugService.removeWatchExpressions();
    }
});
registerAction2(class CopyExpression extends ViewAction {
    constructor() {
        super({
            id: COPY_WATCH_EXPRESSION_COMMAND_ID,
            title: localize('copyWatchExpression', "Copy Expression"),
            f1: false,
            viewId: WATCH_VIEW_ID,
            precondition: CONTEXT_WATCH_EXPRESSIONS_EXIST,
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 33 /* KeyCode.KeyC */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.and(FocusedViewContext.isEqualTo(WATCH_VIEW_ID), CONTEXT_EXPRESSION_SELECTED.negate()),
            },
            menu: {
                id: MenuId.DebugWatchContext,
                order: 20,
                group: '3_modification',
                when: CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression')
            }
        });
    }
    runInView(accessor, view, value) {
        const clipboardService = accessor.get(IClipboardService);
        if (!value) {
            value = view.treeSelection.at(-1);
        }
        if (value) {
            clipboardService.writeText(value.name);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0Y2hFeHByZXNzaW9uc1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL3dhdGNoRXhwcmVzc2lvbnNWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQU1oRyxPQUFPLEVBQUUsdUJBQXVCLEVBQXdCLE1BQU0sOENBQThDLENBQUM7QUFHN0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEdBQUcsTUFBTSxpRUFBaUUsQ0FBQztBQUN6RyxPQUFPLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFG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