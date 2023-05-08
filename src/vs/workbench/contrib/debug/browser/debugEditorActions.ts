/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { Action } from 'vs/base/common/actions';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorAction2, IActionOptions, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import * as nls from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { PanelFocusContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { openBreakpointSource } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { BreakpointWidgetContext, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE, CONTEXT_DISASSEMBLE_REQUEST_SUPPORTED, CONTEXT_EXCEPTION_WIDGET_VISIBLE, CONTEXT_FOCUSED_STACK_FRAME_HAS_INSTRUCTION_POINTER_REFERENCE, CONTEXT_IN_DEBUG_MODE, CONTEXT_LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution, IDebugConfiguration, IDebugEditorContribution, IDebugService, REPL_VIEW_ID, WATCH_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';
import { getEvaluatableExpressionAtPosition } from 'vs/workbench/contrib/debug/common/debugUtils';
import { DisassemblyViewInput } from 'vs/workbench/contrib/debug/common/disassemblyViewInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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

class EditBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.editBreakpoint',
			label: nls.localize('EditBreakpointEditorAction', "Debug: Edit Breakpoint"),
			alias: 'Debug: Edit Existing Breakpoint',
			precondition: CONTEXT_DEBUGGERS_AVAILABLE,
			menuOpts: {
				menuId: MenuId.MenubarNewBreakpointMenu,
				title: nls.localize({ key: 'miEditBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&Edit Breakpoint"),
				group: '1_breakpoints',
				order: 1,
				when: CONTEXT_DEBUGGERS_AVAILABLE
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		const debugModel = debugService.getModel();
		if (!(editor.hasModel() && position)) {
			return;
		}

		const lineBreakpoints = debugModel.getBreakpoints({ lineNumber: position.lineNumber });
		if (lineBreakpoints.length === 0) {
			return;
		}

		const breakpointDistances = lineBreakpoints.map(b => {
			if (!b.column) {
				return position.column;
			}

			return Math.abs(b.column - position.column);
		});
		const closestBreakpointIndex = breakpointDistances.indexOf(Math.min(...breakpointDistances));
		const closestBreakpoint = lineBreakpoints[closestBreakpointIndex];

		editor.getContribution<IBreakpointEditorContribution>(BREAKPOINT_EDITOR_CONTRIBUTION_ID)?.showBreakpointWidget(closestBreakpoint.lineNumber, closestBreakpoint.column);
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
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
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

		const selection = editor.getSelection();
		let text: string;
		if (selection.isEmpty()) {
			text = editor.getModel().getLineContent(selection.selectionStartLineNumber).trim();
		} else {
			text = editor.getModel().getValueInRange(selection);
		}

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
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
			contextMenuOpts: {
				group: 'debug',
				order: 1
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const viewsService = accessor.get(IViewsService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		if (!editor.hasModel()) {
			return;
		}

		let expression: string | undefined = undefined;

		const model = editor.getModel();
		const selection = editor.getSelection();

		if (!selection.isEmpty()) {
			expression = model.getValueInRange(selection);
		} else {
			const position = editor.getPosition();
			const evaluatableExpression = await getEvaluatableExpressionAtPosition(languageFeaturesService, model, position);
			if (!evaluatableExpression) {
				return;
			}
			expression = evaluatableExpression.matchingExpression;
		}

		if (!expression) {
			return;
		}

		await viewsService.openView(WATCH_VIEW_ID);
		debugService.addWatchExpression(expression);
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

		return editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID)?.showHover(position, true);
	}
}

const NO_TARGETS_MESSAGE = nls.localize('editor.debug.action.stepIntoTargets.notAvailable', "Step targets are not available here");

class StepIntoTargetsAction extends EditorAction {

	public static readonly ID = 'editor.debug.action.stepIntoTargets';
	public static readonly LABEL = nls.localize({ key: 'stepIntoTargets', comment: ['Step Into Targets lets the user step into an exact function he or she is interested in.'] }, "Step Into Target");

	constructor() {
		super({
			id: StepIntoTargetsAction.ID,
			label: StepIntoTargetsAction.LABEL,
			alias: 'Debug: Step Into Target',
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
		const selection = editor.getSelection();

		const targetPosition = selection?.getPosition() || (frame && { lineNumber: frame.range.startLineNumber, column: frame.range.startColumn });

		if (!session || !frame || !editor.hasModel() || !uriIdentityService.extUri.isEqual(editor.getModel().uri, frame.source.uri)) {
			if (targetPosition) {
				MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition);
			}
			return;
		}


		const targets = await session.stepInTargets(frame.frameId);
		if (!targets?.length) {
			MessageController.get(editor)?.showMessage(NO_TARGETS_MESSAGE, targetPosition!);
			return;
		}

		// If there is a selection, try to find the best target with a position to step into.
		if (selection) {
			const positionalTargets: { start: Position; end?: Position; target: DebugProtocol.StepInTarget }[] = [];
			for (const target of targets) {
				if (target.line) {
					positionalTargets.push({
						start: new Position(target.line, target.column || 1),
						end: target.endLine ? new Position(target.endLine, target.endColumn || 1) : undefined,
						target
					});
				}
			}

			positionalTargets.sort((a, b) => b.start.lineNumber - a.start.lineNumber || b.start.column - a.start.column);

			const needle = selection.getPosition();

			// Try to find a target with a start and end that is around the cursor
			// position. Or, if none, whatever is before the cursor.
			const best = positionalTargets.find(t => t.end && needle.isBefore(t.end) && t.start.isBeforeOrEqual(needle)) || positionalTargets.find(t => t.end === undefined && t.start.isBeforeOrEqual(needle));
			if (best) {
				session.stepIn(frame.thread.threadId, best.target.id);
				return;
			}
		}

		// Otherwise, show a context menu and have the user pick a target
		editor.revealLineInCenterIfOutsideViewport(frame.range.startLineNumber);
		const cursorCoords = editor.getScrolledVisiblePosition(targetPosition!);
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
registerEditorAction(EditBreakpointAction);
registerEditorAction(RunToCursorAction);
registerEditorAction(StepIntoTargetsAction);
registerEditorAction(SelectionToReplAction);
registerEditorAction(SelectionToWatchExpressionsAction);
registerEditorAction(ShowDebugHoverAction);
registerEditorAction(GoToNextBreakpointAction);
registerEditorAction(GoToPreviousBreakpointAction);
registerEditorAction(CloseExceptionWidgetAction);
