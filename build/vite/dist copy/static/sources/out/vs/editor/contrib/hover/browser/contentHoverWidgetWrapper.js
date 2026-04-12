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
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { HoverOperation } from './hoverOperation.js';
import { HoverParticipantRegistry, HoverRangeAnchor } from './hoverTypes.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ContentHoverWidget } from './contentHoverWidget.js';
import { ContentHoverComputer } from './contentHoverComputer.js';
import { ContentHoverResult } from './contentHoverTypes.js';
import { Emitter } from '../../../../base/common/event.js';
import { RenderedContentHover } from './contentHoverRendered.js';
import { isMousePositionWithinElement } from './hoverUtils.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
let ContentHoverWidgetWrapper = class ContentHoverWidgetWrapper extends Disposable {
    constructor(_editor, _instantiationService, _keybindingService, _hoverService, _clipboardService) {
        super();
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        this._keybindingService = _keybindingService;
        this._hoverService = _hoverService;
        this._clipboardService = _clipboardService;
        this._currentResult = null;
        this._renderedContentHover = this._register(new MutableDisposable());
        this._onContentsChanged = this._register(new Emitter());
        this.onContentsChanged = this._onContentsChanged.event;
        this._contentHoverWidget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
        this._participants = this._initializeHoverParticipants();
        this._hoverOperation = this._register(new HoverOperation(this._editor, new ContentHoverComputer(this._editor, this._participants)));
        this._registerListeners();
    }
    _initializeHoverParticipants() {
        const participants = [];
        for (const participant of HoverParticipantRegistry.getAll()) {
            const participantInstance = this._instantiationService.createInstance(participant, this._editor);
            participants.push(participantInstance);
        }
        participants.sort((p1, p2) => p1.hoverOrdinal - p2.hoverOrdinal);
        this._register(this._contentHoverWidget.onDidResize(() => {
            this._participants.forEach(participant => participant.handleResize?.());
        }));
        this._register(this._contentHoverWidget.onDidScroll((e) => {
            this._participants.forEach(participant => participant.handleScroll?.(e));
        }));
        this._register(this._contentHoverWidget.onContentsChanged(() => {
            this._participants.forEach(participant => participant.handleContentsChanged?.());
        }));
        return participants;
    }
    _registerListeners() {
        this._register(this._hoverOperation.onResult((result) => {
            const messages = (result.hasLoadingMessage ? this._addLoadingMessage(result) : result.value);
            this._withResult(new ContentHoverResult(messages, result.isComplete, result.options));
        }));
        const contentHoverWidgetNode = this._contentHoverWidget.getDomNode();
        this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, 'keydown', (e) => {
            if (e.equals(9 /* KeyCode.Escape */)) {
                this.hide();
            }
        }));
        this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, 'mouseleave', (e) => {
            this._onMouseLeave(e);
        }));
        this._register(TokenizationRegistry.onDidChange(() => {
            if (this._contentHoverWidget.position && this._currentResult) {
                this._setCurrentResult(this._currentResult); // render again
            }
        }));
        this._register(this._contentHoverWidget.onContentsChanged(() => {
            this._onContentsChanged.fire();
        }));
    }
    /**
     * Returns true if the hover shows now or will show.
     */
    _startShowingOrUpdateHover(anchor, mode, source, focus, mouseEvent) {
        const contentHoverIsVisible = this._contentHoverWidget.position && this._currentResult;
        if (!contentHoverIsVisible) {
            if (anchor) {
                this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
                return true;
            }
            return false;
        }
        const isHoverSticky = this._editor.getOption(69 /* EditorOption.hover */).sticky;
        const isMouseGettingCloser = mouseEvent && this._contentHoverWidget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy);
        const isHoverStickyAndIsMouseGettingCloser = isHoverSticky && isMouseGettingCloser;
        // The mouse is getting closer to the hover, so we will keep the hover untouched
        // But we will kick off a hover update at the new anchor, insisting on keeping the hover visible.
        if (isHoverStickyAndIsMouseGettingCloser) {
            if (anchor) {
                this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
            }
            return true;
        }
        // If mouse is not getting closer and anchor not defined, hide the hover
        if (!anchor) {
            this._setCurrentResult(null);
            return false;
        }
        // If mouse if not getting closer and anchor is defined, and the new anchor is the same as the previous anchor
        const currentAnchorEqualsPreviousAnchor = this._currentResult && this._currentResult.options.anchor.equals(anchor);
        if (currentAnchorEqualsPreviousAnchor) {
            return true;
        }
        // If mouse if not getting closer and anchor is defined, and the new anchor is not compatible with the previous anchor
        const currentAnchorCompatibleWithPreviousAnchor = this._currentResult && anchor.canAdoptVisibleHover(this._currentResult.options.anchor, this._contentHoverWidget.position);
        if (!currentAnchorCompatibleWithPreviousAnchor) {
            this._setCurrentResult(null);
            this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
            return true;
        }
        // We aren't getting any closer to the hover, so we will filter existing results
        // and keep those which also apply to the new anchor.
        if (this._currentResult) {
            this._setCurrentResult(this._currentResult.filter(anchor));
        }
        this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
        return true;
    }
    _startHoverOperationIfNecessary(anchor, mode, source, shouldFocus, insistOnKeepingHoverVisible) {
        const currentAnchorEqualToPreviousHover = this._hoverOperation.options && this._hoverOperation.options.anchor.equals(anchor);
        if (currentAnchorEqualToPreviousHover) {
            return;
        }
        this._hoverOperation.cancel();
        const contentHoverComputerOptions = {
            anchor,
            source,
            shouldFocus,
            insistOnKeepingHoverVisible
        };
        this._hoverOperation.start(mode, contentHoverComputerOptions);
    }
    _setCurrentResult(hoverResult) {
        let currentHoverResult = hoverResult;
        const currentResultEqualToPreviousResult = this._currentResult === currentHoverResult;
        if (currentResultEqualToPreviousResult) {
            return;
        }
        const currentHoverResultIsEmpty = currentHoverResult && currentHoverResult.hoverParts.length === 0;
        if (currentHoverResultIsEmpty) {
            currentHoverResult = null;
        }
        this._currentResult = currentHoverResult;
        if (this._currentResult) {
            this._showHover(this._currentResult);
        }
        else {
            this._hideHover();
        }
    }
    _addLoadingMessage(hoverResult) {
        for (const participant of this._participants) {
            if (!participant.createLoadingMessage) {
                continue;
            }
            const loadingMessage = participant.createLoadingMessage(hoverResult.options.anchor);
            if (!loadingMessage) {
                continue;
            }
            return hoverResult.value.slice(0).concat([loadingMessage]);
        }
        return hoverResult.value;
    }
    _withResult(hoverResult) {
        const previousHoverIsVisibleWithCompleteResult = this._contentHoverWidget.position && this._currentResult && this._currentResult.isComplete;
        if (!previousHoverIsVisibleWithCompleteResult) {
            this._setCurrentResult(hoverResult);
        }
        // The hover is visible with a previous complete result.
        const isCurrentHoverResultComplete = hoverResult.isComplete;
        if (!isCurrentHoverResultComplete) {
            // Instead of rendering the new partial result, we wait for the result to be complete.
            return;
        }
        const currentHoverResultIsEmpty = hoverResult.hoverParts.length === 0;
        const insistOnKeepingPreviousHoverVisible = hoverResult.options.insistOnKeepingHoverVisible;
        const shouldKeepPreviousHoverVisible = currentHoverResultIsEmpty && insistOnKeepingPreviousHoverVisible;
        if (shouldKeepPreviousHoverVisible) {
            // The hover would now hide normally, so we'll keep the previous messages
            return;
        }
        this._setCurrentResult(hoverResult);
    }
    _showHover(hoverResult) {
        const context = this._getHoverContext();
        this._renderedContentHover.value = new RenderedContentHover(this._editor, hoverResult, this._participants, context, this._keybindingService, this._hoverService, this._clipboardService);
        if (this._renderedContentHover.value.domNodeHasChildren) {
            this._contentHoverWidget.show(this._renderedContentHover.value);
        }
        else {
            this._renderedContentHover.clear();
        }
    }
    _hideHover() {
        this._contentHoverWidget.hide();
        this._participants.forEach(participant => participant.handleHide?.());
    }
    _getHoverContext() {
        const hide = () => {
            this.hide();
        };
        const onContentsChanged = () => {
            this._contentHoverWidget.handleContentsChanged();
        };
        const setMinimumDimensions = (dimensions) => {
            this._contentHoverWidget.setMinimumDimensions(dimensions);
        };
        const focus = () => this.focus();
        return { hide, onContentsChanged, setMinimumDimensions, focus };
    }
    showsOrWillShow(mouseEvent) {
        const isContentWidgetResizing = this._contentHoverWidget.isResizing;
        if (isContentWidgetResizing) {
            return true;
        }
        const anchorCandidates = this._findHoverAnchorCandidates(mouseEvent);
        const anchorCandidatesExist = anchorCandidates.length > 0;
        if (!anchorCandidatesExist) {
            return this._startShowingOrUpdateHover(null, 0 /* HoverStartMode.Delayed */, 0 /* HoverStartSource.Mouse */, false, mouseEvent);
        }
        const anchor = anchorCandidates[0];
        return this._startShowingOrUpdateHover(anchor, 0 /* HoverStartMode.Delayed */, 0 /* HoverStartSource.Mouse */, false, mouseEvent);
    }
    _findHoverAnchorCandidates(mouseEvent) {
        const anchorCandidates = [];
        for (const participant of this._participants) {
            if (!participant.suggestHoverAnchor) {
                continue;
            }
            const anchor = participant.suggestHoverAnchor(mouseEvent);
            if (!anchor) {
                continue;
            }
            anchorCandidates.push(anchor);
        }
        const target = mouseEvent.target;
        switch (target.type) {
            case 6 /* MouseTargetType.CONTENT_TEXT */: {
                anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
                break;
            }
            case 7 /* MouseTargetType.CONTENT_EMPTY */: {
                const epsilon = this._editor.getOption(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth / 2;
                // Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
                const mouseIsWithinLinesAndCloseToHover = !target.detail.isAfterLines
                    && typeof target.detail.horizontalDistanceToText === 'number'
                    && target.detail.horizontalDistanceToText < epsilon;
                if (!mouseIsWithinLinesAndCloseToHover) {
                    break;
                }
                anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
                break;
            }
        }
        anchorCandidates.sort((a, b) => b.priority - a.priority);
        return anchorCandidates;
    }
    _onMouseLeave(e) {
        const editorDomNode = this._editor.getDomNode();
        const isMousePositionOutsideOfEditor = !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
        if (isMousePositionOutsideOfEditor) {
            this.hide();
        }
    }
    startShowingAtRange(range, mode, source, focus) {
        this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, undefined, undefined), mode, source, focus, null);
    }
    getWidgetContent() {
        const node = this._contentHoverWidget.getDomNode();
        if (!node.textContent) {
            return undefined;
        }
        return node.textContent;
    }
    async updateHoverVerbosityLevel(action, index, focus) {
        this._renderedContentHover.value?.updateHoverVerbosityLevel(action, index, focus);
    }
    doesHoverAtIndexSupportVerbosityAction(index, action) {
        return this._renderedContentHover.value?.doesHoverAtIndexSupportVerbosityAction(index, action) ?? false;
    }
    getAccessibleWidgetContent() {
        return this._renderedContentHover.value?.getAccessibleWidgetContent();
    }
    getAccessibleWidgetContentAtIndex(index) {
        return this._renderedContentHover.value?.getAccessibleWidgetContentAtIndex(index);
    }
    focusedHoverPartIndex() {
        return this._renderedContentHover.value?.focusedHoverPartIndex ?? -1;
    }
    containsNode(node) {
        return (node ? this._contentHoverWidget.getDomNode().contains(node) : false);
    }
    focus() {
        const hoverPartsCount = this._renderedContentHover.value?.hoverPartsCount;
        if (hoverPartsCount === 1) {
            this.focusHoverPartWithIndex(0);
            return;
        }
        this._contentHoverWidget.focus();
    }
    focusHoverPartWithIndex(index) {
        this._renderedContentHover.value?.focusHoverPartWithIndex(index);
    }
    scrollUp() {
        this._contentHoverWidget.scrollUp();
    }
    scrollDown() {
        this._contentHoverWidget.scrollDown();
    }
    scrollLeft() {
        this._contentHoverWidget.scrollLeft();
    }
    scrollRight() {
        this._contentHoverWidget.scrollRight();
    }
    pageUp() {
        this._contentHoverWidget.pageUp();
    }
    pageDown() {
        this._contentHoverWidget.pageDown();
    }
    goToTop() {
        this._contentHoverWidget.goToTop();
    }
    goToBottom() {
        this._contentHoverWidget.goToBottom();
    }
    hide() {
        this._hoverOperation.cancel();
        this._setCurrentResult(null);
    }
    getDomNode() {
        return this._contentHoverWidget.getDomNode();
    }
    get isColorPickerVisible() {
        return this._renderedContentHover.value?.isColorPickerVisible() ?? false;
    }
    get isVisibleFromKeyboard() {
        return this._contentHoverWidget.isVisibleFromKeyboard;
    }
    get isVisible() {
        return this._contentHoverWidget.isVisible;
    }
    get isFocused() {
        return this._contentHoverWidget.isFocused;
    }
    get isResizing() {
        return this._contentHoverWidget.isResizing;
    }
    get widget() {
        return this._contentHoverWidget;
    }
};
ContentHoverWidgetWrapper = __decorate([
    __param(1, IInstantiationService),
    __param(2, IKeybindingService),
    __param(3, IHoverService),
    __param(4, IClipboardService)
], ContentHoverWidgetWrapper);
export { ContentHoverWidgetWrapper };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudEhvdmVyV2lkZ2V0V3JhcHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyV2lkZ2V0V3JhcHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBRXZELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUlyRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsY0FBYyxFQUFpRCxNQUFNLHFCQUFxQixDQUFDO0FBQ3BHLE9BQU8sRUFBZSx3QkFBd0IsRUFBRSxnQkFBZ0IsRUFBMEUsTUFBTSxpQkFBaUIsQ0FBQztBQUNsSyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsb0JBQW9CLEVBQStCLE1BQU0sMkJBQTJCLENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2pFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFB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