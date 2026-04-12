/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { addDisposableListener, isKeyboardEvent } from '../../../../base/browser/dom.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { memoize } from '../../../../base/common/decorators.js';
import { illegalArgument, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { visit } from '../../../../base/common/json.js';
import { setProperty } from '../../../../base/common/jsonEdit.js';
import { DisposableStore, MutableDisposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { basename } from '../../../../base/common/path.js';
import * as env from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { assertType, isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { CoreEditingCommands } from '../../../../editor/browser/coreCommands.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { DEFAULT_WORD_REGEXP } from '../../../../editor/common/core/wordHelper.js';
import { InjectedTextCursorStops } from '../../../../editor/common/model.js';
import { ILanguageFeatureDebounceService } from '../../../../editor/common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import * as nls from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DebugHoverWidget } from './debugHover.js';
import { ExceptionWidget } from './exceptionWidget.js';
import { CONTEXT_EXCEPTION_WIDGET_VISIBLE, IDebugService } from '../common/debug.js';
import { Expression } from '../common/debugModel.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { InsertLineAfterAction } from '../../../../editor/contrib/linesOperations/browser/linesOperations.js';
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
export const debugInlineBackground = registerColor('editor.inlineValuesBackground', '#ffc80033', nls.localize('editor.inlineValuesBackground', "Color for the debug inline value background."));
class InlineSegment {
    constructor(column, text) {
        this.column = column;
        this.text = text;
    }
}
export function formatHoverContent(contentText) {
    if (contentText.includes(',') && contentText.includes('=')) {
        // Custom split: for each equals sign after the first, backtrack to the nearest comma
        const customSplit = (text) => {
            const splits = [];
            let equalsFound = 0;
            let start = 0;
            for (let i = 0; i < text.length; i++) {
                if (text[i] === '=') {
                    if (equalsFound === 0) {
                        equalsFound++;
                        continue;
                    }
                    const commaIndex = text.lastIndexOf(',', i);
                    if (commaIndex !== -1 && commaIndex >= start) {
                        splits.push(commaIndex);
                        start = commaIndex + 1;
                    }
                    equalsFound++;
                }
            }
            const result = [];
            let s = 0;
            for (const index of splits) {
                result.push(text.substring(s, index).trim());
                s = index + 1;
            }
            if (s < text.length) {
                result.push(text.substring(s).trim());
            }
            return result;
        };
        const pairs = customSplit(contentText);
        const formattedPairs = pairs.map(pair => {
            const equalsIndex = pair.indexOf('=');
            if (equalsIndex !== -1) {
                const indent = ' '.repeat(equalsIndex + 2);
                const [firstLine, ...restLines] = pair.split(/\r?\n/);
                return [firstLine, ...restLines.map(line => indent + line)].join('\n');
            }
            return pair;
        });
        return new MarkdownString().appendCodeblock('', formattedPairs.join(',\n'));
    }
    return new MarkdownString().appendCodeblock('', contentText);
}
export function createInlineValueDecoration(lineNumber, contentText, classNamePrefix, column = 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */, viewportMaxCol = MAX_INLINE_DECORATOR_LENGTH) {
    const rawText = contentText; // store raw text for hover message
    // Truncate contentText if it exceeds the viewport max column
    if (contentText.length > viewportMaxCol) {
        contentText = contentText.substring(0, viewportMaxCol) + '...';
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
                description: `${classNamePrefix}-inline-value-decoration-spacer`,
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
                description: `${classNamePrefix}-inline-value-decoration`,
                after: {
                    content: replaceWsWithNoBreakWs(contentText),
                    inlineClassName: `${classNamePrefix}-inline-value`,
                    inlineClassNameAffectsLetterSpacing: true,
                    cursorStops: InjectedTextCursorStops.None
                },
                showIfCollapsed: true,
                hoverMessage: formatHoverContent(rawText)
            }
        },
    ];
}
function replaceWsWithNoBreakWs(str) {
    return str.replace(/[ \t\n]/g, strings.noBreakWhitespace);
}
function createInlineValueDecorationsInsideRange(expressions, ranges, model, wordToLineNumbersMap) {
    const nameValueMap = new Map();
    for (const expr of expressions) {
        nameValueMap.set(expr.name, expr.value);
        // Limit the size of map. Too large can have a perf impact
        if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
            break;
        }
    }
    const lineToNamesMap = new Map();
    // Compute unique set of names on each line
    nameValueMap.forEach((_value, name) => {
        const lineNumbers = wordToLineNumbersMap.get(name);
        if (lineNumbers) {
            for (const lineNumber of lineNumbers) {
                if (ranges.some(r => lineNumber >= r.startLineNumber && lineNumber <= r.endLineNumber)) {
                    if (!lineToNamesMap.has(lineNumber)) {
                        lineToNamesMap.set(lineNumber, []);
                    }
                    if (lineToNamesMap.get(lineNumber).indexOf(name) === -1) {
                        lineToNamesMap.get(lineNumber).push(name);
                    }
                }
            }
        }
    });
    // Compute decorators for each line
    return [...lineToNamesMap].map(([line, names]) => ({
        line,
        variables: names.sort((first, second) => {
            const content = model.getLineContent(line);
            return content.indexOf(first) - content.indexOf(second);
        }).map(name => ({ name, value: nameValueMap.get(name) }))
    }));
}
function getWordToLineNumbersMap(model, lineNumber, result) {
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
        if (tokenType === 0 /* StandardTokenType.Other */) {
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
                result.get(word).push(lineNumber);
            }
        }
    }
}
let DebugEditorContribution = class DebugEditorContribution {
    constructor(editor, debugService, instantiationService, commandService, configurationService, hostService, uriIdentityService, contextKeyService, languageFeaturesService, featureDebounceService, editorService) {
        this.editor = editor;
        this.debugService = debugService;
        this.instantiationService = instantiationService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.hostService = hostService;
        this.uriIdentityService = uriIdentityService;
        this.languageFeaturesService = languageFeaturesService;
        this.editorService = editorService;
        this.mouseDown = false;
        this.gutterIsHovered = false;
        this.altListener = new MutableDisposable();
        this.altPressed = false;
        this.displayedStore = new DisposableStore();
        this.allowScrollToExceptionWidget = true;
        this.shouldScrollToExceptionWidget = () => this.allowScrollToExceptionWidget;
        // Holds a Disposable that prevents the default editor hover behavior while it exists.
        this.defaultHoverLockout = new MutableDisposable();
        this.oldDecorations = this.editor.createDecorationsCollection();
        this.debounceInfo = featureDebounceService.for(languageFeaturesService.inlineValuesProvider, 'InlineValues', { min: DEAFULT_INLINE_DEBOUNCE_DELAY });
        this.hoverWidget = this.instantiationService.createInstance(DebugHoverWidget, this.editor);
        this.toDispose = [this.defaultHoverLockout, this.altListener, this.displayedStore];
        this.registerListeners();
        this.exceptionWidgetVisible = CONTEXT_EXCEPTION_WIDGET_VISIBLE.bindTo(contextKeyService);
        this.toggleExceptionWidget();
    }
    registerListeners() {
        this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(e => this.onFocusStackFrame(e.stackFrame)));
        // hover listeners & hover widget
        this.toDispose.push(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
        this.toDispose.push(this.editor.onMouseUp(() => this.mouseDown = false));
        this.toDispose.push(this.editor.onMouseMove((e) => this.onEditorMouseMove(e)));
        this.toDispose.push(this.editor.onMouseLeave((e) => {
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
        this.toDispose.push(this.editor.onKeyDown((e) => this.onKeyDown(e)));
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
        this.toDispose.push(this.debugService.onDidChangeState((state) => {
            if (state !== 2 /* State.Stopped */) {
                this.toggleExceptionWidget();
            }
        }));
        this.updateHoverConfiguration();
    }
    updateHoverConfiguration() {
        const model = this.editor.getModel();
        if (model) {
            this.editorHoverOptions = this.configurationService.getValue('editor.hover', {
                resource: model.uri,
                overrideIdentifier: model.getLanguageId()
            });
        }
    }
    addDocumentListeners() {
        const stackFrame = this.debugService.getViewModel().focusedStackFrame;
        const model = this.editor.getModel();
        if (model) {
            this.applyDocumentListeners(model, stackFrame);
        }
    }
    applyDocumentListeners(model, stackFrame) {
        if (!stackFrame || !this.uriIdentityService.extUri.isEqual(model.uri, stackFrame.source.uri)) {
            this.altListener.clear();
            return;
        }
        const ownerDocument = this.editor.getContainerDomNode().ownerDocument;
        // When the alt key is pressed show regular editor hover and hide the debug hover #84561
        this.altListener.value = addDisposableListener(ownerDocument, 'keydown', keydownEvent => {
            const standardKeyboardEvent = new StandardKeyboardEvent(keydownEvent);
            if (standardKeyboardEvent.keyCode === 6 /* KeyCode.Alt */) {
                this.altPressed = true;
                const debugHoverWasVisible = this.hoverWidget.isVisible();
                this.hoverWidget.hide();
                this.defaultHoverLockout.clear();
                if (debugHoverWasVisible && this.hoverPosition) {
                    // If the debug hover was visible immediately show the editor hover for the alt transition to be smooth
                    this.showEditorHover(this.hoverPosition.position, false);
                }
                const onKeyUp = new DomEmitter(ownerDocument, 'keyup');
                const listener = Event.any(this.hostService.onDidChangeFocus, onKeyUp.event)(keyupEvent => {
                    let standardKeyboardEvent = undefined;
                    if (isKeyboardEvent(keyupEvent)) {
                        standardKeyboardEvent = new StandardKeyboardEvent(keyupEvent);
                    }
                    if (!standardKeyboardEvent || standardKeyboardEvent.keyCode === 6 /* KeyCode.Alt */) {
                        this.altPressed = false;
                        this.preventDefaultEditorHover();
                        listener.dispose();
                        onKeyUp.dispose();
                    }
                });
            }
        });
    }
    async showHover(position, focus, mouseEvent) {
        // normally will already be set in `showHoverScheduler`, but public callers may hit this directly:
        this.preventDefaultEditorHover();
        const sf = this.debugService.getViewModel().focusedStackFrame;
        const model = this.editor.getModel();
        if (sf && model && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
            const result = await this.hoverWidget.showAt(position, focus, mouseEvent);
            if (result === 1 /* ShowDebugHoverResult.NOT_AVAILABLE */) {
                // When no expression available fallback to editor hover
                this.showEditorHover(position, focus);
            }
        }
        else {
            this.showEditorHover(position, focus);
        }
    }
    preventDefaultEditorHover() {
        if (this.defaultHoverLockout.value || this.editorHoverOptions?.enabled === 'off') {
            return;
        }
        const hoverController = this.editor.getContribution(ContentHoverController.ID);
        hoverController?.hideContentHover();
        this.editor.updateOptions({ hover: { enabled: 'off' } });
        this.defaultHoverLockout.value = {
            dispose: () => {
                this.editor.updateOptions({
                    hover: { enabled: this.editorHoverOptions?.enabled ?? 'on' }
                });
            }
        };
    }
    showEditorHover(position, focus) {
        const hoverController = this.editor.getContribution(ContentHoverController.ID);
        const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
        // enable the editor hover, otherwise the content controller will see it
        // as disabled and hide it on the first mouse move (#193149)
        this.defaultHoverLockout.clear();
        hoverController?.showContentHover(range, 1 /* HoverStartMode.Immediate */, 0 /* HoverStartSource.Mouse */, focus);
    }
    async onFocusStackFrame(sf) {
        const model = this.editor.getModel();
        if (model) {
            this.applyDocumentListeners(model, sf);
            if (sf && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
                await this.toggleExceptionWidget();
            }
            else {
                this.hideHoverWidget();
            }
        }
        await this.updateInlineValueDecorations(sf);
    }
    get hoverDelay() {
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
    get showHoverScheduler() {
        const scheduler = new RunOnceScheduler(() => {
            if (this.hoverPosition && !this.altPressed) {
                this.showHover(this.hoverPosition.position, false, this.hoverPosition.event);
            }
        }, this.hoverDelay);
        this.toDispose.push(scheduler);
        return scheduler;
    }
    hideHoverWidget() {
        if (this.hoverWidget.willBeVisible()) {
            this.hoverWidget.hide();
        }
        this.showHoverScheduler.cancel();
        this.defaultHoverLockout.clear();
    }
    // hover business
    onEditorMouseDown(mouseEvent) {
        this.mouseDown = true;
        if (mouseEvent.target.type === 9 /* MouseTargetType.CONTENT_WIDGET */ && mouseEvent.target.detail === DebugHoverWidget.ID) {
            return;
        }
        this.hideHoverWidget();
    }
    onEditorMouseMove(mouseEvent) {
        if (this.debugService.state !== 2 /* State.Stopped */) {
            return;
        }
        const target = mouseEvent.target;
        const stopKey = env.isMacintosh ? 'metaKey' : 'ctrlKey';
        if (!this.altPressed) {
            if (target.type === 2 /* MouseTargetType.GUTTER_GLYPH_MARGIN */) {
                this.defaultHoverLockout.clear();
                this.gutterIsHovered = true;
            }
            else if (this.gutterIsHovered) {
                this.gutterIsHovered = false;
                this.updateHoverConfiguration();
            }
        }
        if ((target.type === 9 /* MouseTargetType.CONTENT_WIDGET */ && target.detail === DebugHoverWidget.ID)
            || this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
            // mouse moved on top of debug hover widget
            const sticky = this.editorHoverOptions?.sticky ?? true;
            if (sticky || this.hoverWidget.isShowingComplexValue || mouseEvent.event[stopKey]) {
                return;
            }
        }
        if (target.type === 6 /* MouseTargetType.CONTENT_TEXT */) {
            if (target.position && !Position.equals(target.position, this.hoverPosition?.position || null) && !this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
                this.hoverPosition = { position: target.position, event: mouseEvent.event };
                // Disable the editor hover during the request to avoid flickering
                this.preventDefaultEditorHover();
                this.showHoverScheduler.schedule(this.hoverDelay);
            }
        }
        else if (!this.mouseDown) {
            // Do not hide debug hover when the mouse is pressed because it usually leads to accidental closing #64620
            this.hideHoverWidget();
        }
    }
    onKeyDown(e) {
        const stopKey = env.isMacintosh ? 57 /* KeyCode.Meta */ : 5 /* KeyCode.Ctrl */;
        if (e.keyCode !== stopKey && e.keyCode !== 6 /* KeyCode.Alt */) {
            // do not hide hover when Ctrl/Meta is pressed, and alt is handled separately
            this.hideHoverWidget();
        }
    }
    // end hover business
    // exception widget
    async toggleExceptionWidget() {
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
        }
        else if (sameUri) {
            // Show exception widget in all editors with the same file, but only scroll in the active editor
            const activeControl = this.editorService.activeTextEditorControl;
            const isActiveEditor = activeControl === this.editor;
            const exceptionInfo = await focusedSf.thread.exceptionInfo;
            if (exceptionInfo) {
                if (isActiveEditor) {
                    // Active editor: show widget and scroll to it
                    this.showExceptionWidget(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
                }
                else {
                    // Inactive editor: show widget without scrolling
                    this.showExceptionWidgetWithoutScroll(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
                }
            }
        }
    }
    showExceptionWidget(exceptionInfo, debugSession, lineNumber, column) {
        if (this.exceptionWidget) {
            this.exceptionWidget.dispose();
        }
        this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
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
    showExceptionWidgetWithoutScroll(exceptionInfo, debugSession, lineNumber, column) {
        if (this.exceptionWidget) {
            this.exceptionWidget.dispose();
        }
        // Disable scrolling to exception widget
        this.allowScrollToExceptionWidget = false;
        const currentScrollTop = this.editor.getScrollTop();
        const visibleRanges = this.editor.getVisibleRanges();
        if (visibleRanges.length === 0) {
            // Editor not fully initialized or not visible; skip scroll adjustment
            this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
            this.exceptionWidget.show({ lineNumber, column }, 0);
            this.exceptionWidgetVisible.set(true);
            this.allowScrollToExceptionWidget = true;
            return;
        }
        const firstVisibleLine = visibleRanges[0].startLineNumber;
        // Create widget - this may add a zone that pushes content down
        this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
        this.exceptionWidget.show({ lineNumber, column }, 0);
        this.exceptionWidgetVisible.set(true);
        // only adjust scroll if the exception widget is above the first visible line
        if (lineNumber < firstVisibleLine) {
            // Get the actual height of the widget that was just added from the whitespace
            // The whitespace height is more accurate than the container height
            const scrollAdjustment = this.exceptionWidget.getWhitespaceHeight();
            // Scroll down by the actual widget height to keep the first visible line the same
            this.editor.setScrollTop(currentScrollTop + scrollAdjustment, 1 /* ScrollType.Immediate */);
        }
        // Re-enable scrolling to exception widget
        this.allowScrollToExceptionWidget = true;
    }
    closeExceptionWidget() {
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
    async addLaunchConfiguration() {
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        let configurationsArrayPosition;
        let lastProperty;
        const getConfigurationPosition = () => {
            let depthInArray = 0;
            visit(model.getValue(), {
                onObjectProperty: (property) => {
                    lastProperty = property;
                },
                onArrayBegin: (offset) => {
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
        const insertLine = (position) => {
            // Check if there are more characters on a line after a "configurations": [, if yes enter a newline
            if (model.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
                this.editor.setPosition(position);
                this.instantiationService.invokeFunction((accessor) => {
                    CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, this.editor, null);
                });
            }
            this.editor.setPosition(position);
            return this.commandService.executeCommand(InsertLineAfterAction.ID);
        };
        await insertLine(configurationsArrayPosition);
        await this.commandService.executeCommand('editor.action.triggerSuggest');
    }
    // Inline Decorations
    get removeInlineValuesScheduler() {
        return new RunOnceScheduler(() => {
            this.displayedStore.clear();
            this.oldDecorations.clear();
        }, 100);
    }
    get updateInlineValuesScheduler() {
        const model = this.editor.getModel();
        return new RunOnceScheduler(async () => await this.updateInlineValueDecorations(this.debugService.getViewModel().focusedStackFrame), model ? this.debounceInfo.get(model) : DEAFULT_INLINE_DEBOUNCE_DELAY);
    }
    async updateInlineValueDecorations(stackFrame) {
        const var_value_format = '{0} = {1}';
        const separator = ', ';
        const model = this.editor.getModel();
        const inlineValuesSetting = this.configurationService.getValue('debug').inlineValues;
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
        let allDecorations;
        const cts = new CancellationTokenSource();
        this.displayedStore.add(toDisposable(() => cts.dispose(true)));
        if (this.languageFeaturesService.inlineValuesProvider.has(model)) {
            const findVariable = async (_key, caseSensitiveLookup) => {
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
            const ctx = {
                frameId: stackFrame.frameId,
                stoppedLocation: new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1, stackFrame.range.endLineNumber, stackFrame.range.endColumn + 1)
            };
            const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
            allDecorations = [];
            const lineDecorations = new Map();
            const promises = providers.flatMap(provider => viewRanges.map(range => Promise.resolve(provider.provideInlineValues(model, range, ctx, cts.token)).then(async (result) => {
                if (result) {
                    for (const iv of result) {
                        let text = undefined;
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
                            if (!lineSegments.some(iv => iv.text === text)) { // de-dupe
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
                    const editorWidth = this.editor.getLayoutInfo().width;
                    const fontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
                    const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
                    allDecorations.push(...createInlineValueDecoration(line, text, 'debug', undefined, viewportMaxCol));
                }
            });
        }
        else {
            // old "one-size-fits-all" strategy
            const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
            const scopesWithVariables = await Promise.all(scopes.map(async (scope) => ({ scope, variables: await scope.getChildren() })));
            // Map of inline values per line that's populated in scope order, from
            // narrowest to widest. This is done to avoid duplicating values if
            // they appear in multiple scopes or are shadowed (#129770, #217326)
            const valuesPerLine = new Map();
            for (const { scope, variables } of scopesWithVariables) {
                let scopeRange = new Range(0, 0, stackFrame.range.startLineNumber, stackFrame.range.startColumn);
                if (scope.range) {
                    scopeRange = scopeRange.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
                }
                const ownRanges = viewRanges.map(r => r.intersectRanges(scopeRange)).filter(isDefined);
                this._wordToLineNumbersMap ??= new WordsToLineNumbersCache(model);
                for (const range of ownRanges) {
                    this._wordToLineNumbersMap.ensureRangePopulated(range);
                }
                const mapped = createInlineValueDecorationsInsideRange(variables, ownRanges, model, this._wordToLineNumbersMap.value);
                for (const { line, variables } of mapped) {
                    let values = valuesPerLine.get(line);
                    if (!values) {
                        values = new Map();
                        valuesPerLine.set(line, values);
                    }
                    for (const { name, value } of variables) {
                        if (!values.has(name)) {
                            values.set(name, value);
                        }
                    }
                }
            }
            allDecorations = [...valuesPerLine.entries()].flatMap(([line, values]) => {
                const text = [...values].map(([n, v]) => `${n} = ${v}`).join(', ');
                const editorWidth = this.editor.getLayoutInfo().width;
                const fontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
                const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
                return createInlineValueDecoration(line, text, 'debug', undefined, viewportMaxCol);
            });
        }
        if (cts.token.isCancellationRequested) {
            return;
        }
        // If word wrap is on, application of inline decorations may change the scroll position.
        // Ensure the cursor maintains its vertical position relative to the viewport when
        // we apply decorations.
        let preservePosition;
        if (this.editor.getOption(149 /* EditorOption.wordWrap */) !== 'off') {
            const position = this.editor.getPosition();
            if (position && this.editor.getVisibleRanges().some(r => r.containsPosition(position))) {
                preservePosition = { position, top: this.editor.getTopForPosition(position.lineNumber, position.column) };
            }
        }
        this.oldDecorations.set(allDecorations);
        if (preservePosition) {
            const top = this.editor.getTopForPosition(preservePosition.position.lineNumber, preservePosition.position.column);
            this.editor.setScrollTop(this.editor.getScrollTop() - (preservePosition.top - top), 1 /* ScrollType.Immediate */);
        }
    }
    dispose() {
        this.hoverWidget?.dispose();
        this.configurationWidget?.dispose();
        this.exceptionWidget?.dispose();
        this.toDispose = dispose(this.toDispose);
    }
};
__decorate([
    memoize
], DebugEditorContribution.prototype, "showHoverScheduler", null);
__decorate([
    memoize
], DebugEditorContribution.prototype, "removeInlineValuesScheduler", null);
__decorate([
    memoize
], DebugEditorContribution.prototype, "updateInlineValuesScheduler", null);
DebugEditorContribution = __decorate([
    __param(1, IDebugService),
    __param(2, IInstantiationService),
    __param(3, ICommandService),
    __param(4, IConfigurationService),
    __param(5, IHostService),
    __param(6, IUriIdentityService),
    __param(7, IContextKeyService),
    __param(8, ILanguageFeaturesService),
    __param(9, ILanguageFeatureDebounceService),
    __param(10, IEditorService)
], DebugEditorContribution);
export { DebugEditorContribution };
class WordsToLineNumbersCache {
    constructor(model) {
        this.model = model;
        this.value = new Map();
        this.intervals = new Uint8Array(Math.ceil(model.getLineCount() / 8));
    }
    /** Ensures that variables names in the given range have been identified. */
    ensureRangePopulated(range) {
        for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
            const bin = lineNumber >> 3; /* Math.floor(i / 8) */
            const bit = 1 << (lineNumber & 0b111); /* 1 << (i % 8) */
            if (!(this.intervals[bin] & bit)) {
                getWordToLineNumbersMap(this.model, lineNumber, this.value);
                this.intervals[bin] |= bit;
            }
        }
    }
}
CommandsRegistry.registerCommand('_executeInlineValueProvider', async (accessor, uri, iRange, context) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdFZGl0b3JDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnRWRpdG9yQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFrQixxQkFBcUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRWxHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsZUFBZSxFQUFFLHlCQUF5QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFbEUsT0FBTyxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEtBQUssR0FBRyxNQUFNLHFDQUFxQyxDQUFDO0FB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