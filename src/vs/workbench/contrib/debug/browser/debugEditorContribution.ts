/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as env from 'vs/base/common/platform';
import { URI as uri } from 'vs/base/common/uri';
import { visit } from 'vs/base/common/json';
import severity from 'vs/base/common/severity';
import { Constants } from 'vs/editor/common/core/uint';
import { IAction, Action } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardTokenType } from 'vs/editor/common/modes';
import { DEFAULT_WORD_REGEXP } from 'vs/editor/common/model/wordHelper';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, IModelDeltaDecoration, TrackedRangeStickiness, ITextModel } from 'vs/editor/common/model';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { RemoveBreakpointAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { IDebugEditorContribution, IDebugService, State, IBreakpoint, EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, IStackFrame, IDebugConfiguration, IExpression, IExceptionInfo, BreakpointWidgetContext } from 'vs/workbench/contrib/debug/common/debug';
import { ExceptionWidget } from 'vs/workbench/contrib/debug/browser/exceptionWidget';
import { FloatingClickWidget } from 'vs/workbench/browser/parts/editor/editorWidgets';
import { Position } from 'vs/editor/common/core/position';
import { CoreEditingCommands } from 'vs/editor/browser/controller/coreCommands';
import { first } from 'vs/base/common/arrays';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextSubMenu } from 'vs/base/browser/contextmenu';
import { memoize } from 'vs/base/common/decorators';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { IEditorHoverOptions } from 'vs/editor/common/config/editorOptions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { BreakpointWidget } from 'vs/workbench/contrib/debug/browser/breakpointWidget';
import { DebugHoverWidget } from 'vs/workbench/contrib/debug/browser/debugHover';

const HOVER_DELAY = 300;
const LAUNCH_JSON_REGEX = /launch\.json$/;
const INLINE_VALUE_DECORATION_KEY = 'inlinevaluedecoration';
const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped

export class DebugEditorContribution implements IDebugEditorContribution {

	private toDispose: lifecycle.IDisposable[];
	private hoverWidget: DebugHoverWidget;
	private nonDebugHoverPosition: Position | undefined;
	private hoverRange: Range | null = null;
	private mouseDown = false;

	private breakpointHintDecoration: string[];
	private breakpointWidget: BreakpointWidget | undefined;
	private breakpointWidgetVisible: IContextKey<boolean>;
	private wordToLineNumbersMap: Map<string, Position[]> | undefined;

	private exceptionWidget: ExceptionWidget | undefined;

	private configurationWidget: FloatingClickWidget | undefined;

	constructor(
		private editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		this.breakpointHintDecoration = [];
		this.hoverWidget = this.instantiationService.createInstance(DebugHoverWidget, this.editor);
		this.toDispose = [];
		this.registerListeners();
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.updateConfigurationWidgetVisibility();
		this.codeEditorService.registerDecorationType(INLINE_VALUE_DECORATION_KEY, {});
		this.toggleExceptionWidget();
	}

	private getContextMenuActions(breakpoints: ReadonlyArray<IBreakpoint>, uri: uri, lineNumber: number): Array<IAction | ContextSubMenu> {
		const actions: Array<IAction | ContextSubMenu> = [];
		if (breakpoints.length === 1) {
			const breakpointType = breakpoints[0].logMessage ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");
			actions.push(new RemoveBreakpointAction(RemoveBreakpointAction.ID, nls.localize('removeBreakpoint', "Remove {0}", breakpointType), this.debugService, this.keybindingService));
			actions.push(new Action(
				'workbench.debug.action.editBreakpointAction',
				nls.localize('editBreakpoint', "Edit {0}...", breakpointType),
				undefined,
				true,
				() => Promise.resolve(this.editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column))
			));

			actions.push(new Action(
				`workbench.debug.viewlet.action.toggleBreakpoint`,
				breakpoints[0].enabled ? nls.localize('disableBreakpoint', "Disable {0}", breakpointType) : nls.localize('enableBreakpoint', "Enable {0}", breakpointType),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!breakpoints[0].enabled, breakpoints[0])
			));
		} else if (breakpoints.length > 1) {
			const sorted = breakpoints.slice().sort((first, second) => (first.column && second.column) ? first.column - second.column : 1);
			actions.push(new ContextSubMenu(nls.localize('removeBreakpoints', "Remove Breakpoints"), sorted.map(bp => new Action(
				'removeInlineBreakpoint',
				bp.column ? nls.localize('removeInlineBreakpointOnColumn', "Remove Inline Breakpoint on Column {0}", bp.column) : nls.localize('removeLineBreakpoint', "Remove Line Breakpoint"),
				undefined,
				true,
				() => this.debugService.removeBreakpoints(bp.getId())
			))));

			actions.push(new ContextSubMenu(nls.localize('editBreakpoints', "Edit Breakpoints"), sorted.map(bp =>
				new Action('editBreakpoint',
					bp.column ? nls.localize('editInlineBreakpointOnColumn', "Edit Inline Breakpoint on Column {0}", bp.column) : nls.localize('editLineBrekapoint', "Edit Line Breakpoint"),
					undefined,
					true,
					() => Promise.resolve(this.editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(bp.lineNumber, bp.column))
				)
			)));

			actions.push(new ContextSubMenu(nls.localize('enableDisableBreakpoints', "Enable/Disable Breakpoints"), sorted.map(bp => new Action(
				bp.enabled ? 'disableColumnBreakpoint' : 'enableColumnBreakpoint',
				bp.enabled ? (bp.column ? nls.localize('disableInlineColumnBreakpoint', "Disable Inline Breakpoint on Column {0}", bp.column) : nls.localize('disableBreakpointOnLine', "Disable Line Breakpoint"))
					: (bp.column ? nls.localize('enableBreakpoints', "Enable Inline Breakpoint on Column {0}", bp.column) : nls.localize('enableBreakpointOnLine', "Enable Line Breakpoint")),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!bp.enabled, bp)
			))));
		} else {
			actions.push(new Action(
				'addBreakpoint',
				nls.localize('addBreakpoint', "Add Breakpoint"),
				undefined,
				true,
				() => this.debugService.addBreakpoints(uri, [{ lineNumber }], `debugEditorContextMenu`)
			));
			actions.push(new Action(
				'addConditionalBreakpoint',
				nls.localize('addConditionalBreakpoint', "Add Conditional Breakpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(lineNumber, undefined))
			));
			actions.push(new Action(
				'addLogPoint',
				nls.localize('addLogPoint', "Add Logpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.editor.getContribution<IDebugEditorContribution>(EDITOR_CONTRIBUTION_ID).showBreakpointWidget(lineNumber, undefined, BreakpointWidgetContext.LOG_MESSAGE))
			));
		}

		return actions;
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.onMouseDown((e: IEditorMouseEvent) => {
			const data = e.target.detail as IMarginData;
			const model = this.editor.getModel();
			if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || data.isAfterLines || !this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
				return;
			}
			const canSetBreakpoints = this.debugService.getConfigurationManager().canSetBreakpointsIn(model);
			const lineNumber = e.target.position.lineNumber;
			const uri = model.uri;

			if (e.event.rightButton || (env.isMacintosh && e.event.leftButton && e.event.ctrlKey)) {
				if (!canSetBreakpoints) {
					return;
				}

				const anchor = { x: e.event.posx, y: e.event.posy };
				const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber, uri });

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => this.getContextMenuActions(breakpoints, uri, lineNumber),
					getActionsContext: () => breakpoints.length ? breakpoints[0] : undefined
				});
			} else {
				const breakpoints = this.debugService.getModel().getBreakpoints({ uri, lineNumber });

				if (breakpoints.length) {
					// Show the dialog if there is a potential condition to be accidently lost.
					// Do not show dialog on linux due to electron issue freezing the mouse #50026
					if (!env.isLinux && breakpoints.some(bp => !!bp.condition || !!bp.logMessage || !!bp.hitCondition)) {
						const logPoint = breakpoints.every(bp => !!bp.logMessage);
						const breakpointType = logPoint ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");
						const disable = breakpoints.some(bp => bp.enabled);

						const enabling = nls.localize('breakpointHasConditionDisabled',
							"This {0} has a {1} that will get lost on remove. Consider enabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);
						const disabling = nls.localize('breakpointHasConditionEnabled',
							"This {0} has a {1} that will get lost on remove. Consider disabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);

						this.dialogService.show(severity.Info, disable ? disabling : enabling, [
							nls.localize('removeLogPoint', "Remove {0}", breakpointType),
							nls.localize('disableLogPoint', "{0} {1}", disable ? nls.localize('disable', "Disable") : nls.localize('enable', "Enable"), breakpointType),
							nls.localize('cancel', "Cancel")
						], { cancelId: 2 }).then(choice => {
							if (choice === 0) {
								breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
							}
							if (choice === 1) {
								breakpoints.forEach(bp => this.debugService.enableOrDisableBreakpoints(!disable, bp));
							}
						});
					} else {
						breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
					}
				} else if (canSetBreakpoints) {
					this.debugService.addBreakpoints(uri, [{ lineNumber }], `debugEditorGutter`);
				}
			}
		}));

		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => {
			let showBreakpointHintAtLineNumber = -1;
			const model = this.editor.getModel();
			if (model && e.target.position && e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN && this.debugService.getConfigurationManager().canSetBreakpointsIn(model) &&
				this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
				const data = e.target.detail as IMarginData;
				if (!data.isAfterLines) {
					showBreakpointHintAtLineNumber = e.target.position.lineNumber;
				}
			}
			this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
		}));
		this.toDispose.push(this.editor.onMouseLeave((e: IEditorMouseEvent) => {
			this.ensureBreakpointHintDecoration(-1);
		}));
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(e => this.onFocusStackFrame(e.stackFrame)));

		// hover listeners & hover widget
		this.toDispose.push(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
		this.toDispose.push(this.editor.onMouseUp(() => this.mouseDown = false));
		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => this.onEditorMouseMove(e)));
		this.toDispose.push(this.editor.onMouseLeave((e: IEditorMouseEvent) => {
			this.provideNonDebugHoverScheduler.cancel();
			const hoverDomNode = this.hoverWidget.getDomNode();
			if (!hoverDomNode) {
				return;
			}

			const rect = hoverDomNode.getBoundingClientRect();
			// Only hide the hover widget if the editor mouse leave event is outside the hover widget #3528
			if (e.event.posx < rect.left || e.event.posx > rect.right || e.event.posy < rect.top || e.event.posy > rect.bottom) {
				this.hideHoverWidget();
			}
		}));
		this.toDispose.push(this.editor.onKeyDown((e: IKeyboardEvent) => this.onKeyDown(e)));
		this.toDispose.push(this.editor.onDidChangeModelContent(() => {
			this.wordToLineNumbersMap = undefined;
			this.updateInlineValuesScheduler.schedule();
		}));
		this.toDispose.push(this.editor.onDidChangeModel(() => {
			const stackFrame = this.debugService.getViewModel().focusedStackFrame;
			const model = this.editor.getModel();
			if (model) {
				this._applyHoverConfiguration(model, stackFrame);
			}
			this.closeBreakpointWidget();
			this.toggleExceptionWidget();
			this.hideHoverWidget();
			this.updateConfigurationWidgetVisibility();
			this.wordToLineNumbersMap = undefined;
			this.updateInlineValueDecorations(stackFrame);
		}));
		this.toDispose.push(this.editor.onDidScrollChange(() => this.hideHoverWidget));
		this.toDispose.push(this.debugService.onDidChangeState((state: State) => {
			if (state !== State.Stopped) {
				this.toggleExceptionWidget();
			}
		}));
	}

	private _applyHoverConfiguration(model: ITextModel, stackFrame: IStackFrame | undefined): void {
		if (stackFrame && model.uri.toString() === stackFrame.source.uri.toString()) {
			this.editor.updateOptions({
				hover: {
					enabled: false
				}
			});
		} else {
			let overrides = {
				resource: model.uri,
				overrideIdentifier: model.getLanguageIdentifier().language
			};
			const defaultConfiguration = this.configurationService.getValue<IEditorHoverOptions>('editor.hover', overrides);
			this.editor.updateOptions({
				hover: {
					enabled: defaultConfiguration.enabled,
					delay: defaultConfiguration.delay,
					sticky: defaultConfiguration.sticky
				}
			});
		}
	}

	public getId(): string {
		return EDITOR_CONTRIBUTION_ID;
	}

	public showHover(range: Range, focus: boolean): Promise<void> {
		const sf = this.debugService.getViewModel().focusedStackFrame;
		const model = this.editor.getModel();
		if (sf && model && sf.source.uri.toString() === model.uri.toString()) {
			return this.hoverWidget.showAt(range, focus);
		}

		return Promise.resolve();
	}

	private marginFreeFromNonDebugDecorations(line: number): boolean {
		const decorations = this.editor.getLineDecorations(line);
		if (decorations) {
			for (const { options } of decorations) {
				if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf('debug') === -1) {
					return false;
				}
			}
		}

		return true;
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		const newDecoration: IModelDeltaDecoration[] = [];
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

	private onFocusStackFrame(sf: IStackFrame | undefined): void {
		const model = this.editor.getModel();
		if (model) {
			this._applyHoverConfiguration(model, sf);
			if (sf && sf.source.uri.toString() === model.uri.toString()) {
				this.toggleExceptionWidget();
			} else {
				this.hideHoverWidget();
			}
		}

		this.updateInlineValueDecorations(sf);
	}

	@memoize
	private get showHoverScheduler(): RunOnceScheduler {
		const scheduler = new RunOnceScheduler(() => {
			if (this.hoverRange) {
				this.showHover(this.hoverRange, false);
			}
		}, HOVER_DELAY);
		this.toDispose.push(scheduler);

		return scheduler;
	}

	@memoize
	private get hideHoverScheduler(): RunOnceScheduler {
		const scheduler = new RunOnceScheduler(() => {
			if (!this.hoverWidget.isHovered()) {
				this.hoverWidget.hide();
			}
		}, 2 * HOVER_DELAY);
		this.toDispose.push(scheduler);

		return scheduler;
	}

	@memoize
	private get provideNonDebugHoverScheduler(): RunOnceScheduler {
		const scheduler = new RunOnceScheduler(() => {
			if (this.editor.hasModel() && this.nonDebugHoverPosition) {
				getHover(this.editor.getModel(), this.nonDebugHoverPosition, CancellationToken.None);
			}
		}, HOVER_DELAY);
		this.toDispose.push(scheduler);

		return scheduler;
	}

	private hideHoverWidget(): void {
		if (!this.hideHoverScheduler.isScheduled() && this.hoverWidget.isVisible()) {
			this.hideHoverScheduler.schedule();
		}
		this.showHoverScheduler.cancel();
		this.provideNonDebugHoverScheduler.cancel();
	}

	// hover business

	private onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this.mouseDown = true;
		if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID) {
			return;
		}

		this.hideHoverWidget();
	}

	private onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		if (this.debugService.state !== State.Stopped) {
			return;
		}

		if (this.configurationService.getValue<IDebugConfiguration>('debug').enableAllHovers && mouseEvent.target.position) {
			this.nonDebugHoverPosition = mouseEvent.target.position;
			this.provideNonDebugHoverScheduler.schedule();
		}
		const targetType = mouseEvent.target.type;
		const stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (targetType === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of debug hover widget
			return;
		}
		if (targetType === MouseTargetType.CONTENT_TEXT) {
			if (mouseEvent.target.range && !mouseEvent.target.range.equalsRange(this.hoverRange)) {
				this.hoverRange = mouseEvent.target.range;
				this.showHoverScheduler.schedule();
			}
		} else if (!this.mouseDown) {
			// Do not hide debug hover when the mouse is pressed because it usually leads to accidental closing #64620
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

	// breakpoint widget
	public showBreakpointWidget(lineNumber: number, column: number, context?: BreakpointWidgetContext): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
		}

		this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber, context);
		this.breakpointWidget.show({ lineNumber, column: 1 }, 2);
		this.breakpointWidgetVisible.set(true);
	}

	public closeBreakpointWidget(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
			this.breakpointWidget = undefined;
			this.breakpointWidgetVisible.reset();
			this.editor.focus();
		}
	}

	// exception widget
	private toggleExceptionWidget(): void {
		// Toggles exception widget based on the state of the current editor model and debug stack frame
		const model = this.editor.getModel();
		const focusedSf = this.debugService.getViewModel().focusedStackFrame;
		const callStack = focusedSf ? focusedSf.thread.getCallStack() : null;
		if (!model || !focusedSf || !callStack || callStack.length === 0) {
			this.closeExceptionWidget();
			return;
		}

		// First call stack frame that is available is the frame where exception has been thrown
		const exceptionSf = first(callStack, sf => !!(sf && sf.source && sf.source.available && sf.source.presentationHint !== 'deemphasize'), undefined);
		if (!exceptionSf || exceptionSf !== focusedSf) {
			this.closeExceptionWidget();
			return;
		}

		const sameUri = exceptionSf.source.uri.toString() === model.uri.toString();
		if (this.exceptionWidget && !sameUri) {
			this.closeExceptionWidget();
		} else if (sameUri) {
			focusedSf.thread.exceptionInfo.then(exceptionInfo => {
				if (exceptionInfo && exceptionSf.range.startLineNumber && exceptionSf.range.startColumn) {
					this.showExceptionWidget(exceptionInfo, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
				}
			});
		}
	}

	private showExceptionWidget(exceptionInfo: IExceptionInfo, lineNumber: number, column: number): void {
		if (this.exceptionWidget) {
			this.exceptionWidget.dispose();
		}

		this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo);
		this.exceptionWidget.show({ lineNumber, column }, 0);
		this.editor.revealLine(lineNumber);
	}

	private closeExceptionWidget(): void {
		if (this.exceptionWidget) {
			this.exceptionWidget.dispose();
			this.exceptionWidget = undefined;
		}
	}

	// configuration widget
	private updateConfigurationWidgetVisibility(): void {
		const model = this.editor.getModel();
		if (this.configurationWidget) {
			this.configurationWidget.dispose();
		}
		if (model && LAUNCH_JSON_REGEX.test(model.uri.toString()) && !this.editor.getConfiguration().readOnly) {
			this.configurationWidget = this.instantiationService.createInstance(FloatingClickWidget, this.editor, nls.localize('addConfiguration', "Add Configuration..."), null);
			this.configurationWidget.render();
			this.toDispose.push(this.configurationWidget.onClick(() => this.addLaunchConfiguration()));
		}
	}

	public addLaunchConfiguration(): Promise<any> {
		/* __GDPR__
			"debug/addLaunchConfiguration" : {}
		*/
		this.telemetryService.publicLog('debug/addLaunchConfiguration');
		let configurationsArrayPosition: Position | undefined;
		const model = this.editor.getModel();
		if (!model) {
			return Promise.resolve();
		}

		let depthInArray = 0;
		let lastProperty: string;

		visit(model.getValue(), {
			onObjectProperty: (property, offset, length) => {
				lastProperty = property;
			},
			onArrayBegin: (offset: number, length: number) => {
				if (lastProperty === 'configurations' && depthInArray === 0) {
					configurationsArrayPosition = model.getPositionAt(offset + 1);
				}
				depthInArray++;
			},
			onArrayEnd: () => {
				depthInArray--;
			}
		});

		this.editor.focus();
		if (!configurationsArrayPosition) {
			return Promise.resolve();
		}

		const insertLine = (position: Position): Promise<any> => {
			// Check if there are more characters on a line after a "configurations": [, if yes enter a newline
			if (model.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
				this.editor.setPosition(position);
				CoreEditingCommands.LineBreakInsert.runEditorCommand(null, this.editor, null);
			}
			this.editor.setPosition(position);
			return this.commandService.executeCommand('editor.action.insertLineAfter');
		};

		return insertLine(configurationsArrayPosition).then(() => this.commandService.executeCommand('editor.action.triggerSuggest'));
	}

	private static BREAKPOINT_HELPER_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-hint',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	// Inline Decorations

	@memoize
	private get removeInlineValuesScheduler(): RunOnceScheduler {
		return new RunOnceScheduler(
			() => this.editor.removeDecorations(INLINE_VALUE_DECORATION_KEY),
			100
		);
	}

	@memoize
	private get updateInlineValuesScheduler(): RunOnceScheduler {
		return new RunOnceScheduler(
			() => this.updateInlineValueDecorations(this.debugService.getViewModel().focusedStackFrame),
			200
		);
	}

	private updateInlineValueDecorations(stackFrame: IStackFrame | undefined): void {
		const model = this.editor.getModel();
		if (!this.configurationService.getValue<IDebugConfiguration>('debug').inlineValues ||
			!model || !stackFrame || model.uri.toString() !== stackFrame.source.uri.toString()) {
			if (!this.removeInlineValuesScheduler.isScheduled()) {
				this.removeInlineValuesScheduler.schedule();
			}
			return;
		}

		this.removeInlineValuesScheduler.cancel();

		stackFrame.getMostSpecificScopes(stackFrame.range)
			// Get all top level children in the scope chain
			.then(scopes => Promise.all(scopes.map(scope => scope.getChildren()
				.then(children => {
					let range = new Range(0, 0, stackFrame.range.startLineNumber, stackFrame.range.startColumn);
					if (scope.range) {
						range = range.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
					}

					return this.createInlineValueDecorationsInsideRange(children, range, model);
				}))).then(decorationsPerScope => {
					const allDecorations = decorationsPerScope.reduce((previous, current) => previous.concat(current), []);
					this.editor.setDecorations(INLINE_VALUE_DECORATION_KEY, allDecorations);
				}));
	}

	private createInlineValueDecorationsInsideRange(expressions: ReadonlyArray<IExpression>, range: Range, model: ITextModel): IDecorationOptions[] {
		const nameValueMap = new Map<string, string>();
		for (let expr of expressions) {
			nameValueMap.set(expr.name, expr.value);
			// Limit the size of map. Too large can have a perf impact
			if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
				break;
			}
		}

		const lineToNamesMap: Map<number, string[]> = new Map<number, string[]>();
		const wordToPositionsMap = this.getWordToPositionsMap();

		// Compute unique set of names on each line
		nameValueMap.forEach((value, name) => {
			const positions = wordToPositionsMap.get(name);
			if (positions) {
				for (let position of positions) {
					if (range.containsPosition(position)) {
						if (!lineToNamesMap.has(position.lineNumber)) {
							lineToNamesMap.set(position.lineNumber, []);
						}

						if (lineToNamesMap.get(position.lineNumber)!.indexOf(name) === -1) {
							lineToNamesMap.get(position.lineNumber)!.push(name);
						}
					}
				}
			}
		});

		const decorations: IDecorationOptions[] = [];
		// Compute decorators for each line
		lineToNamesMap.forEach((names, line) => {
			const contentText = names.sort((first, second) => {
				const content = model.getLineContent(line);
				return content.indexOf(first) - content.indexOf(second);
			}).map(name => `${name} = ${nameValueMap.get(name)}`).join(', ');
			decorations.push(this.createInlineValueDecoration(line, contentText));
		});

		return decorations;
	}

	private createInlineValueDecoration(lineNumber: number, contentText: string): IDecorationOptions {
		// If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
		if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
			contentText = contentText.substr(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
		}

		return {
			range: {
				startLineNumber: lineNumber,
				endLineNumber: lineNumber,
				startColumn: Constants.MAX_SAFE_SMALL_INTEGER,
				endColumn: Constants.MAX_SAFE_SMALL_INTEGER
			},
			renderOptions: {
				after: {
					contentText,
					backgroundColor: 'rgba(255, 200, 0, 0.2)',
					margin: '10px'
				},
				dark: {
					after: {
						color: 'rgba(255, 255, 255, 0.5)',
					}
				},
				light: {
					after: {
						color: 'rgba(0, 0, 0, 0.5)',
					}
				}
			}
		};
	}

	private getWordToPositionsMap(): Map<string, Position[]> {
		if (!this.wordToLineNumbersMap) {
			this.wordToLineNumbersMap = new Map<string, Position[]>();
			const model = this.editor.getModel();
			if (!model) {
				return this.wordToLineNumbersMap;
			}

			// For every word in every line, map its ranges for fast lookup
			for (let lineNumber = 1, len = model.getLineCount(); lineNumber <= len; ++lineNumber) {
				const lineContent = model.getLineContent(lineNumber);

				// If line is too long then skip the line
				if (lineContent.length > MAX_TOKENIZATION_LINE_LEN) {
					continue;
				}

				model.forceTokenization(lineNumber);
				const lineTokens = model.getLineTokens(lineNumber);
				for (let tokenIndex = 0, tokenCount = lineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
					const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
					const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);
					const tokenType = lineTokens.getStandardTokenType(tokenIndex);
					const tokenStr = lineContent.substring(tokenStartOffset, tokenEndOffset);

					// Token is a word and not a comment
					if (tokenType === StandardTokenType.Other) {
						DEFAULT_WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match
						const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);

						if (wordMatch) {
							const word = wordMatch[0];
							if (!this.wordToLineNumbersMap.has(word)) {
								this.wordToLineNumbersMap.set(word, []);
							}

							this.wordToLineNumbersMap.get(word)!.push(new Position(lineNumber, tokenStartOffset));
						}
					}
				}
			}
		}

		return this.wordToLineNumbersMap;
	}

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

registerEditorContribution(DebugEditorContribution);
