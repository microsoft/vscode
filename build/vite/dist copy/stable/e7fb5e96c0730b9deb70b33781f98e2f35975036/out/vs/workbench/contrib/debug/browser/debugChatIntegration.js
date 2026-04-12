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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, debouncedObservable, derived, ObservablePromise, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatContextPickService } from '../../chat/browser/attachments/chatContextPickService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IDebugService } from '../common/debug.js';
import { Variable } from '../common/debugModel.js';
var PickerMode;
(function (PickerMode) {
    PickerMode["Main"] = "main";
    PickerMode["Expression"] = "expression";
})(PickerMode || (PickerMode = {}));
let DebugSessionContextPick = class DebugSessionContextPick {
    constructor(debugService) {
        this.debugService = debugService;
        this.type = 'pickerPick';
        this.label = localize('chatContext.debugSession', 'Debug Session...');
        this.icon = Codicon.debug;
        this.ordinal = -200;
    }
    isEnabled() {
        // Only enabled when there's a focused session that is stopped (paused)
        const viewModel = this.debugService.getViewModel();
        const focusedSession = viewModel.focusedSession;
        return !!focusedSession && focusedSession.state === 2 /* State.Stopped */;
    }
    asPicker(_widget) {
        const store = new DisposableStore();
        const mode = observableValue('debugPicker.mode', "main" /* PickerMode.Main */);
        const query = observableValue('debugPicker.query', '');
        const picksObservable = this.createPicksObservable(mode, query, store);
        return {
            placeholder: localize('selectDebugData', 'Select debug data to attach'),
            picks: (_queryObs, token) => {
                // Connect the external query observable to our internal one
                store.add(autorun(reader => {
                    query.set(_queryObs.read(reader), undefined);
                }));
                const cts = new CancellationTokenSource(token);
                store.add(toDisposable(() => cts.dispose(true)));
                return picksObservable;
            },
            goBack: () => {
                if (mode.get() === "expression" /* PickerMode.Expression */) {
                    mode.set("main" /* PickerMode.Main */, undefined);
                    return true; // Stay in picker
                }
                return false; // Go back to main context menu
            },
            dispose: () => store.dispose(),
        };
    }
    createPicksObservable(mode, query, store) {
        const debouncedQuery = debouncedObservable(query, 300);
        return derived(reader => {
            const currentMode = mode.read(reader);
            if (currentMode === "expression" /* PickerMode.Expression */) {
                return this.getExpressionPicks(debouncedQuery, store);
            }
            else {
                return this.getMainPicks(mode);
            }
        }).flatten();
    }
    getMainPicks(mode) {
        // Return an observable that resolves to the main picks
        const promise = derived(_reader => {
            return new ObservablePromise(this.buildMainPicks(mode));
        });
        return promise.map((value, reader) => {
            const result = value.promiseResult.read(reader);
            return { picks: result?.data || [], busy: result === undefined };
        });
    }
    async buildMainPicks(mode) {
        const picks = [];
        const viewModel = this.debugService.getViewModel();
        const stackFrame = viewModel.focusedStackFrame;
        const session = viewModel.focusedSession;
        if (!session || !stackFrame) {
            return picks;
        }
        // Add "Expression Value..." option at the top
        picks.push({
            label: localize('expressionValue', 'Expression Value...'),
            iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
            asAttachment: () => {
                // Switch to expression mode
                mode.set("expression" /* PickerMode.Expression */, undefined);
                return 'noop';
            },
        });
        // Add watch expressions section
        const watches = this.debugService.getModel().getWatchExpressions();
        if (watches.length > 0) {
            picks.push({ type: 'separator', label: localize('watchExpressions', 'Watch Expressions') });
            for (const watch of watches) {
                picks.push({
                    label: watch.name,
                    description: watch.value,
                    iconClass: ThemeIcon.asClassName(Codicon.eye),
                    asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(watch)),
                });
            }
        }
        // Add scopes and their variables
        let scopes = [];
        try {
            scopes = await stackFrame.getScopes();
        }
        catch {
            // Ignore errors when fetching scopes
        }
        for (const scope of scopes) {
            // Include variables from non-expensive scopes
            if (scope.expensive && !scope.childrenHaveBeenLoaded) {
                continue;
            }
            picks.push({ type: 'separator', label: scope.name });
            try {
                const variables = await scope.getChildren();
                if (variables.length > 1) {
                    picks.push({
                        label: localize('allVariablesInScope', 'All variables in {0}', scope.name),
                        iconClass: ThemeIcon.asClassName(Codicon.symbolNamespace),
                        asAttachment: () => createDebugAttachments(stackFrame, createScopeEntry(scope, variables)),
                    });
                }
                for (const variable of variables) {
                    picks.push({
                        label: variable.name,
                        description: formatVariableDescription(variable),
                        iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
                        asAttachment: () => createDebugAttachments(stackFrame, createDebugVariableEntry(variable)),
                    });
                }
            }
            catch {
                // Ignore errors when fetching variables
            }
        }
        return picks;
    }
    getExpressionPicks(query, _store) {
        const promise = derived((reader) => {
            const queryValue = query.read(reader);
            const cts = new CancellationTokenSource();
            reader.store.add(toDisposable(() => cts.dispose(true)));
            return new ObservablePromise(this.evaluateExpression(queryValue, cts.token));
        });
        return promise.map((value, r) => {
            const result = value.promiseResult.read(r);
            return { picks: result?.data || [], busy: result === undefined };
        });
    }
    async evaluateExpression(expression, token) {
        if (!expression.trim()) {
            return [{
                    label: localize('typeExpression', 'Type an expression to evaluate...'),
                    disabled: true,
                    asAttachment: () => 'noop',
                }];
        }
        const viewModel = this.debugService.getViewModel();
        const session = viewModel.focusedSession;
        const stackFrame = viewModel.focusedStackFrame;
        if (!session || !stackFrame) {
            return [{
                    label: localize('noDebugSession', 'No active debug session'),
                    disabled: true,
                    asAttachment: () => 'noop',
                }];
        }
        try {
            const response = await session.evaluate(expression, stackFrame.frameId, 'watch');
            if (token.isCancellationRequested) {
                return [];
            }
            if (response?.body) {
                const resultValue = response.body.result;
                const resultType = response.body.type;
                return [{
                        label: expression,
                        description: formatExpressionResult(resultValue, resultType),
                        iconClass: ThemeIcon.asClassName(Codicon.symbolVariable),
                        asAttachment: () => createDebugAttachments(stackFrame, {
                            kind: 'debugVariable',
                            id: `debug-expression:${expression}`,
                            name: expression,
                            fullName: expression,
                            icon: Codicon.debug,
                            value: resultValue,
                            expression: expression,
                            type: resultType,
                            modelDescription: formatModelDescription(expression, resultValue, resultType),
                        }),
                    }];
            }
            else {
                return [{
                        label: expression,
                        description: localize('noResult', 'No result'),
                        disabled: true,
                        asAttachment: () => 'noop',
                    }];
            }
        }
        catch (err) {
            return [{
                    label: expression,
                    description: err instanceof Error ? err.message : localize('evaluationError', 'Evaluation error'),
                    disabled: true,
                    asAttachment: () => 'noop',
                }];
        }
    }
};
DebugSessionContextPick = __decorate([
    __param(0, IDebugService)
], DebugSessionContextPick);
function createDebugVariableEntry(expression) {
    return {
        kind: 'debugVariable',
        id: `debug-variable:${expression.getId()}`,
        name: expression.name,
        fullName: expression.name,
        icon: Codicon.debug,
        value: expression.value,
        expression: expression.name,
        type: expression.type,
        modelDescription: formatModelDescription(expression.name, expression.value, expression.type),
    };
}
function createPausedLocationEntry(stackFrame) {
    const uri = stackFrame.source.uri;
    let range = Range.lift(stackFrame.range);
    if (range.isEmpty()) {
        range = range.setEndPosition(range.startLineNumber + 1, 1);
    }
    return {
        kind: 'file',
        value: { uri, range },
        id: `debug-paused-location:${uri.toString()}:${range.startLineNumber}`,
        name: basename(uri),
        modelDescription: 'The debugger is currently paused at this location',
    };
}
function createDebugAttachments(stackFrame, variableEntry) {
    return [
        createPausedLocationEntry(stackFrame),
        variableEntry,
    ];
}
function createScopeEntry(scope, variables) {
    const variablesSummary = variables.map(v => `${v.name}: ${v.value}`).join('\n');
    return {
        kind: 'debugVariable',
        id: `debug-scope:${scope.name}`,
        name: `Scope: ${scope.name}`,
        fullName: `Scope: ${scope.name}`,
        icon: Codicon.debug,
        value: variablesSummary,
        expression: scope.name,
        type: 'scope',
        modelDescription: `Debug scope "${scope.name}" with ${variables.length} variables:\n${variablesSummary}`,
    };
}
function formatVariableDescription(expression) {
    const value = expression.value;
    const type = expression.type;
    if (type && value) {
        return `${type}: ${value}`;
    }
    return value || type || '';
}
function formatExpressionResult(value, type) {
    if (type && value) {
        return `${type}: ${value}`;
    }
    return value || type || '';
}
function formatModelDescription(name, value, type) {
    let description = `Debug variable "${name}"`;
    if (type) {
        description += ` of type ${type}`;
    }
    description += ` with value: ${value}`;
    return description;
}
let DebugChatContextContribution = class DebugChatContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chat.debugChatContextContribution'; }
    constructor(contextPickService, instantiationService) {
        super();
        this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(DebugSessionContextPick)));
    }
};
DebugChatContextContribution = __decorate([
    __param(0, IChatContextPickService),
    __param(1, IInstantiationService)
], DebugChatContextContribution);
export { DebugChatContextContribution };
// Context menu action: Add variable to chat
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.debug.action.addVariableToChat',
            title: localize('addToChat', 'Add to Chat'),
            f1: false,
            menu: {
                id: MenuId.DebugVariablesContext,
                group: 'z_commands',
                order: 110,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, context) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const debugService = accessor.get(IDebugService);
        const widget = await chatWidgetService.revealWidget();
        if (!widget) {
            return;
        }
        // Context is the variable from the variables view
        const entry = createDebugVariableEntryFromContext(context);
        if (entry) {
            const stackFrame = debugService.getViewModel().focusedStackFrame;
            if (stackFrame) {
                widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
            }
            widget.attachmentModel.addContext(entry);
        }
    }
});
// Context menu action: Add watch expression to chat
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.debug.action.addWatchExpressionToChat',
            title: localize('addToChat', 'Add to Chat'),
            f1: false,
            menu: {
                id: MenuId.DebugWatchContext,
                group: 'z_commands',
                order: 110,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, context) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const debugService = accessor.get(IDebugService);
        const widget = await chatWidgetService.revealWidget();
        if (!context || !widget) {
            return;
        }
        // Context is the expression (watch expression or variable under it)
        const stackFrame = debugService.getViewModel().focusedStackFrame;
        if (stackFrame) {
            widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
        }
        widget.attachmentModel.addContext(createDebugVariableEntry(context));
    }
});
// Context menu action: Add scope to chat
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.debug.action.addScopeToChat',
            title: localize('addToChat', 'Add to Chat'),
            f1: false,
            menu: {
                id: MenuId.DebugScopesContext,
                group: 'z_commands',
                order: 1,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, context) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const debugService = accessor.get(IDebugService);
        const widget = await chatWidgetService.revealWidget();
        if (!context || !widget) {
            return;
        }
        // Get the actual scope and its variables
        const viewModel = debugService.getViewModel();
        const stackFrame = viewModel.focusedStackFrame;
        if (!stackFrame) {
            return;
        }
        try {
            const scopes = await stackFrame.getScopes();
            const scope = scopes.find(s => s.name === context.scope.name);
            if (scope) {
                const variables = await scope.getChildren();
                widget.attachmentModel.addContext(createPausedLocationEntry(stackFrame));
                widget.attachmentModel.addContext(createScopeEntry(scope, variables));
            }
        }
        catch {
            // Ignore errors
        }
    }
});
function isVariablesContext(context) {
    return typeof context === 'object' && context !== null && 'variable' in context && 'sessionId' in context;
}
function createDebugVariableEntryFromContext(context) {
    // The context can be either a Variable directly, or an IVariablesContext object
    if (context instanceof Variable) {
        return createDebugVariableEntry(context);
    }
    // Handle IVariablesContext format from the variables view
    if (isVariablesContext(context)) {
        const variable = context.variable;
        return {
            kind: 'debugVariable',
            id: `debug-variable:${variable.name}`,
            name: variable.name,
            fullName: variable.evaluateName ?? variable.name,
            icon: Codicon.debug,
            value: variable.value,
            expression: variable.evaluateName ?? variable.name,
            type: variable.type,
            modelDescription: formatModelDescription(variable.evaluateName || variable.name, variable.value, variable.type),
        };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdDaGF0SW50ZWdyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnQ2hhdEludGVncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQW9DLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFFckgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0UsT0FBTyxFQUErRCx1QkFBdUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hLLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsYUFBYSxFQUEy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