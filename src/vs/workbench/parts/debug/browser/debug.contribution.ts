/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debug.contribution';
import nls = require('vs/nls');
import env = require('vs/base/common/platform');
import lifecycle = require('vs/base/common/lifecycle');
import keyboard = require('vs/base/browser/keyboardEvent');
import editorbrowser = require('vs/editor/browser/editorBrowser');
import editorcommon = require('vs/editor/common/editorCommon');
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { CommonEditorRegistry, ContextKey, EditorActionDescriptor } from 'vs/editor/common/editorCommonExtensions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import platform = require('vs/platform/platform');
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import wbaregistry = require('vs/workbench/browser/actionRegistry');
import actionbarregistry = require('vs/workbench/browser/actionBarRegistry');
import viewlet = require('vs/workbench/browser/viewlet');
import wbext = require('vs/workbench/common/contributions');
import files = require('vs/workbench/parts/files/browser/files');
import baseeditor = require('vs/workbench/browser/parts/editor/baseEditor');
import filesCommon = require('vs/workbench/parts/files/common/files');
import manager = require('vs/workbench/parts/debug/browser/debugEditorModelManager');
import service = require('vs/workbench/parts/debug/browser/debugService');
import * as debug from 'vs/workbench/parts/debug/common/debug';
import dbgactions = require('vs/workbench/parts/debug/browser/debugActions');
import editorinputs = require('vs/workbench/parts/debug/browser/debugEditorInputs');
import repleditor = require('vs/workbench/parts/debug/browser/replEditor');
import debugwidget = require('vs/workbench/parts/debug/browser/debugActionsWidget');
import debughover = require('vs/workbench/parts/debug/browser/debugHoverWidget');
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingService';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

import IDebugService = debug.IDebugService;

class OpenDebugViewletAction extends viewlet.ToggleViewletAction {
	public static ID = debug.VIEWLET_ID;
	public static LABEL = nls.localize('toggleDebugViewlet', "Show Debug");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, debug.VIEWLET_ID, viewletService, editorService);
	}
}

class DebugEditorContrib implements editorcommon.IEditorContribution {

	static ID = 'editor.contrib.debug';

	private editor: editorbrowser.ICodeEditor;
	private toDispose: lifecycle.IDisposable[];
	private breakpointHintDecoration: string[];
	private hoverWidget: debughover.DebugHoverWidget;

	constructor(edtr: editorbrowser.ICodeEditor,
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		this.editor = edtr;
		this.breakpointHintDecoration = [];
		this.toDispose = [];
		this.registerListeners();
		this.hoverWidget = new debughover.DebugHoverWidget(this.editor, this.debugService);
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseDown, (e: editorbrowser.IMouseEvent) => {
			if (e.target.type !== editorcommon.MouseTargetType.GUTTER_GLYPH_MARGIN || /* after last line */ e.target.detail) {
				return;
			}
			if (!this.debugService.canSetBreakpointsIn(this.editor.getModel(), e.target.position.lineNumber)) {
				return;
			}

			var modelUrl = this.editor.getModel().getAssociatedResource();
			this.debugService.toggleBreakpoint(modelUrl, e.target.position.lineNumber);
		}));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseMove, (e: editorbrowser.IMouseEvent) => {
			var showBreakpointHintAtLineNumber = -1;
			if (e.target.type === editorcommon.MouseTargetType.GUTTER_GLYPH_MARGIN && this.debugService.canSetBreakpointsIn(this.editor.getModel(), e.target.position.lineNumber)) {
				if (!e.target.detail) {
					// is not after last line
					showBreakpointHintAtLineNumber = e.target.position.lineNumber;
				}
			}
			this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
		}));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseLeave, (e: editorbrowser.IMouseEvent) => {
			this.ensureBreakpointHintDecoration(-1);
		}));
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => this.onDebugStateUpdate()));

		// hover listeners & hover widget
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseDown, (e: editorbrowser.IMouseEvent) => this.onEditorMouseDown(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseMove, (e: editorbrowser.IMouseEvent) => this.onEditorMouseMove(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.MouseLeave, (e: editorbrowser.IMouseEvent) => this.hoverWidget.hide()));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.KeyDown, (e: keyboard.StandardKeyboardEvent) => this.onKeyDown(e)));
		this.toDispose.push(this.editor.addListener2(editorcommon.EventType.ModelChanged, () => this.onModelChanged()));
		this.toDispose.push(this.editor.addListener2('scroll', () => this.hoverWidget.hide()));
	}

	public getId(): string {
		return DebugEditorContrib.ID;
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		var newDecoration: editorcommon.IModelDeltaDecoration[] = [];
		if (showBreakpointHintAtLineNumber !== -1) {
			newDecoration.push({
				options: DebugEditorContrib.BREAKPOINT_HELPER_DECORATION,
				range: {
					startLineNumber: showBreakpointHintAtLineNumber,
					startColumn: 1,
					endLineNumber: showBreakpointHintAtLineNumber,
					endColumn: 1
				}
			});
		}

		this.breakpointHintDecoration = this.editor.deltaDecorations(this.breakpointHintDecoration, newDecoration);
	}

	private onDebugStateUpdate(): void {
		if (this.debugService.getState() !== debug.State.Stopped) {
			this.hoverWidget.hide();
		}
		this.contextService.updateOptions('editor', {
			hover: this.debugService.getState() !== debug.State.Stopped
		});
	}

	private onModelChanged(): void {
		this.hoverWidget.hide();
	}

	// hover business

	private onEditorMouseDown(mouseEvent: editorbrowser.IMouseEvent): void {
		var targetType = mouseEvent.target.type;
		if (targetType === editorcommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === debughover.DebugHoverWidget.ID) {
			return;
		}

		this.hoverWidget.hide();
	}

	private onEditorMouseMove(mouseEvent: editorbrowser.IMouseEvent): void {
		if (this.debugService.getState() !== debug.State.Stopped) {
			return;
		}

		var targetType = mouseEvent.target.type;
		var stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === editorcommon.MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === debughover.DebugHoverWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of content hover widget
			return;
		}

		if (targetType === editorcommon.MouseTargetType.CONTENT_TEXT) {
			this.hoverWidget.showAt(mouseEvent.target.range);
		} else {
			this.hoverWidget.hide();
		}
	}

	private onKeyDown(e: keyboard.StandardKeyboardEvent): void {
		var stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey) {
			// Do not hide hover when Ctrl/Meta is pressed
			this.hoverWidget.hide();
		}
	}

	// end hover business

	private static BREAKPOINT_HELPER_DECORATION: editorcommon.IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-glyph-hint',
		stickiness: editorcommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	public dispose(): void {
		this.toDispose = lifecycle.disposeAll(this.toDispose);
	}
}

EditorBrowserRegistry.registerEditorContribution(DebugEditorContrib);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(dbgactions.ToggleBreakpointAction, dbgactions.ToggleBreakpointAction.ID, nls.localize('toggleBreakpointAction', "Debug: Toggle Breakpoint"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyCode.F9
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(dbgactions.SelectionToReplAction, dbgactions.SelectionToReplAction.ID, nls.localize('debugEvaluate', "Debug: Evaluate")));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(dbgactions.SelectionToWatchExpressionsAction, dbgactions.SelectionToWatchExpressionsAction.ID, nls.localize('addToWatch', "Debug: Add to Watch")));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(dbgactions.RunToCursorAction, dbgactions.RunToCursorAction.ID, nls.localize('runToCursor', "Debug: Run to Cursor")));

// Register Service
registerSingleton(IDebugService, service.DebugService);

// Register Viewlet
(<viewlet.IViewletRegistry>platform.Registry.as(viewlet.Extensions.Viewlets)).registerViewlet(new viewlet.ViewletDescriptor(
	'vs/workbench/parts/debug/browser/debugViewlet',
	'DebugViewlet',
	debug.VIEWLET_ID,
	nls.localize('debug', "Debug"),
	'debug',
	40
));

var openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_D
};

// Register repl editor
platform.Registry.as(baseeditor.Extensions.Editors).registerEditor(
	new baseeditor.EditorDescriptor(repleditor.Repl.ID, 'Repl', 'vs/workbench/parts/debug/browser/replEditor', 'Repl'),
	new SyncDescriptor(editorinputs.ReplEditorInput));

let actionBarRegistry = <actionbarregistry.IActionBarRegistry> platform.Registry.as(actionbarregistry.Extensions.Actionbar);
actionBarRegistry.registerActionBarContributor(actionbarregistry.Scope.EDITOR, repleditor.ReplEditorActionContributor);
(<baseeditor.IEditorRegistry>platform.Registry.as(baseeditor.Extensions.Editors)).registerEditorInputFactory(editorinputs.ReplEditorInput.ID, repleditor.ReplInputFactory);

// Register Action to Open Viewlet
var registry = (<wbaregistry.IWorkbenchActionRegistry> platform.Registry.as(wbaregistry.Extensions.WorkbenchActions));
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenDebugViewletAction, OpenDebugViewletAction.ID, OpenDebugViewletAction.LABEL, openViewletKb), nls.localize('view', "View"));

(<wbext.IWorkbenchContributionsRegistry>platform.Registry.as(wbext.Extensions.Workbench)).registerWorkbenchContribution(manager.DebugEditorModelManager);
(<wbext.IWorkbenchContributionsRegistry>platform.Registry.as(wbext.Extensions.Workbench)).registerWorkbenchContribution(debugwidget.DebugActionsWidget);

var debugCategory = nls.localize('debugCategory', "Debug");
registry.registerWorkbenchAction(new SyncActionDescriptor(
	dbgactions.StartDebugAction, dbgactions.StartDebugAction.ID, dbgactions.StartDebugAction.LABEL, { primary: KeyCode.F5 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE, operator: KeybindingsRegistry.KEYBINDING_CONTEXT_OPERATOR_NOT_EQUAL, operand: true }]), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.StepOverDebugAction, dbgactions.StepOverDebugAction.ID, dbgactions.StepOverDebugAction.LABEL, { primary: KeyCode.F10 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE }]), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.StepIntoDebugAction, dbgactions.StepIntoDebugAction.ID, dbgactions.StepIntoDebugAction.LABEL, { primary: KeyCode.F11 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE }], KeybindingsRegistry.WEIGHT.workbenchContrib(1)), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.StepOutDebugAction, dbgactions.StepOutDebugAction.ID, dbgactions.StepOutDebugAction.LABEL, { primary: KeyMod.Shift | KeyCode.F11 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE }]), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.RestartDebugAction, dbgactions.RestartDebugAction.ID, dbgactions.RestartDebugAction.LABEL), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.StopDebugAction, dbgactions.StopDebugAction.ID, dbgactions.StopDebugAction.LABEL, { primary: KeyMod.Shift | KeyCode.F5 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE }]), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.ContinueAction, dbgactions.ContinueAction.ID, dbgactions.ContinueAction.LABEL, { primary: KeyCode.F5 }, [{ key: debug.CONTEXT_IN_DEBUG_MODE }]), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.PauseAction, dbgactions.PauseAction.ID, dbgactions.PauseAction.LABEL), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.ConfigureAction, dbgactions.ConfigureAction.ID, dbgactions.ConfigureAction.LABEL), debugCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(dbgactions.OpenReplAction, dbgactions.OpenReplAction.ID, dbgactions.OpenReplAction.LABEL), debugCategory);
