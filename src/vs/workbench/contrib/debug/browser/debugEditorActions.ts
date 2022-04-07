/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, EditorAction, IActionOptions, EditorAction2 } from 'vs/editor/browser/editorExtensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IDebugService, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE, IDebugEditorContribution, EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, BREAKPOINT_EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution, REPL_VIEW_ID, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, WATCH_VIEW_ID, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_EXCEPTION_WIDGET_VISIBLE, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_CALLSTACK_ITEM_TYPE, IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { openBreakpointSource } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { PanelFocusContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { registerAction2, MenuId, Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { DisassemblyViewInput } from 'vs/workbench/contrib/debug/common/disassemblyViewInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class ToggleBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.toggleBreakpoint',
			label: nls.localize('toggleBreakpointAction', "Debug: Toggle Breakpoint"),
			alias: 'Debug: Toggle Breakpoint',
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F9,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				when: CONTEXT_DEBUGGERS_AVAILABLE,
				title: nls.localize({ key: 'miToggleBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle &&Breakpoint"),
				menuId: MenuId.MenubarDebugMenu,
				group: '4_new_breakpoint',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		// TODO: add disassembly F9
		if (editor.hasModel()) {
			const debugService = accessor.get(IDebugService);
			const modelUri = editor.getModel().uri;
			const canSet = debugService.canSetBreakpointsIn(editor.getModel());
			// Does not account for multi line selections, Set to remove multiple cursor on the same line
			const lineNumbers = [...new Set(editor.getSelections().map(s => s.getPosition().lineNumber))];

			await Promise.all(lineNumbers.map(async line => {
				const bps = debugService.getModel().getBreakpoints({ lineNumber: line, uri: modelUri });
				if (bps.length) {
					await Promise.all(bps.map(bp => debugService.removeBreakpoints(bp.getId())));
				} else if (canSet) {
					await debugService.addBreakpoints(modelUri, [{ lineNumber: line }]);
				}
			}));
		}
	}
}

class ConditionalBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.conditionalBreakpoint',
			label: nls.localize('conditionalBreakpointEditorAction', "Debug: Add Conditional Breakpoint..."),
			alias: 'Debug: Add Conditional Breakpoint...',
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			menuOpts: {
				menuId: MenuId.MenubarNewBreakpointMenu,
				title: nls.localize({ key: 'miConditionalBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Conditional Breakpoint..."),
				group: '1_breakpoints',
				order: 1,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
			editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, undefined, BreakpointWidgetContext.CONDITION);
		}
	}
}

class LogPointAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.addLogPoint',
			label: nls.localize('logPointEditorAction', "Debug: Add Logpoint..."),
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			alias: 'Debug: Add Logpoint...',
			menuOpts: [
				{
					menuId: MenuId.MenubarNewBreakpointMenu,
					title: nls.localize({ key: 'miLogPoint', comment: ['&& denotes a mnemonic'] }, "&&Logpoint..."),
					group: '1_breakpoints',
					order: 4,
					when: CONTEXT_DEBUGGERS_AVAILABLE,
				}
			]
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		if (position && editor.hasModel() && debugService.canSetBreakpointsIn(editor.getModel())) {
			editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.LOG_MESSAGE);
		}
	}
}

class OpenDisassemblyViewAction extends EditorAction2 {

	public static readonly ID = 'editor.debug.action.openDisassemblyView';

	constructor() {
		super({
			id: OpenDisassemblyViewAction.ID,
			title: {
				value: nls.localize('openDisassemblyView', "Open Disassembly View"),
				original: 'Open Disassembly View',
				mnemonicTitle: nls.localize({ key: 'miDisassemblyView', comment: ['&& denotes a mnemonic'] }, "&&DisassemblyView")
			},
			precondition: CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE,
			menu: [
				{
					id: MenuId.EditorContext,
					group: 'debug',
					order: 5,
					when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEqualTo('stopped'), EditorContextKeys.editorTextFocus, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST)
				},
				{
					id: MenuId.DebugCallStackContext,
					group: 'z_commands',
					order: 50,
					when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('stackFrame'), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
				},
				{
					id: MenuId.CommandPalette,
					when: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED)
				}
			]
		});
	}

	runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]): void {
		if (editor.hasModel()) {
			const editorService = accessor.get(IEditorService);
			editorService.openEditor(DisassemblyViewInput.instance, { pinned: true });
		}
	}
}

class ToggleDisassemblyViewSourceCodeAction extends Action2 {

	public static readonly ID = 'debug.action.toggleDisassemblyViewSourceCode';
	public static readonly configID: string = 'debug.disassemblyView.showSourceCode';

	constructor() {
		super({
			id: ToggleDisassemblyViewSourceCodeAction.ID,
			title: {
				value: nls.localize('toggleDisassemblyViewSourceCode', "Toggle Source Code in Disassembly View"),
				original: 'Toggle Source Code in Disassembly View',
				mnemonicTitle: nls.localize({ key: 'mitogglesource', comment: ['&& denotes a mnemonic'] }, "&&ToggleSource")
			},
			f1: true,
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor, ...args: any[]): void {
		const configService = accessor.get(IConfigurationService);
		if (configService) {
			const value = configService.getValue<IDebugConfiguration>('debug').disassemblyView.showSourceCode;
			configService.updateValue(ToggleDisassemblyViewSourceCodeAction.configID, !value);
		}
	}
}

export class RunToCursorAction extends EditorAction {

	public static readonly ID = 'editor.debug.action.runToCursor';
	public static readonly LABEL = nls.localize('runToCursor', "Run to Cursor");

	constructor() {
		super({
			id: RunToCursorAction.ID,
			label: RunToCursorAction.LABEL,
			alias: 'Debug: Run to Cursor',
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEqualTo('stopped'), EditorContextKeys.editorTextFocus),
			contextMenuOpts: {
				group: 'debug',
				order: 2
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const position = editor.getPosition();
		if (!(editor.hasModel() && position)) {
			return;
		}
		const uri = editor.getModel().uri;

		const debugService = accessor.get(IDebugService);
		const viewModel = debugService.getViewModel();
		const uriIdentityService = accessor.get(IUriIdentityService);

		let column: number | undefined = undefined;
		const focusedStackFrame = viewModel.focusedStackFrame;
		if (focusedStackFrame && uriIdentityService.extUri.isEqual(focusedStackFrame.source.uri, uri) && focusedStackFrame.range.startLineNumber === position.lineNumber) {
			// If the cursor is on a line different than the one the debugger is currently paused on, then send the breakpoint on the line without a column
			// otherwise set it at the precise column #102199
			column = position.column;
		}

		await debugService.runTo(uri, position.lineNumber, column);
	}
}

export class SelectionToReplAction extends EditorAction {

	public static readonly ID = 'editor.debug.action.selectionToRepl';
	public static readonly LABEL = nls.localize('evaluateInDebugConsole', "Evaluate in Debug Console");

	constructor() {
		super({
			id: SelectionToReplAction.ID,
			label: SelectionToReplAction.LABEL,
			alias: 'Debug: Evaluate in Console',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
			contextMenuOpts: {
				group: 'debug',
				order: 0
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const viewsService = accessor.get(IViewsService);
		const viewModel = debugService.getViewModel();
		const session = viewModel.focusedSession;
		if (!editor.hasModel() || !session) {
			return;
		}

		const text = editor.getModel().getValueInRange(editor.getSelection());
		await session.addReplExpression(viewModel.focusedStackFrame!, text);
		await viewsService.openView(REPL_VIEW_ID, false);
	}
}

export class SelectionToWatchExpressionsAction extends EditorAction {

	public static readonly ID = 'editor.debug.action.selectionToWatch';
	public static readonly LABEL = nls.localize('addToWatch', "Add to Watch");

	constructor() {
		super({
			id: SelectionToWatchExpressionsAction.ID,
			label: SelectionToWatchExpressionsAction.LABEL,
			alias: 'Debug: Add to Watch',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
			contextMenuOpts: {
				group: 'debug',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const viewsService = accessor.get(IViewsService);
		if (!editor.hasModel()) {
			return;
		}

		const text = editor.getModel().getValueInRange(editor.getSelection());
		await viewsService.openView(WATCH_VIEW_ID);
		debugService.addWatchExpression(text);
	}
}

class ShowDebugHoverAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.showDebugHover',
			label: nls.localize('showDebugHover', "Debug: Show Hover"),
			alias: 'Debug: Show Hover',
			precondition: CONTEXT_IN_DEBUG_MODE,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const position = editor.getPosition();
		if (!position || !editor.hasModel()) {
			return;
		}
		const word = editor.getModel().getWordAtPosition(position);
		if (!word) {
			return;
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, word.endColumn);
		return editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID)?.showHover(range, true);
	}
}

class StepIntoTargetsAction extends EditorAction {

	public static readonly ID = 'editor.debug.action.stepIntoTargets';
	public static readonly LABEL = nls.localize({ key: 'stepIntoTargets', comment: ['Step Into Targets lets the user step into an exact function he or she is interested in.'] }, "Step Into Targets...");

	constructor() {
		super({
			id: StepIntoTargetsAction.ID,
			label: StepIntoTargetsAction.LABEL,
			alias: 'Debug: Step Into Targets...',
			precondition: ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), EditorContextKeys.editorTextFocus),
			contextMenuOpts: {
				group: 'debug',
				order: 1.5
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const contextMenuService = accessor.get(IContextMenuService);
		const uriIdentityService = accessor.get(IUriIdentityService);
		const session = debugService.getViewModel().focusedSession;
		const frame = debugService.getViewModel().focusedStackFrame;

		if (session && frame && editor.hasModel() && uriIdentityService.extUri.isEqual(editor.getModel().uri, frame.source.uri)) {
			const targets = await session.stepInTargets(frame.frameId);
			if (!targets) {
				return;
			}

			editor.revealLineInCenterIfOutsideViewport(frame.range.startLineNumber);
			const cursorCoords = editor.getScrolledVisiblePosition({ lineNumber: frame.range.startLineNumber, column: frame.range.startColumn });
			const editorCoords = getDomNodePagePosition(editor.getDomNode());
			const x = editorCoords.left + cursorCoords.left;
			const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

			contextMenuService.showContextMenu({
				getAnchor: () => ({ x, y }),
				getActions: () => {
					return targets.map(t => new Action(`stepIntoTarget:${t.id}`, t.label, undefined, true, () => session.stepIn(frame.thread.threadId, t.id)));
				}
			});
		}
	}
}

class GoToBreakpointAction extends EditorAction {
	constructor(private isNext: boolean, opts: IActionOptions) {
		super(opts);
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<any> {
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);
		const uriIdentityService = accessor.get(IUriIdentityService);

		if (editor.hasModel()) {
			const currentUri = editor.getModel().uri;
			const currentLine = editor.getPosition().lineNumber;
			//Breakpoints returned from `getBreakpoints` are already sorted.
			const allEnabledBreakpoints = debugService.getModel().getBreakpoints({ enabledOnly: true });

			//Try to find breakpoint in current file
			let moveBreakpoint =
				this.isNext
					? allEnabledBreakpoints.filter(bp => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber > currentLine).shift()
					: allEnabledBreakpoints.filter(bp => uriIdentityService.extUri.isEqual(bp.uri, currentUri) && bp.lineNumber < currentLine).pop();

			//Try to find breakpoints in following files
			if (!moveBreakpoint) {
				moveBreakpoint =
					this.isNext
						? allEnabledBreakpoints.filter(bp => bp.uri.toString() > currentUri.toString()).shift()
						: allEnabledBreakpoints.filter(bp => bp.uri.toString() < currentUri.toString()).pop();
			}

			//Move to first or last possible breakpoint
			if (!moveBreakpoint && allEnabledBreakpoints.length) {
				moveBreakpoint = this.isNext ? allEnabledBreakpoints[0] : allEnabledBreakpoints[allEnabledBreakpoints.length - 1];
			}

			if (moveBreakpoint) {
				return openBreakpointSource(moveBreakpoint, false, true, false, debugService, editorService);
			}
		}
	}
}

class GoToNextBreakpointAction extends GoToBreakpointAction {
	constructor() {
		super(true, {
			id: 'editor.debug.action.goToNextBreakpoint',
			label: nls.localize('goToNextBreakpoint', "Debug: Go to Next Breakpoint"),
			alias: 'Debug: Go to Next Breakpoint',
			precondition: CONTEXT_DEBUGGERS_AVAILABLE
		});
	}
}

class GoToPreviousBreakpointAction extends GoToBreakpointAction {
	constructor() {
		super(false, {
			id: 'editor.debug.action.goToPreviousBreakpoint',
			label: nls.localize('goToPreviousBreakpoint', "Debug: Go to Previous Breakpoint"),
			alias: 'Debug: Go to Previous Breakpoint',
			precondition: CONTEXT_DEBUGGERS_AVAILABLE
		});
	}
}

class CloseExceptionWidgetAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.closeExceptionWidget',
			label: nls.localize('closeExceptionWidget', "Close Exception Widget"),
			alias: 'Close Exception Widget',
			precondition: CONTEXT_EXCEPTION_WIDGET_VISIBLE,
			kbOpts: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const contribution = editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID);
		contribution?.closeExceptionWidget();
	}
}

registerAction2(OpenDisassemblyViewAction);
registerAction2(ToggleDisassemblyViewSourceCodeAction);
registerEditorAction(ToggleBreakpointAction);
registerEditorAction(ConditionalBreakpointAction);
registerEditorAction(LogPointAction);
registerEditorAction(RunToCursorAction);
registerEditorAction(StepIntoTargetsAction);
registerEditorAction(SelectionToReplAction);
registerEditorAction(SelectionToWatchExpressionsAction);
registerEditorAction(ShowDebugHoverAction);
registerEditorAction(GoToNextBreakpointAction);
registerEditorAction(GoToPreviousBreakpointAction);
registerEditorAction(CloseExceptionWidgetAction);
