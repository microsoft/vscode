/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ServicesAccessor, registerEditorAction, EditorAction, IActionOptions } from 'vs/editor/browser/editorExtensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IDebugService, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE, State, REPL_ID, VIEWLET_ID, IDebugEditorContribution, EDITOR_CONTRIBUTION_ID, BreakpointWidgetContext, IBreakpoint } from 'vs/workbench/contrib/debug/common/debug';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { openBreakpointSource } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { PanelFocusContext } from 'vs/workbench/common/panel';

export const TOGGLE_BREAKPOINT_ID = 'editor.debug.action.toggleBreakpoint';
class ToggleBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: TOGGLE_BREAKPOINT_ID,
			label: nls.localize('toggleBreakpointAction', "Debug: Toggle Breakpoint"),
			alias: 'Debug: Toggle Breakpoint',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyCode.F9,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<any> {
		if (editor.hasModel()) {
			const debugService = accessor.get(IDebugService);
			const modelUri = editor.getModel().uri;
			const canSet = debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel());
			// Does not account for multi line selections, Set to remove multiple cursor on the same line
			const lineNumbers = [...new Set(editor.getSelections().map(s => s.getPosition().lineNumber))];

			return Promise.all(lineNumbers.map(line => {
				const bps = debugService.getModel().getBreakpoints({ lineNumber: line, uri: modelUri });
				if (bps.length) {
					return Promise.all(bps.map(bp => debugService.removeBreakpoints(bp.getId())));
				} else if (canSet) {
					return (debugService.addBreakpoints(modelUri, [{ lineNumber: line }], 'debugEditorActions.toggleBreakpointAction'));
				} else {
					return Promise.resolve([]);
				}
			}));
		}

		return Promise.resolve();
	}
}

export const TOGGLE_CONDITIONAL_BREAKPOINT_ID = 'editor.debug.action.conditionalBreakpoint';
class ConditionalBreakpointAction extends EditorAction {

	constructor() {
		super({
			id: TOGGLE_CONDITIONAL_BREAKPOINT_ID,
			label: nls.localize('conditionalBreakpointEditorAction', "Debug: Add Conditional Breakpoint..."),
			alias: 'Debug: Add Conditional Breakpoint...',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		if (position && editor.hasModel() && debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel())) {
			editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(position.lineNumber, position.column);
		}
	}
}

export const TOGGLE_LOG_POINT_ID = 'editor.debug.action.toggleLogPoint';
class LogPointAction extends EditorAction {

	constructor() {
		super({
			id: TOGGLE_LOG_POINT_ID,
			label: nls.localize('logPointEditorAction', "Debug: Add Logpoint..."),
			alias: 'Debug: Add Logpoint...',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		if (position && editor.hasModel() && debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel())) {
			editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(position.lineNumber, position.column, BreakpointWidgetContext.LOG_MESSAGE);
		}
	}
}

export class RunToCursorAction extends EditorAction {

	public static ID = 'editor.debug.action.runToCursor';
	public static LABEL = nls.localize('runToCursor', "Run to Cursor");

	constructor() {
		super({
			id: RunToCursorAction.ID,
			label: RunToCursorAction.LABEL,
			alias: 'Debug: Run to Cursor',
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, PanelFocusContext.toNegated(), CONTEXT_DEBUG_STATE.isEqualTo('stopped'), EditorContextKeys.editorTextFocus),
			menuOpts: {
				group: 'debug',
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const focusedSession = debugService.getViewModel().focusedSession;
		if (debugService.state !== State.Stopped || !focusedSession) {
			return Promise.resolve(undefined);
		}

		let breakpointToRemove: IBreakpoint;
		const oneTimeListener = focusedSession.onDidChangeState(() => {
			const state = focusedSession.state;
			if (state === State.Stopped || state === State.Inactive) {
				if (breakpointToRemove) {
					debugService.removeBreakpoints(breakpointToRemove.getId());
				}
				oneTimeListener.dispose();
			}
		});

		const position = editor.getPosition();
		if (!editor.hasModel() || !position) {
			return Promise.resolve();
		}

		const uri = editor.getModel().uri;
		const bpExists = !!(debugService.getModel().getBreakpoints({ column: position.column, lineNumber: position.lineNumber, uri }).length);
		return (bpExists ? Promise.resolve(null) : <Promise<any>>debugService.addBreakpoints(uri, [{ lineNumber: position.lineNumber, column: position.column }], 'debugEditorActions.runToCursorAction')).then((breakpoints) => {
			if (breakpoints && breakpoints.length) {
				breakpointToRemove = breakpoints[0];
			}
			debugService.getViewModel().focusedThread!.continue();
		});
	}
}

class SelectionToReplAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.selectionToRepl',
			label: nls.localize('debugEvaluate', "Debug: Evaluate"),
			alias: 'Debug: Evaluate',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
			menuOpts: {
				group: 'debug',
				order: 0
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const panelService = accessor.get(IPanelService);
		const viewModel = debugService.getViewModel();
		const session = viewModel.focusedSession;
		if (!editor.hasModel() || !session) {
			return Promise.resolve();
		}

		const text = editor.getModel().getValueInRange(editor.getSelection());
		return session.addReplExpression(viewModel.focusedStackFrame!, text)
			.then(() => panelService.openPanel(REPL_ID, true))
			.then(_ => undefined);
	}
}

class SelectionToWatchExpressionsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.selectionToWatch',
			label: nls.localize('debugAddToWatch', "Debug: Add to Watch"),
			alias: 'Debug: Add to Watch',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, EditorContextKeys.editorTextFocus),
			menuOpts: {
				group: 'debug',
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const viewletService = accessor.get(IViewletService);
		if (!editor.hasModel()) {
			return Promise.resolve();
		}

		const text = editor.getModel().getValueInRange(editor.getSelection());
		return viewletService.openViewlet(VIEWLET_ID).then(() => debugService.addWatchExpression(text));
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
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const position = editor.getPosition();
		if (!position || !editor.hasModel()) {
			return Promise.resolve();
		}
		const word = editor.getModel().getWordAtPosition(position);
		if (!word) {
			return Promise.resolve();
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, word.endColumn);
		return editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showHover(range, true);
	}
}

class GoToBreakpointAction extends EditorAction {
	constructor(private isNext: boolean, opts: IActionOptions) {
		super(opts);
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<any> {
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);
		if (editor.hasModel()) {
			const currentUri = editor.getModel().uri;
			const currentLine = editor.getPosition().lineNumber;
			//Breakpoints returned from `getBreakpoints` are already sorted.
			const allEnabledBreakpoints = debugService.getModel().getBreakpoints({ enabledOnly: true });

			//Try to find breakpoint in current file
			let moveBreakpoint =
				this.isNext
					? allEnabledBreakpoints.filter(bp => bp.uri.toString() === currentUri.toString() && bp.lineNumber > currentLine).shift()
					: allEnabledBreakpoints.filter(bp => bp.uri.toString() === currentUri.toString() && bp.lineNumber < currentLine).pop();

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
				return openBreakpointSource(moveBreakpoint, false, true, debugService, editorService);
			}
		}

		return Promise.resolve(null);
	}
}

class GoToNextBreakpointAction extends GoToBreakpointAction {
	constructor() {
		super(true, {
			id: 'editor.debug.action.goToNextBreakpoint',
			label: nls.localize('goToNextBreakpoint', "Debug: Go To Next Breakpoint"),
			alias: 'Debug: Go To Next Breakpoint',
			precondition: undefined
		});
	}
}

class GoToPreviousBreakpointAction extends GoToBreakpointAction {
	constructor() {
		super(false, {
			id: 'editor.debug.action.goToPreviousBreakpoint',
			label: nls.localize('goToPreviousBreakpoint', "Debug: Go To Previous Breakpoint"),
			alias: 'Debug: Go To Previous Breakpoint',
			precondition: undefined
		});
	}
}

registerEditorAction(ToggleBreakpointAction);
registerEditorAction(ConditionalBreakpointAction);
registerEditorAction(LogPointAction);
registerEditorAction(RunToCursorAction);
registerEditorAction(SelectionToReplAction);
registerEditorAction(SelectionToWatchExpressionsAction);
registerEditorAction(ShowDebugHoverAction);
registerEditorAction(GoToNextBreakpointAction);
registerEditorAction(GoToPreviousBreakpointAction);
