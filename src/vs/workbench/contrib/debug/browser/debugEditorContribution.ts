/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, isKeyboardEvent } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { distinct } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { memoize } from 'vs/base/common/decorators';
import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { visit } from 'vs/base/common/json';
import { setProperty } from 'vs/base/common/jsonEdit';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable, MutableDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { basename } from 'vs/base/common/path';
import * as env from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { assertType, isDefined } from 'vs/base/common/types';
import { Constants } from 'vs/base/common/uint';
import { URI } from 'vs/base/common/uri';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { ICodeEditor, IEditorMouseEvent, IPartialEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { EditorOption, IEditorHoverOptions } from 'vs/editor/common/config/editorOptions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { DEFAULT_WORD_REGEXP } from 'vs/editor/common/core/wordHelper';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { InlineValue, InlineValueContext } from 'vs/editor/common/languages';
import { IModelDeltaDecoration, ITextModel, InjectedTextCursorStops } from 'vs/editor/common/model';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { HoverController } from 'vs/editor/contrib/hover/browser/hoverController';
import { HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import * as nls from 'vs/nls';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { FloatingEditorClickWidget } from 'vs/workbench/browser/codeeditor';
import { DebugHoverWidget, ShowDebugHoverResult } from 'vs/workbench/contrib/debug/browser/debugHover';
import { ExceptionWidget } from 'vs/workbench/contrib/debug/browser/exceptionWidget';
import { CONTEXT_EXCEPTION_WIDGET_VISIBLE, IDebugConfiguration, IDebugEditorContribution, IDebugService, IDebugSession, IExceptionInfo, IExpression, IStackFrame, State } from 'vs/workbench/contrib/debug/common/debug';
import { Expression } from 'vs/workbench/contrib/debug/common/debugModel';
import { IHostService } from 'vs/workbench/services/host/browser/host';

const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped

const DEAFULT_INLINE_DEBOUNCE_DELAY = 200;

export const debugInlineForeground = registerColor('editor.inlineValuesForeground', {
	dark: '#ffffff80',
	light: '#00000080',
	hcDark: '#ffffff80',
	hcLight: '#00000080'
}, nls.localize('editor.inlineValuesForeground', "Color for the debug inline value text."));

export const debugInlineBackground = registerColor('editor.inlineValuesBackground', {
	dark: '#ffc80033',
	light: '#ffc80033',
	hcDark: '#ffc80033',
	hcLight: '#ffc80033'
}, nls.localize('editor.inlineValuesBackground', "Color for the debug inline value background."));

class InlineSegment {
	constructor(public column: number, public text: string) {
	}
}

function createInlineValueDecoration(lineNumber: number, contentText: string, column = Constants.MAX_SAFE_SMALL_INTEGER): IModelDeltaDecoration[] {
	// If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
	if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
		contentText = contentText.substring(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
	}

	return [
		{
			range: {
				startLineNumber: lineNumber,
				endLineNumber: lineNumber,
				startColumn: column,
				endColumn: column
			},
			options: {
				description: 'debug-inline-value-decoration-spacer',
				after: {
					content: strings.noBreakWhitespace,
					cursorStops: InjectedTextCursorStops.None
				},
				showIfCollapsed: true,
			}
		},
		{
			range: {
				startLineNumber: lineNumber,
				endLineNumber: lineNumber,
				startColumn: column,
				endColumn: column
			},
			options: {
				description: 'debug-inline-value-decoration',
				after: {
					content: replaceWsWithNoBreakWs(contentText),
					inlineClassName: 'debug-inline-value',
					inlineClassNameAffectsLetterSpacing: true,
					cursorStops: InjectedTextCursorStops.None
				},
				showIfCollapsed: true,
			}
		},
	];
}

function replaceWsWithNoBreakWs(str: string): string {
	return str.replace(/[ \t]/g, strings.noBreakWhitespace);
}

function createInlineValueDecorationsInsideRange(expressions: ReadonlyArray<IExpression>, ranges: Range[], model: ITextModel, wordToLineNumbersMap: Map<string, number[]>): IModelDeltaDecoration[] {
	const nameValueMap = new Map<string, string>();
	for (const expr of expressions) {
		nameValueMap.set(expr.name, expr.value);
		// Limit the size of map. Too large can have a perf impact
		if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
			break;
		}
	}

	const lineToNamesMap: Map<number, string[]> = new Map<number, string[]>();

	// Compute unique set of names on each line
	nameValueMap.forEach((_value, name) => {
		const lineNumbers = wordToLineNumbersMap.get(name);
		if (lineNumbers) {
			for (const lineNumber of lineNumbers) {
				if (ranges.some(r => lineNumber >= r.startLineNumber && lineNumber <= r.endLineNumber)) {
					if (!lineToNamesMap.has(lineNumber)) {
						lineToNamesMap.set(lineNumber, []);
					}

					if (lineToNamesMap.get(lineNumber)!.indexOf(name) === -1) {
						lineToNamesMap.get(lineNumber)!.push(name);
					}
				}
			}
		}
	});

	const decorations: IModelDeltaDecoration[] = [];
	// Compute decorators for each line
	lineToNamesMap.forEach((names, line) => {
		const contentText = names.sort((first, second) => {
			const content = model.getLineContent(line);
			return content.indexOf(first) - content.indexOf(second);
		}).map(name => `${name} = ${nameValueMap.get(name)}`).join(', ');
		decorations.push(...createInlineValueDecoration(line, contentText));
	});

	return decorations;
}

function getWordToLineNumbersMap(model: ITextModel, lineNumber: number, result: Map<string, number[]>) {
	const lineLength = model.getLineLength(lineNumber);
	// If line is too long then skip the line
	if (lineLength > MAX_TOKENIZATION_LINE_LEN) {
		return;
	}

	const lineContent = model.getLineContent(lineNumber);
	model.tokenization.forceTokenization(lineNumber);
	const lineTokens = model.tokenization.getLineTokens(lineNumber);
	for (let tokenIndex = 0, tokenCount = lineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
		const tokenType = lineTokens.getStandardTokenType(tokenIndex);

		// Token is a word and not a comment
		if (tokenType === StandardTokenType.Other) {
			DEFAULT_WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match

			const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
			const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);
			const tokenStr = lineContent.substring(tokenStartOffset, tokenEndOffset);
			const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);

			if (wordMatch) {

				const word = wordMatch[0];
				if (!result.has(word)) {
					result.set(word, []);
				}

				result.get(word)!.push(lineNumber);
			}
		}
	}
}

export class DebugEditorContribution implements IDebugEditorContribution {

	private toDispose: IDisposable[];
	private hoverWidget: DebugHoverWidget;
	private hoverPosition: Position | null = null;
	private mouseDown = false;
	private exceptionWidgetVisible: IContextKey<boolean>;
	private gutterIsHovered = false;

	private exceptionWidget: ExceptionWidget | undefined;
	private configurationWidget: FloatingEditorClickWidget | undefined;
	private readonly altListener = new MutableDisposable();
	private altPressed = false;
	private oldDecorations = this.editor.createDecorationsCollection();
	private readonly displayedStore = new DisposableStore();
	private editorHoverOptions: IEditorHoverOptions | undefined;
	private readonly debounceInfo: IFeatureDebounceInformation;

	// Holds a Disposable that prevents the default editor hover behavior while it exists.
	private readonly defaultHoverLockout = new MutableDisposable();

	constructor(
		private editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHostService private readonly hostService: IHostService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService featureDebounceService: ILanguageFeatureDebounceService
	) {
		this.debounceInfo = featureDebounceService.for(languageFeaturesService.inlineValuesProvider, 'InlineValues', { min: DEAFULT_INLINE_DEBOUNCE_DELAY });
		this.hoverWidget = this.instantiationService.createInstance(DebugHoverWidget, this.editor);
		this.toDispose = [this.defaultHoverLockout, this.altListener, this.displayedStore];
		this.registerListeners();
		this.exceptionWidgetVisible = CONTEXT_EXCEPTION_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.toggleExceptionWidget();
	}

	private registerListeners(): void {
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(e => this.onFocusStackFrame(e.stackFrame)));

		// hover listeners & hover widget
		this.toDispose.push(this.editor.onMouseDown((e: IEditorMouseEvent) => this.onEditorMouseDown(e)));
		this.toDispose.push(this.editor.onMouseUp(() => this.mouseDown = false));
		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => this.onEditorMouseMove(e)));
		this.toDispose.push(this.editor.onMouseLeave((e: IPartialEditorMouseEvent) => {
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
			this._wordToLineNumbersMap = undefined;
			this.updateInlineValuesScheduler.schedule();
		}));
		this.toDispose.push(this.debugService.getViewModel().onWillUpdateViews(() => this.updateInlineValuesScheduler.schedule()));
		this.toDispose.push(this.debugService.getViewModel().onDidEvaluateLazyExpression(() => this.updateInlineValuesScheduler.schedule()));
		this.toDispose.push(this.editor.onDidChangeModel(async () => {
			this.addDocumentListeners();
			this.toggleExceptionWidget();
			this.hideHoverWidget();
			this._wordToLineNumbersMap = undefined;
			const stackFrame = this.debugService.getViewModel().focusedStackFrame;
			await this.updateInlineValueDecorations(stackFrame);
		}));
		this.toDispose.push(this.editor.onDidScrollChange(() => {
			this.hideHoverWidget();

			// Inline value provider should get called on view port change
			const model = this.editor.getModel();
			if (model && this.languageFeaturesService.inlineValuesProvider.has(model)) {
				this.updateInlineValuesScheduler.schedule();
			}
		}));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('editor.hover')) {
				this.updateHoverConfiguration();
			}
		}));
		this.toDispose.push(this.debugService.onDidChangeState((state: State) => {
			if (state !== State.Stopped) {
				this.toggleExceptionWidget();
			}
		}));

		this.updateHoverConfiguration();
	}

	private _wordToLineNumbersMap: WordsToLineNumbersCache | undefined;

	private updateHoverConfiguration(): void {
		const model = this.editor.getModel();
		if (model) {
			this.editorHoverOptions = this.configurationService.getValue<IEditorHoverOptions>('editor.hover', {
				resource: model.uri,
				overrideIdentifier: model.getLanguageId()
			});
		}
	}

	private addDocumentListeners(): void {
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const model = this.editor.getModel();
		if (model) {
			this.applyDocumentListeners(model, stackFrame);
		}
	}

	private applyDocumentListeners(model: ITextModel, stackFrame: IStackFrame | undefined): void {
		if (!stackFrame || !this.uriIdentityService.extUri.isEqual(model.uri, stackFrame.source.uri)) {
			this.altListener.clear();
			return;
		}

		const ownerDocument = this.editor.getContainerDomNode().ownerDocument;

		// When the alt key is pressed show regular editor hover and hide the debug hover #84561
		this.altListener.value = addDisposableListener(ownerDocument, 'keydown', keydownEvent => {
			const standardKeyboardEvent = new StandardKeyboardEvent(keydownEvent);
			if (standardKeyboardEvent.keyCode === KeyCode.Alt) {
				this.altPressed = true;
				const debugHoverWasVisible = this.hoverWidget.isVisible();
				this.hoverWidget.hide();
				this.defaultHoverLockout.clear();

				if (debugHoverWasVisible && this.hoverPosition) {
					// If the debug hover was visible immediately show the editor hover for the alt transition to be smooth
					this.showEditorHover(this.hoverPosition, false);
				}

				const onKeyUp = new DomEmitter(ownerDocument, 'keyup');
				const listener = Event.any<KeyboardEvent | boolean>(this.hostService.onDidChangeFocus, onKeyUp.event)(keyupEvent => {
					let standardKeyboardEvent = undefined;
					if (isKeyboardEvent(keyupEvent)) {
						standardKeyboardEvent = new StandardKeyboardEvent(keyupEvent);
					}
					if (!standardKeyboardEvent || standardKeyboardEvent.keyCode === KeyCode.Alt) {
						this.altPressed = false;
						this.preventDefaultEditorHover();
						listener.dispose();
						onKeyUp.dispose();
					}
				});
			}
		});
	}

	async showHover(position: Position, focus: boolean): Promise<void> {
		// normally will already be set in `showHoverScheduler`, but public callers may hit this directly:
		this.preventDefaultEditorHover();

		const sf = this.debugService.getViewModel().focusedStackFrame;
		const model = this.editor.getModel();
		if (sf && model && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
			const result = await this.hoverWidget.showAt(position, focus);
			if (result === ShowDebugHoverResult.NOT_AVAILABLE) {
				// When no expression available fallback to editor hover
				this.showEditorHover(position, focus);
			}
		} else {
			this.showEditorHover(position, focus);
		}
	}

	private preventDefaultEditorHover() {
		if (this.defaultHoverLockout.value || this.editorHoverOptions?.enabled === false) {
			return;
		}

		const hoverController = this.editor.getContribution<HoverController>(HoverController.ID);
		hoverController?.hideContentHover();

		this.editor.updateOptions({ hover: { enabled: false } });
		this.defaultHoverLockout.value = {
			dispose: () => {
				this.editor.updateOptions({
					hover: { enabled: this.editorHoverOptions?.enabled ?? true }
				});
			}
		};
	}

	private showEditorHover(position: Position, focus: boolean) {
		const hoverController = this.editor.getContribution<HoverController>(HoverController.ID);
		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		// enable the editor hover, otherwise the content controller will see it
		// as disabled and hide it on the first mouse move (#193149)
		this.defaultHoverLockout.clear();
		hoverController?.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, focus);
	}

	private async onFocusStackFrame(sf: IStackFrame | undefined): Promise<void> {
		const model = this.editor.getModel();
		if (model) {
			this.applyDocumentListeners(model, sf);
			if (sf && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
				await this.toggleExceptionWidget();
			} else {
				this.hideHoverWidget();
			}
		}

		await this.updateInlineValueDecorations(sf);
	}

	private get hoverDelay() {
		const baseDelay = this.editorHoverOptions?.delay || 0;

		// heuristic to get a 'good' but configurable delay for evaluation. The
		// debug hover can be very large, so we tend to be more conservative about
		// when to show it (#180621). With this equation:
		// - default 300ms hover => * 2   = 600ms
		// - short   100ms hover => * 2   = 200ms
		// - longer  600ms hover => * 1.5 = 900ms
		// - long   1000ms hover => * 1.0 = 1000ms
		const delayFactor = clamp(2 - (baseDelay - 300) / 600, 1, 2);

		return baseDelay * delayFactor;
	}

	@memoize
	private get showHoverScheduler() {
		const scheduler = new RunOnceScheduler(() => {
			if (this.hoverPosition && !this.altPressed) {
				this.showHover(this.hoverPosition, false);
			}
		}, this.hoverDelay);
		this.toDispose.push(scheduler);

		return scheduler;
	}

	private hideHoverWidget(): void {
		if (this.hoverWidget.willBeVisible()) {
			this.hoverWidget.hide();
		}
		this.showHoverScheduler.cancel();
		this.defaultHoverLockout.clear();
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

		const target = mouseEvent.target;
		const stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';

		if (!this.altPressed) {
			if (target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
				this.defaultHoverLockout.clear();
				this.gutterIsHovered = true;
			} else if (this.gutterIsHovered) {
				this.gutterIsHovered = false;
				this.updateHoverConfiguration();
			}
		}

		if (target.type === MouseTargetType.CONTENT_WIDGET && target.detail === DebugHoverWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of debug hover widget

			const sticky = this.editorHoverOptions?.sticky ?? true;
			if (sticky || this.hoverWidget.isShowingComplexValue) {
				return;
			}
		}

		if (target.type === MouseTargetType.CONTENT_TEXT) {
			if (target.position && !Position.equals(target.position, this.hoverPosition)) {
				this.hoverPosition = target.position;
				// Disable the editor hover during the request to avoid flickering
				this.preventDefaultEditorHover();
				this.showHoverScheduler.schedule(this.hoverDelay);
			}
		} else if (!this.mouseDown) {
			// Do not hide debug hover when the mouse is pressed because it usually leads to accidental closing #64620
			this.hideHoverWidget();
		}
	}

	private onKeyDown(e: IKeyboardEvent): void {
		const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
		if (e.keyCode !== stopKey && e.keyCode !== KeyCode.Alt) {
			// do not hide hover when Ctrl/Meta is pressed, and alt is handled separately
			this.hideHoverWidget();
		}
	}
	// end hover business

	// exception widget
	private async toggleExceptionWidget(): Promise<void> {
		// Toggles exception widget based on the state of the current editor model and debug stack frame
		const model = this.editor.getModel();
		const focusedSf = this.debugService.getViewModel().focusedStackFrame;
		const callStack = focusedSf ? focusedSf.thread.getCallStack() : null;
		if (!model || !focusedSf || !callStack || callStack.length === 0) {
			this.closeExceptionWidget();
			return;
		}

		// First call stack frame that is available is the frame where exception has been thrown
		const exceptionSf = callStack.find(sf => !!(sf && sf.source && sf.source.available && sf.source.presentationHint !== 'deemphasize'));
		if (!exceptionSf || exceptionSf !== focusedSf) {
			this.closeExceptionWidget();
			return;
		}

		const sameUri = this.uriIdentityService.extUri.isEqual(exceptionSf.source.uri, model.uri);
		if (this.exceptionWidget && !sameUri) {
			this.closeExceptionWidget();
		} else if (sameUri) {
			const exceptionInfo = await focusedSf.thread.exceptionInfo;
			if (exceptionInfo) {
				this.showExceptionWidget(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
			}
		}
	}

	private showExceptionWidget(exceptionInfo: IExceptionInfo, debugSession: IDebugSession | undefined, lineNumber: number, column: number): void {
		if (this.exceptionWidget) {
			this.exceptionWidget.dispose();
		}

		this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession);
		this.exceptionWidget.show({ lineNumber, column }, 0);
		this.exceptionWidget.focus();
		this.editor.revealRangeInCenter({
			startLineNumber: lineNumber,
			startColumn: column,
			endLineNumber: lineNumber,
			endColumn: column,
		});
		this.exceptionWidgetVisible.set(true);
	}

	closeExceptionWidget(): void {
		if (this.exceptionWidget) {
			const shouldFocusEditor = this.exceptionWidget.hasFocus();
			this.exceptionWidget.dispose();
			this.exceptionWidget = undefined;
			this.exceptionWidgetVisible.set(false);
			if (shouldFocusEditor) {
				this.editor.focus();
			}
		}
	}

	async addLaunchConfiguration(): Promise<any> {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		let configurationsArrayPosition: Position | undefined;
		let lastProperty: string;

		const getConfigurationPosition = () => {
			let depthInArray = 0;
			visit(model.getValue(), {
				onObjectProperty: (property: string) => {
					lastProperty = property;
				},
				onArrayBegin: (offset: number) => {
					if (lastProperty === 'configurations' && depthInArray === 0) {
						configurationsArrayPosition = model.getPositionAt(offset + 1);
					}
					depthInArray++;
				},
				onArrayEnd: () => {
					depthInArray--;
				}
			});
		};

		getConfigurationPosition();

		if (!configurationsArrayPosition) {
			// "configurations" array doesn't exist. Add it here.
			const { tabSize, insertSpaces } = model.getOptions();
			const eol = model.getEOL();
			const edit = (basename(model.uri.fsPath) === 'launch.json') ?
				setProperty(model.getValue(), ['configurations'], [], { tabSize, insertSpaces, eol })[0] :
				setProperty(model.getValue(), ['launch'], { 'configurations': [] }, { tabSize, insertSpaces, eol })[0];
			const startPosition = model.getPositionAt(edit.offset);
			const lineNumber = startPosition.lineNumber;
			const range = new Range(lineNumber, startPosition.column, lineNumber, model.getLineMaxColumn(lineNumber));
			model.pushEditOperations(null, [EditOperation.replace(range, edit.content)], () => null);
			// Go through the file again since we've edited it
			getConfigurationPosition();
		}
		if (!configurationsArrayPosition) {
			return;
		}

		this.editor.focus();

		const insertLine = (position: Position): Promise<any> => {
			// Check if there are more characters on a line after a "configurations": [, if yes enter a newline
			if (model.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
				this.editor.setPosition(position);
				CoreEditingCommands.LineBreakInsert.runEditorCommand(null, this.editor, null);
			}
			this.editor.setPosition(position);
			return this.commandService.executeCommand('editor.action.insertLineAfter');
		};

		await insertLine(configurationsArrayPosition);
		await this.commandService.executeCommand('editor.action.triggerSuggest');
	}

	// Inline Decorations

	@memoize
	private get removeInlineValuesScheduler(): RunOnceScheduler {
		return new RunOnceScheduler(
			() => {
				this.displayedStore.clear();
				this.oldDecorations.clear();
			},
			100
		);
	}

	@memoize
	private get updateInlineValuesScheduler(): RunOnceScheduler {
		const model = this.editor.getModel();
		return new RunOnceScheduler(
			async () => await this.updateInlineValueDecorations(this.debugService.getViewModel().focusedStackFrame),
			model ? this.debounceInfo.get(model) : DEAFULT_INLINE_DEBOUNCE_DELAY
		);
	}

	private async updateInlineValueDecorations(stackFrame: IStackFrame | undefined): Promise<void> {

		const var_value_format = '{0} = {1}';
		const separator = ', ';

		const model = this.editor.getModel();
		const inlineValuesSetting = this.configurationService.getValue<IDebugConfiguration>('debug').inlineValues;
		const inlineValuesTurnedOn = inlineValuesSetting === true || inlineValuesSetting === 'on' || (inlineValuesSetting === 'auto' && model && this.languageFeaturesService.inlineValuesProvider.has(model));
		if (!inlineValuesTurnedOn || !model || !stackFrame || model.uri.toString() !== stackFrame.source.uri.toString()) {
			if (!this.removeInlineValuesScheduler.isScheduled()) {
				this.removeInlineValuesScheduler.schedule();
			}
			return;
		}

		this.removeInlineValuesScheduler.cancel();
		this.displayedStore.clear();

		const viewRanges = this.editor.getVisibleRangesPlusViewportAboveBelow();
		let allDecorations: IModelDeltaDecoration[];

		const cts = new CancellationTokenSource();
		this.displayedStore.add(toDisposable(() => cts.dispose(true)));

		if (this.languageFeaturesService.inlineValuesProvider.has(model)) {

			const findVariable = async (_key: string, caseSensitiveLookup: boolean): Promise<string | undefined> => {
				const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
				const key = caseSensitiveLookup ? _key : _key.toLowerCase();
				for (const scope of scopes) {
					const variables = await scope.getChildren();
					const found = variables.find(v => caseSensitiveLookup ? (v.name === key) : (v.name.toLowerCase() === key));
					if (found) {
						return found.value;
					}
				}
				return undefined;
			};

			const ctx: InlineValueContext = {
				frameId: stackFrame.frameId,
				stoppedLocation: new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1, stackFrame.range.endLineNumber, stackFrame.range.endColumn + 1)
			};

			const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();

			allDecorations = [];
			const lineDecorations = new Map<number, InlineSegment[]>();

			const promises = providers.flatMap(provider => viewRanges.map(range => Promise.resolve(provider.provideInlineValues(model, range, ctx, cts.token)).then(async (result) => {
				if (result) {
					for (const iv of result) {

						let text: string | undefined = undefined;
						switch (iv.type) {
							case 'text':
								text = iv.text;
								break;
							case 'variable': {
								let va = iv.variableName;
								if (!va) {
									const lineContent = model.getLineContent(iv.range.startLineNumber);
									va = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
								}
								const value = await findVariable(va, iv.caseSensitiveLookup);
								if (value) {
									text = strings.format(var_value_format, va, value);
								}
								break;
							}
							case 'expression': {
								let expr = iv.expression;
								if (!expr) {
									const lineContent = model.getLineContent(iv.range.startLineNumber);
									expr = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
								}
								if (expr) {
									const expression = new Expression(expr);
									await expression.evaluate(stackFrame.thread.session, stackFrame, 'watch', true);
									if (expression.available) {
										text = strings.format(var_value_format, expr, expression.value);
									}
								}
								break;
							}
						}

						if (text) {
							const line = iv.range.startLineNumber;
							let lineSegments = lineDecorations.get(line);
							if (!lineSegments) {
								lineSegments = [];
								lineDecorations.set(line, lineSegments);
							}
							if (!lineSegments.some(iv => iv.text === text)) {	// de-dupe
								lineSegments.push(new InlineSegment(iv.range.startColumn, text));
							}
						}
					}
				}
			}, err => {
				onUnexpectedExternalError(err);
			})));

			const startTime = Date.now();

			await Promise.all(promises);

			// update debounce info
			this.updateInlineValuesScheduler.delay = this.debounceInfo.update(model, Date.now() - startTime);

			// sort line segments and concatenate them into a decoration

			lineDecorations.forEach((segments, line) => {
				if (segments.length > 0) {
					segments = segments.sort((a, b) => a.column - b.column);
					const text = segments.map(s => s.text).join(separator);
					allDecorations.push(...createInlineValueDecoration(line, text));
				}
			});

		} else {
			// old "one-size-fits-all" strategy

			const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
			// Get all top level variables in the scope chain
			const decorationsPerScope = await Promise.all(scopes.map(async scope => {
				const variables = await scope.getChildren();

				let scopeRange = new Range(0, 0, stackFrame.range.startLineNumber, stackFrame.range.startColumn);
				if (scope.range) {
					scopeRange = scopeRange.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
				}

				const ownRanges = viewRanges.map(r => r.intersectRanges(scopeRange)).filter(isDefined);
				this._wordToLineNumbersMap ??= new WordsToLineNumbersCache(model);
				for (const range of ownRanges) {
					this._wordToLineNumbersMap.ensureRangePopulated(range);
				}

				return createInlineValueDecorationsInsideRange(variables, ownRanges, model, this._wordToLineNumbersMap.value);
			}));

			allDecorations = distinct(decorationsPerScope.flat(),
				// Deduplicate decorations since same variable can appear in multiple scopes, leading to duplicated decorations #129770
				decoration => `${decoration.range.startLineNumber}:${decoration?.options.after?.content}`);
		}

		if (cts.token.isCancellationRequested) {
			return;
		}

		// If word wrap is on, application of inline decorations may change the scroll position.
		// Ensure the cursor maintains its vertical position relative to the viewport when
		// we apply decorations.
		let preservePosition: { position: Position; top: number } | undefined;
		if (this.editor.getOption(EditorOption.wordWrap) !== 'off') {
			const position = this.editor.getPosition();
			if (position && this.editor.getVisibleRanges().some(r => r.containsPosition(position))) {
				preservePosition = { position, top: this.editor.getTopForPosition(position.lineNumber, position.column) };
			}
		}

		this.oldDecorations.set(allDecorations);

		if (preservePosition) {
			const top = this.editor.getTopForPosition(preservePosition.position.lineNumber, preservePosition.position.column);
			this.editor.setScrollTop(this.editor.getScrollTop() - (preservePosition.top - top), ScrollType.Immediate);
		}
	}

	dispose(): void {
		if (this.hoverWidget) {
			this.hoverWidget.dispose();
		}
		if (this.configurationWidget) {
			this.configurationWidget.dispose();
		}
		this.toDispose = dispose(this.toDispose);
	}
}

class WordsToLineNumbersCache {
	// we use this as an array of bits where each 1 bit is a line number that's been parsed
	private readonly intervals: Uint8Array;
	public readonly value = new Map<string, number[]>();

	constructor(private readonly model: ITextModel) {
		this.intervals = new Uint8Array(Math.ceil(model.getLineCount() / 8));
	}

	/** Ensures that variables names in the given range have been identified. */
	public ensureRangePopulated(range: Range) {
		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
			const bin = lineNumber >> 3;  /* Math.floor(i / 8) */
			const bit = 1 << (lineNumber & 0b111); /* 1 << (i % 8) */
			if (!(this.intervals[bin] & bit)) {
				getWordToLineNumbersMap(this.model, lineNumber, this.value);
				this.intervals[bin] |= bit;
			}
		}
	}
}


CommandsRegistry.registerCommand(
	'_executeInlineValueProvider',
	async (
		accessor: ServicesAccessor,
		uri: URI,
		iRange: IRange,
		context: InlineValueContext
	): Promise<InlineValue[] | null> => {
		assertType(URI.isUri(uri));
		assertType(Range.isIRange(iRange));

		if (!context || typeof context.frameId !== 'number' || !Range.isIRange(context.stoppedLocation)) {
			throw illegalArgument('context');
		}

		const model = accessor.get(IModelService).getModel(uri);
		if (!model) {
			throw illegalArgument('uri');
		}

		const range = Range.lift(iRange);
		const { inlineValuesProvider } = accessor.get(ILanguageFeaturesService);
		const providers = inlineValuesProvider.ordered(model);
		const providerResults = await Promise.all(providers.map(provider => provider.provideInlineValues(model, range, context, CancellationToken.None)));
		return providerResults.flat().filter(isDefined);
	});
