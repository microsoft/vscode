/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_RESTART_FRAME_SUPPORTED, CONTEXT_SET_DATA_BREAKPOINT_BYTES_SUPPORTED, CONTEXT_SET_EXPRESSION_SUPPORTED, CONTEXT_SET_VARIABLE_SUPPORTED, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_THREADS_SUPPORTED, IDebugSession, IExpression, IExpressionContainer, IStackFrame, IThread, IViewModel } from './debug.js';
import { isSessionAttach } from './debugUtils.js';

export class ViewModel implements IViewModel {

	firstSessionStart = true;

	private _focusedStackFrame: IStackFrame | undefined;
	private _focusedSession: IDebugSession | undefined;
	private _focusedThread: IThread | undefined;
	private selectedExpression: { expression: IExpression; settingWatch: boolean } | undefined;
	private readonly _onDidFocusSession = new Emitter<IDebugSession | undefined>();
	private readonly _onDidFocusThread = new Emitter<{ thread: IThread | undefined; explicit: boolean; session: IDebugSession | undefined }>();
	private readonly _onDidFocusStackFrame = new Emitter<{ stackFrame: IStackFrame | undefined; explicit: boolean; session: IDebugSession | undefined }>();
	private readonly _onDidSelectExpression = new Emitter<{ expression: IExpression; settingWatch: boolean } | undefined>();
	private readonly _onDidEvaluateLazyExpression = new Emitter<IExpressionContainer>();
	private readonly _onWillUpdateViews = new Emitter<void>();
	private readonly _onDidChangeVisualization = new Emitter<{ original: IExpression; replacement: IExpression }>();
	private readonly visualized = new WeakMap<IExpression, IExpression>();
	private readonly preferredVisualizers = new Map</** cache key */ string, /* tree ID */ string>();
	private expressionSelectedContextKey!: IContextKey<boolean>;
	private loadedScriptsSupportedContextKey!: IContextKey<boolean>;
	private stepBackSupportedContextKey!: IContextKey<boolean>;
	private focusedSessionIsAttach!: IContextKey<boolean>;
	private focusedSessionIsNoDebug!: IContextKey<boolean>;
	private restartFrameSupportedContextKey!: IContextKey<boolean>;
	private stepIntoTargetsSupported!: IContextKey<boolean>;
	private jumpToCursorSupported!: IContextKey<boolean>;
	private setVariableSupported!: IContextKey<boolean>;
	private setDataBreakpointAtByteSupported!: IContextKey<boolean>;
	private setExpressionSupported!: IContextKey<boolean>;
	private multiSessionDebug!: IContextKey<boolean>;
	private terminateDebuggeeSupported!: IContextKey<boolean>;
	private suspendDebuggeeSupported!: IContextKey<boolean>;
	private terminateThreadsSupported!: IContextKey<boolean>;
	private disassembleRequestSupported!: IContextKey<boolean>;
	private focusedStackFrameHasInstructionPointerReference!: IContextKey<boolean>;

	constructor(private contextKeyService: IContextKeyService) {
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

	getId(): string {
		return 'root';
	}

	get focusedSession(): IDebugSession | undefined {
		return this._focusedSession;
	}

	get focusedThread(): IThread | undefined {
		return this._focusedThread;
	}

	get focusedStackFrame(): IStackFrame | undefined {
		return this._focusedStackFrame;
	}

	setFocus(stackFrame: IStackFrame | undefined, thread: IThread | undefined, session: IDebugSession | undefined, explicit: boolean): void {
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
		} else if (shouldEmitForThread) {
			this._onDidFocusThread.fire({ thread, explicit, session });
		}
	}

	get onDidFocusSession(): Event<IDebugSession | undefined> {
		return this._onDidFocusSession.event;
	}

	get onDidFocusThread(): Event<{ thread: IThread | undefined; explicit: boolean; session: IDebugSession | undefined }> {
		return this._onDidFocusThread.event;
	}

	get onDidFocusStackFrame(): Event<{ stackFrame: IStackFrame | undefined; explicit: boolean; session: IDebugSession | undefined }> {
		return this._onDidFocusStackFrame.event;
	}

	get onDidChangeVisualization() {
		return this._onDidChangeVisualization.event;
	}

	getSelectedExpression(): { expression: IExpression; settingWatch: boolean } | undefined {
		return this.selectedExpression;
	}

	setSelectedExpression(expression: IExpression | undefined, settingWatch: boolean) {
		this.selectedExpression = expression ? { expression, settingWatch: settingWatch } : undefined;
		this.expressionSelectedContextKey.set(!!expression);
		this._onDidSelectExpression.fire(this.selectedExpression);
	}

	get onDidSelectExpression(): Event<{ expression: IExpression; settingWatch: boolean } | undefined> {
		return this._onDidSelectExpression.event;
	}

	get onDidEvaluateLazyExpression(): Event<IExpressionContainer> {
		return this._onDidEvaluateLazyExpression.event;
	}

	updateViews(): void {
		this._onWillUpdateViews.fire();
	}

	get onWillUpdateViews(): Event<void> {
		return this._onWillUpdateViews.event;
	}

	isMultiSessionView(): boolean {
		return !!this.multiSessionDebug.get();
	}

	setMultiSessionView(isMultiSessionView: boolean): void {
		this.multiSessionDebug.set(isMultiSessionView);
	}

	setVisualizedExpression(original: IExpression, visualized: IExpression & { treeId: string } | undefined): void {
		const current = this.visualized.get(original) || original;
		const key = this.getPreferredVisualizedKey(original);
		if (visualized) {
			this.visualized.set(original, visualized);
			this.preferredVisualizers.set(key, visualized.treeId);
		} else {
			this.visualized.delete(original);
			this.preferredVisualizers.delete(key);
		}
		this._onDidChangeVisualization.fire({ original: current, replacement: visualized || original });
	}

	getVisualizedExpression(expression: IExpression): IExpression | string | undefined {
		return this.visualized.get(expression) || this.preferredVisualizers.get(this.getPreferredVisualizedKey(expression));
	}

	async evaluateLazyExpression(expression: IExpressionContainer): Promise<void> {
		await expression.evaluateLazy();
		this._onDidEvaluateLazyExpression.fire(expression);
	}

	private getPreferredVisualizedKey(expr: IExpression) {
		return JSON.stringify([
			expr.name,
			expr.type,
			!!expr.memoryReference,
		].join('\0'));
	}
}
