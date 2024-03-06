/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { IDebugService, IEnablement, CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_VARIABLES_FOCUSED, EDITOR_CONTRIBUTION_ID, IDebugEditorContribution, CONTEXT_IN_DEBUG_MODE, CONTEXT_EXPRESSION_SELECTED, IConfig, IStackFrame, IThread, IDebugSession, CONTEXT_DEBUG_STATE, IDebugConfiguration, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, REPL_VIEW_ID, CONTEXT_DEBUGGERS_AVAILABLE, State, getStateLabel, CONTEXT_BREAKPOINT_INPUT_FOCUSED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, VIEWLET_ID, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_IN_DEBUG_REPL, CONTEXT_STEP_INTO_TARGETS_SUPPORTED } from 'vs/workbench/contrib/debug/common/debug';
import { Expression, Variable, Breakpoint, FunctionBreakpoint, DataBreakpoint, Thread } from 'vs/workbench/contrib/debug/common/debugModel';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { MenuRegistry, MenuId, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { openBreakpointSource } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ActiveEditorContext, PanelFocusContext, ResourceContextKey } from 'vs/workbench/common/contextkeys';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfiguration';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { deepClone } from 'vs/base/common/objects';
import { isWeb, isWindows } from 'vs/base/common/platform';
import { saveAllBeforeDebugStart } from 'vs/workbench/contrib/debug/common/debugUtils';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { showLoadedScriptMenu } from 'vs/workbench/contrib/debug/common/loadedScriptsPicker';
import { showDebugSessionMenu } from 'vs/workbench/contrib/debug/browser/debugSessionPicker';
import { TEXT_FILE_EDITOR_ID } from 'vs/workbench/contrib/files/common/files';
import { ILocalizedString } from 'vs/platform/action/common/action';

export const ADD_CONFIGURATION_ID = 'debug.addConfiguration';
export const TOGGLE_INLINE_BREAKPOINT_ID = 'editor.debug.action.toggleInlineBreakpoint';
export const COPY_STACK_TRACE_ID = 'debug.copyStackTrace';
export const REVERSE_CONTINUE_ID = 'workbench.action.debug.reverseContinue';
export const STEP_BACK_ID = 'workbench.action.debug.stepBack';
export const RESTART_SESSION_ID = 'workbench.action.debug.restart';
export const TERMINATE_THREAD_ID = 'workbench.action.debug.terminateThread';
export const STEP_OVER_ID = 'workbench.action.debug.stepOver';
export const STEP_INTO_ID = 'workbench.action.debug.stepInto';
export const STEP_INTO_TARGET_ID = 'workbench.action.debug.stepIntoTarget';
export const STEP_OUT_ID = 'workbench.action.debug.stepOut';
export const PAUSE_ID = 'workbench.action.debug.pause';
export const DISCONNECT_ID = 'workbench.action.debug.disconnect';
export const DISCONNECT_AND_SUSPEND_ID = 'workbench.action.debug.disconnectAndSuspend';
export const STOP_ID = 'workbench.action.debug.stop';
export const RESTART_FRAME_ID = 'workbench.action.debug.restartFrame';
export const CONTINUE_ID = 'workbench.action.debug.continue';
export const FOCUS_REPL_ID = 'workbench.debug.action.focusRepl';
export const JUMP_TO_CURSOR_ID = 'debug.jumpToCursor';
export const FOCUS_SESSION_ID = 'workbench.action.debug.focusProcess';
export const SELECT_AND_START_ID = 'workbench.action.debug.selectandstart';
export const SELECT_DEBUG_CONSOLE_ID = 'workbench.action.debug.selectDebugConsole';
export const SELECT_DEBUG_SESSION_ID = 'workbench.action.debug.selectDebugSession';
export const DEBUG_CONFIGURE_COMMAND_ID = 'workbench.action.debug.configure';
export const DEBUG_START_COMMAND_ID = 'workbench.action.debug.start';
export const DEBUG_RUN_COMMAND_ID = 'workbench.action.debug.run';
export const EDIT_EXPRESSION_COMMAND_ID = 'debug.renameWatchExpression';
export const SET_EXPRESSION_COMMAND_ID = 'debug.setWatchExpression';
export const REMOVE_EXPRESSION_COMMAND_ID = 'debug.removeWatchExpression';
export const NEXT_DEBUG_CONSOLE_ID = 'workbench.action.debug.nextConsole';
export const PREV_DEBUG_CONSOLE_ID = 'workbench.action.debug.prevConsole';
export const SHOW_LOADED_SCRIPTS_ID = 'workbench.action.debug.showLoadedScripts';
export const CALLSTACK_TOP_ID = 'workbench.action.debug.callStackTop';
export const CALLSTACK_BOTTOM_ID = 'workbench.action.debug.callStackBottom';
export const CALLSTACK_UP_ID = 'workbench.action.debug.callStackUp';
export const CALLSTACK_DOWN_ID = 'workbench.action.debug.callStackDown';

export const DEBUG_COMMAND_CATEGORY: ILocalizedString = nls.localize2('debug', 'Debug');
export const RESTART_LABEL = nls.localize2('restartDebug', "Restart");
export const STEP_OVER_LABEL = nls.localize2('stepOverDebug', "Step Over");
export const STEP_INTO_LABEL = nls.localize2('stepIntoDebug', "Step Into");
export const STEP_INTO_TARGET_LABEL = nls.localize2('stepIntoTargetDebug', "Step Into Target");
export const STEP_OUT_LABEL = nls.localize2('stepOutDebug', "Step Out");
export const PAUSE_LABEL = nls.localize2('pauseDebug', "Pause");
export const DISCONNECT_LABEL = nls.localize2('disconnect', "Disconnect");
export const DISCONNECT_AND_SUSPEND_LABEL = nls.localize2('disconnectSuspend', "Disconnect and Suspend");
export const STOP_LABEL = nls.localize2('stop', "Stop");
export const CONTINUE_LABEL = nls.localize2('continueDebug', "Continue");
export const FOCUS_SESSION_LABEL = nls.localize2('focusSession', "Focus Session");
export const SELECT_AND_START_LABEL = nls.localize2('selectAndStartDebugging', "Select and Start Debugging");
export const DEBUG_CONFIGURE_LABEL = nls.localize('openLaunchJson', "Open '{0}'", 'launch.json');
export const DEBUG_START_LABEL = nls.localize2('startDebug', "Start Debugging");
export const DEBUG_RUN_LABEL = nls.localize2('startWithoutDebugging', "Start Without Debugging");
export const NEXT_DEBUG_CONSOLE_LABEL = nls.localize2('nextDebugConsole', "Focus Next Debug Console");
export const PREV_DEBUG_CONSOLE_LABEL = nls.localize2('prevDebugConsole', "Focus Previous Debug Console");
export const OPEN_LOADED_SCRIPTS_LABEL = nls.localize2('openLoadedScript', "Open Loaded Script...");
export const CALLSTACK_TOP_LABEL = nls.localize2('callStackTop', "Navigate to Top of Call Stack");
export const CALLSTACK_BOTTOM_LABEL = nls.localize2('callStackBottom', "Navigate to Bottom of Call Stack");
export const CALLSTACK_UP_LABEL = nls.localize2('callStackUp', "Navigate Up Call Stack");
export const CALLSTACK_DOWN_LABEL = nls.localize2('callStackDown', "Navigate Down Call Stack");

export const SELECT_DEBUG_CONSOLE_LABEL = nls.localize2('selectDebugConsole', "Select Debug Console");
export const SELECT_DEBUG_SESSION_LABEL = nls.localize2('selectDebugSession', "Select Debug Session");

export const DEBUG_QUICK_ACCESS_PREFIX = 'debug ';
export const DEBUG_CONSOLE_QUICK_ACCESS_PREFIX = 'debug consoles ';

interface CallStackContext {
	sessionId: string;
	threadId: string;
	frameId: string;
}

function isThreadContext(obj: any): obj is CallStackContext {
	return obj && typeof obj.sessionId === 'string' && typeof obj.threadId === 'string';
}

async function getThreadAndRun(accessor: ServicesAccessor, sessionAndThreadId: CallStackContext | unknown, run: (thread: IThread) => Promise<void>): Promise<void> {
	const debugService = accessor.get(IDebugService);
	let thread: IThread | undefined;
	if (isThreadContext(sessionAndThreadId)) {
		const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
		if (session) {
			thread = session.getAllThreads().find(t => t.getId() === sessionAndThreadId.threadId);
		}
	} else if (isSessionContext(sessionAndThreadId)) {
		const session = debugService.getModel().getSession(sessionAndThreadId.sessionId);
		if (session) {
			const threads = session.getAllThreads();
			thread = threads.length > 0 ? threads[0] : undefined;
		}
	}

	if (!thread) {
		thread = debugService.getViewModel().focusedThread;
		if (!thread) {
			const focusedSession = debugService.getViewModel().focusedSession;
			const threads = focusedSession ? focusedSession.getAllThreads() : undefined;
			thread = threads && threads.length ? threads[0] : undefined;
		}
	}

	if (thread) {
		await run(thread);
	}
}

function isStackFrameContext(obj: any): obj is CallStackContext {
	return obj && typeof obj.sessionId === 'string' && typeof obj.threadId === 'string' && typeof obj.frameId === 'string';
}

function getFrame(debugService: IDebugService, context: CallStackContext | unknown): IStackFrame | undefined {
	if (isStackFrameContext(context)) {
		const session = debugService.getModel().getSession(context.sessionId);
		if (session) {
			const thread = session.getAllThreads().find(t => t.getId() === context.threadId);
			if (thread) {
				return thread.getCallStack().find(sf => sf.getId() === context.frameId);
			}
		}
	} else {
		return debugService.getViewModel().focusedStackFrame;
	}

	return undefined;
}

function isSessionContext(obj: any): obj is CallStackContext {
	return obj && typeof obj.sessionId === 'string';
}

async function changeDebugConsoleFocus(accessor: ServicesAccessor, next: boolean) {
	const debugService = accessor.get(IDebugService);
	const viewsService = accessor.get(IViewsService);
	const sessions = debugService.getModel().getSessions(true).filter(s => s.hasSeparateRepl());
	let currSession = debugService.getViewModel().focusedSession;

	let nextIndex = 0;
	if (sessions.length > 0 && currSession) {
		while (currSession && !currSession.hasSeparateRepl()) {
			currSession = currSession.parentSession;
		}

		if (currSession) {
			const currIndex = sessions.indexOf(currSession);
			if (next) {
				nextIndex = (currIndex === (sessions.length - 1) ? 0 : (currIndex + 1));
			} else {
				nextIndex = (currIndex === 0 ? (sessions.length - 1) : (currIndex - 1));
			}
		}
	}
	await debugService.focusStackFrame(undefined, undefined, sessions[nextIndex], { explicit: true });

	if (!viewsService.isViewVisible(REPL_VIEW_ID)) {
		await viewsService.openView(REPL_VIEW_ID, true);
	}
}

async function navigateCallStack(debugService: IDebugService, down: boolean) {
	const frame = debugService.getViewModel().focusedStackFrame;
	if (frame) {

		let callStack = frame.thread.getCallStack();
		let index = callStack.findIndex(elem => elem.frameId === frame.frameId);
		let nextVisibleFrame;
		if (down) {
			if (index >= callStack.length - 1) {
				if ((<Thread>frame.thread).reachedEndOfCallStack) {
					goToTopOfCallStack(debugService);
					return;
				} else {
					await debugService.getModel().fetchCallstack(frame.thread, 20);
					callStack = frame.thread.getCallStack();
					index = callStack.findIndex(elem => elem.frameId === frame.frameId);
				}
			}
			nextVisibleFrame = findNextVisibleFrame(true, callStack, index);
		} else {
			if (index <= 0) {
				goToBottomOfCallStack(debugService);
				return;
			}
			nextVisibleFrame = findNextVisibleFrame(false, callStack, index);
		}

		if (nextVisibleFrame) {
			debugService.focusStackFrame(nextVisibleFrame, undefined, undefined, { preserveFocus: false });
		}
	}
}

async function goToBottomOfCallStack(debugService: IDebugService) {
	const thread = debugService.getViewModel().focusedThread;
	if (thread) {
		await debugService.getModel().fetchCallstack(thread);
		const callStack = thread.getCallStack();
		if (callStack.length > 0) {
			const nextVisibleFrame = findNextVisibleFrame(false, callStack, 0); // must consider the next frame up first, which will be the last frame
			if (nextVisibleFrame) {
				debugService.focusStackFrame(nextVisibleFrame, undefined, undefined, { preserveFocus: false });
			}
		}
	}
}

function goToTopOfCallStack(debugService: IDebugService) {
	const thread = debugService.getViewModel().focusedThread;

	if (thread) {
		debugService.focusStackFrame(thread.getTopStackFrame(), undefined, undefined, { preserveFocus: false });
	}
}

/**
 * Finds next frame that is not skipped by SkipFiles. Skips frame at index and starts searching at next.
 * Must satisfy `0 <= startIndex <= callStack - 1`
 * @param down specifies whether to search downwards if the current file is skipped.
 * @param callStack the call stack to search
 * @param startIndex the index to start the search at
 */
function findNextVisibleFrame(down: boolean, callStack: readonly IStackFrame[], startIndex: number) {

	if (startIndex >= callStack.length) {
		startIndex = callStack.length - 1;
	} else if (startIndex < 0) {
		startIndex = 0;
	}

	let index = startIndex;

	let currFrame;
	do {
		if (down) {
			if (index === callStack.length - 1) {
				index = 0;
			} else {
				index++;
			}
		} else {
			if (index === 0) {
				index = callStack.length - 1;
			} else {
				index--;
			}
		}

		currFrame = callStack[index];
		if (!(currFrame.source.presentationHint === 'deemphasize' || currFrame.presentationHint === 'deemphasize')) {
			return currFrame;
		}
	} while (index !== startIndex); // end loop when we've just checked the start index, since that should be the last one checked

	return undefined;
}

// These commands are used in call stack context menu, call stack inline actions, command palette, debug toolbar, mac native touch bar
// When the command is exectued in the context of a thread(context menu on a thread, inline call stack action) we pass the thread id
// Otherwise when it is executed "globaly"(using the touch bar, debug toolbar, command palette) we do not pass any id and just take whatever is the focussed thread
// Same for stackFrame commands and session commands.
CommandsRegistry.registerCommand({
	id: COPY_STACK_TRACE_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const textResourcePropertiesService = accessor.get(ITextResourcePropertiesService);
		const clipboardService = accessor.get(IClipboardService);
		const debugService = accessor.get(IDebugService);
		const frame = getFrame(debugService, context);
		if (frame) {
			const eol = textResourcePropertiesService.getEOL(frame.source.uri);
			await clipboardService.writeText(frame.thread.getCallStack().map(sf => sf.toString()).join(eol));
		}
	}
});

CommandsRegistry.registerCommand({
	id: REVERSE_CONTINUE_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		await getThreadAndRun(accessor, context, thread => thread.reverseContinue());
	}
});

CommandsRegistry.registerCommand({
	id: STEP_BACK_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const contextKeyService = accessor.get(IContextKeyService);
		if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepBack('instruction'));
		} else {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepBack());
		}
	}
});

CommandsRegistry.registerCommand({
	id: TERMINATE_THREAD_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		await getThreadAndRun(accessor, context, thread => thread.terminate());
	}
});

CommandsRegistry.registerCommand({
	id: JUMP_TO_CURSOR_ID,
	handler: async (accessor: ServicesAccessor) => {
		const debugService = accessor.get(IDebugService);
		const stackFrame = debugService.getViewModel().focusedStackFrame;
		const editorService = accessor.get(IEditorService);
		const activeEditorControl = editorService.activeTextEditorControl;
		const notificationService = accessor.get(INotificationService);
		const quickInputService = accessor.get(IQuickInputService);

		if (stackFrame && isCodeEditor(activeEditorControl) && activeEditorControl.hasModel()) {
			const position = activeEditorControl.getPosition();
			const resource = activeEditorControl.getModel().uri;
			const source = stackFrame.thread.session.getSourceForUri(resource);
			if (source) {
				const response = await stackFrame.thread.session.gotoTargets(source.raw, position.lineNumber, position.column);
				const targets = response?.body.targets;
				if (targets && targets.length) {
					let id = targets[0].id;
					if (targets.length > 1) {
						const picks = targets.map(t => ({ label: t.label, _id: t.id }));
						const pick = await quickInputService.pick(picks, { placeHolder: nls.localize('chooseLocation', "Choose the specific location") });
						if (!pick) {
							return;
						}

						id = pick._id;
					}

					return await stackFrame.thread.session.goto(stackFrame.thread.threadId, id).catch(e => notificationService.warn(e));
				}
			}
		}

		return notificationService.warn(nls.localize('noExecutableCode', "No executable code is associated at the current cursor position."));
	}
});


CommandsRegistry.registerCommand({
	id: CALLSTACK_TOP_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		goToTopOfCallStack(debugService);
	}
});

CommandsRegistry.registerCommand({
	id: CALLSTACK_BOTTOM_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		await goToBottomOfCallStack(debugService);
	}
});

CommandsRegistry.registerCommand({
	id: CALLSTACK_UP_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		navigateCallStack(debugService, false);
	}
});

CommandsRegistry.registerCommand({
	id: CALLSTACK_DOWN_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		navigateCallStack(debugService, true);
	}
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: JUMP_TO_CURSOR_ID,
		title: nls.localize('jumpToCursor', "Jump to Cursor"),
		category: DEBUG_COMMAND_CATEGORY
	},
	when: ContextKeyExpr.and(CONTEXT_JUMP_TO_CURSOR_SUPPORTED, EditorContextKeys.editorTextFocus),
	group: 'debug',
	order: 3
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: NEXT_DEBUG_CONSOLE_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: CONTEXT_IN_DEBUG_REPL,
	primary: KeyMod.CtrlCmd | KeyCode.PageDown,
	mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketRight },
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		changeDebugConsoleFocus(accessor, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: PREV_DEBUG_CONSOLE_ID,
	weight: KeybindingWeight.WorkbenchContrib + 1,
	when: CONTEXT_IN_DEBUG_REPL,
	primary: KeyMod.CtrlCmd | KeyCode.PageUp,
	mac: { primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.BracketLeft },
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		changeDebugConsoleFocus(accessor, false);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: RESTART_SESSION_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.F5,
	when: CONTEXT_IN_DEBUG_MODE,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		const configurationService = accessor.get(IConfigurationService);
		let session: IDebugSession | undefined;
		if (isSessionContext(context)) {
			session = debugService.getModel().getSession(context.sessionId);
		} else {
			session = debugService.getViewModel().focusedSession;
		}

		if (!session) {
			const { launch, name } = debugService.getConfigurationManager().selectedConfiguration;
			await debugService.startDebugging(launch, name, { noDebug: false, startedByUser: true });
		} else {
			const showSubSessions = configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
			// Stop should be sent to the root parent session
			while (!showSubSessions && session.lifecycleManagedByParent && session.parentSession) {
				session = session.parentSession;
			}
			session.removeReplExpressions();
			await debugService.restartSession(session);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: STEP_OVER_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.F10,
	when: CONTEXT_DEBUG_STATE.isEqualTo('stopped'),
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const contextKeyService = accessor.get(IContextKeyService);
		if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.next('instruction'));
		} else {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.next());
		}
	}
});

// Windows browsers use F11 for full screen, thus use alt+F11 as the default shortcut
const STEP_INTO_KEYBINDING = (isWeb && isWindows) ? (KeyMod.Alt | KeyCode.F11) : KeyCode.F11;

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: STEP_INTO_ID,
	weight: KeybindingWeight.WorkbenchContrib + 10, // Have a stronger weight to have priority over full screen when debugging
	primary: STEP_INTO_KEYBINDING,
	// Use a more flexible when clause to not allow full screen command to take over when F11 pressed a lot of times
	when: CONTEXT_DEBUG_STATE.notEqualsTo('inactive'),
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const contextKeyService = accessor.get(IContextKeyService);
		if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepIn('instruction'));
		} else {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepIn());
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: STEP_OUT_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.Shift | KeyCode.F11,
	when: CONTEXT_DEBUG_STATE.isEqualTo('stopped'),
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const contextKeyService = accessor.get(IContextKeyService);
		if (CONTEXT_DISASSEMBLY_VIEW_FOCUS.getValue(contextKeyService)) {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepOut('instruction'));
		} else {
			await getThreadAndRun(accessor, context, (thread: IThread) => thread.stepOut());
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: PAUSE_ID,
	weight: KeybindingWeight.WorkbenchContrib + 2, // take priority over focus next part while we are debugging
	primary: KeyCode.F6,
	when: CONTEXT_DEBUG_STATE.isEqualTo('running'),
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		await getThreadAndRun(accessor, context, thread => thread.pause());
	}
});


KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: STEP_INTO_TARGET_ID,
	primary: STEP_INTO_KEYBINDING | KeyMod.CtrlCmd,
	when: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped')),
	weight: KeybindingWeight.WorkbenchContrib,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const quickInputService = accessor.get(IQuickInputService);
		const debugService = accessor.get(IDebugService);
		const session = debugService.getViewModel().focusedSession;
		const frame = debugService.getViewModel().focusedStackFrame;
		if (!frame || !session) {
			return;
		}

		const editor = await accessor.get(IEditorService).openEditor({
			resource: frame.source.uri,
			options: { revealIfOpened: true }
		});

		let codeEditor: ICodeEditor | undefined;
		if (editor) {
			const ctrl = editor?.getControl();
			if (isCodeEditor(ctrl)) {
				codeEditor = ctrl;
			}
		}

		interface ITargetItem extends IQuickPickItem {
			target: DebugProtocol.StepInTarget;
		}

		const qp = quickInputService.createQuickPick<ITargetItem>();
		qp.busy = true;
		qp.show();

		qp.onDidChangeActive(([item]) => {
			if (codeEditor && item && item.target.line !== undefined) {
				codeEditor.revealLineInCenterIfOutsideViewport(item.target.line);
				codeEditor.setSelection({
					startLineNumber: item.target.line,
					startColumn: item.target.column || 1,
					endLineNumber: item.target.endLine || item.target.line,
					endColumn: item.target.endColumn || item.target.column || 1,
				});
			}
		});

		qp.onDidAccept(() => {
			if (qp.activeItems.length) {
				session.stepIn(frame.thread.threadId, qp.activeItems[0].target.id);
			}
		});

		qp.onDidHide(() => qp.dispose());

		session.stepInTargets(frame.frameId).then(targets => {
			qp.busy = false;
			if (targets?.length) {
				qp.items = targets?.map(target => ({ target, label: target.label }));
			} else {
				qp.placeholder = nls.localize('editor.debug.action.stepIntoTargets.none', "No step targets available");
			}
		});
	}
});

async function stopHandler(accessor: ServicesAccessor, _: string, context: CallStackContext | unknown, disconnect: boolean, suspend?: boolean): Promise<void> {
	const debugService = accessor.get(IDebugService);
	let session: IDebugSession | undefined;
	if (isSessionContext(context)) {
		session = debugService.getModel().getSession(context.sessionId);
	} else {
		session = debugService.getViewModel().focusedSession;
	}

	const configurationService = accessor.get(IConfigurationService);
	const showSubSessions = configurationService.getValue<IDebugConfiguration>('debug').showSubSessionsInToolBar;
	// Stop should be sent to the root parent session
	while (!showSubSessions && session && session.lifecycleManagedByParent && session.parentSession) {
		session = session.parentSession;
	}

	await debugService.stopSession(session, disconnect, suspend);
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DISCONNECT_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.Shift | KeyCode.F5,
	when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_IN_DEBUG_MODE),
	handler: (accessor, _, context) => stopHandler(accessor, _, context, true)
});

CommandsRegistry.registerCommand({
	id: DISCONNECT_AND_SUSPEND_ID,
	handler: (accessor, _, context) => stopHandler(accessor, _, context, true, true)
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: STOP_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.Shift | KeyCode.F5,
	when: ContextKeyExpr.and(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_IN_DEBUG_MODE),
	handler: (accessor, _, context) => stopHandler(accessor, _, context, false)
});

CommandsRegistry.registerCommand({
	id: RESTART_FRAME_ID,
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		const debugService = accessor.get(IDebugService);
		const notificationService = accessor.get(INotificationService);
		const frame = getFrame(debugService, context);
		if (frame) {
			try {
				await frame.restart();
			} catch (e) {
				notificationService.error(e);
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: CONTINUE_ID,
	weight: KeybindingWeight.WorkbenchContrib + 10, // Use a stronger weight to get priority over start debugging F5 shortcut
	primary: KeyCode.F5,
	when: CONTEXT_DEBUG_STATE.isEqualTo('stopped'),
	handler: async (accessor: ServicesAccessor, _: string, context: CallStackContext | unknown) => {
		await getThreadAndRun(accessor, context, thread => thread.continue());
	}
});

CommandsRegistry.registerCommand({
	id: SHOW_LOADED_SCRIPTS_ID,
	handler: async (accessor) => {
		await showLoadedScriptMenu(accessor);
	}
});

CommandsRegistry.registerCommand({
	id: FOCUS_REPL_ID,
	handler: async (accessor) => {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(REPL_VIEW_ID, true);
	}
});

CommandsRegistry.registerCommand({
	id: 'debug.startFromConfig',
	handler: async (accessor, config: IConfig) => {
		const debugService = accessor.get(IDebugService);
		await debugService.startDebugging(undefined, config);
	}
});

CommandsRegistry.registerCommand({
	id: FOCUS_SESSION_ID,
	handler: async (accessor: ServicesAccessor, session: IDebugSession) => {
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);
		const stoppedChildSession = debugService.getModel().getSessions().find(s => s.parentSession === session && s.state === State.Stopped);
		if (stoppedChildSession && session.state !== State.Stopped) {
			session = stoppedChildSession;
		}
		await debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
		const stackFrame = debugService.getViewModel().focusedStackFrame;
		if (stackFrame) {
			await stackFrame.openInEditor(editorService, true);
		}
	}
});

CommandsRegistry.registerCommand({
	id: SELECT_AND_START_ID,
	handler: async (accessor: ServicesAccessor, debugType: string | unknown) => {
		const quickInputService = accessor.get(IQuickInputService);
		const debugService = accessor.get(IDebugService);

		if (debugType) {
			const configManager = debugService.getConfigurationManager();
			const dynamicProviders = await configManager.getDynamicProviders();
			for (const provider of dynamicProviders) {
				if (provider.type === debugType) {
					const pick = await provider.pick();
					if (pick) {
						await configManager.selectConfiguration(pick.launch, pick.config.name, pick.config, { type: provider.type });
						debugService.startDebugging(pick.launch, pick.config, { startedByUser: true });

						return;
					}
				}
			}
		}

		quickInputService.quickAccess.show(DEBUG_QUICK_ACCESS_PREFIX);
	}
});

CommandsRegistry.registerCommand({
	id: SELECT_DEBUG_CONSOLE_ID,
	handler: async (accessor: ServicesAccessor) => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.quickAccess.show(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX);
	}
});

CommandsRegistry.registerCommand({
	id: SELECT_DEBUG_SESSION_ID,
	handler: async (accessor: ServicesAccessor) => {
		showDebugSessionMenu(accessor, SELECT_AND_START_ID);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DEBUG_START_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.F5,
	when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.isEqualTo('inactive')),
	handler: async (accessor: ServicesAccessor, debugStartOptions?: { config?: Partial<IConfig>; noDebug?: boolean }) => {
		const debugService = accessor.get(IDebugService);
		await saveAllBeforeDebugStart(accessor.get(IConfigurationService), accessor.get(IEditorService));
		const { launch, name, getConfig } = debugService.getConfigurationManager().selectedConfiguration;
		const config = await getConfig();
		const configOrName = config ? Object.assign(deepClone(config), debugStartOptions?.config) : name;
		await debugService.startDebugging(launch, configOrName, { noDebug: debugStartOptions?.noDebug, startedByUser: true }, false);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DEBUG_RUN_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.F5,
	mac: { primary: KeyMod.WinCtrl | KeyCode.F5 },
	when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))),
	handler: async (accessor: ServicesAccessor) => {
		const commandService = accessor.get(ICommandService);
		await commandService.executeCommand(DEBUG_START_COMMAND_ID, { noDebug: true });
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.toggleBreakpoint',
	weight: KeybindingWeight.WorkbenchContrib + 5,
	when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, InputFocusedContext.toNegated()),
	primary: KeyCode.Space,
	handler: (accessor) => {
		const listService = accessor.get(IListService);
		const debugService = accessor.get(IDebugService);
		const list = listService.lastFocusedList;
		if (list instanceof List) {
			const focused = <IEnablement[]>list.getFocusedElements();
			if (focused && focused.length) {
				debugService.enableOrDisableBreakpoints(!focused[0].enabled, focused[0]);
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.enableOrDisableBreakpoint',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: undefined,
	when: EditorContextKeys.editorTextFocus,
	handler: (accessor) => {
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);
		const control = editorService.activeTextEditorControl;
		if (isCodeEditor(control)) {
			const model = control.getModel();
			if (model) {
				const position = control.getPosition();
				if (position) {
					const bps = debugService.getModel().getBreakpoints({ uri: model.uri, lineNumber: position.lineNumber });
					if (bps.length) {
						debugService.enableOrDisableBreakpoints(!bps[0].enabled, bps[0]);
					}
				}
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: EDIT_EXPRESSION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib + 5,
	when: CONTEXT_WATCH_EXPRESSIONS_FOCUSED,
	primary: KeyCode.F2,
	mac: { primary: KeyCode.Enter },
	handler: (accessor: ServicesAccessor, expression: Expression | unknown) => {
		const debugService = accessor.get(IDebugService);
		if (!(expression instanceof Expression)) {
			const listService = accessor.get(IListService);
			const focused = listService.lastFocusedList;
			if (focused) {
				const elements = focused.getFocus();
				if (Array.isArray(elements) && elements[0] instanceof Expression) {
					expression = elements[0];
				}
			}
		}

		if (expression instanceof Expression) {
			debugService.getViewModel().setSelectedExpression(expression, false);
		}
	}
});

CommandsRegistry.registerCommand({
	id: SET_EXPRESSION_COMMAND_ID,
	handler: async (accessor: ServicesAccessor, expression: Expression | unknown) => {
		const debugService = accessor.get(IDebugService);
		if (expression instanceof Expression || expression instanceof Variable) {
			debugService.getViewModel().setSelectedExpression(expression, true);
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.setVariable',
	weight: KeybindingWeight.WorkbenchContrib + 5,
	when: CONTEXT_VARIABLES_FOCUSED,
	primary: KeyCode.F2,
	mac: { primary: KeyCode.Enter },
	handler: (accessor) => {
		const listService = accessor.get(IListService);
		const debugService = accessor.get(IDebugService);
		const focused = listService.lastFocusedList;

		if (focused) {
			const elements = focused.getFocus();
			if (Array.isArray(elements) && elements[0] instanceof Variable) {
				debugService.getViewModel().setSelectedExpression(elements[0], false);
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REMOVE_EXPRESSION_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_WATCH_EXPRESSIONS_FOCUSED, CONTEXT_EXPRESSION_SELECTED.toNegated()),
	primary: KeyCode.Delete,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
	handler: (accessor: ServicesAccessor, expression: Expression | unknown) => {
		const debugService = accessor.get(IDebugService);

		if (expression instanceof Expression) {
			debugService.removeWatchExpressions(expression.getId());
			return;
		}

		const listService = accessor.get(IListService);
		const focused = listService.lastFocusedList;
		if (focused) {
			let elements = focused.getFocus();
			if (Array.isArray(elements) && elements[0] instanceof Expression) {
				const selection = focused.getSelection();
				if (selection && selection.indexOf(elements[0]) >= 0) {
					elements = selection;
				}
				elements.forEach((e: Expression) => debugService.removeWatchExpressions(e.getId()));
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.removeBreakpoint',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(CONTEXT_BREAKPOINTS_FOCUSED, CONTEXT_BREAKPOINT_INPUT_FOCUSED.toNegated()),
	primary: KeyCode.Delete,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace },
	handler: (accessor) => {
		const listService = accessor.get(IListService);
		const debugService = accessor.get(IDebugService);
		const list = listService.lastFocusedList;

		if (list instanceof List) {
			const focused = list.getFocusedElements();
			const element = focused.length ? focused[0] : undefined;
			if (element instanceof Breakpoint) {
				debugService.removeBreakpoints(element.getId());
			} else if (element instanceof FunctionBreakpoint) {
				debugService.removeFunctionBreakpoints(element.getId());
			} else if (element instanceof DataBreakpoint) {
				debugService.removeDataBreakpoints(element.getId());
			}
		}
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.installAdditionalDebuggers',
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: undefined,
	handler: async (accessor, query: string) => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		const viewlet = (await paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true))?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		let searchFor = `@category:debuggers`;
		if (typeof query === 'string') {
			searchFor += ` ${query}`;
		}
		viewlet.search(searchFor);
		viewlet.focus();
	}
});

registerAction2(class AddConfigurationAction extends Action2 {
	constructor() {
		super({
			id: ADD_CONFIGURATION_ID,
			title: nls.localize2('addConfiguration', "Add Configuration..."),
			category: DEBUG_COMMAND_CATEGORY,
			f1: true,
			menu: {
				id: MenuId.EditorContent,
				when: ContextKeyExpr.and(
					ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]launch\.json$/),
					ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID))
			}
		});
	}

	async run(accessor: ServicesAccessor, launchUri: string): Promise<void> {
		const manager = accessor.get(IDebugService).getConfigurationManager();

		const launch = manager.getLaunches().find(l => l.uri.toString() === launchUri) || manager.selectedConfiguration.launch;
		if (launch) {
			const { editor, created } = await launch.openConfigFile({ preserveFocus: false });
			if (editor && !created) {
				const codeEditor = <ICodeEditor>editor.getControl();
				if (codeEditor) {
					await codeEditor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID)?.addLaunchConfiguration();
				}
			}
		}
	}
});

const inlineBreakpointHandler = (accessor: ServicesAccessor) => {
	const debugService = accessor.get(IDebugService);
	const editorService = accessor.get(IEditorService);
	const control = editorService.activeTextEditorControl;
	if (isCodeEditor(control)) {
		const position = control.getPosition();
		if (position && control.hasModel() && debugService.canSetBreakpointsIn(control.getModel())) {
			const modelUri = control.getModel().uri;
			const breakpointAlreadySet = debugService.getModel().getBreakpoints({ lineNumber: position.lineNumber, uri: modelUri })
				.some(bp => (bp.sessionAgnosticData.column === position.column || (!bp.column && position.column <= 1)));

			if (!breakpointAlreadySet) {
				debugService.addBreakpoints(modelUri, [{ lineNumber: position.lineNumber, column: position.column > 1 ? position.column : undefined }]);
			}
		}
	}
};

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.Shift | KeyCode.F9,
	when: EditorContextKeys.editorTextFocus,
	id: TOGGLE_INLINE_BREAKPOINT_ID,
	handler: inlineBreakpointHandler
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: TOGGLE_INLINE_BREAKPOINT_ID,
		title: nls.localize('addInlineBreakpoint', "Add Inline Breakpoint"),
		category: DEBUG_COMMAND_CATEGORY
	},
	when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), EditorContextKeys.editorTextFocus),
	group: 'debug',
	order: 1
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.openBreakpointToSide',
	weight: KeybindingWeight.WorkbenchContrib,
	when: CONTEXT_BREAKPOINTS_FOCUSED,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	secondary: [KeyMod.Alt | KeyCode.Enter],
	handler: (accessor) => {
		const listService = accessor.get(IListService);
		const list = listService.lastFocusedList;
		if (list instanceof List) {
			const focus = list.getFocusedElements();
			if (focus.length && focus[0] instanceof Breakpoint) {
				return openBreakpointSource(focus[0], true, false, true, accessor.get(IDebugService), accessor.get(IEditorService));
			}
		}

		return undefined;
	}
});

// When there are no debug extensions, open the debug viewlet when F5 is pressed so the user can read the limitations
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'debug.openView',
	weight: KeybindingWeight.WorkbenchContrib,
	when: CONTEXT_DEBUGGERS_AVAILABLE.toNegated(),
	primary: KeyCode.F5,
	secondary: [KeyMod.CtrlCmd | KeyCode.F5],
	handler: async (accessor) => {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		await paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
	}
});
