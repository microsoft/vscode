/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_MULTI_SESSION_DEBUG, CONTEXT_RESTART_FRAME_SUPPORTED, CONTEXT_SET_EXPRESSION_SUPPORTED, CONTEXT_SET_VARIABLE_SUPPORTED, CONTEXT_STEP_BACK_SUPPORTED, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, IDebugSession, IExpression, IExpressionContainer, IStackFrame, IThread, IViewModel } from 'vs/workbench/contrib/debug/common/debug';
import { isSessionAttach } from 'vs/workbench/contrib/debug/common/debugUtils';

export class ViewModel implements IViewModel {

	firstSessionStart = true;

	private _focusedStackFrame: IStackFrame | undefined;
	private _focusedSession: IDebugSession | undefined;
	private _focusedThread: IThread | undefined;
	private selectedExpression: { expression: IExpression; settingWatch: boolean } | undefined;
	private readonly _onDidFocusSession = new Emitter<IDebugSession | undefined>();
	private readonly _onDidFocusStackFrame = new Emitter<{ stackFrame: IStackFrame | undefined; explicit: boolean }>();
	private readonly _onDidSelectExpression = new Emitter<{ expression: IExpression; settingWatch: boolean } | undefined>();
	private readonly _onDidEvaluateLazyExpression = new Emitter<IExpressionContainer>();
	private readonly _onWillUpdateViews = new Emitter<void>();
	private expressionSelectedContextKey!: IContextKey<boolean>;
	private loadedScriptsSupportedContextKey!: IContextKey<boolean>;
	private stepBackSupportedContextKey!: IContextKey<boolean>;
	private focusedSessionIsAttach!: IContextKey<boolean>;
	private restartFrameSupportedContextKey!: IContextKey<boolean>;
	private stepIntoTargetsSupported!: IContextKey<boolean>;
	private jumpToCursorSupported!: IContextKey<boolean>;
	private setVariableSupported!: IContextKey<boolean>;
	private setExpressionSupported!: IContextKey<boolean>;
	private multiSessionDebug!: IContextKey<boolean>;
	private terminateDebuggeeSupported!: IContextKey<boolean>;
	private suspendDebuggeeSupported!: IContextKey<boolean>;
	private disassembleRequestSupported!: IContextKey<boolean>;
	private focusedStackFrameHasInstructionPointerReference!: IContextKey<boolean>;

	constructor(contextKeyService: IContextKeyService) {
		this.expressionSelectedContextKey = CONTEXT_EXPRESSION_SELECTED.bindTo(contextKeyService);
		this.loadedScriptsSupportedContextKey = CONTEXT_LOADED_SCRIPTS_SUPPORTED.bindTo(contextKeyService);
		this.stepBackSupportedContextKey = CONTEXT_STEP_BACK_SUPPORTED.bindTo(contextKeyService);
		this.focusedSessionIsAttach = CONTEXT_FOCUSED_SESSION_IS_ATTACH.bindTo(contextKeyService);
		this.restartFrameSupportedContextKey = CONTEXT_RESTART_FRAME_SUPPORTED.bindTo(contextKeyService);
		this.stepIntoTargetsSupported = CONTEXT_STEP_INTO_TARGETS_SUPPORTED.bindTo(contextKeyService);
		this.jumpToCursorSupported = CONTEXT_JUMP_TO_CURSOR_SUPPORTED.bindTo(contextKeyService);
		this.setVariableSupported = CONTEXT_SET_VARIABLE_SUPPORTED.bindTo(contextKeyService);
		this.setExpressionSupported = CONTEXT_SET_EXPRESSION_SUPPORTED.bindTo(contextKeyService);
		this.multiSessionDebug = CONTEXT_MULTI_SESSION_DEBUG.bindTo(contextKeyService);
		this.terminateDebuggeeSupported = CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED.bindTo(contextKeyService);
		this.suspendDebuggeeSupported = CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED.bindTo(contextKeyService);
		this.disassembleRequestSupported = CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED.bindTo(contextKeyService);
		this.focusedStackFrameHasInstructionPointerReference = CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE.bindTo(contextKeyService);
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

		this._focusedStackFrame = stackFrame;
		this._focusedThread = thread;
		this._focusedSession = session;

		this.loadedScriptsSupportedContextKey.set(session ? !!session.capabilities.supportsLoadedSourcesRequest : false);
		this.stepBackSupportedContextKey.set(session ? !!session.capabilities.supportsStepBack : false);
		this.restartFrameSupportedContextKey.set(session ? !!session.capabilities.supportsRestartFrame : false);
		this.stepIntoTargetsSupported.set(session ? !!session.capabilities.supportsStepInTargetsRequest : false);
		this.jumpToCursorSupported.set(session ? !!session.capabilities.supportsGotoTargetsRequest : false);
		this.setVariableSupported.set(session ? !!session.capabilities.supportsSetVariable : false);
		this.setExpressionSupported.set(session ? !!session.capabilities.supportsSetExpression : false);
		this.terminateDebuggeeSupported.set(session ? !!session.capabilities.supportTerminateDebuggee : false);
		this.suspendDebuggeeSupported.set(session ? !!session.capabilities.supportSuspendDebuggee : false);
		this.disassembleRequestSupported.set(!!session?.capabilities.supportsDisassembleRequest);
		this.focusedStackFrameHasInstructionPointerReference.set(!!stackFrame?.instructionPointerReference);
		const attach = !!session && isSessionAttach(session);
		this.focusedSessionIsAttach.set(attach);

		if (shouldEmitForSession) {
			this._onDidFocusSession.fire(session);
		}
		if (shouldEmitForStackFrame) {
			this._onDidFocusStackFrame.fire({ stackFrame, explicit });
		}
	}

	get onDidFocusSession(): Event<IDebugSession | undefined> {
		return this._onDidFocusSession.event;
	}

	get onDidFocusStackFrame(): Event<{ stackFrame: IStackFrame | undefined; explicit: boolean }> {
		return this._onDidFocusStackFrame.event;
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

	async evaluateLazyExpression(expression: IExpressionContainer): Promise<void> {
		await expression.evaluateLazy();
		this._onDidEvaluateLazyExpression.fire(expression);
	}
}
