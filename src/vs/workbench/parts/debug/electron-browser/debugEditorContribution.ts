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
import { Constants } from 'vs/editor/common/core/uint';
import { IAction, Action } from 'vs/base/common/actions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardTokenType } from 'vs/editor/common/modes';
import { DEFAULT_WORD_REGEXP } from 'vs/editor/common/model/wordHelper';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IDecorationOptions, IModelDecorationOptions, MouseTargetType, IModelDeltaDecoration, TrackedRangeStickiness, IPosition } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DebugHoverWidget } from 'vs/workbench/parts/debug/electron-browser/debugHover';
import { RemoveBreakpointAction, EditConditionalBreakpointAction, EnableBreakpointAction, DisableBreakpointAction, AddConditionalBreakpointAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IDebugEditorContribution, IDebugService, State, IBreakpoint, EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, IStackFrame, IDebugConfiguration, IExpression } from 'vs/workbench/parts/debug/common/debug';
import { BreakpointWidget } from 'vs/workbench/parts/debug/browser/breakpointWidget';
import { FloatingClickWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';

const HOVER_DELAY = 300;
const LAUNCH_JSON_REGEX = /launch\.json$/;
const REMOVE_INLINE_VALUES_DELAY = 100;
const INLINE_VALUE_DECORATION_KEY = 'inlinevaluedecoration';
const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped

@editorContribution
export class DebugEditorContribution implements IDebugEditorContribution {

	private toDispose: lifecycle.IDisposable[];
	private hoverWidget: DebugHoverWidget;
	private showHoverScheduler: RunOnceScheduler;
	private hideHoverScheduler: RunOnceScheduler;
	private removeInlineValuesScheduler: RunOnceScheduler;
	private hoverRange: Range;

	private breakpointHintDecoration: string[];
	private breakpointWidget: BreakpointWidget;
	private breakpointWidgetVisible: IContextKey<boolean>;
	private wordToLineNumbersMap: Map<string, IPosition[]>;

	private configurationWidget: FloatingClickWidget;

	constructor(
		private editor: ICodeEditor,
		@IDebugService private debugService: IDebugService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private commandService: ICommandService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.breakpointHintDecoration = [];
		this.hoverWidget = new DebugHoverWidget(this.editor, this.debugService, this.instantiationService);
		this.toDispose = [];
		this.showHoverScheduler = new RunOnceScheduler(() => this.showHover(this.hoverRange, false), HOVER_DELAY);
		this.hideHoverScheduler = new RunOnceScheduler(() => this.hoverWidget.hide(), HOVER_DELAY);
		this.removeInlineValuesScheduler = new RunOnceScheduler(() => this.editor.removeDecorations(INLINE_VALUE_DECORATION_KEY), REMOVE_INLINE_VALUES_DELAY);
		this.registerListeners();
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.updateConfigurationWidgetVisibility();
		this.codeEditorService.registerDecorationType(INLINE_VALUE_DECORATION_KEY, {});
	}

	private getContextMenuActions(breakpoint: IBreakpoint, uri: uri, lineNumber: number): TPromise<IAction[]> {
		const actions: IAction[] = [];
		if (breakpoint) {
			actions.push(this.instantiationService.createInstance(RemoveBreakpointAction, RemoveBreakpointAction.ID, RemoveBreakpointAction.LABEL));
			actions.push(this.instantiationService.createInstance(EditConditionalBreakpointAction, EditConditionalBreakpointAction.ID, EditConditionalBreakpointAction.LABEL, this.editor, lineNumber));
			if (breakpoint.enabled) {
				actions.push(this.instantiationService.createInstance(DisableBreakpointAction, DisableBreakpointAction.ID, DisableBreakpointAction.LABEL));
			} else {
				actions.push(this.instantiationService.createInstance(EnableBreakpointAction, EnableBreakpointAction.ID, EnableBreakpointAction.LABEL));
			}
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
				const breakpoints = this.debugService.getModel().getBreakpoints()
					.filter(bp => bp.uri.toString() === uri.toString() && bp.lineNumber === lineNumber);

				if (breakpoints.length) {
					breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
				} else if (canSetBreakpoints) {
					this.debugService.addBreakpoints(uri, [{ lineNumber }]);
				}
			}
		}));

		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => {
			let showBreakpointHintAtLineNumber = -1;
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
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame((sf) => this.onFocusStackFrame(sf)));

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
		this.toDispose.push(this.editor.onDidChangeModelContent(() => {
			this.wordToLineNumbersMap = null;
		}));
		this.toDispose.push(this.editor.onDidChangeModel(() => {
			const sf = this.debugService.getViewModel().focusedStackFrame;
			const model = this.editor.getModel();
			this.editor.updateOptions({ hover: !sf || !model || model.uri.toString() !== sf.source.uri.toString() });
			this.closeBreakpointWidget();
			this.hideHoverWidget();
			this.updateConfigurationWidgetVisibility();
			this.wordToLineNumbersMap = null;
			this.updateInlineDecorations(sf);
		}));
		this.toDispose.push(this.editor.onDidScrollChange(() => this.hideHoverWidget));
	}

	public getId(): string {
		return EDITOR_CONTRIBUTION_ID;
	}

	public showHover(range: Range, focus: boolean): TPromise<void> {
		const sf = this.debugService.getViewModel().focusedStackFrame;
		const model = this.editor.getModel();
		if (sf && model && sf.source.uri.toString() === model.uri.toString()) {
			return this.hoverWidget.showAt(range, focus);
		}
		return undefined;
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

	private onFocusStackFrame(sf: IStackFrame): void {
		const model = this.editor.getModel();
		if (model && sf && sf.source.uri.toString() === model.uri.toString()) {
			this.editor.updateOptions({ hover: false });
		} else {
			this.editor.updateOptions({ hover: true });
			this.hideHoverWidget();
		}

		this.updateInlineDecorations(sf);
	}

	private hideHoverWidget(): void {
		if (!this.hideHoverScheduler.isScheduled() && this.hoverWidget.isVisible()) {
			this.hideHoverScheduler.schedule();
		}
		this.showHoverScheduler.cancel();
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
			if (!mouseEvent.target.range.equalsRange(this.hoverRange)) {
				this.hoverRange = mouseEvent.target.range;
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
			this.configurationWidget = this.instantiationService.createInstance(FloatingClickWidget, this.editor, nls.localize('addConfiguration', "Add Configuration..."), null);
			this.configurationWidget.render();
			this.toDispose.push(this.configurationWidget.onClick(() => this.addLaunchConfiguration().done(undefined, errors.onUnexpectedError)));
		} else if (this.configurationWidget) {
			this.configurationWidget.dispose();
		}
	}

	public addLaunchConfiguration(): TPromise<any> {
		this.telemetryService.publicLog('debug/addLaunchConfiguration');
		let configurationsPosition: IPosition;
		const model = this.editor.getModel();
		let depthInArray = 0;
		let lastProperty: string;

		visit(model.getValue(), {
			onObjectProperty: (property, offset, length) => {
				lastProperty = property;
			},
			onArrayBegin: (offset: number, length: number) => {
				if (lastProperty === 'configurations' && depthInArray === 0) {
					configurationsPosition = model.getPositionAt(offset);
				}
				depthInArray++;
			},
			onArrayEnd: () => {
				depthInArray--;
			}
		});
		if (!configurationsPosition) {
			return this.commandService.executeCommand('editor.action.triggerSuggest');
		}

		const insertLineAfter = (lineNumber: number): TPromise<any> => {
			if (this.editor.getModel().getLineLastNonWhitespaceColumn(lineNumber + 1) === 0) {
				this.editor.setSelection(new Selection(lineNumber + 1, Number.MAX_VALUE, lineNumber + 1, Number.MAX_VALUE));
				return TPromise.as(null);
			}

			this.editor.setSelection(new Selection(lineNumber, Number.MAX_VALUE, lineNumber, Number.MAX_VALUE));
			return this.commandService.executeCommand('editor.action.insertLineAfter');
		};

		return insertLineAfter(configurationsPosition.lineNumber).then(() => this.commandService.executeCommand('editor.action.triggerSuggest'));
	}

	private static BREAKPOINT_HELPER_DECORATION: IModelDecorationOptions = {
		glyphMarginClassName: 'debug-breakpoint-hint-glyph',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	};

	// Inline Decorations
	private updateInlineDecorations(stackFrame: IStackFrame): void {
		const model = this.editor.getModel();
		if (!this.configurationService.getConfiguration<IDebugConfiguration>('debug').inlineValues ||
			!model || !stackFrame || model.uri.toString() !== stackFrame.source.uri.toString()) {
			if (!this.removeInlineValuesScheduler.isScheduled()) {
				this.removeInlineValuesScheduler.schedule();
			}
			return;
		}

		this.removeInlineValuesScheduler.cancel();

		stackFrame.getMostSpecificScopes(new Range(stackFrame.lineNumber, stackFrame.column, stackFrame.lineNumber, stackFrame.column))
			// Get all top level children in the scope chain
			.then(scopes => TPromise.join(scopes.map(scope => scope.getChildren()
				.then(children => {
					let range = new Range(0, 0, stackFrame.lineNumber, stackFrame.column);
					if (scope.range) {
						range = range.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
					}

					return this.createInlineValueDecorationsInsideRange(children, range);
				}))).then(decorationsPerScope => {
					const allDecorations = decorationsPerScope.reduce((previous, current) => previous.concat(current), []);
					this.editor.setDecorations(INLINE_VALUE_DECORATION_KEY, allDecorations);
				}));
	}

	private createInlineValueDecorationsInsideRange(expressions: IExpression[], range: Range): IDecorationOptions[] {
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
			if (wordToPositionsMap.has(name)) {
				for (let position of wordToPositionsMap.get(name)) {
					if (range.containsPosition(position)) {
						if (!lineToNamesMap.has(position.lineNumber)) {
							lineToNamesMap.set(position.lineNumber, []);
						}

						if (lineToNamesMap.get(position.lineNumber).indexOf(name) === -1) {
							lineToNamesMap.get(position.lineNumber).push(name);
						}
					}
				}
			}
		});

		const decorations: IDecorationOptions[] = [];
		// Compute decorators for each line
		lineToNamesMap.forEach((names, line) => {
			const contentText = names.map(name => `${name} = ${nameValueMap.get(name)}`).join(', ');
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

	private getWordToPositionsMap(): Map<string, IPosition[]> {
		if (!this.wordToLineNumbersMap) {
			this.wordToLineNumbersMap = new Map<string, IPosition[]>();
			const model = this.editor.getModel();
			// For every word in every line, map its ranges for fast lookup
			for (let lineNumber = 1, len = model.getLineCount(); lineNumber <= len; ++lineNumber) {
				const lineContent = model.getLineContent(lineNumber);

				// If line is too long then skip the line
				if (lineContent.length > MAX_TOKENIZATION_LINE_LEN) {
					continue;
				}

				const lineTokens = model.getLineTokens(lineNumber);
				for (let token = lineTokens.firstToken(); !!token; token = token.next()) {
					const tokenStr = lineContent.substring(token.startOffset, token.endOffset);

					// Token is a word and not a comment
					if (token.tokenType === StandardTokenType.Other) {
						DEFAULT_WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match
						const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);

						if (wordMatch) {
							const word = wordMatch[0];
							if (!this.wordToLineNumbersMap.has(word)) {
								this.wordToLineNumbersMap.set(word, []);
							}

							this.wordToLineNumbersMap.get(word).push({ lineNumber, column: token.startOffset });
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
