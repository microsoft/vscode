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
import './nativeEditContext.css';
import { isFirefox } from '../../../../../base/browser/browser.js';
import { addDisposableListener, getActiveElement, getWindow, getWindowId } from '../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CopyOptions, createClipboardCopyEvent, createClipboardPasteEvent } from '../clipboardUtils.js';
import { AbstractEditContext } from '../editContext.js';
import { editContextAddDisposableListener, FocusTracker } from './nativeEditContextUtils.js';
import { ScreenReaderSupport } from './screenReaderSupport.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { Position } from '../../../../common/core/position.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { EditContext } from './editContextFactory.js';
import { NativeEditContextRegistry } from './nativeEditContextRegistry.js';
import { isHighSurrogate, isLowSurrogate } from '../../../../../base/common/strings.js';
import { IME } from '../../../../../base/common/ime.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { inputLatency } from '../../../../../base/browser/performance.js';
// Corresponds to classes in nativeEditContext.css
var CompositionClassName;
(function (CompositionClassName) {
    CompositionClassName["NONE"] = "edit-context-composition-none";
    CompositionClassName["SECONDARY"] = "edit-context-composition-secondary";
    CompositionClassName["PRIMARY"] = "edit-context-composition-primary";
})(CompositionClassName || (CompositionClassName = {}));
let NativeEditContext = class NativeEditContext extends AbstractEditContext {
    constructor(ownerID, context, overflowGuardContainer, _viewController, _visibleRangeProvider, instantiationService, logService) {
        super(context);
        this._viewController = _viewController;
        this._visibleRangeProvider = _visibleRangeProvider;
        this.logService = logService;
        this._previousEditContextSelection = new OffsetRange(0, 0);
        this._previousEditContextText = '';
        this._editContextPrimarySelection = new Selection(1, 1, 1, 1);
        this._parentBounds = null;
        this._decorations = [];
        this._primarySelection = new Selection(1, 1, 1, 1);
        this._targetWindowId = -1;
        this._scrollTop = 0;
        this._scrollLeft = 0;
        this._linesVisibleRanges = null;
        this.domNode = new FastDomNode(document.createElement('div'));
        this.domNode.setClassName(`native-edit-context`);
        this._imeTextArea = new FastDomNode(document.createElement('textarea'));
        this._imeTextArea.setClassName(`ime-text-area`);
        this._imeTextArea.setAttribute('readonly', 'true');
        this._imeTextArea.setAttribute('tabindex', '-1');
        this._imeTextArea.setAttribute('aria-hidden', 'true');
        this.domNode.setAttribute('autocorrect', 'off');
        this.domNode.setAttribute('autocapitalize', 'off');
        this.domNode.setAttribute('autocomplete', 'off');
        this.domNode.setAttribute('spellcheck', 'false');
        this._updateDomAttributes();
        overflowGuardContainer.appendChild(this.domNode);
        overflowGuardContainer.appendChild(this._imeTextArea);
        this._parent = overflowGuardContainer.domNode;
        this._focusTracker = this._register(new FocusTracker(logService, this.domNode.domNode, (newFocusValue) => {
            logService.trace('NativeEditContext#handleFocusChange : ', newFocusValue);
            this._screenReaderSupport.handleFocusChange(newFocusValue);
            this._context.viewModel.setHasFocus(newFocusValue);
        }));
        const window = getWindow(this.domNode.domNode);
        this._editContext = EditContext.create(window);
        this.setEditContextOnDomNode();
        this._screenReaderSupport = this._register(instantiationService.createInstance(ScreenReaderSupport, this.domNode, context, this._viewController));
        this._register(addDisposableListener(this.domNode.domNode, 'copy', (e) => {
            this.logService.trace('NativeEditContext#copy');
            // !!!!!
            // This is a workaround for what we think is an Electron bug where
            // execCommand('copy') does not always work (it does not fire a clipboard event)
            // !!!!!
            // We signal that we have executed a copy command
            CopyOptions.electronBugWorkaroundCopyEventHasFired = true;
            const copyEvent = createClipboardCopyEvent(e, /* isCut */ false, this._context, this.logService, isFirefox);
            this._onWillCopy.fire(copyEvent);
            if (copyEvent.isHandled) {
                return;
            }
            copyEvent.ensureClipboardGetsEditorData();
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'cut', (e) => {
            this.logService.trace('NativeEditContext#cut');
            const cutEvent = createClipboardCopyEvent(e, /* isCut */ true, this._context, this.logService, isFirefox);
            this._onWillCut.fire(cutEvent);
            if (cutEvent.isHandled) {
                return;
            }
            // Pretend here we touched the text area, as the `cut` event will most likely
            // result in a `selectionchange` event which we want to ignore
            this._screenReaderSupport.onWillCut();
            cutEvent.ensureClipboardGetsEditorData();
            this.logService.trace('NativeEditContext#cut (before viewController.cut)');
            this._viewController.cut();
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'selectionchange', () => {
            inputLatency.onSelectionChange();
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'keyup', (e) => this._onKeyUp(e)));
        this._register(addDisposableListener(this.domNode.domNode, 'keydown', async (e) => this._onKeyDown(e)));
        this._register(addDisposableListener(this._imeTextArea.domNode, 'keyup', (e) => this._onKeyUp(e)));
        this._register(addDisposableListener(this._imeTextArea.domNode, 'keydown', async (e) => this._onKeyDown(e)));
        this._register(addDisposableListener(this.domNode.domNode, 'beforeinput', async (e) => {
            inputLatency.onBeforeInput();
            if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
                this._onType(this._viewController, { text: '\n', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
            }
        }));
        this._register(addDisposableListener(this.domNode.domNode, 'paste', (e) => {
            this.logService.trace('NativeEditContext#paste');
            const pasteEvent = createClipboardPasteEvent(e);
            this._onWillPaste.fire(pasteEvent);
            if (pasteEvent.isHandled) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            if (!e.clipboardData) {
                return;
            }
            this.logService.trace('NativeEditContext#paste with id : ', pasteEvent.metadata?.id, ' with text.length: ', pasteEvent.text.length);
            if (!pasteEvent.text) {
                return;
            }
            let pasteOnNewLine = false;
            let multicursorText = null;
            let mode = null;
            if (pasteEvent.metadata) {
                const options = this._context.configuration.options;
                const emptySelectionClipboard = options.get(45 /* EditorOption.emptySelectionClipboard */);
                pasteOnNewLine = emptySelectionClipboard && !!pasteEvent.metadata.isFromEmptySelection;
                multicursorText = typeof pasteEvent.metadata.multicursorText !== 'undefined' ? pasteEvent.metadata.multicursorText : null;
                mode = pasteEvent.metadata.mode;
            }
            this.logService.trace('NativeEditContext#paste (before viewController.paste)');
            this._viewController.paste(pasteEvent.text, pasteOnNewLine, multicursorText, mode);
        }));
        // Edit context events
        this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', (e) => this._handleTextFormatUpdate(e)));
        this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', (e) => this._updateCharacterBounds(e)));
        let highSurrogateCharacter;
        this._register(editContextAddDisposableListener(this._editContext, 'textupdate', (e) => {
            inputLatency.onInput();
            const text = e.text;
            if (text.length === 1) {
                const charCode = text.charCodeAt(0);
                if (isHighSurrogate(charCode)) {
                    highSurrogateCharacter = text;
                    return;
                }
                if (isLowSurrogate(charCode) && highSurrogateCharacter) {
                    const textUpdateEvent = {
                        text: highSurrogateCharacter + text,
                        selectionEnd: e.selectionEnd,
                        selectionStart: e.selectionStart,
                        updateRangeStart: e.updateRangeStart - 1,
                        updateRangeEnd: e.updateRangeEnd - 1
                    };
                    highSurrogateCharacter = undefined;
                    this._emitTypeEvent(this._viewController, textUpdateEvent);
                    return;
                }
            }
            this._emitTypeEvent(this._viewController, e);
        }));
        this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', (e) => {
            this._updateEditContext();
            // Utlimately fires onDidCompositionStart() on the editor to notify for example suggest model of composition state
            // Updates the composition state of the cursor controller which determines behavior of typing with interceptors
            this._viewController.compositionStart();
            // Emits ViewCompositionStartEvent which can be depended on by ViewEventHandlers
            this._context.viewModel.onCompositionStart();
        }));
        this._register(editContextAddDisposableListener(this._editContext, 'compositionend', (e) => {
            this._updateEditContext();
            // Utlimately fires compositionEnd() on the editor to notify for example suggest model of composition state
            // Updates the composition state of the cursor controller which determines behavior of typing with interceptors
            this._viewController.compositionEnd();
            // Emits ViewCompositionEndEvent which can be depended on by ViewEventHandlers
            this._context.viewModel.onCompositionEnd();
        }));
        let reenableTracking = false;
        this._register(IME.onDidChange(() => {
            if (IME.enabled && reenableTracking) {
                this._focusTracker.resume();
                this.domNode.focus();
                reenableTracking = false;
            }
            if (!IME.enabled && this.isFocused()) {
                this._focusTracker.pause();
                this._imeTextArea.focus();
                reenableTracking = true;
            }
        }));
        this._register(NativeEditContextRegistry.register(ownerID, this));
        this._register(context.viewModel.model.onDidChangeContent((e) => {
            let doChange = false;
            for (const change of e.changes) {
                if (change.range.startLineNumber <= this._editContextPrimarySelection.endLineNumber
                    && change.range.endLineNumber >= this._editContextPrimarySelection.startLineNumber) {
                    doChange = true;
                    break;
                }
            }
            if (doChange) {
                this._updateEditContext();
            }
        }));
    }
    // --- Public methods ---
    dispose() {
        // Force blue the dom node so can write in pane with no native edit context after disposal
        this.domNode.domNode.editContext = undefined;
        this.domNode.domNode.blur();
        this.domNode.domNode.remove();
        this._imeTextArea.domNode.remove();
        super.dispose();
    }
    setAriaOptions(options) {
        this._screenReaderSupport.setAriaOptions(options);
    }
    /* Last rendered data needed for correct hit-testing and determining the mouse position.
     * Without this, the selection will blink as incorrect mouse position is calculated */
    getLastRenderData() {
        return this._primarySelection.getPosition();
    }
    onBeforeRender(viewportData) {
        // We need to read the position of the container dom node
        // It is best to do this before we begin touching the DOM at all
        // Because the sync layout will be fast if we do it here
        this._parentBounds = this._parent.getBoundingClientRect();
    }
    prepareRender(ctx) {
        this._screenReaderSupport.prepareRender(ctx);
        this._updateSelectionAndControlBoundsData(ctx);
    }
    render(ctx) {
        this._screenReaderSupport.render(ctx);
        this._updateSelectionAndControlBounds();
    }
    onCursorStateChanged(e) {
        this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
        this._screenReaderSupport.onCursorStateChanged(e);
        this._updateEditContext();
        return true;
    }
    onConfigurationChanged(e) {
        this._screenReaderSupport.onConfigurationChanged(e);
        this._updateDomAttributes();
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
    handleWillPaste() {
        this.logService.trace('NativeEditContext#handleWillPaste');
        this._prepareScreenReaderForPaste();
    }
    _prepareScreenReaderForPaste() {
        this._screenReaderSupport.onWillPaste();
    }
    handleWillCopy() {
        this.logService.trace('NativeEditContext#handleWillCopy');
        this.logService.trace('NativeEditContext#isFocused : ', this.domNode.domNode === getActiveElement());
    }
    writeScreenReaderContent() {
        this._screenReaderSupport.writeScreenReaderContent();
    }
    isFocused() {
        return this._focusTracker.isFocused;
    }
    focus() {
        this._focusTracker.focus();
        // If the editor is off DOM, focus cannot be really set, so let's double check that we have managed to set the focus
        this.refreshFocusState();
    }
    refreshFocusState() {
        this._focusTracker.refreshFocusState();
    }
    // TODO: added as a workaround fix for https://github.com/microsoft/vscode/issues/229825
    // When this issue will be fixed the following should be removed.
    setEditContextOnDomNode() {
        const targetWindow = getWindow(this.domNode.domNode);
        const targetWindowId = getWindowId(targetWindow);
        if (this._targetWindowId !== targetWindowId) {
            this.domNode.domNode.editContext = this._editContext;
            this._targetWindowId = targetWindowId;
        }
    }
    // --- Private methods ---
    _onKeyUp(e) {
        inputLatency.onKeyUp();
        this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
    }
    _onKeyDown(e) {
        inputLatency.onKeyDown();
        const standardKeyboardEvent = new StandardKeyboardEvent(e);
        // When the IME is visible, the keys, like arrow-left and arrow-right, should be used to navigate in the IME, and should not be propagated further
        if (standardKeyboardEvent.keyCode === 114 /* KeyCode.KEY_IN_COMPOSITION */) {
            standardKeyboardEvent.stopPropagation();
        }
        this._viewController.emitKeyDown(standardKeyboardEvent);
    }
    _updateDomAttributes() {
        const options = this._context.configuration.options;
        this.domNode.domNode.setAttribute('tabindex', String(options.get(140 /* EditorOption.tabIndex */)));
    }
    _updateEditContext() {
        const editContextState = this._getNewEditContextState();
        if (!editContextState) {
            return;
        }
        const newText = editContextState.text ?? ' ';
        if (newText !== this._previousEditContextText) {
            this._editContext.updateText(0, this._previousEditContextText.length, newText);
            this._previousEditContextText = newText;
        }
        if (editContextState.selectionStartOffset !== this._previousEditContextSelection.start ||
            editContextState.selectionEndOffset !== this._previousEditContextSelection.endExclusive) {
            this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
        }
        this._editContextPrimarySelection = editContextState.editContextPrimarySelection;
        this._previousEditContextSelection = new OffsetRange(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
    }
    _emitTypeEvent(viewController, e) {
        if (!this._editContext) {
            return;
        }
        const selectionEndOffset = this._previousEditContextSelection.endExclusive;
        const selectionStartOffset = this._previousEditContextSelection.start;
        this._previousEditContextSelection = new OffsetRange(e.selectionStart, e.selectionEnd);
        let replaceNextCharCnt = 0;
        let replacePrevCharCnt = 0;
        if (e.updateRangeEnd > selectionEndOffset) {
            replaceNextCharCnt = e.updateRangeEnd - selectionEndOffset;
        }
        if (e.updateRangeStart < selectionStartOffset) {
            replacePrevCharCnt = selectionStartOffset - e.updateRangeStart;
        }
        let text = '';
        if (selectionStartOffset < e.updateRangeStart) {
            text += this._editContext.text.substring(selectionStartOffset, e.updateRangeStart);
        }
        text += e.text;
        if (selectionEndOffset > e.updateRangeEnd) {
            text += this._editContext.text.substring(e.updateRangeEnd, selectionEndOffset);
        }
        let positionDelta = 0;
        if (e.selectionStart === e.selectionEnd && selectionStartOffset === selectionEndOffset) {
            positionDelta = e.selectionStart - (e.updateRangeStart + e.text.length);
        }
        const typeInput = {
            text,
            replacePrevCharCnt,
            replaceNextCharCnt,
            positionDelta
        };
        this._onType(viewController, typeInput);
    }
    _onType(viewController, typeInput) {
        if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
            viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
        }
        else {
            viewController.type(typeInput.text);
        }
    }
    _getNewEditContextState() {
        const editContextPrimarySelection = this._primarySelection;
        const model = this._context.viewModel.model;
        if (!model.isValidRange(editContextPrimarySelection)) {
            return;
        }
        const primarySelectionStartLine = editContextPrimarySelection.startLineNumber;
        const primarySelectionEndLine = editContextPrimarySelection.endLineNumber;
        const endColumnOfEndLineNumber = model.getLineMaxColumn(primarySelectionEndLine);
        const rangeOfText = new Range(primarySelectionStartLine, 1, primarySelectionEndLine, endColumnOfEndLineNumber);
        const text = model.getValueInRange(rangeOfText, 0 /* EndOfLinePreference.TextDefined */);
        const selectionStartOffset = editContextPrimarySelection.startColumn - 1;
        const selectionEndOffset = text.length + editContextPrimarySelection.endColumn - endColumnOfEndLineNumber;
        return {
            text,
            selectionStartOffset,
            selectionEndOffset,
            editContextPrimarySelection
        };
    }
    _editContextStartPosition() {
        return new Position(this._editContextPrimarySelection.startLineNumber, 1);
    }
    _handleTextFormatUpdate(e) {
        if (!this._editContext) {
            return;
        }
        const formats = e.getTextFormats();
        const editContextStartPosition = this._editContextStartPosition();
        const decorations = [];
        formats.forEach(f => {
            const textModel = this._context.viewModel.model;
            const offsetOfEditContextText = textModel.getOffsetAt(editContextStartPosition);
            const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
            const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
            const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
            const thickness = f.underlineThickness.toLowerCase();
            let decorationClassName = CompositionClassName.NONE;
            switch (thickness) {
                case 'thin':
                    decorationClassName = CompositionClassName.SECONDARY;
                    break;
                case 'thick':
                    decorationClassName = CompositionClassName.PRIMARY;
                    break;
            }
            decorations.push({
                range: decorationRange,
                options: {
                    description: 'textFormatDecoration',
                    inlineClassName: decorationClassName,
                }
            });
        });
        this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
    }
    _updateSelectionAndControlBoundsData(ctx) {
        const viewSelection = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(this._primarySelection);
        if (this._primarySelection.isEmpty()) {
            const linesVisibleRanges = ctx.visibleRangeForPosition(viewSelection.getStartPosition());
            this._linesVisibleRanges = linesVisibleRanges;
        }
        else {
            this._linesVisibleRanges = null;
        }
    }
    _updateSelectionAndControlBounds() {
        const options = this._context.configuration.options;
        const contentLeft = options.get(165 /* EditorOption.layoutInfo */).contentLeft;
        const viewSelection = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(this._primarySelection);
        const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(viewSelection.startLineNumber);
        const verticalOffsetEnd = this._context.viewLayout.getVerticalOffsetAfterLineNumber(viewSelection.endLineNumber);
        // !!! Make sure this doesn't force an extra layout
        // !!! by using the cached parent bounds read in onBeforeRender
        const parentBounds = this._parentBounds;
        const top = parentBounds.top + verticalOffsetStart - this._scrollTop;
        const height = verticalOffsetEnd - verticalOffsetStart;
        let left = parentBounds.left + contentLeft - this._scrollLeft;
        let width;
        if (this._primarySelection.isEmpty()) {
            if (this._linesVisibleRanges) {
                left += this._linesVisibleRanges.left;
            }
            width = 0;
        }
        else {
            width = parentBounds.width - contentLeft;
        }
        const selectionBounds = new DOMRect(left, top, width, height);
        this._editContext.updateSelectionBounds(selectionBounds);
        this._editContext.updateControlBounds(selectionBounds);
    }
    _updateCharacterBounds(e) {
        const options = this._context.configuration.options;
        const typicalHalfWidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        const contentLeft = options.get(165 /* EditorOption.layoutInfo */).contentLeft;
        const parentBounds = this._parentBounds;
        const characterBounds = [];
        const offsetTransformer = new PositionOffsetTransformer(this._editContext.text);
        for (let offset = e.rangeStart; offset < e.rangeEnd; offset++) {
            const editContextStartPosition = offsetTransformer.getPosition(offset);
            const textStartLineOffsetWithinEditor = this._editContextPrimarySelection.startLineNumber - 1;
            const characterStartPosition = new Position(textStartLineOffsetWithinEditor + editContextStartPosition.lineNumber, editContextStartPosition.column);
            const characterEndPosition = characterStartPosition.delta(0, 1);
            const characterModelRange = Range.fromPositions(characterStartPosition, characterEndPosition);
            const characterViewRange = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(characterModelRange);
            const characterLinesVisibleRanges = this._visibleRangeProvider.linesVisibleRangesForRange(characterViewRange, true) ?? [];
            const lineNumber = characterViewRange.startLineNumber;
            const characterVerticalOffset = this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
            const top = parentBounds.top + characterVerticalOffset - this._scrollTop;
            let left = 0;
            let width = typicalHalfWidthCharacterWidth;
            if (characterLinesVisibleRanges.length > 0) {
                for (const visibleRange of characterLinesVisibleRanges[0].ranges) {
                    left = visibleRange.left;
                    width = visibleRange.width;
                    break;
                }
            }
            const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(lineNumber);
            characterBounds.push(new DOMRect(parentBounds.left + contentLeft + left - this._scrollLeft, top, width, lineHeight));
        }
        this._editContext.updateCharacterBounds(e.rangeStart, characterBounds);
    }
};
NativeEditContext = __decorate([
    __param(5, IInstantiationService),
    __param(6, ILogService)
], NativeEditContext);
export { NativeEditContext };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlRWRpdENvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L25hdGl2ZS9uYXRpdmVFZGl0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHlCQUF5QixDQUFDO0FBQ2pDLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVyRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQU90RyxPQUFPLEVBQUUsV0FBVyxFQUFFLHdCQUF3QixFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDeEQsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLFlBQVksRUFBYSxNQUFNLDZCQUE2QixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzdGLE9BQU8s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