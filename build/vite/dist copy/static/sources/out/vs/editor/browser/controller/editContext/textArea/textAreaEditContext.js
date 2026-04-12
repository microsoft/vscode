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
import './textAreaEditContext.css';
import * as nls from '../../../../../nls.js';
import * as browser from '../../../../../base/browser/browser.js';
import { createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import * as platform from '../../../../../base/common/platform.js';
import * as strings from '../../../../../base/common/strings.js';
import { applyFontInfo } from '../../../config/domFontInfo.js';
import { PartFingerprints } from '../../../view/viewPart.js';
import { LineNumbersOverlay } from '../../../viewParts/lineNumbers/lineNumbers.js';
import { Margin } from '../../../viewParts/margin/margin.js';
import { EditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { TokenizationRegistry } from '../../../../common/languages.js';
import { Color } from '../../../../../base/common/color.js';
import { IME } from '../../../../../base/common/ime.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AbstractEditContext } from '../editContext.js';
import { TextAreaInput, TextAreaWrapper } from './textAreaEditContextInput.js';
import { ariaLabelForScreenReaderContent, newlinecount, SimplePagedScreenReaderStrategy } from '../screenReaderUtils.js';
import { _debugComposition, TextAreaState } from './textAreaEditContextState.js';
import { getMapForWordSeparators } from '../../../../common/core/wordCharacterClassifier.js';
import { TextAreaEditContextRegistry } from './textAreaEditContextRegistry.js';
class VisibleTextAreaData {
    constructor(_context, modelLineNumber, distanceToModelLineStart, widthOfHiddenLineTextBefore, distanceToModelLineEnd) {
        this._context = _context;
        this.modelLineNumber = modelLineNumber;
        this.distanceToModelLineStart = distanceToModelLineStart;
        this.widthOfHiddenLineTextBefore = widthOfHiddenLineTextBefore;
        this.distanceToModelLineEnd = distanceToModelLineEnd;
        this._visibleTextAreaBrand = undefined;
        this.startPosition = null;
        this.endPosition = null;
        this.visibleTextareaStart = null;
        this.visibleTextareaEnd = null;
        /**
         * When doing composition, the currently composed text might be split up into
         * multiple tokens, then merged again into a single token, etc. Here we attempt
         * to keep the presentation of the <textarea> stable by using the previous used
         * style if multiple tokens come into play. This avoids flickering.
         */
        this._previousPresentation = null;
    }
    prepareRender(visibleRangeProvider) {
        const startModelPosition = new Position(this.modelLineNumber, this.distanceToModelLineStart + 1);
        const endModelPosition = new Position(this.modelLineNumber, this._context.viewModel.model.getLineMaxColumn(this.modelLineNumber) - this.distanceToModelLineEnd);
        this.startPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(startModelPosition);
        this.endPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(endModelPosition);
        if (this.startPosition.lineNumber === this.endPosition.lineNumber) {
            this.visibleTextareaStart = visibleRangeProvider.visibleRangeForPosition(this.startPosition);
            this.visibleTextareaEnd = visibleRangeProvider.visibleRangeForPosition(this.endPosition);
        }
        else {
            // TODO: what if the view positions are not on the same line?
            this.visibleTextareaStart = null;
            this.visibleTextareaEnd = null;
        }
    }
    definePresentation(tokenPresentation) {
        if (!this._previousPresentation) {
            // To avoid flickering, once set, always reuse a presentation throughout the entire IME session
            if (tokenPresentation) {
                this._previousPresentation = tokenPresentation;
            }
            else {
                this._previousPresentation = {
                    foreground: 1 /* ColorId.DefaultForeground */,
                    italic: false,
                    bold: false,
                    underline: false,
                    strikethrough: false,
                };
            }
        }
        return this._previousPresentation;
    }
}
const canUseZeroSizeTextarea = (browser.isFirefox);
let TextAreaEditContext = class TextAreaEditContext extends AbstractEditContext {
    constructor(ownerID, context, overflowGuardContainer, viewController, visibleRangeProvider, _keybindingService, _instantiationService) {
        super(context);
        this._keybindingService = _keybindingService;
        this._instantiationService = _instantiationService;
        this._primaryCursorPosition = new Position(1, 1);
        this._primaryCursorVisibleRange = null;
        this._viewController = viewController;
        this._visibleRangeProvider = visibleRangeProvider;
        this._scrollLeft = 0;
        this._scrollTop = 0;
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._setAccessibilityOptions(options);
        this._contentLeft = layoutInfo.contentLeft;
        this._contentWidth = layoutInfo.contentWidth;
        this._contentHeight = layoutInfo.height;
        this._fontInfo = options.get(59 /* EditorOption.fontInfo */);
        this._emptySelectionClipboard = options.get(45 /* EditorOption.emptySelectionClipboard */);
        this._visibleTextArea = null;
        this._selections = [new Selection(1, 1, 1, 1)];
        this._modelSelections = [new Selection(1, 1, 1, 1)];
        this._lastRenderPosition = null;
        // Text Area (The focus will always be in the textarea when the cursor is blinking)
        this.textArea = createFastDomNode(document.createElement('textarea'));
        PartFingerprints.write(this.textArea, 7 /* PartFingerprint.TextArea */);
        this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
        this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
        const { tabSize } = this._context.viewModel.model.getOptions();
        this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
        this.textArea.setAttribute('autocorrect', 'off');
        this.textArea.setAttribute('autocapitalize', 'off');
        this.textArea.setAttribute('autocomplete', 'off');
        this.textArea.setAttribute('spellcheck', 'false');
        this.textArea.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
        this.textArea.setAttribute('aria-required', options.get(9 /* EditorOption.ariaRequired */) ? 'true' : 'false');
        this.textArea.setAttribute('tabindex', String(options.get(140 /* EditorOption.tabIndex */)));
        this.textArea.setAttribute('role', 'textbox');
        this.textArea.setAttribute('aria-roledescription', nls.localize('editor', "editor"));
        this.textArea.setAttribute('aria-multiline', 'true');
        this.textArea.setAttribute('aria-autocomplete', options.get(104 /* EditorOption.readOnly */) ? 'none' : 'both');
        this._ensureReadOnlyAttribute();
        this.textAreaCover = createFastDomNode(document.createElement('div'));
        this.textAreaCover.setPosition('absolute');
        overflowGuardContainer.appendChild(this.textArea);
        overflowGuardContainer.appendChild(this.textAreaCover);
        const simplePagedScreenReaderStrategy = new SimplePagedScreenReaderStrategy();
        const textAreaInputHost = {
            context: this._context,
            getScreenReaderContent: () => {
                if (this._accessibilitySupport === 1 /* AccessibilitySupport.Disabled */) {
                    // We know for a fact that a screen reader is not attached
                    // On OSX, we write the character before the cursor to allow for "long-press" composition
                    // Also on OSX, we write the word before the cursor to allow for the Accessibility Keyboard to give good hints
                    const selection = this._selections[0];
                    if (platform.isMacintosh && selection.isEmpty()) {
                        const position = selection.getStartPosition();
                        let textBefore = this._getWordBeforePosition(position);
                        if (textBefore.length === 0) {
                            textBefore = this._getCharacterBeforePosition(position);
                        }
                        if (textBefore.length > 0) {
                            return new TextAreaState(textBefore, textBefore.length, textBefore.length, Range.fromPositions(position), 0);
                        }
                    }
                    // on macOS, write current selection into textarea will allow system text services pick selected text,
                    // but we still want to limit the amount of text given Chromium handles very poorly text even of a few
                    // thousand chars
                    // (https://github.com/microsoft/vscode/issues/27799)
                    const LIMIT_CHARS = 500;
                    if (platform.isMacintosh && !selection.isEmpty() && this._context.viewModel.getValueLengthInRange(selection, 0 /* EndOfLinePreference.TextDefined */) < LIMIT_CHARS) {
                        const text = this._context.viewModel.getValueInRange(selection, 0 /* EndOfLinePreference.TextDefined */);
                        return new TextAreaState(text, 0, text.length, selection, 0);
                    }
                    // on Safari, document.execCommand('cut') and document.execCommand('copy') will just not work
                    // if the textarea has no content selected. So if there is an editor selection, ensure something
                    // is selected in the textarea.
                    if (browser.isSafari && !selection.isEmpty()) {
                        const placeholderText = 'vscode-placeholder';
                        return new TextAreaState(placeholderText, 0, placeholderText.length, null, undefined);
                    }
                    return TextAreaState.EMPTY;
                }
                if (browser.isAndroid) {
                    // when tapping in the editor on a word, Android enters composition mode.
                    // in the `compositionstart` event we cannot clear the textarea, because
                    // it then forgets to ever send a `compositionend`.
                    // we therefore only write the current word in the textarea
                    const selection = this._selections[0];
                    if (selection.isEmpty()) {
                        const position = selection.getStartPosition();
                        const [wordAtPosition, positionOffsetInWord] = this._getAndroidWordAtPosition(position);
                        if (wordAtPosition.length > 0) {
                            return new TextAreaState(wordAtPosition, positionOffsetInWord, positionOffsetInWord, Range.fromPositions(position), 0);
                        }
                    }
                    return TextAreaState.EMPTY;
                }
                const screenReaderContentState = simplePagedScreenReaderStrategy.fromEditorSelection(this._context.viewModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === 0 /* AccessibilitySupport.Unknown */);
                return TextAreaState.fromScreenReaderContentState(screenReaderContentState);
            },
            deduceModelPosition: (viewAnchorPosition, deltaOffset, lineFeedCnt) => {
                return this._context.viewModel.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
            }
        };
        const textAreaWrapper = this._register(new TextAreaWrapper(this.textArea.domNode));
        this._textAreaInput = this._register(this._instantiationService.createInstance(TextAreaInput, textAreaInputHost, textAreaWrapper, platform.OS, {
            isAndroid: browser.isAndroid,
            isChrome: browser.isChrome,
            isFirefox: browser.isFirefox,
            isSafari: browser.isSafari,
        }));
        // Relay clipboard events from TextAreaInput
        this._register(this._textAreaInput.onWillCopy(e => this._onWillCopy.fire(e)));
        this._register(this._textAreaInput.onWillCut(e => this._onWillCut.fire(e)));
        this._register(this._textAreaInput.onWillPaste(e => this._onWillPaste.fire(e)));
        this._register(this._textAreaInput.onKeyDown((e) => {
            this._viewController.emitKeyDown(e);
        }));
        this._register(this._textAreaInput.onKeyUp((e) => {
            this._viewController.emitKeyUp(e);
        }));
        this._register(this._textAreaInput.onPaste((e) => {
            let pasteOnNewLine = false;
            let multicursorText = null;
            let mode = null;
            if (e.metadata) {
                pasteOnNewLine = (this._emptySelectionClipboard && !!e.metadata.isFromEmptySelection);
                multicursorText = (typeof e.metadata.multicursorText !== 'undefined' ? e.metadata.multicursorText : null);
                mode = e.metadata.mode;
            }
            this._viewController.paste(e.text, pasteOnNewLine, multicursorText, mode);
        }));
        this._register(this._textAreaInput.onCut(() => {
            this._viewController.cut();
        }));
        this._register(this._textAreaInput.onType((e) => {
            if (e.replacePrevCharCnt || e.replaceNextCharCnt || e.positionDelta) {
                // must be handled through the new command
                if (_debugComposition) {
                    console.log(` => compositionType: <<${e.text}>>, ${e.replacePrevCharCnt}, ${e.replaceNextCharCnt}, ${e.positionDelta}`);
                }
                this._viewController.compositionType(e.text, e.replacePrevCharCnt, e.replaceNextCharCnt, e.positionDelta);
            }
            else {
                if (_debugComposition) {
                    console.log(` => type: <<${e.text}>>`);
                }
                this._viewController.type(e.text);
            }
        }));
        this._register(this._textAreaInput.onSelectionChangeRequest((modelSelection) => {
            this._viewController.setSelection(modelSelection);
        }));
        this._register(this._textAreaInput.onCompositionStart((e) => {
            // The textarea might contain some content when composition starts.
            //
            // When we make the textarea visible, it always has a height of 1 line,
            // so we don't need to worry too much about content on lines above or below
            // the selection.
            //
            // However, the text on the current line needs to be made visible because
            // some IME methods allow to move to other glyphs on the current line
            // (by pressing arrow keys).
            //
            // (1) The textarea might contain only some parts of the current line,
            // like the word before the selection. Also, the content inside the textarea
            // can grow or shrink as composition occurs. We therefore anchor the textarea
            // in terms of distance to a certain line start and line end.
            //
            // (2) Also, we should not make \t characters visible, because their rendering
            // inside the <textarea> will not align nicely with our rendering. We therefore
            // will hide (if necessary) some of the leading text on the current line.
            const ta = this.textArea.domNode;
            const modelSelection = this._modelSelections[0];
            const { distanceToModelLineStart, widthOfHiddenTextBefore } = (() => {
                // Find the text that is on the current line before the selection
                const textBeforeSelection = ta.value.substring(0, Math.min(ta.selectionStart, ta.selectionEnd));
                const lineFeedOffset1 = textBeforeSelection.lastIndexOf('\n');
                const lineTextBeforeSelection = textBeforeSelection.substring(lineFeedOffset1 + 1);
                // We now search to see if we should hide some part of it (if it contains \t)
                const tabOffset1 = lineTextBeforeSelection.lastIndexOf('\t');
                const desiredVisibleBeforeCharCount = lineTextBeforeSelection.length - tabOffset1 - 1;
                const startModelPosition = modelSelection.getStartPosition();
                const visibleBeforeCharCount = Math.min(startModelPosition.column - 1, desiredVisibleBeforeCharCount);
                const distanceToModelLineStart = startModelPosition.column - 1 - visibleBeforeCharCount;
                const hiddenLineTextBefore = lineTextBeforeSelection.substring(0, lineTextBeforeSelection.length - visibleBeforeCharCount);
                const { tabSize } = this._context.viewModel.model.getOptions();
                const widthOfHiddenTextBefore = measureText(this.textArea.domNode.ownerDocument, hiddenLineTextBefore, this._fontInfo, tabSize);
                return { distanceToModelLineStart, widthOfHiddenTextBefore };
            })();
            const { distanceToModelLineEnd } = (() => {
                // Find the text that is on the current line after the selection
                const textAfterSelection = ta.value.substring(Math.max(ta.selectionStart, ta.selectionEnd));
                const lineFeedOffset2 = textAfterSelection.indexOf('\n');
                const lineTextAfterSelection = lineFeedOffset2 === -1 ? textAfterSelection : textAfterSelection.substring(0, lineFeedOffset2);
                const tabOffset2 = lineTextAfterSelection.indexOf('\t');
                const desiredVisibleAfterCharCount = (tabOffset2 === -1 ? lineTextAfterSelection.length : lineTextAfterSelection.length - tabOffset2 - 1);
                const endModelPosition = modelSelection.getEndPosition();
                const visibleAfterCharCount = Math.min(this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column, desiredVisibleAfterCharCount);
                const distanceToModelLineEnd = this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column - visibleAfterCharCount;
                return { distanceToModelLineEnd };
            })();
            // Scroll to reveal the location in the editor where composition occurs
            this._context.viewModel.revealRange('keyboard', true, Range.fromPositions(this._selections[0].getStartPosition()), 0 /* viewEvents.VerticalRevealType.Simple */, 1 /* ScrollType.Immediate */);
            this._visibleTextArea = new VisibleTextAreaData(this._context, modelSelection.startLineNumber, distanceToModelLineStart, widthOfHiddenTextBefore, distanceToModelLineEnd);
            // We turn off wrapping if the <textarea> becomes visible for composition
            this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
            this._visibleTextArea.prepareRender(this._visibleRangeProvider);
            this._render();
            // Show the textarea
            this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);
            this._viewController.compositionStart();
            this._context.viewModel.onCompositionStart();
        }));
        this._register(this._textAreaInput.onCompositionUpdate((e) => {
            if (!this._visibleTextArea) {
                return;
            }
            this._visibleTextArea.prepareRender(this._visibleRangeProvider);
            this._render();
        }));
        this._register(this._textAreaInput.onCompositionEnd(() => {
            this._visibleTextArea = null;
            // We turn on wrapping as necessary if the <textarea> hides after composition
            this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
            this._render();
            this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
            this._viewController.compositionEnd();
            this._context.viewModel.onCompositionEnd();
        }));
        this._register(this._textAreaInput.onFocus(() => {
            this._context.viewModel.setHasFocus(true);
        }));
        this._register(this._textAreaInput.onBlur(() => {
            this._context.viewModel.setHasFocus(false);
        }));
        this._register(IME.onDidChange(() => {
            this._ensureReadOnlyAttribute();
        }));
        this._register(TextAreaEditContextRegistry.register(ownerID, this));
    }
    get domNode() {
        return this.textArea;
    }
    writeScreenReaderContent(reason) {
        this._textAreaInput.writeNativeTextAreaContent(reason);
    }
    getTextAreaDomNode() {
        return this.textArea.domNode;
    }
    dispose() {
        super.dispose();
        this.textArea.domNode.remove();
        this.textAreaCover.domNode.remove();
    }
    _getAndroidWordAtPosition(position) {
        const ANDROID_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
        const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
        const wordSeparators = getMapForWordSeparators(ANDROID_WORD_SEPARATORS, []);
        let goingLeft = true;
        let startColumn = position.column;
        let goingRight = true;
        let endColumn = position.column;
        let distance = 0;
        while (distance < 50 && (goingLeft || goingRight)) {
            if (goingLeft && startColumn <= 1) {
                goingLeft = false;
            }
            if (goingLeft) {
                const charCode = lineContent.charCodeAt(startColumn - 2);
                const charClass = wordSeparators.get(charCode);
                if (charClass !== 0 /* WordCharacterClass.Regular */) {
                    goingLeft = false;
                }
                else {
                    startColumn--;
                }
            }
            if (goingRight && endColumn > lineContent.length) {
                goingRight = false;
            }
            if (goingRight) {
                const charCode = lineContent.charCodeAt(endColumn - 1);
                const charClass = wordSeparators.get(charCode);
                if (charClass !== 0 /* WordCharacterClass.Regular */) {
                    goingRight = false;
                }
                else {
                    endColumn++;
                }
            }
            distance++;
        }
        return [lineContent.substring(startColumn - 1, endColumn - 1), position.column - startColumn];
    }
    _getWordBeforePosition(position) {
        const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
        const wordSeparators = getMapForWordSeparators(this._context.configuration.options.get(148 /* EditorOption.wordSeparators */), []);
        let column = position.column;
        let distance = 0;
        while (column > 1) {
            const charCode = lineContent.charCodeAt(column - 2);
            const charClass = wordSeparators.get(charCode);
            if (charClass !== 0 /* WordCharacterClass.Regular */ || distance > 50) {
                return lineContent.substring(column - 1, position.column - 1);
            }
            distance++;
            column--;
        }
        return lineContent.substring(0, position.column - 1);
    }
    _getCharacterBeforePosition(position) {
        if (position.column > 1) {
            const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
            const charBefore = lineContent.charAt(position.column - 2);
            if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
                return charBefore;
            }
        }
        return '';
    }
    _setAccessibilityOptions(options) {
        this._accessibilitySupport = options.get(2 /* EditorOption.accessibilitySupport */);
        const accessibilityPageSize = options.get(3 /* EditorOption.accessibilityPageSize */);
        if (this._accessibilitySupport === 2 /* AccessibilitySupport.Enabled */ && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
            // If a screen reader is attached and the default value is not set we should automatically increase the page size to 500 for a better experience
            this._accessibilityPageSize = 500;
        }
        else {
            this._accessibilityPageSize = accessibilityPageSize;
        }
        // When wrapping is enabled and a screen reader might be attached,
        // we will size the textarea to match the width used for wrapping points computation (see `domLineBreaksComputer.ts`).
        // This is because screen readers will read the text in the textarea and we'd like that the
        // wrapping points in the textarea match the wrapping points in the editor.
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        const wrappingColumn = layoutInfo.wrappingColumn;
        if (wrappingColumn !== -1 && this._accessibilitySupport !== 1 /* AccessibilitySupport.Disabled */) {
            const fontInfo = options.get(59 /* EditorOption.fontInfo */);
            this._textAreaWrapping = true;
            this._textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
        }
        else {
            this._textAreaWrapping = false;
            this._textAreaWidth = (canUseZeroSizeTextarea ? 0 : 1);
        }
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this._setAccessibilityOptions(options);
        this._contentLeft = layoutInfo.contentLeft;
        this._contentWidth = layoutInfo.contentWidth;
        this._contentHeight = layoutInfo.height;
        this._fontInfo = options.get(59 /* EditorOption.fontInfo */);
        this._emptySelectionClipboard = options.get(45 /* EditorOption.emptySelectionClipboard */);
        this.textArea.setAttribute('wrap', this._textAreaWrapping && !this._visibleTextArea ? 'on' : 'off');
        const { tabSize } = this._context.viewModel.model.getOptions();
        this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
        this.textArea.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
        this.textArea.setAttribute('aria-required', options.get(9 /* EditorOption.ariaRequired */) ? 'true' : 'false');
        this.textArea.setAttribute('tabindex', String(options.get(140 /* EditorOption.tabIndex */)));
        if (e.hasChanged(41 /* EditorOption.domReadOnly */) || e.hasChanged(104 /* EditorOption.readOnly */)) {
            this._ensureReadOnlyAttribute();
        }
        if (e.hasChanged(2 /* EditorOption.accessibilitySupport */)) {
            this._textAreaInput.writeNativeTextAreaContent('strategy changed');
        }
        return true;
    }
    onCursorStateChanged(e) {
        this._selections = e.selections.slice(0);
        this._modelSelections = e.modelSelections.slice(0);
        // We must update the <textarea> synchronously, otherwise long press IME on macos breaks.
        // See https://github.com/microsoft/vscode/issues/165821
        this._textAreaInput.writeNativeTextAreaContent('selection changed');
        return true;
    }
    onDecorationsChanged(e) {
        // true for inline decorations that can end up relayouting text
        return true;
    }
    onFlushed(e) {
        return true;
    }
    onLinesChanged(e) {
        return true;
    }
    onLinesDeleted(e) {
        return true;
    }
    onLinesInserted(e) {
        return true;
    }
    onScrollChanged(e) {
        this._scrollLeft = e.scrollLeft;
        this._scrollTop = e.scrollTop;
        return true;
    }
    onZonesChanged(e) {
        return true;
    }
    // --- end event handlers
    // --- begin view API
    isFocused() {
        return this._textAreaInput.isFocused();
    }
    focus() {
        this._textAreaInput.focusTextArea();
    }
    refreshFocusState() {
        this._textAreaInput.refreshFocusState();
    }
    getLastRenderData() {
        return this._lastRenderPosition;
    }
    setAriaOptions(options) {
        if (options.activeDescendant) {
            this.textArea.setAttribute('aria-haspopup', 'true');
            this.textArea.setAttribute('aria-autocomplete', 'list');
            this.textArea.setAttribute('aria-activedescendant', options.activeDescendant);
        }
        else {
            this.textArea.setAttribute('aria-haspopup', 'false');
            this.textArea.setAttribute('aria-autocomplete', 'both');
            this.textArea.removeAttribute('aria-activedescendant');
        }
        if (options.role) {
            this.textArea.setAttribute('role', options.role);
        }
    }
    // --- end view API
    _ensureReadOnlyAttribute() {
        const options = this._context.configuration.options;
        // When someone requests to disable IME, we set the "readonly" attribute on the <textarea>.
        // This will prevent composition.
        const useReadOnly = !IME.enabled || (options.get(41 /* EditorOption.domReadOnly */) && options.get(104 /* EditorOption.readOnly */));
        if (useReadOnly) {
            this.textArea.setAttribute('readonly', 'true');
        }
        else {
            this.textArea.removeAttribute('readonly');
        }
    }
    prepareRender(ctx) {
        this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
        this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
        this._visibleTextArea?.prepareRender(ctx);
    }
    render(ctx) {
        this._textAreaInput.writeNativeTextAreaContent('render');
        this._render();
    }
    _render() {
        if (this._visibleTextArea) {
            // The text area is visible for composition reasons
            const visibleStart = this._visibleTextArea.visibleTextareaStart;
            const visibleEnd = this._visibleTextArea.visibleTextareaEnd;
            const startPosition = this._visibleTextArea.startPosition;
            const endPosition = this._visibleTextArea.endPosition;
            if (startPosition && endPosition && visibleStart && visibleEnd && visibleEnd.left >= this._scrollLeft && visibleStart.left <= this._scrollLeft + this._contentWidth) {
                const top = (this._context.viewLayout.getVerticalOffsetForLineNumber(this._primaryCursorPosition.lineNumber) - this._scrollTop);
                const lineCount = newlinecount(this.textArea.domNode.value.substr(0, this.textArea.domNode.selectionStart));
                let scrollLeft = this._visibleTextArea.widthOfHiddenLineTextBefore;
                let left = (this._contentLeft + visibleStart.left - this._scrollLeft);
                // See https://github.com/microsoft/vscode/issues/141725#issuecomment-1050670841
                // Here we are adding +1 to avoid flickering that might be caused by having a width that is too small.
                // This could be caused by rounding errors that might only show up with certain font families.
                // In other words, a pixel might be lost when doing something like
                //      `Math.round(end) - Math.round(start)`
                // vs
                //      `Math.round(end - start)`
                let width = visibleEnd.left - visibleStart.left + 1;
                if (left < this._contentLeft) {
                    // the textarea would be rendered on top of the margin,
                    // so reduce its width. We use the same technique as
                    // for hiding text before
                    const delta = (this._contentLeft - left);
                    left += delta;
                    scrollLeft += delta;
                    width -= delta;
                }
                if (width > this._contentWidth) {
                    // the textarea would be wider than the content width,
                    // so reduce its width.
                    width = this._contentWidth;
                }
                // Try to render the textarea with the color/font style to match the text under it
                const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(startPosition.lineNumber);
                const fontSize = this._context.viewModel.getFontSizeAtPosition(this._primaryCursorPosition);
                const viewLineData = this._context.viewModel.getViewLineData(startPosition.lineNumber);
                const startTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(startPosition.column - 1);
                const endTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(endPosition.column - 1);
                const textareaSpansSingleToken = (startTokenIndex === endTokenIndex);
                const presentation = this._visibleTextArea.definePresentation((textareaSpansSingleToken ? viewLineData.tokens.getPresentation(startTokenIndex) : null));
                this.textArea.domNode.scrollTop = lineCount * lineHeight;
                this.textArea.domNode.scrollLeft = scrollLeft;
                this._doRender({
                    lastRenderPosition: null,
                    top: top,
                    left: left,
                    width: width,
                    height: lineHeight,
                    useCover: false,
                    color: (TokenizationRegistry.getColorMap() || [])[presentation.foreground],
                    italic: presentation.italic,
                    bold: presentation.bold,
                    underline: presentation.underline,
                    strikethrough: presentation.strikethrough,
                    fontSize
                });
            }
            return;
        }
        if (!this._primaryCursorVisibleRange) {
            // The primary cursor is outside the viewport => place textarea to the top left
            this._renderAtTopLeft();
            return;
        }
        const left = this._contentLeft + this._primaryCursorVisibleRange.left - this._scrollLeft;
        if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
            // cursor is outside the viewport
            this._renderAtTopLeft();
            return;
        }
        const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._selections[0].positionLineNumber) - this._scrollTop;
        if (top < 0 || top > this._contentHeight) {
            // cursor is outside the viewport
            this._renderAtTopLeft();
            return;
        }
        // The primary cursor is in the viewport (at least vertically) => place textarea on the cursor
        if (platform.isMacintosh || this._accessibilitySupport === 2 /* AccessibilitySupport.Enabled */) {
            // For the popup emoji input, we will make the text area as high as the line height
            // We will also make the fontSize and lineHeight the correct dimensions to help with the placement of these pickers
            const lineNumber = this._primaryCursorPosition.lineNumber;
            const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(lineNumber);
            this._doRender({
                lastRenderPosition: this._primaryCursorPosition,
                top,
                left: this._textAreaWrapping ? this._contentLeft : left,
                width: this._textAreaWidth,
                height: lineHeight,
                useCover: false
            });
            // In case the textarea contains a word, we're going to try to align the textarea's cursor
            // with our cursor by scrolling the textarea as much as possible
            this.textArea.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
            const lineCount = this._textAreaInput.textAreaState.newlineCountBeforeSelection ?? newlinecount(this.textArea.domNode.value.substring(0, this.textArea.domNode.selectionStart));
            this.textArea.domNode.scrollTop = lineCount * lineHeight;
            return;
        }
        this._doRender({
            lastRenderPosition: this._primaryCursorPosition,
            top: top,
            left: this._textAreaWrapping ? this._contentLeft : left,
            width: this._textAreaWidth,
            height: (canUseZeroSizeTextarea ? 0 : 1),
            useCover: false
        });
    }
    _renderAtTopLeft() {
        // (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
        // specifically, when doing Korean IME, setting the textarea to 0x0 breaks IME badly.
        this._doRender({
            lastRenderPosition: null,
            top: 0,
            left: 0,
            width: this._textAreaWidth,
            height: (canUseZeroSizeTextarea ? 0 : 1),
            useCover: true
        });
    }
    _doRender(renderData) {
        this._lastRenderPosition = renderData.lastRenderPosition;
        const ta = this.textArea;
        const tac = this.textAreaCover;
        applyFontInfo(ta, this._fontInfo);
        ta.setTop(renderData.top);
        ta.setLeft(renderData.left);
        ta.setWidth(renderData.width);
        ta.setHeight(renderData.height);
        ta.setLineHeight(renderData.height);
        ta.setFontSize(renderData.fontSize ?? this._fontInfo.fontSize);
        ta.setColor(renderData.color ? Color.Format.CSS.formatHex(renderData.color) : '');
        ta.setFontStyle(renderData.italic ? 'italic' : '');
        if (renderData.bold) {
            // fontWeight is also set by `applyFontInfo`, so only overwrite it if necessary
            ta.setFontWeight('bold');
        }
        ta.setTextDecoration(`${renderData.underline ? ' underline' : ''}${renderData.strikethrough ? ' line-through' : ''}`);
        tac.setTop(renderData.useCover ? renderData.top : 0);
        tac.setLeft(renderData.useCover ? renderData.left : 0);
        tac.setWidth(renderData.useCover ? renderData.width : 0);
        tac.setHeight(renderData.useCover ? renderData.height : 0);
        const options = this._context.configuration.options;
        if (options.get(66 /* EditorOption.glyphMargin */)) {
            tac.setClassName('monaco-editor-background textAreaCover ' + Margin.OUTER_CLASS_NAME);
        }
        else {
            if (options.get(76 /* EditorOption.lineNumbers */).renderType !== 0 /* RenderLineNumbersType.Off */) {
                tac.setClassName('monaco-editor-background textAreaCover ' + LineNumbersOverlay.CLASS_NAME);
            }
            else {
                tac.setClassName('monaco-editor-background textAreaCover');
            }
        }
    }
};
TextAreaEditContext = __decorate([
    __param(5, IKeybindingService),
    __param(6, IInstantiationService)
], TextAreaEditContext);
export { TextAreaEditContext };
function measureText(targetDocument, text, fontInfo, tabSize) {
    if (text.length === 0) {
        return 0;
    }
    const container = targetDocument.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '-50000px';
    container.style.width = '50000px';
    const regularDomNode = targetDocument.createElement('span');
    applyFontInfo(regularDomNode, fontInfo);
    regularDomNode.style.whiteSpace = 'pre'; // just like the textarea
    regularDomNode.style.tabSize = `${tabSize * fontInfo.spaceWidth}px`; // just like the textarea
    regularDomNode.append(text);
    container.appendChild(regularDomNode);
    targetDocument.body.appendChild(container);
    const res = regularDomNode.offsetWidth;
    container.remove();
    return res;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEFyZWFFZGl0Q29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvdGV4dEFyZWEvdGV4dEFyZWFFZGl0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDJCQUEyQixDQUFDO0FBQ25DLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxLQUFLLE9BQU8sTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUU1RixPQUFPLEtBQUssUUFBUSxNQUFNLHdDQUF3QyxDQUFDO0FBQ25FLE9BQU8sS0FBSyxPQUFPLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRS9ELE9BQU8sRUFBbUIsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM5RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUErRCxhQUFhLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV4SSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQVFqRSxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3hELE9BQU8sRUFBb0QsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2pJLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxZQUFZLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6SCxPQUFPLEVBQUUsaUJBQWlCLEVBQWEsYUFBYSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDNUYsT0FBTyxFQUFFLHVCQUF1QixFQUFzQixNQUFNLG9EQUFvRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBTy9FLE1BQU0sbUJBQW1CO0lBaUJ4QixZQUNrQixRQUFxQixFQUN0QixlQUF1QixFQUN2Qix3QkFBZ0MsRUFDaEMsMkJBQW1DLEVBQ25DLHNCQUE4QjtRQUo3QixhQUFRLEdBQVIsUUFBUSxDQUFhO1FBQ3RCLG9CQUFlLEdBQWYsZUFBZSxDQUFRO1FBQ3ZCLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBUTtRQUNoQyxnQ0FBMkIsR0FBM0IsMkJBQTJCLENBQVE7UUFDbkMsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUFRO1FBckIvQywwQkFBcUIsR0FBUyxTQUFTLENBQUM7UUFFakMsa0JBQWEsR0FBb0IsSUFBSSxDQUFDO1FBQ3RDLGdCQUFXLEdBQW9CLElBQUksQ0FBQztRQUVwQyx5QkFBb0IsR0FBOEIsSUFBSSxDQUFDO1FBQ3ZELHVCQUFrQixHQUE4QixJQUFJLENBQUM7UUFFNUQ7Ozs7O1dBS0c7UUFDSywwQkFBcUIsR0FBOEIsSUFBSSxDQUFDO0lBU2hFLENBQUM7SUFFRCxhQUFhLENBQUMsb0JBQTJDO1FBQ3hELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsd0JBQXdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDakcsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFFaEssSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3pILElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsa0NBQWtDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUVySCxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbkUsSUFBSSxDQUFDLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUM3RixJQUFJLENBQUMsa0JBQWtCLEdBQUcsb0JBQW9CLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzFGLENBQUM7YUFBTSxDQUFDO1lBQ1AsNkRBQTZEO1lBQzdELElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUM7WUFDakMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUVELGtCQUFrQixDQUFDLGlCQUE0QztRQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDakMsK0ZBQStGO1lBQy9GLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLHFCQUFxQixHQUFHLGlCQUFpQixDQUFDO1lBQ2hELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMscUJBQXFCLEdBQUc7b0JBQzVCLFVBQVUsbUNBQTJCO29CQUNyQyxNQUFNLEVBQUUsS0FBSztvQkFDYixJQUFJLEVBQUUsS0FBSztvQkFDWCxTQUFTLEVBQUUsS0FBSztvQkFDaEIsYUFBYSxFQUFFLEtBQUs7aUJBQ3BCLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQ25DLENBQUM7Q0FDRDtBQUVELE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFFNUMsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxtQkFBbUI7SUFrQzNELFlBQ0MsT0FBZSxFQUNmLE9BQW9CLEVBQ3BCLHNCQUFnRCxFQUNoRCxjQUE4QixFQUM5QixvQkFBMkMsRUFDdkIsa0JBQXVELEVBQ3BELHFCQUE2RDtRQUVwRixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFIc0IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUNuQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBNmdCN0UsMkJBQXNCLEdBQWEsSUFBSSxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RELCtCQUEwQixHQUE4QixJQUFJLENBQUM7UUExZ0JwRSxJQUFJLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztRQUN0QyxJQUFJLENBQUMscUJBQXFCLEdBQUcsb0JBQW9CLENBQUM7UUFDbEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDckIsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFcEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3BELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLG1DQUF5QixDQUFDO1FBRXhELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUM7UUFDM0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUMsWUFBWSxDQUFDO1FBQzdDLElBQUksQ0FBQyxjQUFjLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUN4QyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDO1FBQ3BELElBQUksQ0FBQyx3QkFBd0IsR0FBRyxPQUFPLENBQUMsR0FBRywrQ0FBc0MsQ0FBQztRQUVsRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQzdCLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9DLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztRQUVoQyxtRkFBbUY7UUFDbkYsSUFBSSxDQUFDLFFBQVEsR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDdEUsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLG1DQUEyQixDQUFDO1FBQ2hFLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGFBQWEsZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEcsTUFBTSxFQUFFLE9BQU8sRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUMvRCxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEdBQUcsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxJQUFJLENBQUM7UUFDakYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLCtCQUErQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO1FBQzVHLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsR0FBRyxtQ0FBMkIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLGlDQUF1QixDQUFDLENBQUMsQ0FBQztRQUNuRixJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsR0FBRyxpQ0FBdUIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV0RyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUVoQyxJQUFJLENBQUMsYUFBYSxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUzQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xELHNCQUFzQixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFdkQsTUFBTSwrQkFBK0IsR0FBRyxJQUFJLCtCQUErQixFQUFFLENBQUM7UUFDOUUsTUFBTSxpQkFBaUIsR0FBdUI7WUFDN0MsT0FBTyxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3RCLHNCQUFzQixFQUFFLEdBQWtCLEVBQUU7Z0JBQzNDLElBQUksSUFBSSxDQUFDLHFCQUFxQiwwQ0FBa0MsRUFBRSxDQUFDO29CQUNsRSwwREFBMEQ7b0JBQzFELHlGQUF5RjtvQkFDekYsOEdBQThHO29CQUM5RyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0QyxJQUFJLFFBQVEsQ0FBQyxXQUFXLElBQUksU0FBUyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7d0JBQ2pELE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO3dCQUU5QyxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQ3ZELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQzs0QkFDN0IsVUFBVSxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDekQsQ0FBQzt3QkFFRCxJQUFJLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7NEJBQzNCLE9BQU8sSUFBSSxhQUFhLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUM5RyxDQUFDO29CQUNGLENBQUM7b0JBQ0Qsc0dBQXNHO29CQUN0RyxzR0FBc0c7b0JBQ3RHLGlCQUFpQjtvQkFDakIscURBQXFEO29CQUNyRCxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUM7b0JBQ3hCLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLDBDQUFrQyxHQUFHLFdBQVcsRUFBRSxDQUFDO3dCQUM3SixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsU0FBUywwQ0FBa0MsQ0FBQzt3QkFDakcsT0FBTyxJQUFJLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUM5RCxDQUFDO29CQUVELDZGQUE2RjtvQkFDN0YsZ0dBQWdHO29CQUNoRywrQkFBK0I7b0JBQy9CLElBQUksT0FBTyxDQUFDLFFBQVEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO3dCQUM5QyxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQzt3QkFDN0MsT0FBTyxJQUFJLGFBQWEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUN2RixDQUFDO29CQUVELE9BQU8sYUFBYSxDQUFDLEtBQUssQ0FBQztnQkFDNUIsQ0FBQztnQkFFRCxJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDdkIseUVBQXlFO29CQUN6RSx3RUFBd0U7b0JBQ3hFLG1EQUFtRDtvQkFDbkQsMkRBQTJEO29CQUMzRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN0QyxJQUFJLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO3dCQUN6QixNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQzt3QkFDOUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDeEYsSUFBSSxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDOzRCQUMvQixPQUFPLElBQUksYUFBYSxDQUFDLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUN4SCxDQUFDO29CQUNGLENBQUM7b0JBQ0QsT0FBTyxhQUFhLENBQUMsS0FBSyxDQUFDO2dCQUM1QixDQUFDO2dCQUVELE1BQU0sd0JBQXdCLEdBQUcsK0JBQStCLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLHFCQUFxQix5Q0FBaUMsQ0FBQyxDQUFDO2dCQUM3TixPQUFPLGFBQWEsQ0FBQyw0QkFBNEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1lBQzdFLENBQUM7WUFFRCxtQkFBbUIsRUFBRSxDQUFDLGtCQUE0QixFQUFFLFdBQW1CLEVBQUUsV0FBbUIsRUFBWSxFQUFFO2dCQUN6RyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLHlDQUF5QyxDQUFDLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN4SCxDQUFDO1NBQ0QsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ25GLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRTtZQUM5SSxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7WUFDNUIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO1lBQzFCLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUztZQUM1QixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7U0FDMUIsQ0FBQyxDQUFDLENBQUM7UUFFSiw0Q0FBNEM7UUFDNUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFaEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQWlCLEVBQUUsRUFBRTtZQUNsRSxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQWlCLEVBQUUsRUFBRTtZQUNoRSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQWEsRUFBRSxFQUFFO1lBQzVELElBQUksY0FBYyxHQUFHLEtBQUssQ0FBQztZQUMzQixJQUFJLGVBQWUsR0FBb0IsSUFBSSxDQUFDO1lBQzVDLElBQUksSUFBSSxHQUFrQixJQUFJLENBQUM7WUFDL0IsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2hCLGNBQWMsR0FBRyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUN0RixlQUFlLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxLQUFLLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMxRyxJQUFJLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDeEIsQ0FBQztZQUNELElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMzRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUU7WUFDN0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQVksRUFBRSxFQUFFO1lBQzFELElBQUksQ0FBQyxDQUFDLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLENBQUMsYUFBYSxFQUFFLENBQUM7Z0JBQ3JFLDBDQUEwQztnQkFDMUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO29CQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxrQkFBa0IsS0FBSyxDQUFDLENBQUMsa0JBQWtCLEtBQUssQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7Z0JBQ3pILENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMzRyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO29CQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQ3hDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUMsY0FBeUIsRUFBRSxFQUFFO1lBQ3pGLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUUzRCxtRUFBbUU7WUFDbkUsRUFBRTtZQUNGLHVFQUF1RTtZQUN2RSwyRUFBMkU7WUFDM0UsaUJBQWlCO1lBQ2pCLEVBQUU7WUFDRix5RUFBeUU7WUFDekUscUVBQXFFO1lBQ3JFLDRCQUE0QjtZQUM1QixFQUFFO1lBQ0Ysc0VBQXNFO1lBQ3RFLDRFQUE0RTtZQUM1RSw2RUFBNkU7WUFDN0UsNkRBQTZEO1lBQzdELEVBQUU7WUFDRiw4RUFBOEU7WUFDOUUsK0VBQStFO1lBQy9FLHlFQUF5RTtZQUV6RSxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztZQUNqQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFaEQsTUFBTSxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUU7Z0JBQ25FLGlFQUFpRTtnQkFDakUsTUFBTSxtQkFBbUIsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUNoRyxNQUFNLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzlELE1BQU0sdUJBQXVCLEdBQUcsbUJBQW1CLENBQUMsU0FBUyxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFFbkYsNkVBQTZFO2dCQUM3RSxNQUFNLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdELE1BQU0sNkJBQTZCLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRyxDQUFDLENBQUM7Z0JBQ3RGLE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQzdELE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLDZCQUE2QixDQUFDLENBQUM7Z0JBQ3RHLE1BQU0sd0JBQXdCLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxzQkFBc0IsQ0FBQztnQkFDeEYsTUFBTSxvQkFBb0IsR0FBRyx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLE1BQU0sR0FBRyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUMzSCxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUMvRCxNQUFNLHVCQUF1QixHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFFaEksT0FBTyxFQUFFLHdCQUF3QixFQUFFLHVCQUF1QixFQUFFLENBQUM7WUFDOUQsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUVMLE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFO2dCQUN4QyxnRUFBZ0U7Z0JBQ2hFLE1BQU0sa0JBQWtCLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO2dCQUM1RixNQUFNLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3pELE1BQU0sc0JBQXNCLEdBQUcsZUFBZSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFFOUgsTUFBTSxVQUFVLEdBQUcsc0JBQXNCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN4RCxNQUFNLDRCQUE0QixHQUFHLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLE1BQU0sR0FBRyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFJLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN6RCxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLE1BQU0sRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO2dCQUM1SyxNQUFNLHNCQUFzQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcscUJBQXFCLENBQUM7Z0JBRTdKLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxDQUFDO1lBQ25DLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFTCx1RUFBdUU7WUFDdkUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUNsQyxVQUFVLEVBQ1YsSUFBSSxFQUNKLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLDZFQUczRCxDQUFDO1lBRUYsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksbUJBQW1CLENBQzlDLElBQUksQ0FBQyxRQUFRLEVBQ2IsY0FBYyxDQUFDLGVBQWUsRUFDOUIsd0JBQXdCLEVBQ3hCLHVCQUF1QixFQUN2QixzQkFBc0IsQ0FDdEIsQ0FBQztZQUVGLHlFQUF5RTtZQUN6RSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXBHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRWYsb0JBQW9CO1lBQ3BCLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLGFBQWEsZ0NBQWdDLFlBQVksQ0FBQyxDQUFDO1lBRXRGLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN4QyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFtQixFQUFFLEVBQUU7WUFDOUUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUM1QixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFO1lBRXhELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7WUFFN0IsNkVBQTZFO1lBQzdFLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsaUJBQWlCLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFcEcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBRWYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsYUFBYSxnQ0FBZ0MsRUFBRSxDQUFDLENBQUM7WUFDNUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQzVDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRTtZQUMvQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDM0MsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFO1lBQzlDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUNuQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVELElBQVcsT0FBTztRQUNqQixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7SUFDdEIsQ0FBQztJQUVNLHdCQUF3QixDQUFDLE1BQWM7UUFDN0MsSUFBSSxDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRU0sa0JBQWtCO1FBQ3hCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7SUFDOUIsQ0FBQztJQUVlLE9BQU87UUFDdEIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxRQUFrQjtRQUNuRCxNQUFNLHVCQUF1QixHQUFHLGlDQUFpQyxDQUFDO1FBQ2xFLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDaEYsTUFBTSxjQUFjLEdBQUcsdUJBQXVCLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFNUUsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDbEMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLElBQUksU0FBUyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDaEMsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ2pCLE9BQU8sUUFBUSxHQUFHLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQ25ELElBQUksU0FBUyxJQUFJLFdBQVcsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUNuQixDQUFDO1lBQ0QsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDekQsTUFBTSxTQUFTLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDL0MsSUFBSSxTQUFTLHVDQUErQixFQUFFLENBQUM7b0JBQzlDLFNBQVMsR0FBRyxLQUFLLENBQUM7Z0JBQ25CLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxXQUFXLEVBQUUsQ0FBQztnQkFDZixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksVUFBVSxJQUFJLFNBQVMsR0FBRyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ2xELFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDcEIsQ0FBQztZQUNELElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUMvQyxJQUFJLFNBQVMsdUNBQStCLEVBQUUsQ0FBQztvQkFDOUMsVUFBVSxHQUFHLEtBQUssQ0FBQztnQkFDcEIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLFNBQVMsRUFBRSxDQUFDO2dCQUNiLENBQUM7WUFDRixDQUFDO1lBQ0QsUUFBUSxFQUFFLENBQUM7UUFDWixDQUFDO1FBRUQsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsQ0FBQztJQUMvRixDQUFDO0lBRU8sc0JBQXNCLENBQUMsUUFBa0I7UUFDaEQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNoRixNQUFNLGNBQWMsR0FBRyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsR0FBRyx1Q0FBNkIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV6SCxJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQzdCLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztRQUNqQixPQUFPLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuQixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNwRCxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLElBQUksU0FBUyx1Q0FBK0IsSUFBSSxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUM7Z0JBQy9ELE9BQU8sV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDL0QsQ0FBQztZQUNELFFBQVEsRUFBRSxDQUFDO1lBQ1gsTUFBTSxFQUFFLENBQUM7UUFDVixDQUFDO1FBQ0QsT0FBTyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTywyQkFBMkIsQ0FBQyxRQUFrQjtRQUNyRCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNoRixNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDM0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hELE9BQU8sVUFBVSxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBRU8sd0JBQXdCLENBQUMsT0FBK0I7UUFDL0QsSUFBSSxDQUFDLHFCQUFxQixHQUFHLE9BQU8sQ0FBQyxHQUFHLDJDQUFtQyxDQUFDO1FBQzVFLE1BQU0scUJBQXFCLEdBQUcsT0FBTyxDQUFDLEdBQUcsNENBQW9DLENBQUM7UUFDOUUsSUFBSSxJQUFJLENBQUMscUJBQXFCLHlDQUFpQyxJQUFJLHFCQUFxQixLQUFLLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUMvSSxnSkFBZ0o7WUFDaEosSUFBSSxDQUFDLHNCQUFzQixHQUFHLEdBQUcsQ0FBQztRQUNuQyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxxQkFBcUIsQ0FBQztRQUNyRCxDQUFDO1FBRUQsa0VBQWtFO1FBQ2xFLHNIQUFzSDtRQUN0SCwyRkFBMkY7UUFDM0YsMkVBQTJFO1FBQzNFLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLG1DQUF5QixDQUFDO1FBQ3hELE1BQU0sY0FBYyxHQUFHLFVBQVUsQ0FBQyxjQUFjLENBQUM7UUFDakQsSUFBSSxjQUFjLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLHFCQUFxQiwwQ0FBa0MsRUFBRSxDQUFDO1lBQzNGLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDO1lBQ3BELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7WUFDOUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsR0FBRyxRQUFRLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUM1RixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7WUFDL0IsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDRixDQUFDO0lBRUQsMkJBQTJCO0lBRVgsc0JBQXNCLENBQUMsQ0FBMkM7UUFDakYsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3BELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLG1DQUF5QixDQUFDO1FBRXhELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxXQUFXLENBQUM7UUFDM0MsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFVLENBQUMsWUFBWSxDQUFDO1FBQzdDLElBQUksQ0FBQyxjQUFjLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUN4QyxJQUFJLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDO1FBQ3BELElBQUksQ0FBQyx3QkFBd0IsR0FBRyxPQUFPLENBQUMsR0FBRywrQ0FBc0MsQ0FBQztRQUNsRixJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BHLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDL0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sR0FBRyxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsSUFBSSxDQUFDO1FBQ2pGLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSwrQkFBK0IsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUM1RyxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLEdBQUcsbUNBQTJCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxpQ0FBdUIsQ0FBQyxDQUFDLENBQUM7UUFFbkYsSUFBSSxDQUFDLENBQUMsVUFBVSxtQ0FBMEIsSUFBSSxDQUFDLENBQUMsVUFBVSxpQ0FBdUIsRUFBRSxDQUFDO1lBQ25GLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1FBQ2pDLENBQUM7UUFFRCxJQUFJLENBQUMsQ0FBQyxVQUFVLDJDQUFtQyxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3BFLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDZSxvQkFBb0IsQ0FBQyxDQUF5QztRQUM3RSxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuRCx5RkFBeUY7UUFDekYsd0RBQXdEO1FBQ3hELElBQUksQ0FBQyxjQUFjLENBQUMsMEJBQTBCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDZSxvQkFBb0IsQ0FBQyxDQUF5QztRQUM3RSwrREFBK0Q7UUFDL0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ2UsU0FBUyxDQUFDLENBQThCO1FBQ3ZELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNlLGNBQWMsQ0FBQyxDQUFtQztRQUNqRSxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDZSxjQUFjLENBQUMsQ0FBbUM7UUFDakUsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBQ2UsZUFBZSxDQUFDLENBQW9DO1FBQ25FLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNlLGVBQWUsQ0FBQyxDQUFvQztRQUNuRSxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUM7UUFDaEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzlCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUNlLGNBQWMsQ0FBQyxDQUFtQztRQUNqRSxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCx5QkFBeUI7SUFFekIscUJBQXFCO0lBRWQsU0FBUztRQUNmLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRU0sS0FBSztRQUNYLElBQUksQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDckMsQ0FBQztJQUVNLGlCQUFpQjtRQUN2QixJQUFJLENBQUMsY0FBYyxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDekMsQ0FBQztJQUVNLGlCQUFpQjtRQUN2QixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztJQUNqQyxDQUFDO0lBRU0sY0FBYyxDQUFDLE9BQTJCO1FBQ2hELElBQUksT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQy9FLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUNELElBQUksT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7SUFFRCxtQkFBbUI7SUFFWCx3QkFBd0I7UUFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3BELDJGQUEyRjtRQUMzRixpQ0FBaUM7UUFDakMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsbUNBQTBCLElBQUksT0FBTyxDQUFDLEdBQUcsaUNBQXVCLENBQUMsQ0FBQztRQUNsSCxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2pCLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNoRCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLENBQUM7SUFDRixDQUFDO0lBS00sYUFBYSxDQUFDLEdBQXFCO1FBQ3pDLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdkgsSUFBSSxDQUFDLDBCQUEwQixHQUFHLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMzRixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTSxNQUFNLENBQUMsR0FBK0I7UUFDNUMsSUFBSSxDQUFDLGNBQWMsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6RCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQztJQUVPLE9BQU87UUFDZCxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzNCLG1EQUFtRDtZQUVuRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsb0JBQW9CLENBQUM7WUFDaEUsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDO1lBQzVELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUM7WUFDMUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQztZQUN0RCxJQUFJLGFBQWEsSUFBSSxXQUFXLElBQUksWUFBWSxJQUFJLFVBQVUsSUFBSSxVQUFVLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxXQUFXLElBQUksWUFBWSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDckssTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsVUFBVSxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNoSSxNQUFNLFNBQVMsR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFFNUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixDQUFDO2dCQUNuRSxJQUFJLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3RFLGdGQUFnRjtnQkFDaEYsc0dBQXNHO2dCQUN0Ryw4RkFBOEY7Z0JBQzlGLGtFQUFrRTtnQkFDbEUsNkNBQTZDO2dCQUM3QyxLQUFLO2dCQUNMLGlDQUFpQztnQkFDakMsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxZQUFZLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztnQkFDcEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO29CQUM5Qix1REFBdUQ7b0JBQ3ZELG9EQUFvRDtvQkFDcEQseUJBQXlCO29CQUN6QixNQUFNLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLENBQUM7b0JBQ3pDLElBQUksSUFBSSxLQUFLLENBQUM7b0JBQ2QsVUFBVSxJQUFJLEtBQUssQ0FBQztvQkFDcEIsS0FBSyxJQUFJLEtBQUssQ0FBQztnQkFDaEIsQ0FBQztnQkFDRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQ2hDLHNEQUFzRDtvQkFDdEQsdUJBQXVCO29CQUN2QixLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztnQkFDNUIsQ0FBQztnQkFFRCxrRkFBa0Y7Z0JBQ2xGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDakcsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUM7Z0JBQzVGLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3ZGLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDN0YsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxXQUFXLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN6RixNQUFNLHdCQUF3QixHQUFHLENBQUMsZUFBZSxLQUFLLGFBQWEsQ0FBQyxDQUFDO2dCQUNyRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQzVELENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FDeEYsQ0FBQztnQkFFRixJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQztnQkFDekQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztnQkFFOUMsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDZCxrQkFBa0IsRUFBRSxJQUFJO29CQUN4QixHQUFHLEVBQUUsR0FBRztvQkFDUixJQUFJLEVBQUUsSUFBSTtvQkFDVixLQUFLLEVBQUUsS0FBSztvQkFDWixNQUFNLEVBQUUsVUFBVTtvQkFDbEIsUUFBUSxFQUFFLEtBQUs7b0JBQ2YsS0FBSyxFQUFFLENBQUMsb0JBQW9CLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQztvQkFDMUUsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNO29CQUMzQixJQUFJLEVBQUUsWUFBWSxDQUFDLElBQUk7b0JBQ3ZCLFNBQVMsRUFBRSxZQUFZLENBQUMsU0FBUztvQkFDakMsYUFBYSxFQUFFLFlBQVksQ0FBQyxhQUFhO29CQUN6QyxRQUFRO2lCQUNSLENBQUMsQ0FBQztZQUNKLENBQUM7WUFDRCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUN0QywrRUFBK0U7WUFDL0UsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUN6RixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUMvRSxpQ0FBaUM7WUFDakMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUM5SCxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUMxQyxpQ0FBaUM7WUFDakMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCw4RkFBOEY7UUFFOUYsSUFBSSxRQUFRLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxxQkFBcUIseUNBQWlDLEVBQUUsQ0FBQztZQUN6RixtRkFBbUY7WUFDbkYsbUhBQW1IO1lBQ25ILE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7WUFDMUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkYsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDZCxrQkFBa0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCO2dCQUMvQyxHQUFHO2dCQUNILElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUk7Z0JBQ3ZELEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYztnQkFDMUIsTUFBTSxFQUFFLFVBQVU7Z0JBQ2xCLFFBQVEsRUFBRSxLQUFLO2FBQ2YsQ0FBQyxDQUFDO1lBQ0gsMEZBQTBGO1lBQzFGLGdFQUFnRTtZQUNoRSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQztZQUN4RSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQywyQkFBMkIsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUNoTCxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQztZQUN6RCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLENBQUM7WUFDZCxrQkFBa0IsRUFBRSxJQUFJLENBQUMsc0JBQXNCO1lBQy9DLEdBQUcsRUFBRSxHQUFHO1lBQ1IsSUFBSSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsSUFBSTtZQUN2RCxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDMUIsTUFBTSxFQUFFLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLFFBQVEsRUFBRSxLQUFLO1NBQ2YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLGdCQUFnQjtRQUN2QiwwRkFBMEY7UUFDMUYscUZBQXFGO1FBQ3JGLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDZCxrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLEdBQUcsRUFBRSxDQUFDO1lBQ04sSUFBSSxFQUFFLENBQUM7WUFDUCxLQUFLLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDMUIsTUFBTSxFQUFFLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLFFBQVEsRUFBRSxJQUFJO1NBQ2QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVPLFNBQVMsQ0FBQyxVQUF1QjtRQUN4QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsVUFBVSxDQUFDLGtCQUFrQixDQUFDO1FBRXpELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDekIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUUvQixhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNsQyxFQUFFLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQixFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QixFQUFFLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoQyxFQUFFLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQyxFQUFFLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMvRCxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuRCxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNyQiwrRUFBK0U7WUFDL0UsRUFBRSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBQ0QsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXRILEdBQUcsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFM0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBRXBELElBQUksT0FBTyxDQUFDLEdBQUcsbUNBQTBCLEVBQUUsQ0FBQztZQUMzQyxHQUFHLENBQUMsWUFBWSxDQUFDLHlDQUF5QyxHQUFHLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxPQUFPLENBQUMsR0FBRyxtQ0FBMEIsQ0FBQyxVQUFVLHNDQUE4QixFQUFFLENBQUM7Z0JBQ3BGLEdBQUcsQ0FBQyxZQUFZLENBQUMseUNBQXlDLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDN0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLEdBQUcsQ0FBQyxZQUFZLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUM1RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBbHZCWSxtQkFBbUI7SUF3QzdCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxxQkFBcUIsQ0FBQTtHQXpDWCxtQkFBbUIsQ0FrdkIvQjs7QUFrQkQsU0FBUyxXQUFXLENBQUMsY0FBd0IsRUFBRSxJQUFZLEVBQUUsUUFBa0IsRUFBRSxPQUFlO0lBQy9GLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN2QixPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3RELFNBQVMsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQztJQUN0QyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxVQUFVLENBQUM7SUFDakMsU0FBUyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDO0lBRWxDLE1BQU0sY0FBYyxHQUFHLGNBQWMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDNUQsYUFBYSxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUN4QyxjQUFjLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUMsQ0FBQyx5QkFBeUI7SUFDbEUsY0FBYyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsR0FBRyxPQUFPLEdBQUcsUUFBUSxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMseUJBQXlCO0lBQzlGLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsU0FBUyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUV0QyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUUzQyxNQUFNLEdBQUcsR0FBRyxjQUFjLENBQUMsV0FBVyxDQUFDO0lBRXZDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUVuQixPQUFPLEdBQUcsQ0FBQztBQUNaLENBQUMifQ==