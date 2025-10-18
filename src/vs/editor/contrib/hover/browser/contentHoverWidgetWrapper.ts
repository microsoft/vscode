/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { TokenizationRegistry } from '../../../common/languages.js';
import { HoverOperation, HoverResult, HoverStartMode, HoverStartSource } from './hoverOperation.js';
import { HoverAnchor, HoverParticipantRegistry, HoverRangeAnchor, IEditorHoverContext, IEditorHoverParticipant, IHoverPart, IHoverWidget } from './hoverTypes.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { HoverVerbosityAction } from '../../../common/standalone/standaloneEnums.js';
import { ContentHoverWidget } from './contentHoverWidget.js';
import { ContentHoverComputer, ContentHoverComputerOptions } from './contentHoverComputer.js';
import { ContentHoverResult } from './contentHoverTypes.js';
import { Emitter } from '../../../../base/common/event.js';
import { RenderedContentHover } from './contentHoverRendered.js';
import { isMousePositionWithinElement } from './hoverUtils.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Position } from '../../../common/core/position.js';

export class ContentHoverWidgetWrapper extends Disposable implements IHoverWidget {

	private _currentResult: ContentHoverResult | null = null;
	private readonly _renderedContentHover = this._register(new MutableDisposable<RenderedContentHover>());

	private readonly _contentHoverWidget: ContentHoverWidget;
	private readonly _participants: IEditorHoverParticipant[];
	private readonly _hoverOperation: HoverOperation<ContentHoverComputerOptions, IHoverPart>;

	private readonly _onContentsChanged = this._register(new Emitter<void>());
	public readonly onContentsChanged = this._onContentsChanged.event;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService private readonly _hoverService: IHoverService
	) {
		super();
		this._contentHoverWidget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
		this._participants = this._initializeHoverParticipants();
		this._hoverOperation = this._register(new HoverOperation(this._editor, new ContentHoverComputer(this._editor, this._participants)));
		this._registerListeners();
	}

	private _initializeHoverParticipants(): IEditorHoverParticipant[] {
		const participants: IEditorHoverParticipant[] = [];
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

	private _registerListeners(): void {
		this._register(this._hoverOperation.onResult((result) => {
			const messages = (result.hasLoadingMessage ? this._addLoadingMessage(result) : result.value);
			this._withResult(new ContentHoverResult(messages, result.isComplete, result.options));
		}));
		const contentHoverWidgetNode = this._contentHoverWidget.getDomNode();
		this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, 'keydown', (e) => {
			if (e.equals(KeyCode.Escape)) {
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
	private _startShowingOrUpdateHover(
		anchor: HoverAnchor | null,
		mode: HoverStartMode,
		source: HoverStartSource,
		focus: boolean,
		mouseEvent: IEditorMouseEvent | null
	): boolean {
		if (!this._isContentHoverVisible()) {
			return this._handleHoverWhenNotVisible(anchor, mode, source, focus);
		}
		if (this._shouldKeepHoverForStickyMouse(mouseEvent)) {
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
			}
			return true;
		}
		if (!anchor) {
			this._setCurrentResult(null);
			return false;
		}
		if (this._isCurrentAnchorEqualToPrevious(anchor)) {
			return true;
		}
		if (!this._isCurrentAnchorCompatibleWithPrevious(anchor, this._contentHoverWidget.position!)) {
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

	/**
	 * Checks if the content hover widget is currently visible.
	 * Extracted for improved readability and reusability.
	 */
	private _isContentHoverVisible(): boolean {
		return !!(this._contentHoverWidget.position && this._currentResult);
	}

	/**
	 * Handles hover behavior when the content hover is not currently visible.
	 * Extracted from _startShowingOrUpdateHover to improve code clarity.
	 */
	private _handleHoverWhenNotVisible(
		anchor: HoverAnchor | null,
		mode: HoverStartMode,
		source: HoverStartSource,
		focus: boolean
	): boolean {
		if (anchor) {
			this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
			return true;
		}
		return false;
	}

	/**
	 * Determines if the hover should be kept visible due to sticky mouse behavior.
	 * Extracted to simplify complex boolean logic in _startShowingOrUpdateHover.
	 */
	private _shouldKeepHoverForStickyMouse(mouseEvent: IEditorMouseEvent | null): boolean {
		const isHoverSticky = this._editor.getOption(EditorOption.hover).sticky;
		const isMouseGettingCloser = (mouseEvent && this._contentHoverWidget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy)) ?? false;
		return isHoverSticky && isMouseGettingCloser;
	}

	/**
	 * Checks if the current anchor is equal to the previous anchor.
	 * Extracted to improve readability of anchor comparison logic.
	 */
	private _isCurrentAnchorEqualToPrevious(anchor: HoverAnchor): boolean {
		return !!(this._currentResult && this._currentResult.options.anchor.equals(anchor));
	}

	/**
	 * Checks if the current anchor is compatible with the previous anchor.
	 * Extracted to simplify complex anchor compatibility logic.
	 */
	private _isCurrentAnchorCompatibleWithPrevious(anchor: HoverAnchor, position: Position): boolean {
		return !!(this._currentResult && anchor.canAdoptVisibleHover(this._currentResult.options.anchor, position));
	}

	private _startHoverOperationIfNecessary(anchor: HoverAnchor, mode: HoverStartMode, source: HoverStartSource, shouldFocus: boolean, insistOnKeepingHoverVisible: boolean): void {
		if (this._isHoverOperationForSameAnchor(anchor)) {
			return;
		}
		this._hoverOperation.cancel();
		const contentHoverComputerOptions: ContentHoverComputerOptions = {
			anchor,
			source,
			shouldFocus,
			insistOnKeepingHoverVisible
		};
		this._hoverOperation.start(mode, contentHoverComputerOptions);
	}

	/**
	 * Checks if the current hover operation is for the same anchor.
	 * Extracted to improve code clarity and reusability.
	 */
	private _isHoverOperationForSameAnchor(anchor: HoverAnchor): boolean {
		return !!(this._hoverOperation.options && this._hoverOperation.options.anchor.equals(anchor));
	}

	private _setCurrentResult(hoverResult: ContentHoverResult | null): void {
		const normalizedResult = this._normalizeHoverResult(hoverResult);
		if (this._currentResult === normalizedResult) {
			return;
		}
		this._currentResult = normalizedResult;
		if (this._currentResult) {
			this._showHover(this._currentResult);
		} else {
			this._hideHover();
		}
	}

	/**
	 * Normalizes hover results by returning null for empty results.
	 * Extracted to centralize hover result validation logic.
	 */
	private _normalizeHoverResult(hoverResult: ContentHoverResult | null): ContentHoverResult | null {
		if (!hoverResult) {
			return null;
		}
		const hasHoverParts = hoverResult.hoverParts.length > 0;
		return hasHoverParts ? hoverResult : null;
	}

	private _addLoadingMessage(hoverResult: HoverResult<ContentHoverComputerOptions, IHoverPart>): IHoverPart[] {
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

	private _withResult(hoverResult: ContentHoverResult): void {
		if (!this._shouldWaitForCompleteResult(hoverResult)) {
			this._setCurrentResult(hoverResult);
		}
		if (!hoverResult.isComplete) {
			// Instead of rendering the new partial result, we wait for the result to be complete.
			return;
		}
		if (this._shouldKeepPreviousHoverVisible(hoverResult)) {
			// The hover would now hide normally, so we'll keep the previous messages
			return;
		}
		this._setCurrentResult(hoverResult);
	}

	/**
	 * Determines if we should wait for a complete hover result before updating.
	 * Extracted to simplify complex conditional logic in _withResult.
	 */
	private _shouldWaitForCompleteResult(hoverResult: ContentHoverResult): boolean {
		return !!(this._contentHoverWidget.position && this._currentResult && this._currentResult.isComplete);
	}

	private _shouldKeepPreviousHoverVisible(hoverResult: ContentHoverResult): boolean {
		const hasNoHoverParts = hoverResult.hoverParts.length === 0;
		const insistOnKeepingVisible = hoverResult.options.insistOnKeepingHoverVisible;
		return hasNoHoverParts && insistOnKeepingVisible;
	}

	private _showHover(hoverResult: ContentHoverResult): void {
		const context = this._getHoverContext();
		this._renderedContentHover.value = new RenderedContentHover(this._editor, hoverResult, this._participants, context, this._keybindingService, this._hoverService);
		if (this._renderedContentHover.value.domNodeHasChildren) {
			this._contentHoverWidget.show(this._renderedContentHover.value);
		} else {
			this._renderedContentHover.clear();
		}
	}

	private _hideHover(): void {
		this._contentHoverWidget.hide();
		this._participants.forEach(participant => participant.handleHide?.());
	}

	private _getHoverContext(): IEditorHoverContext {
		const hide = () => {
			this.hide();
		};
		const onContentsChanged = () => {
			this._contentHoverWidget.handleContentsChanged();
		};
		const setMinimumDimensions = (dimensions: dom.Dimension) => {
			this._contentHoverWidget.setMinimumDimensions(dimensions);
		};
		const focus = () => this.focus();
		return { hide, onContentsChanged, setMinimumDimensions, focus };
	}


	public showsOrWillShow(mouseEvent: IEditorMouseEvent): boolean {
		if (this._contentHoverWidget.isResizing) {
			return true;
		}
		const anchorCandidates = this._findHoverAnchorCandidates(mouseEvent);
		const anchor = this._selectBestAnchor(anchorCandidates);
		return this._startShowingOrUpdateHover(anchor, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
	}

	/**
	 * Selects the best anchor from a list of anchor candidates.
	 * Extracted to improve readability and enable easier anchor selection logic changes.
	 */
	private _selectBestAnchor(anchorCandidates: HoverAnchor[]): HoverAnchor | null {
		return anchorCandidates.length > 0 ? anchorCandidates[0] : null;
	}

	private _findHoverAnchorCandidates(mouseEvent: IEditorMouseEvent): HoverAnchor[] {
		const anchorCandidates: HoverAnchor[] = [];
		this._addParticipantAnchors(mouseEvent, anchorCandidates);
		this._addTargetBasedAnchors(mouseEvent, anchorCandidates);
		anchorCandidates.sort((a, b) => b.priority - a.priority);
		return anchorCandidates;
	}

	/**
	 * Adds hover anchors suggested by hover participants to the candidates list.
	 * Extracted to separate participant-specific anchor logic.
	 */
	private _addParticipantAnchors(mouseEvent: IEditorMouseEvent, anchorCandidates: HoverAnchor[]): void {
		for (const participant of this._participants) {
			if (!participant.suggestHoverAnchor) {
				continue;
			}
			const anchor = participant.suggestHoverAnchor(mouseEvent);
			if (anchor) {
				anchorCandidates.push(anchor);
			}
		}
	}

	/**
	 * Adds hover anchors based on mouse target type to the candidates list.
	 * Extracted to separate target-based anchor logic from participant logic.
	 */
	private _addTargetBasedAnchors(mouseEvent: IEditorMouseEvent, anchorCandidates: HoverAnchor[]): void {
		const target = mouseEvent.target;
		switch (target.type) {
			case MouseTargetType.CONTENT_TEXT:
				anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
				break;
			case MouseTargetType.CONTENT_EMPTY:
				if (this._shouldAddAnchorForEmptyContent(target, mouseEvent)) {
					anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
				}
				break;
		}
	}

	/**
	 * Determines if an anchor should be added for empty content based on mouse proximity.
	 * Extracted to isolate complex empty content hover logic.
	 */
	private _shouldAddAnchorForEmptyContent(target: any, mouseEvent: IEditorMouseEvent): boolean {
		const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
		// Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
		const mouseIsWithinLinesAndCloseToHover = !target.detail.isAfterLines
			&& typeof target.detail.horizontalDistanceToText === 'number'
			&& target.detail.horizontalDistanceToText < epsilon;
		return mouseIsWithinLinesAndCloseToHover;
	}

	private _onMouseLeave(e: MouseEvent): void {
		if (this._isMouseOutsideEditor(e)) {
			this.hide();
		}
	}

	/**
	 * Checks if the mouse position is outside the editor bounds.
	 * Extracted to improve readability of mouse leave logic.
	 */
	private _isMouseOutsideEditor(e: MouseEvent): boolean {
		const editorDomNode = this._editor.getDomNode();
		return !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
	}

	public startShowingAtRange(range: Range, mode: HoverStartMode, source: HoverStartSource, focus: boolean): void {
		this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, undefined, undefined), mode, source, focus, null);
	}

	public getWidgetContent(): string | undefined {
		const domNode = this._contentHoverWidget.getDomNode();
		return domNode.textContent || undefined;
	}

	public async updateHoverVerbosityLevel(action: HoverVerbosityAction, index: number, focus?: boolean): Promise<void> {
		this._renderedContentHover.value?.updateHoverVerbosityLevel(action, index, focus);
	}

	public doesHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		return this._renderedContentHover.value?.doesHoverAtIndexSupportVerbosityAction(index, action) ?? false;
	}

	public getAccessibleWidgetContent(): string | undefined {
		return this._renderedContentHover.value?.getAccessibleWidgetContent();
	}

	public getAccessibleWidgetContentAtIndex(index: number): string | undefined {
		return this._renderedContentHover.value?.getAccessibleWidgetContentAtIndex(index);
	}

	public focusedHoverPartIndex(): number {
		return this._renderedContentHover.value?.focusedHoverPartIndex ?? -1;
	}

	public containsNode(node: Node | null | undefined): boolean {
		return !!node && this._contentHoverWidget.getDomNode().contains(node);
	}

	public focus(): void {
		const hoverPartsCount = this._renderedContentHover.value?.hoverPartsCount;
		if (hoverPartsCount === 1) {
			this.focusHoverPartWithIndex(0);
			return;
		}
		this._contentHoverWidget.focus();
	}

	public focusHoverPartWithIndex(index: number): void {
		this._renderedContentHover.value?.focusHoverPartWithIndex(index);
	}

	public scrollUp(): void {
		this._contentHoverWidget.scrollUp();
	}

	public scrollDown(): void {
		this._contentHoverWidget.scrollDown();
	}

	public scrollLeft(): void {
		this._contentHoverWidget.scrollLeft();
	}

	public scrollRight(): void {
		this._contentHoverWidget.scrollRight();
	}

	public pageUp(): void {
		this._contentHoverWidget.pageUp();
	}

	public pageDown(): void {
		this._contentHoverWidget.pageDown();
	}

	public goToTop(): void {
		this._contentHoverWidget.goToTop();
	}

	public goToBottom(): void {
		this._contentHoverWidget.goToBottom();
	}

	public hide(): void {
		this._hoverOperation.cancel();
		this._setCurrentResult(null);
	}

	public getDomNode(): HTMLElement {
		return this._contentHoverWidget.getDomNode();
	}

	public get isColorPickerVisible(): boolean {
		return this._renderedContentHover.value?.isColorPickerVisible() ?? false;
	}

	public get isVisibleFromKeyboard(): boolean {
		return this._contentHoverWidget.isVisibleFromKeyboard;
	}

	public get isVisible(): boolean {
		return this._contentHoverWidget.isVisible;
	}

	public get isFocused(): boolean {
		return this._contentHoverWidget.isFocused;
	}

	public get isResizing(): boolean {
		return this._contentHoverWidget.isResizing;
	}

	public get widget() {
		return this._contentHoverWidget;
	}
}
