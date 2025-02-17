/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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

export class ContentHoverWidgetWrapper extends Disposable implements IHoverWidget {

	private _currentResult: ContentHoverResult | null = null;
	private _renderedContentHover: RenderedContentHover | undefined;

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
		const contentHoverIsVisible = this._contentHoverWidget.position && this._currentResult;
		if (!contentHoverIsVisible) {
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
				return true;
			}
			return false;
		}
		const isHoverSticky = this._editor.getOption(EditorOption.hover).sticky;
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

	private _startHoverOperationIfNecessary(anchor: HoverAnchor, mode: HoverStartMode, source: HoverStartSource, shouldFocus: boolean, insistOnKeepingHoverVisible: boolean): void {
		const currentAnchorEqualToPreviousHover = this._hoverOperation.options && this._hoverOperation.options.anchor.equals(anchor);
		if (currentAnchorEqualToPreviousHover) {
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

	private _setCurrentResult(hoverResult: ContentHoverResult | null): void {
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
		} else {
			this._hideHover();
		}
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

	private _showHover(hoverResult: ContentHoverResult): void {
		const context = this._getHoverContext();
		this._renderedContentHover = new RenderedContentHover(this._editor, hoverResult, this._participants, context, this._keybindingService, this._hoverService);
		if (this._renderedContentHover.domNodeHasChildren) {
			this._contentHoverWidget.show(this._renderedContentHover);
		} else {
			this._renderedContentHover.dispose();
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
			this._onContentsChanged.fire();
			this._contentHoverWidget.onContentsChanged();
		};
		const setMinimumDimensions = (dimensions: dom.Dimension) => {
			this._contentHoverWidget.setMinimumDimensions(dimensions);
		};
		const focus = () => this.focus();
		return { hide, onContentsChanged, setMinimumDimensions, focus };
	}


	public showsOrWillShow(mouseEvent: IEditorMouseEvent): boolean {
		const isContentWidgetResizing = this._contentHoverWidget.isResizing;
		if (isContentWidgetResizing) {
			return true;
		}
		const anchorCandidates: HoverAnchor[] = this._findHoverAnchorCandidates(mouseEvent);
		const anchorCandidatesExist = anchorCandidates.length > 0;
		if (!anchorCandidatesExist) {
			return this._startShowingOrUpdateHover(null, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
		}
		const anchor = anchorCandidates[0];
		return this._startShowingOrUpdateHover(anchor, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
	}

	private _findHoverAnchorCandidates(mouseEvent: IEditorMouseEvent): HoverAnchor[] {
		const anchorCandidates: HoverAnchor[] = [];
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
			case MouseTargetType.CONTENT_TEXT: {
				anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
				break;
			}
			case MouseTargetType.CONTENT_EMPTY: {
				const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
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

	private _onMouseLeave(e: MouseEvent): void {
		const editorDomNode = this._editor.getDomNode();
		const isMousePositionOutsideOfEditor = !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
		if (isMousePositionOutsideOfEditor) {
			this.hide();
		}
	}

	public startShowingAtRange(range: Range, mode: HoverStartMode, source: HoverStartSource, focus: boolean): void {
		this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, undefined, undefined), mode, source, focus, null);
	}

	public getWidgetContent(): string | undefined {
		const node = this._contentHoverWidget.getDomNode();
		if (!node.textContent) {
			return undefined;
		}
		return node.textContent;
	}

	public async updateHoverVerbosityLevel(action: HoverVerbosityAction, index: number, focus?: boolean): Promise<void> {
		this._renderedContentHover?.updateHoverVerbosityLevel(action, index, focus);
	}

	public doesHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		return this._renderedContentHover?.doesHoverAtIndexSupportVerbosityAction(index, action) ?? false;
	}

	public getAccessibleWidgetContent(): string | undefined {
		return this._renderedContentHover?.getAccessibleWidgetContent();
	}

	public getAccessibleWidgetContentAtIndex(index: number): string | undefined {
		return this._renderedContentHover?.getAccessibleWidgetContentAtIndex(index);
	}

	public focusedHoverPartIndex(): number {
		return this._renderedContentHover?.focusedHoverPartIndex ?? -1;
	}

	public containsNode(node: Node | null | undefined): boolean {
		return (node ? this._contentHoverWidget.getDomNode().contains(node) : false);
	}

	public focus(): void {
		const hoverPartsCount = this._renderedContentHover?.hoverPartsCount;
		if (hoverPartsCount === 1) {
			this.focusHoverPartWithIndex(0);
			return;
		}
		this._contentHoverWidget.focus();
	}

	public focusHoverPartWithIndex(index: number): void {
		this._renderedContentHover?.focusHoverPartWithIndex(index);
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
		return this._renderedContentHover?.isColorPickerVisible() ?? false;
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
