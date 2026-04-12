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
var RenderedContentHover_1, RenderedContentHoverParts_1;
import { RenderedHoverParts } from './hoverTypes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { EditorHoverStatusBar } from './contentHoverStatusBar.js';
import { HoverCopyButton } from './hoverCopyButton.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import * as dom from '../../../../base/browser/dom.js';
import { MarkdownHoverParticipant } from './markdownHoverParticipant.js';
import { HoverColorPickerParticipant } from '../../colorPicker/browser/hoverColorPicker/hoverColorPickerParticipant.js';
import { localize } from '../../../../nls.js';
import { InlayHintsHover } from '../../inlayHints/browser/inlayHintsHover.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { MarkerHover } from './markerHoverParticipant.js';
let RenderedContentHover = RenderedContentHover_1 = class RenderedContentHover extends Disposable {
    constructor(editor, hoverResult, participants, context, keybindingService, hoverService, clipboardService) {
        super();
        const parts = hoverResult.hoverParts;
        this._renderedHoverParts = this._register(new RenderedContentHoverParts(editor, participants, parts, context, keybindingService, hoverService, clipboardService));
        const contentHoverComputerOptions = hoverResult.options;
        const anchor = contentHoverComputerOptions.anchor;
        const { showAtPosition, showAtSecondaryPosition } = RenderedContentHover_1.computeHoverPositions(editor, anchor.range, parts);
        this.shouldAppearBeforeContent = parts.some(m => m.isBeforeContent);
        this.showAtPosition = showAtPosition;
        this.showAtSecondaryPosition = showAtSecondaryPosition;
        this.initialMousePosX = anchor.initialMousePosX;
        this.initialMousePosY = anchor.initialMousePosY;
        this.shouldFocus = contentHoverComputerOptions.shouldFocus;
        this.source = contentHoverComputerOptions.source;
    }
    get domNode() {
        return this._renderedHoverParts.domNode;
    }
    get domNodeHasChildren() {
        return this._renderedHoverParts.domNodeHasChildren;
    }
    get focusedHoverPartIndex() {
        return this._renderedHoverParts.focusedHoverPartIndex;
    }
    get hoverPartsCount() {
        return this._renderedHoverParts.hoverPartsCount;
    }
    focusHoverPartWithIndex(index) {
        this._renderedHoverParts.focusHoverPartWithIndex(index);
    }
    getAccessibleWidgetContent() {
        return this._renderedHoverParts.getAccessibleContent();
    }
    getAccessibleWidgetContentAtIndex(index) {
        return this._renderedHoverParts.getAccessibleHoverContentAtIndex(index);
    }
    async updateHoverVerbosityLevel(action, index, focus) {
        this._renderedHoverParts.updateHoverVerbosityLevel(action, index, focus);
    }
    doesHoverAtIndexSupportVerbosityAction(index, action) {
        return this._renderedHoverParts.doesHoverAtIndexSupportVerbosityAction(index, action);
    }
    isColorPickerVisible() {
        return this._renderedHoverParts.isColorPickerVisible();
    }
    static computeHoverPositions(editor, anchorRange, hoverParts) {
        let startColumnBoundary = 1;
        if (editor.hasModel()) {
            // Ensure the range is on the current view line
            const viewModel = editor._getViewModel();
            const coordinatesConverter = viewModel.coordinatesConverter;
            const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
            const anchorViewMinColumn = viewModel.getLineMinColumn(anchorViewRange.startLineNumber);
            const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, anchorViewMinColumn);
            startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
        }
        // The anchor range is always on a single line
        const anchorStartLineNumber = anchorRange.startLineNumber;
        let secondaryPositionColumn = anchorRange.startColumn;
        let forceShowAtRange;
        for (const hoverPart of hoverParts) {
            const hoverPartRange = hoverPart.range;
            const hoverPartRangeOnAnchorStartLine = hoverPartRange.startLineNumber === anchorStartLineNumber;
            const hoverPartRangeOnAnchorEndLine = hoverPartRange.endLineNumber === anchorStartLineNumber;
            const hoverPartRangeIsOnAnchorLine = hoverPartRangeOnAnchorStartLine && hoverPartRangeOnAnchorEndLine;
            if (hoverPartRangeIsOnAnchorLine) {
                // this message has a range that is completely sitting on the line of the anchor
                const hoverPartStartColumn = hoverPartRange.startColumn;
                const minSecondaryPositionColumn = Math.min(secondaryPositionColumn, hoverPartStartColumn);
                secondaryPositionColumn = Math.max(minSecondaryPositionColumn, startColumnBoundary);
            }
            if (hoverPart.forceShowAtRange) {
                forceShowAtRange = hoverPartRange;
            }
        }
        let showAtPosition;
        let showAtSecondaryPosition;
        if (forceShowAtRange) {
            const forceShowAtPosition = forceShowAtRange.getStartPosition();
            showAtPosition = forceShowAtPosition;
            showAtSecondaryPosition = forceShowAtPosition;
        }
        else {
            showAtPosition = anchorRange.getStartPosition();
            showAtSecondaryPosition = new Position(anchorStartLineNumber, secondaryPositionColumn);
        }
        return {
            showAtPosition,
            showAtSecondaryPosition,
        };
    }
};
RenderedContentHover = RenderedContentHover_1 = __decorate([
    __param(4, IKeybindingService),
    __param(5, IHoverService),
    __param(6, IClipboardService)
], RenderedContentHover);
export { RenderedContentHover };
class RenderedStatusBar {
    constructor(fragment, _statusBar) {
        this._statusBar = _statusBar;
        fragment.appendChild(this._statusBar.hoverElement);
    }
    get hoverElement() {
        return this._statusBar.hoverElement;
    }
    get actions() {
        return this._statusBar.actions;
    }
    dispose() {
        this._statusBar.dispose();
    }
}
let RenderedContentHoverParts = class RenderedContentHoverParts extends Disposable {
    static { RenderedContentHoverParts_1 = this; }
    static { this._DECORATION_OPTIONS = ModelDecorationOptions.register({
        description: 'content-hover-highlight',
        className: 'hoverHighlight'
    }); }
    constructor(editor, participants, hoverParts, context, keybindingService, _hoverService, _clipboardService) {
        super();
        this._hoverService = _hoverService;
        this._clipboardService = _clipboardService;
        this._renderedParts = [];
        this._focusedHoverPartIndex = -1;
        this._context = context;
        this._fragment = document.createDocumentFragment();
        this._register(this._renderParts(participants, hoverParts, context, keybindingService, this._hoverService));
        this._register(this._registerListenersOnRenderedParts());
        this._register(this._createEditorDecorations(editor, hoverParts));
        this._updateMarkdownAndColorParticipantInfo(participants);
    }
    _createEditorDecorations(editor, hoverParts) {
        if (hoverParts.length === 0) {
            return Disposable.None;
        }
        let highlightRange = hoverParts[0].range;
        for (const hoverPart of hoverParts) {
            const hoverPartRange = hoverPart.range;
            highlightRange = Range.plusRange(highlightRange, hoverPartRange);
        }
        const highlightDecoration = editor.createDecorationsCollection();
        highlightDecoration.set([{
                range: highlightRange,
                options: RenderedContentHoverParts_1._DECORATION_OPTIONS
            }]);
        return toDisposable(() => {
            highlightDecoration.clear();
        });
    }
    _renderParts(participants, hoverParts, hoverContext, keybindingService, hoverService) {
        const statusBar = new EditorHoverStatusBar(keybindingService, hoverService);
        const hoverRenderingContext = {
            fragment: this._fragment,
            statusBar,
            ...hoverContext
        };
        const disposables = new DisposableStore();
        disposables.add(statusBar);
        for (const participant of participants) {
            const renderedHoverParts = this._renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext);
            disposables.add(renderedHoverParts);
            for (const renderedHoverPart of renderedHoverParts.renderedHoverParts) {
                this._renderedParts.push({
                    type: 'hoverPart',
                    participant,
                    hoverPart: renderedHoverPart.hoverPart,
                    hoverElement: renderedHoverPart.hoverElement,
                });
            }
        }
        const renderedStatusBar = this._renderStatusBar(this._fragment, statusBar);
        if (renderedStatusBar) {
            disposables.add(renderedStatusBar);
            this._renderedParts.push({
                type: 'statusBar',
                hoverElement: renderedStatusBar.hoverElement,
                actions: renderedStatusBar.actions,
            });
        }
        return disposables;
    }
    _renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext) {
        const hoverPartsForParticipant = hoverParts.filter(hoverPart => hoverPart.owner === participant);
        const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
        if (!hasHoverPartsForParticipant) {
            return new RenderedHoverParts([]);
        }
        return participant.renderHoverParts(hoverRenderingContext, hoverPartsForParticipant);
    }
    _renderStatusBar(fragment, statusBar) {
        if (!statusBar.hasContent) {
            return undefined;
        }
        return new RenderedStatusBar(fragment, statusBar);
    }
    _registerListenersOnRenderedParts() {
        const disposables = new DisposableStore();
        this._renderedParts.forEach((renderedPart, index) => {
            const element = renderedPart.hoverElement;
            element.tabIndex = 0;
            disposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_IN, (event) => {
                event.stopPropagation();
                this._focusedHoverPartIndex = index;
            }));
            disposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_OUT, (event) => {
                event.stopPropagation();
                this._focusedHoverPartIndex = -1;
            }));
            // Add copy button for marker hovers
            if (renderedPart.type === 'hoverPart' && renderedPart.hoverPart instanceof MarkerHover) {
                disposables.add(new HoverCopyButton(element, () => renderedPart.participant.getAccessibleContent(renderedPart.hoverPart), this._clipboardService, this._hoverService));
            }
        });
        return disposables;
    }
    _updateMarkdownAndColorParticipantInfo(participants) {
        const markdownHoverParticipant = participants.find(p => {
            return (p instanceof MarkdownHoverParticipant) && !(p instanceof InlayHintsHover);
        });
        if (markdownHoverParticipant) {
            this._markdownHoverParticipant = markdownHoverParticipant;
        }
        this._colorHoverParticipant = participants.find(p => p instanceof HoverColorPickerParticipant);
    }
    focusHoverPartWithIndex(index) {
        if (index < 0 || index >= this._renderedParts.length) {
            return;
        }
        this._renderedParts[index].hoverElement.focus();
    }
    getAccessibleContent() {
        const content = [];
        for (let i = 0; i < this._renderedParts.length; i++) {
            content.push(this.getAccessibleHoverContentAtIndex(i));
        }
        return content.join('\n\n');
    }
    getAccessibleHoverContentAtIndex(index) {
        const renderedPart = this._renderedParts[index];
        if (!renderedPart) {
            return '';
        }
        if (renderedPart.type === 'statusBar') {
            const statusBarDescription = [localize('hoverAccessibilityStatusBar', "This is a hover status bar.")];
            for (const action of renderedPart.actions) {
                const keybinding = action.actionKeybindingLabel;
                if (keybinding) {
                    statusBarDescription.push(localize('hoverAccessibilityStatusBarActionWithKeybinding', "It has an action with label {0} and keybinding {1}.", action.actionLabel, keybinding));
                }
                else {
                    statusBarDescription.push(localize('hoverAccessibilityStatusBarActionWithoutKeybinding', "It has an action with label {0}.", action.actionLabel));
                }
            }
            return statusBarDescription.join('\n');
        }
        return renderedPart.participant.getAccessibleContent(renderedPart.hoverPart);
    }
    async updateHoverVerbosityLevel(action, index, focus) {
        if (!this._markdownHoverParticipant) {
            return;
        }
        let rangeOfIndicesToUpdate;
        if (index >= 0) {
            rangeOfIndicesToUpdate = { start: index, endExclusive: index + 1 };
        }
        else {
            rangeOfIndicesToUpdate = this._findRangeOfMarkdownHoverParts(this._markdownHoverParticipant);
        }
        for (let i = rangeOfIndicesToUpdate.start; i < rangeOfIndicesToUpdate.endExclusive; i++) {
            const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, i);
            if (normalizedMarkdownHoverIndex === undefined) {
                continue;
            }
            const renderedPart = await this._markdownHoverParticipant.updateMarkdownHoverVerbosityLevel(action, normalizedMarkdownHoverIndex);
            if (!renderedPart) {
                continue;
            }
            this._renderedParts[i] = {
                type: 'hoverPart',
                participant: this._markdownHoverParticipant,
                hoverPart: renderedPart.hoverPart,
                hoverElement: renderedPart.hoverElement,
            };
        }
        if (focus) {
            if (index >= 0) {
                this.focusHoverPartWithIndex(index);
            }
            else {
                this._context.focus();
            }
        }
        this._context.onContentsChanged();
    }
    doesHoverAtIndexSupportVerbosityAction(index, action) {
        if (!this._markdownHoverParticipant) {
            return false;
        }
        const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, index);
        if (normalizedMarkdownHoverIndex === undefined) {
            return false;
        }
        return this._markdownHoverParticipant.doesMarkdownHoverAtIndexSupportVerbosityAction(normalizedMarkdownHoverIndex, action);
    }
    isColorPickerVisible() {
        return this._colorHoverParticipant?.isColorPickerVisible() ?? false;
    }
    _normalizedIndexToMarkdownHoverIndexRange(markdownHoverParticipant, index) {
        const renderedPart = this._renderedParts[index];
        if (!renderedPart || renderedPart.type !== 'hoverPart') {
            return undefined;
        }
        const isHoverPartMarkdownHover = renderedPart.participant === markdownHoverParticipant;
        if (!isHoverPartMarkdownHover) {
            return undefined;
        }
        const firstIndexOfMarkdownHovers = this._renderedParts.findIndex(renderedPart => renderedPart.type === 'hoverPart'
            && renderedPart.participant === markdownHoverParticipant);
        if (firstIndexOfMarkdownHovers === -1) {
            throw new BugIndicatingError();
        }
        return index - firstIndexOfMarkdownHovers;
    }
    _findRangeOfMarkdownHoverParts(markdownHoverParticipant) {
        const copiedRenderedParts = this._renderedParts.slice();
        const firstIndexOfMarkdownHovers = copiedRenderedParts.findIndex(renderedPart => renderedPart.type === 'hoverPart' && renderedPart.participant === markdownHoverParticipant);
        const inversedLastIndexOfMarkdownHovers = copiedRenderedParts.reverse().findIndex(renderedPart => renderedPart.type === 'hoverPart' && renderedPart.participant === markdownHoverParticipant);
        const lastIndexOfMarkdownHovers = inversedLastIndexOfMarkdownHovers >= 0 ? copiedRenderedParts.length - inversedLastIndexOfMarkdownHovers : inversedLastIndexOfMarkdownHovers;
        return { start: firstIndexOfMarkdownHovers, endExclusive: lastIndexOfMarkdownHovers + 1 };
    }
    get domNode() {
        return this._fragment;
    }
    get domNodeHasChildren() {
        return this._fragment.hasChildNodes();
    }
    get focusedHoverPartIndex() {
        return this._focusedHoverPartIndex;
    }
    get hoverPartsCount() {
        return this._renderedParts.length;
    }
};
RenderedContentHoverParts = RenderedContentHoverParts_1 = __decorate([
    __param(4, IKeybindingService),
    __param(5, IHoverService),
    __param(6, IClipboardService)
], RenderedContentHoverParts);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudEhvdmVyUmVuZGVyZWQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlclJlbmRlcmVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTRHLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDL0osT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDOUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFdEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUV2RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUN4SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU1RSxP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