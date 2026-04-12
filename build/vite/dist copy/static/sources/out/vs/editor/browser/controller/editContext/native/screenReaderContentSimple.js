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
import { addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Selection } from '../../../../common/core/selection.js';
import { SimplePagedScreenReaderStrategy } from '../screenReaderUtils.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IME } from '../../../../../base/common/ime.js';
let SimpleScreenReaderContent = class SimpleScreenReaderContent extends Disposable {
    constructor(_domNode, _context, _viewController, _accessibilityService) {
        super();
        this._domNode = _domNode;
        this._context = _context;
        this._viewController = _viewController;
        this._accessibilityService = _accessibilityService;
        this._selectionChangeListener = this._register(new MutableDisposable());
        this._accessibilityPageSize = 1;
        this._ignoreSelectionChangeTime = 0;
        this._strategy = new SimplePagedScreenReaderStrategy();
        this.onConfigurationChanged(this._context.configuration.options);
    }
    updateScreenReaderContent(primarySelection) {
        const domNode = this._domNode.domNode;
        const focusedElement = getActiveWindow().document.activeElement;
        if (!focusedElement || focusedElement !== domNode) {
            return;
        }
        const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
        if (isScreenReaderOptimized) {
            this._state = this._getScreenReaderContentState(primarySelection);
            if (domNode.textContent !== this._state.value) {
                this._setIgnoreSelectionChangeTime('setValue');
                domNode.textContent = this._state.value;
            }
            const selection = getActiveWindow().document.getSelection();
            if (!selection) {
                return;
            }
            const data = this._getScreenReaderRange(this._state.selectionStart, this._state.selectionEnd);
            if (!data) {
                return;
            }
            this._setIgnoreSelectionChangeTime('setRange');
            selection.setBaseAndExtent(data.anchorNode, data.anchorOffset, data.focusNode, data.focusOffset);
        }
        else {
            this._state = undefined;
            this._setIgnoreSelectionChangeTime('setValue');
            this._domNode.domNode.textContent = '';
        }
    }
    updateScrollTop(primarySelection) {
        if (!this._state) {
            return;
        }
        const viewLayout = this._context.viewModel.viewLayout;
        const stateStartLineNumber = this._state.startPositionWithinEditor.lineNumber;
        const verticalOffsetOfStateStartLineNumber = viewLayout.getVerticalOffsetForLineNumber(stateStartLineNumber);
        const verticalOffsetOfPositionLineNumber = viewLayout.getVerticalOffsetForLineNumber(primarySelection.positionLineNumber);
        this._domNode.domNode.scrollTop = verticalOffsetOfPositionLineNumber - verticalOffsetOfStateStartLineNumber;
    }
    onFocusChange(newFocusValue) {
        if (newFocusValue) {
            this._selectionChangeListener.value = this._setSelectionChangeListener();
        }
        else {
            this._selectionChangeListener.value = undefined;
        }
    }
    onConfigurationChanged(options) {
        this._accessibilityPageSize = options.get(3 /* EditorOption.accessibilityPageSize */);
    }
    onWillCut() {
        this._setIgnoreSelectionChangeTime('onCut');
    }
    onWillPaste() {
        this._setIgnoreSelectionChangeTime('onWillPaste');
    }
    // --- private methods
    _setIgnoreSelectionChangeTime(reason) {
        this._ignoreSelectionChangeTime = Date.now();
    }
    _setSelectionChangeListener() {
        // See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
        // When using a Braille display or NVDA for example, it is possible for users to reposition the
        // system caret. This is reflected in Chrome as a `selectionchange` event and needs to be reflected within the editor.
        // `selectionchange` events often come multiple times for a single logical change
        // so throttle multiple `selectionchange` events that burst in a short period of time.
        let previousSelectionChangeEventTime = 0;
        return addDisposableListener(this._domNode.domNode.ownerDocument, 'selectionchange', () => {
            const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
            if (!this._state || !isScreenReaderOptimized || !IME.enabled) {
                return;
            }
            const activeElement = getActiveWindow().document.activeElement;
            const isFocused = activeElement === this._domNode.domNode;
            if (!isFocused) {
                return;
            }
            const selection = getActiveWindow().document.getSelection();
            if (!selection) {
                return;
            }
            const rangeCount = selection.rangeCount;
            if (rangeCount === 0) {
                return;
            }
            const range = selection.getRangeAt(0);
            const now = Date.now();
            const delta1 = now - previousSelectionChangeEventTime;
            previousSelectionChangeEventTime = now;
            if (delta1 < 5) {
                // received another `selectionchange` event within 5ms of the previous `selectionchange` event
                // => ignore it
                return;
            }
            const delta2 = now - this._ignoreSelectionChangeTime;
            this._ignoreSelectionChangeTime = 0;
            if (delta2 < 100) {
                // received a `selectionchange` event within 100ms since we touched the hidden div
                // => ignore it, since we caused it
                return;
            }
            this._viewController.setSelection(this._getEditorSelectionFromDomRange(this._context, this._state, selection.direction, range));
        });
    }
    _getScreenReaderContentState(primarySelection) {
        const state = this._strategy.fromEditorSelection(this._context.viewModel, primarySelection, this._accessibilityPageSize, this._accessibilityService.getAccessibilitySupport() === 0 /* AccessibilitySupport.Unknown */);
        const endPosition = this._context.viewModel.model.getPositionAt(Infinity);
        let value = state.value;
        if (endPosition.column === 1 && primarySelection.getEndPosition().equals(endPosition)) {
            value += '\n';
        }
        state.value = value;
        return state;
    }
    _getScreenReaderRange(selectionOffsetStart, selectionOffsetEnd) {
        const textContent = this._domNode.domNode.firstChild;
        if (!textContent) {
            return;
        }
        const range = new globalThis.Range();
        range.setStart(textContent, selectionOffsetStart);
        range.setEnd(textContent, selectionOffsetEnd);
        return {
            anchorNode: textContent,
            anchorOffset: selectionOffsetStart,
            focusNode: textContent,
            focusOffset: selectionOffsetEnd
        };
    }
    _getEditorSelectionFromDomRange(context, state, direction, range) {
        const viewModel = context.viewModel;
        const model = viewModel.model;
        const coordinatesConverter = viewModel.coordinatesConverter;
        const modelScreenReaderContentStartPositionWithinEditor = coordinatesConverter.convertViewPositionToModelPosition(state.startPositionWithinEditor);
        const offsetOfStartOfScreenReaderContent = model.getOffsetAt(modelScreenReaderContentStartPositionWithinEditor);
        let offsetOfSelectionStart = range.startOffset + offsetOfStartOfScreenReaderContent;
        let offsetOfSelectionEnd = range.endOffset + offsetOfStartOfScreenReaderContent;
        const modelUsesCRLF = model.getEndOfLineSequence() === 1 /* EndOfLineSequence.CRLF */;
        if (modelUsesCRLF) {
            const screenReaderContentText = state.value;
            const offsetTransformer = new PositionOffsetTransformer(screenReaderContentText);
            const positionOfStartWithinText = offsetTransformer.getPosition(range.startOffset);
            const positionOfEndWithinText = offsetTransformer.getPosition(range.endOffset);
            offsetOfSelectionStart += positionOfStartWithinText.lineNumber - 1;
            offsetOfSelectionEnd += positionOfEndWithinText.lineNumber - 1;
        }
        const positionOfSelectionStart = model.getPositionAt(offsetOfSelectionStart);
        const positionOfSelectionEnd = model.getPositionAt(offsetOfSelectionEnd);
        const selectionStart = direction === 'forward' ? positionOfSelectionStart : positionOfSelectionEnd;
        const selectionEnd = direction === 'forward' ? positionOfSelectionEnd : positionOfSelectionStart;
        return Selection.fromPositions(selectionStart, selectionEnd);
    }
};
SimpleScreenReaderContent = __decorate([
    __param(3, IAccessibilityService)
], SimpleScreenReaderContent);
export { SimpleScreenReaderContent };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyZWVuUmVhZGVyQ29udGVudFNpbXBsZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvbmF0aXZlL3NjcmVlblJlYWRlckNvbnRlbnRTaW1wbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTVGLE9BQU8sRUFBd0IscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUk1SCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLCtCQUErQixFQUFtQyxNQUFNLHlCQUF5QixDQUFDO0FBQzNHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxVQUFVLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJakQsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO0lBVXhELFlBQ2tCLFFBQWtDLEVBQ2xDLFFBQXFCLEVBQ3JCLGVBQStCLEVBQ3pCLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUxTLGFBQVEsR0FBUixRQUFRLENBQTBCO1FBQ2xDLGFBQVEsR0FBUixRQUFRLENBQWE7UUFDckIsb0JBQWUsR0FBZixlQUFlLENBQWdCO1FBQ1IsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQVpwRSw2QkFBd0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBRTVFLDJCQUFzQixHQUFXLENBQUMsQ0FB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