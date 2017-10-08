/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { Range } from 'vs/editor/common/core/range';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ServicesAccessor, editorAction, EditorAction, CommonEditorRegistry, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IDebugService, CONTEXT_IN_DEBUG_MODE, CONTEXT_NOT_IN_DEBUG_REPL, CONTEXT_DEBUG_STATE, State, REPL_ID, VIEWLET_ID, IDebugEditorContribution, EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE } from 'vs/workbench/parts/debug/common/debug';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorService } from 'vs/platform/editor/common/editor';

@editorAction
class ToggleBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.toggleBreakpoint',
			label: nls.localize('toggleBreakpointAction', "Debug: Toggle Breakpoint"),
			alias: 'Debug: Toggle Breakpoint',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyCode.F9
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const debugService = accessor.get(IDebugService);

		const position = editor.getPosition();
		const modelUri = editor.getModel().uri;
		const bps = debugService.getModel().getBreakpoints()
			.filter(bp => bp.lineNumber === position.lineNumber && bp.uri.toString() === modelUri.toString());

		if (bps.length) {
			return TPromise.join(bps.map(bp => debugService.removeBreakpoints(bp.getId())));
		}
		if (debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel())) {
			return debugService.addBreakpoints(modelUri, [{ lineNumber: position.lineNumber }]);
		}

		return TPromise.as(null);
	}
}

function addColumnBreakpoint(accessor: ServicesAccessor, editor: ICommonCodeEditor, remove: boolean): TPromise<any> {
	const debugService = accessor.get(IDebugService);

	const position = editor.getPosition();
	const modelUri = editor.getModel().uri;
	const bp = debugService.getModel().getBreakpoints()
		.filter(bp => bp.lineNumber === position.lineNumber && bp.column === position.column && bp.uri.toString() === modelUri.toString()).pop();

	if (bp) {
		return remove ? debugService.removeBreakpoints(bp.getId()) : TPromise.as(null);
	}
	if (debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel())) {
		return debugService.addBreakpoints(modelUri, [{ lineNumber: position.lineNumber, column: position.column }]);
	}

	return TPromise.as(null);
}

@editorAction
class ToggleColumnBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.toggleColumnBreakpoint',
			label: nls.localize('columnBreakpointAction', "Debug: Column Breakpoint"),
			alias: 'Debug: Column Breakpoint',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyCode.F9
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		return addColumnBreakpoint(accessor, editor, true);
	}
}

// TODO@Isidor merge two column breakpoints actions together
@editorAction
class ToggleColumnBreakpointContextMenuAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.toggleColumnBreakpointContextMenu',
			label: nls.localize('columnBreakpoint', "Add Column Breakpoint"),
			alias: 'Toggle Column Breakpoint',
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_NOT_IN_DEBUG_REPL, EditorContextKeys.writable),
			menuOpts: {
				group: 'debug',
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		return addColumnBreakpoint(accessor, editor, false);
	}
}

@editorAction
class ConditionalBreakpointAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.conditionalBreakpoint',
			label: nls.localize('conditionalBreakpointEditorAction', "Debug: Add Conditional Breakpoint..."),
			alias: 'Debug: Add Conditional Breakpoint...',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const debugService = accessor.get(IDebugService);

		const { lineNumber, column } = editor.getPosition();
		if (debugService.getConfigurationManager().canSetBreakpointsIn(editor.getModel())) {
			editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(lineNumber, column);
		}
	}
}


@editorAction
class RunToCursorAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.runToCursor',
			label: nls.localize('runToCursor', "Run to Cursor"),
			alias: 'Debug: Run to Cursor',
			precondition: ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, CONTEXT_NOT_IN_DEBUG_REPL, EditorContextKeys.writable, CONTEXT_DEBUG_STATE.isEqualTo('stopped')),
			menuOpts: {
				group: 'debug',
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const debugService = accessor.get(IDebugService);

		if (debugService.state !== State.Stopped) {
			return TPromise.as(null);
		}
		const position = editor.getPosition();
		const uri = editor.getModel().uri;

		const oneTimeListener = debugService.getViewModel().focusedProcess.session.onDidEvent(event => {
			if (event.event === 'stopped' || event.event === 'exit') {
				const toRemove = debugService.getModel().getBreakpoints()
					.filter(bp => bp.lineNumber === position.lineNumber && bp.uri.toString() === uri.toString()).pop();
				if (toRemove) {
					debugService.removeBreakpoints(toRemove.getId());
				}
				oneTimeListener.dispose();
			}
		});

		const bpExists = !!(debugService.getModel().getBreakpoints().filter(bp => bp.column === position.column && bp.lineNumber === position.lineNumber && bp.uri.toString() === uri.toString()).pop());
		return (bpExists ? TPromise.as(null) : debugService.addBreakpoints(uri, [{ lineNumber: position.lineNumber, column: position.column }])).then(() => {
			debugService.getViewModel().focusedThread.continue();
		});
	}
}

@editorAction
class SelectionToReplAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.selectionToRepl',
			label: nls.localize('debugEvaluate', "Debug: Evaluate"),
			alias: 'Debug: Evaluate',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, CONTEXT_NOT_IN_DEBUG_REPL),
			menuOpts: {
				group: 'debug',
				order: 0
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const debugService = accessor.get(IDebugService);
		const panelService = accessor.get(IPanelService);

		const text = editor.getModel().getValueInRange(editor.getSelection());
		return debugService.addReplExpression(text)
			.then(() => panelService.openPanel(REPL_ID, true))
			.then(_ => void 0);
	}
}

@editorAction
class SelectionToWatchExpressionsAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.selectionToWatch',
			label: nls.localize('debugAddToWatch', "Debug: Add to Watch"),
			alias: 'Debug: Add to Watch',
			precondition: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CONTEXT_IN_DEBUG_MODE, CONTEXT_NOT_IN_DEBUG_REPL),
			menuOpts: {
				group: 'debug',
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const debugService = accessor.get(IDebugService);
		const viewletService = accessor.get(IViewletService);

		const text = editor.getModel().getValueInRange(editor.getSelection());
		return viewletService.openViewlet(VIEWLET_ID).then(() => debugService.addWatchExpression(text));
	}
}

@editorAction
class ShowDebugHoverAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.debug.action.showDebugHover',
			label: nls.localize('showDebugHover', "Debug: Show Hover"),
			alias: 'Debug: Show Hover',
			precondition: CONTEXT_IN_DEBUG_MODE,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		const position = editor.getPosition();
		const word = editor.getModel().getWordAtPosition(position);
		if (!word) {
			return TPromise.as(null);
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, word.endColumn);
		return editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showHover(range, true);
	}
}

@editorAction
export class GoToNextBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.goToNextBreakpoint',
			label: nls.localize('goToNextBreakpoint', "Debug: Go To Next Breakpoint"),
			alias: 'Debug: Go To Next Breakpoint',
			precondition: null//,
			// kbOpts: {
			// 	kbExpr: EditorContextKeys.textFocus,
			// 	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
			// }
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		debugger;
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);

		const currentUri = editor.getModel().uri;
		const currentLine = editor.getPosition().lineNumber;
		const allEnabledBreakpoints = debugService.getModel().getBreakpoints()
			.filter(bp => bp.enabled)
			.sort((a, b) => {
				if (a.uri.path.localeCompare(b.uri.path) === 0){
					return a.lineNumber - b.lineNumber;
				}
				return a.uri.path.localeCompare(b.uri.path);
			});

		let nextBreakpoint = allEnabledBreakpoints
			.filter(bp => bp.uri.toString() === currentUri.toString() && bp.lineNumber > currentLine)[0];
		if (nextBreakpoint)
		{
			editor.revealLine(nextBreakpoint.lineNumber);
			editor.setPosition(new Position(nextBreakpoint.lineNumber, nextBreakpoint.column || 0));

			return TPromise.as(null);
		}

		nextBreakpoint = allEnabledBreakpoints.filter(bp => currentUri.toString().localeCompare(bp.uri.toString()) < 0)[0];
		if (!nextBreakpoint) {
			nextBreakpoint = allEnabledBreakpoints[0];
		}

		editorService.openEditor({
			resource: nextBreakpoint.uri,
			options: {
				selection: new Selection(nextBreakpoint.lineNumber, nextBreakpoint.column || 0, nextBreakpoint.lineNumber, nextBreakpoint.column || 0)
			}
		});
		return TPromise.as(null);
	}
}

@editorAction
export class GoToPreviousBreakpointAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.debug.action.goToPreviousBreakpoint',
			label: nls.localize('goToPreviousBreakpoint', "Debug: Go To Previous Breakpoint"),
			alias: 'Debug: Go To Previous Breakpoint',
			precondition: null//,
			// kbOpts: {
			// 	kbExpr: EditorContextKeys.textFocus,
			// 	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_I)
			// }
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		debugger;
		const debugService = accessor.get(IDebugService);
		const editorService = accessor.get(IEditorService);

		const currentUri = editor.getModel().uri;
		const currentLine = editor.getPosition().lineNumber;
		const allEnabledBreakpoints = debugService.getModel().getBreakpoints()
			.filter(bp => bp.enabled)
			.sort((a, b) => {
				if (a.uri.path.localeCompare(b.uri.path) === 0){
					return b.lineNumber - a.lineNumber;
				}
				return b.uri.path.localeCompare(a.uri.path);
			});

		let nextBreakpoint = allEnabledBreakpoints
			.filter(bp => bp.uri.toString() === currentUri.toString() && bp.lineNumber < currentLine)[0];
		if (nextBreakpoint)
		{
			editor.revealLine(nextBreakpoint.lineNumber);
			editor.setPosition(new Position(nextBreakpoint.lineNumber, nextBreakpoint.column || 0));

			return TPromise.as(null);
		}

		nextBreakpoint = allEnabledBreakpoints.filter(bp => currentUri.toString().localeCompare(bp.uri.toString()) > 0)[0];
		if (!nextBreakpoint) {
			nextBreakpoint = allEnabledBreakpoints[0];
		}

		editorService.openEditor({
			resource: nextBreakpoint.uri,
			options: {
				selection: new Selection(nextBreakpoint.lineNumber, nextBreakpoint.column || 0, nextBreakpoint.lineNumber, nextBreakpoint.column || 0)
			}
		});
		return TPromise.as(null);
	}
}

class CloseBreakpointWidgetCommand extends EditorCommand {

	constructor() {
		super({
			id: 'closeBreakpointWidget',
			precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
			kbOpts: {
				weight: CommonEditorRegistry.commandWeight(8),
				kbExpr: EditorContextKeys.focus,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		return editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).closeBreakpointWidget();
	}
}

CommonEditorRegistry.registerEditorCommand(new CloseBreakpointWidgetCommand());
