/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_RESTART_FRAME_SUPPORTED, CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, CONTEXT_SET_EXPRESSION_SUPPORTED, CONTEXT_SET_VARIABLE_SUPPORTED, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_THREADS_SUPPORTED } from './debug.js';
import { isSessionAttach } from './debugUtils.js';
export class ViewModel extends Disposable {
    constructor(contextKeyService) {
        super();
        this.contextKeyService = contextKeyService;
        this.firstSessionStart = true;
        this._onDidFocusSession = this._register(new Emitter());
        this._onDidFocusThread = this._register(new Emitter());
        this._onDidFocusStackFrame = this._register(new Emitter());
        this._onDidSelectExpression = this._register(new Emitter());
        this._onDidEvaluateLazyExpression = this._register(new Emitter());
        this._onWillUpdateViews = this._register(new Emitter());
        this._onDidChangeVisualization = this._register(new Emitter());
        this.visualized = new WeakMap();
        this.preferredVisualizers = new Map();
        contextKeyService.bufferChangeEvents(() => {
            this.expressionSelectedContextKey = CONTEXT_EXPRESSION_SELECTED.bindTo(contextKeyService);
            this.loadedScriptsSupportedContextKey = CONTEXT_LOADED_SCRIPTS_SUPPORTED.bindTo(contextKeyService);
            this.stepBackSupportedContextKey = CONTEXT_STEP_BACK_SUPPORTED.bindTo(contextKeyService);
            this.focusedSessionIsAttach = CONTEXT_FOCUSED_SESSION_IS_ATTACH.bindTo(contextKeyService);
            this.focusedSessionIsNoDebug = CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.bindTo(contextKeyService);
            this.restartFrameSupportedContextKey = CONTEXT_RESTART_FRAME_SUPPORTED.bindTo(contextKeyService);
            this.stepIntoTargetsSupported = CONTEXT_STEP_INTO_TARGETS_SUPPORTED.bindTo(contextKeyService);
            this.jumpToCursorSupported = CONTEXT_JUMP_TO_CURSOR_SUPPORTED.bindTo(contextKeyService);
            this.setVariableSupported = CONTEXT_SET_VARIABLE_SUPPORTED.bindTo(contextKeyService);
            this.setDataBreakpointAtByteSupported = CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED.bindTo(contextKeyService);
            this.setExpressionSupported = CONTEXT_SET_EXPRESSION_SUPPORTED.bindTo(contextKeyService);
            this.multiSessionDebug = CONTEXT_MULTI_SESSION_DEBUG.bindTo(contextKeyService);
            this.terminateDebuggeeSupported = CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED.bindTo(contextKeyService);
            this.suspendDebuggeeSupported = CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED.bindTo(contextKeyService);
            this.terminateThreadsSupported = CONTEXT_TERMINATE_THREADS_SUPPORTED.bindTo(contextKeyService);
            this.disassembleRequestSupported = CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED.bindTo(contextKeyService);
            this.focusedStackFrameHasInstructionPointerReference = CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE.bindTo(contextKeyService);
        });
    }
    getId() {
        return 'root';
    }
    get focusedSession() {
        return this._focusedSession;
    }
    get focusedThread() {
        return this._focusedThread;
    }
    get focusedStackFrame() {
        return this._focusedStackFrame;
    }
    setFocus(stackFrame, thread, session, explicit) {
        const shouldEmitForStackFrame = this._focusedStackFrame !== stackFrame;
        const shouldEmitForSession = this._focusedSession !== session;
        const shouldEmitForThread = this._focusedThread !== thread;
        this._focusedStackFrame = stackFrame;
        this._focusedThread = thread;
        this._focusedSession = session;
        this.contextKeyService.bufferChangeEvents(() => {
            this.loadedScriptsSupportedContextKey.set(!!session?.capabilities.supportsLoadedSourcesRequest);
            this.stepBackSupportedContextKey.set(!!session?.capabilities.supportsStepBack);
            this.restartFrameSupportedContextKey.set(!!session?.capabilities.supportsRestartFrame);
            this.stepIntoTargetsSupported.set(!!session?.capabilities.supportsStepInTargetsRequest);
            this.jumpToCursorSupported.set(!!session?.capabilities.supportsGotoTargetsRequest);
            this.setVariableSupported.set(!!session?.capabilities.supportsSetVariable);
            this.setDataBreakpointAtByteSupported.set(!!session?.capabilities.supportsDataBreakpointBytes);
            this.setExpressionSupported.set(!!session?.capabilities.supportsSetExpression);
            this.terminateDebuggeeSupported.set(!!session?.capabilities.supportTerminateDebuggee);
            this.suspendDebuggeeSupported.set(!!session?.capabilities.supportSuspendDebuggee);
            this.terminateThreadsSupported.set(!!session?.capabilities.supportsTerminateThreadsRequest);
            this.disassembleRequestSupported.set(!!session?.capabilities.supportsDisassembleRequest);
            this.focusedStackFrameHasInstructionPointerReference.set(!!stackFrame?.instructionPointerReference);
            const attach = !!session && isSessionAttach(session);
            this.focusedSessionIsAttach.set(attach);
            this.focusedSessionIsNoDebug.set(!!session && !!session.configuration.noDebug);
        });
        if (shouldEmitForSession) {
            this._onDidFocusSession.fire(session);
        }
        // should not call onDidFocusThread if onDidFocusStackFrame is called.
        if (shouldEmitForStackFrame) {
            this._onDidFocusStackFrame.fire({ stackFrame, explicit, session });
        }
        else if (shouldEmitForThread) {
            this._onDidFocusThread.fire({ thread, explicit, session });
        }
    }
    get onDidFocusSession() {
        return this._onDidFocusSession.event;
    }
    get onDidFocusThread() {
        return this._onDidFocusThread.event;
    }
    get onDidFocusStackFrame() {
        return this._onDidFocusStackFrame.event;
    }
    get onDidChangeVisualization() {
        return this._onDidChangeVisualization.event;
    }
    getSelectedExpression() {
        return this.selectedExpression;
    }
    setSelectedExpression(expression, settingWatch) {
        this.selectedExpression = expression ? { expression, settingWatch: settingWatch } : undefined;
        this.expressionSelectedContextKey.set(!!expression);
        this._onDidSelectExpression.fire(this.selectedExpression);
    }
    get onDidSelectExpression() {
        return this._onDidSelectExpression.event;
    }
    get onDidEvaluateLazyExpression() {
        return this._onDidEvaluateLazyExpression.event;
    }
    updateViews() {
        this._onWillUpdateViews.fire();
    }
    get onWillUpdateViews() {
        return this._onWillUpdateViews.event;
    }
    isMultiSessionView() {
        return !!this.multiSessionDebug.get();
    }
    setMultiSessionView(isMultiSessionView) {
        this.multiSessionDebug.set(isMultiSessionView);
    }
    setVisualizedExpression(original, visualized) {
        const current = this.visualized.get(original) || original;
        const key = this.getPreferredVisualizedKey(original);
        if (visualized) {
            this.visualized.set(original, visualized);
            this.preferredVisualizers.set(key, visualized.treeId);
        }
        else {
            this.visualized.delete(original);
            this.preferredVisualizers.delete(key);
        }
        this._onDidChangeVisualization.fire({ original: current, replacement: visualized || original });
    }
    getVisualizedExpression(expression) {
        return this.visualized.get(expression) || this.preferredVisualizers.get(this.getPreferredVisualizedKey(expression));
    }
    async evaluateLazyExpression(expression) {
        await expression.evaluateLazy();
        this._onDidEvaluateLazyExpression.fire(expression);
    }
    getPreferredVisualizedKey(expr) {
        return JSON.stringify([
            expr.name,
            expr.type,
            !!expr.memoryReference,
        ].join('\0'));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdWaWV3TW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdWaWV3TW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUscUNBQXFDLEVBQUUsMkJBQTJCLEVBQUUsaUNBQWlDLEVBQUUsbUNBQW1DLEVBQUUsNkRBQTZELEVBQUUsZ0NBQWdDLEVBQUUsZ0NBQWdDLEVBQUUsMkJBQTJCLEVBQUUsK0JBQStCLEVBQUUsMkNBQTJDLEVBQUUsZ0NBQWdDLEVBQUUsOEJBQThCLEVBQUUsMkJBQTJCLEVBQUUsbUNBQW1DLEVBQUUsa0NBQWtDLEVBQUUsb0NBQW9DLEVBQUUsbUNBQW1DLEVBQXNGLE1BQU0sWUFBWSxDQUFDO0FBQzd0QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFbEQsTUFBTSxPQUFPLFNBQVUsU0FBUSxVQUFVO0lBbUN4QyxZQUFvQixpQkFBcUM7UUFDeEQsS0FBSyxFQUFFLENBQUM7UUFEVyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBakN6RCxzQkFBaUIsR0FBRyxJQUFJLENBQUM7UUFNUix1QkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE2QixDQUFDLENBQUM7UUFDOUUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEYsQ0FBQyxDQUFDO1FBQzFJLDBCQUFxQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtHLENBQUMsQ0FBQztRQUN0SiwyQkFBc0Is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