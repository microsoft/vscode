/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as env from 'vs/base/common/platform';
import uri from 'vs/base/common/uri';
import { visit } from 'vs/base/common/json';
import { IAction, Action } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IModelDecorationOptions, MouseTargetType, IModelDeltaDecoration, TrackedRangeStickiness, IPosition } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DebugHoverWidget } from 'vs/workbench/parts/debug/electron-browser/debugHover';
import { RemoveBreakpointAction, EditConditionalBreakpointAction, ToggleEnablementAction, AddConditionalBreakpointAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IDebugEditorContribution, IDebugService, State, IBreakpoint, EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE } from 'vs/workbench/parts/debug/common/debug';
import { BreakpointWidget } from 'vs/workbench/parts/debug/browser/breakpointWidget';
import { FloatingClickWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';

const HOVER_DELAY = 300;
const LAUNCH_JSON_REGEX = /launch\.json$/;

@editorContribution
export class DebugEditorContribution implements IDebugEditorContribution {

	private toDispose: lifecycle.IDisposable[];
	private hoverWidget: DebugHoverWidget;
	private showHoverScheduler: RunOnceScheduler;
	private hideHoverScheduler: RunOnceScheduler;
	private hoverRange: Range;
	private hoveringOver: string;

	private breakpointHintDecoration: string[];
	private breakpointWidget: BreakpointWidget;
	private breakpointWidgetVisible: IContextKey<boolean>;

	private configurationWidget: FloatingClickWidget;

	constructor(
		private editor: ICodeEditor,
		@IDebugService private debugService: IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private commandService: ICommandService
	) {
		this.breakpointHintDecoration = [];
		this.hoverWidget = new DebugHoverWidget(this.editor, this.debugService, this.instantiationService);
		this.toDispose = [];
		this.showHoverScheduler = new RunOnceScheduler(() => this.showHover(this.hoverRange, this.hoveringOver, false), HOVER_DELAY);
		this.hideHoverScheduler = new RunOnceScheduler(() => this.hoverWidget.hide(), HOVER_DELAY);
		this.registerListeners();
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.updateConfigurationWidgetVisibility();
	}

	private getContextMenuActions(breakpoint: IBreakpoint, uri: uri, lineNumber: number): TPromise<IAction[]> {
		const actions = [];
		if (breakpoint) {
			actions.push(this.instantiationService.createInstance(RemoveBreakpointAction, RemoveBreakpointAction.ID, RemoveBreakpointAction.LABEL));
			actions.push(this.instantiationService.createInstance(EditConditionalBreakpointAction, EditConditionalBreakpointAction.ID, EditConditionalBreakpointAction.LABEL, this.editor, lineNumber));
			actions.push(this.instantiationService.createInstance(ToggleEnablementAction, ToggleEnablementAction.ID, ToggleEnablementAction.LABEL));
		} else {
			actions.push(new Action(
				'addBreakpoint',
				nls.localize('addBreakpoint', "Add Breakpoint"),
				null,
				true,
				() => this.debugService.addBreakpoints(uri, [{ lineNumber }])
			));
			actions.push(this.instantiationService.createInstance(AddConditionalBreakpointAction, AddConditionalBreakpointAction.ID, AddConditionalBreakpointAction.LABEL, this.editor, lineNumber));
		}

		return TPromise.as(actions);
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.onMouseDown((e: IEditorMouseEvent) => {
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || /* after last line */ e.target.detail) {
				return;
			}
			const canSetBreakpoints = this.debugService.getConfigurationManager().canSetBreakpointsIn(this.editor.getModel());

			const lineNumber = e.target.position.lineNumber;
			const uri = this.editor.getModel().uri;

			if (e.event.rightButton || (env.isMacintosh && e.event.leftButton && e.event.ctrlKey)) {
				if (!canSetBreakpoints) {
					return;
				}

				const anchor = { x: e.event.posx + 1, y: e.event.posy };
				const breakpoint = this.debugService.getModel().getBreakpoints().filter(bp => bp.lineNumber === lineNumber && bp.uri.toString() === uri.toString()).pop();

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => this.getContextMenuActions(breakpoint, uri, lineNumber),
					getActionsContext: () => breakpoint
				});
			} else {
				const breakpoint = this.debugService.getModel().getBreakpoints()
					.filter(bp => bp.uri.toString() === uri.toString() && bp.lineNumber === lineNumber).pop();

				if (breakpoint) {
					this.debugService.removeBreakpoints(breakpoint.getId());
				} else if (canSetBreakpoints) {
					this.debugService.addBreakpoints(uri, [{ lineNumber }]);
				}
			}
		}));

		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => {
			var showBreakpointHintAtLineNumber = -1;
			if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN && this.debugService.getConfigurationManager().canSetBreakpointsIn(this.editor.getModel())) {
				if (!e.target.detail) {
					// is not after last line
					showBreakpointHintAtLineNumber = e.target.position.lineNumber;
				}
			}
			this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
		}));
		this.toDispose.push(this.editor.onMouseLeave((e: IEditorMouseEvent) => {
			this.ensureBreakpointHintDecoration(-1);
		}));
		this.toDispose.push(this.debugService.onDidChangeState(() => this.onDebugStateUpdate()));

		// hover listeners & hover widget
		this.toDispose.push(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => this.onEditorMouseMove(e)));
		this.toDispose.push(this.editor.onMouseLeave((e: IEditorMouseEvent) => {
			const rect = this.hoverWidget.getDomNode().getBoundingClientRect();
			// Only hide the hover widget if the editor mouse leave event is outside the hover widget #3528
			if (e.event.posx < rect.left || e.event.posx > rect.right || e.event.posy < rect.top || e.event.posy > rect.bottom) {
				this.hideHoverWidget();
			}
		}));
		this.toDispose.push(this.editor.onKeyDown((e: IKeyboardEvent) => this.onKeyDown(e)));
		this.toDispose.push(this.editor.onDidChangeModel(() => {
			this.closeBreakpointWidget();
			this.hideHoverWidget();
			this.updateConfigurationWidgetVisibility();
		}));
		this.toDispose.push(this.editor.onDidScrollChange(() => this.hideHoverWidget));
	}

	public getId(): string {
		return EDITOR_CONTRIBUTION_ID;
	}

	public showHover(range: Range, hoveringOver: string, focus: boolean): TPromise<void> {
		return this.hoverWidget.showAt(range, hoveringOver, focus);
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		var newDecoration: IModelDeltaDecoration[] = [];
		if (showBreakpointHintAtLineNumber !== -1) {
			newDecoration.push({
				options: DebugEditorContribution.BREAKPOINT_HELPER_DECORATION,
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
		const state = this.debugService.state;
		if (state !== State.Stopped) {
			this.hideHoverWidget();
		}
		this.codeEditorService.listCodeEditors().forEach(e => {
			e.updateOptions({ hover: state !== State.Stopped });
		});
	}

	private hideHoverWidget(): void {
		if (!this.hideHoverScheduler.isScheduled() && this.hoverWidget.isVisible()) {
			this.hideHoverScheduler.schedule();
		}
		this.showHoverScheduler.cancel();
		this.hoveringOver = null;
	}

	// hover business

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID) {
			return;
		}

		this.hideHoverWidget();
	}

	private onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		if (this.debugService.state !== State.Stopped) {
			return;
		}

		const targetType = mouseEvent.target.type;
		const stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of debug hover widget
			return;
		}
		if (targetType === MouseTargetType.CONTENT_TEXT) {
			const wordAtPosition = this.editor.getModel().getWordAtPosition(mouseEvent.target.range.getStartPosition());
			if (wordAtPosition && this.hoveringOver !== wordAtPosition.word) {
				this.hoverRange = mouseEvent.target.range;
				this.hoveringOver = wordAtPosition.word;
				this.showHoverScheduler.schedule();
			}
		} else {
			this.hideHoverWidget();
		}
	}

	private onKeyDown(e: IKeyboardEvent): void {
		const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey) {
			// do not hide hover when Ctrl/Meta is pressed
			this.hideHoverWidget();
		}
	}

	// end hover business

	public showBreakpointWidget(lineNumber: number): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
		}

		this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber);
		this.breakpointWidget.show({ lineNumber, column: 1 }, 2);
		this.breakpointWidgetVisible.set(true);
	}

	public closeBreakpointWidget(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
			this.breakpointWidget = null;
			this.breakpointWidgetVisible.reset();
			this.editor.focus();
		}
	}

	// configuration widget
	private updateConfigurationWidgetVisibility(): void {
		const model = this.editor.getModel();
		if (model && LAUNCH_JSON_REGEX.test(model.uri.toString())) {
			this.configurationWidget = this.instantiationService.createInstance(FloatingClickWidget, this.editor, nls.localize('addConfiguration', "Add Configuration"), null);
			this.configurationWidget.render();
			this.toDispose.push(this.configurationWidget.onClick(() => this.addLaunchConfiguration()));
		} else if (this.configurationWidget) {
			this.configurationWidget.dispose();
		}
	}

	private addLaunchConfiguration(): void {
		let depthInArray = 0;
		let configurationsPosition: IPosition;
		const model = this.editor.getModel();
		visit(model.getValue(), {
			onObjectProperty: (property, offset, length) => {
				if (property === 'configurations' && depthInArray === 0) {
					configurationsPosition = model.getPositionAt(offset);
				}
			},
			onArrayBegin: (offset: number, length: number) => {
				depthInArray++;
			},
			onArrayEnd: (offset: number, length: number) => {
				depthInArray--;
			}
		});

		if (configurationsPosition) {
			this.editor.setSelection(new Selection(configurationsPosition.lineNumber, Number.MAX_VALUE, configurationsPosition.lineNumber, Number.MAX_VALUE));
			this.commandService.executeCommand('editor.action.insertLineAfter').done(() =>
				this.commandService.executeCommand('editor.action.triggerSuggest'), errors.onUnexpectedError);
		}
	}

	private static BREAKPOINT_HELPER_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-hint-glyph',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	public dispose(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
		}
		if (this.hoverWidget) {
			this.hoverWidget.dispose();
		}
		if (this.configurationWidget) {
			this.configurationWidget.dispose();
		}
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}
