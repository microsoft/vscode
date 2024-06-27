/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, IPartialEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { HoverOperation, HoverStartMode, HoverStartSource } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverAnchor, HoverParticipantRegistry, HoverRangeAnchor, IEditorHoverContext, IEditorHoverParticipant, IHoverPart, IHoverSettings } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService, IKeyboardEvent } from 'vs/platform/keybinding/common/keybinding';
import { HoverVerbosityAction } from 'vs/editor/common/standalone/standaloneEnums';
import { ContentHoverWidget } from 'vs/editor/contrib/hover/browser/contentHoverWidget';
import { ContentHoverComputer } from 'vs/editor/contrib/hover/browser/contentHoverComputer';
import { HoverResult } from 'vs/editor/contrib/hover/browser/contentHoverTypes';
import { Emitter } from 'vs/base/common/event';
import { RenderedContentHover } from 'vs/editor/contrib/hover/browser/contentHoverRendered';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IEditorContribution, IScrollEvent } from 'vs/editor/common/editorCommon';
import { ResultKind } from 'vs/platform/keybinding/common/keybindingResolver';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHintsWidget';
import { TokenizationRegistry } from 'vs/editor/common/languages';

// sticky hover widget which doesn't disappear on focus out and such
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

export class ContentHoverController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.contentHover';

	public shouldKeepOpenOnEditorMouseMoveOrLeave: boolean = false;

	private _currentResult: HoverResult | null = null;
	private _renderedContentHover: RenderedContentHover | undefined;
	private _mouseMoveEvent: IEditorMouseEvent | undefined;
	private _reactToEditorMouseMoveRunner: RunOnceScheduler;

	private readonly _computer: ContentHoverComputer;
	private readonly _contentHoverWidget: ContentHoverWidget;
	private readonly _participants: IEditorHoverParticipant[];
	private readonly _hoverOperation: HoverOperation<IHoverPart>;
	private readonly _listenersStore = new DisposableStore();

	private readonly _onContentsChanged = this._register(new Emitter<void>());
	public readonly onContentsChanged = this._onContentsChanged.event;

	private _hoverSettings!: IHoverSettings;
	private _mouseDown: boolean = false;
	private _activatedByDecoratorClick: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._reactToEditorMouseMoveRunner = this._register(new RunOnceScheduler(() => this._reactToEditorMouseMove(this._mouseMoveEvent), 0));
		this._contentHoverWidget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
		this._participants = this._initializeHoverParticipants();
		this._computer = new ContentHoverComputer(this._editor, this._participants);
		this._hoverOperation = this._register(new HoverOperation(this._editor, this._computer));
		this._hookListeners();
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.hover)) {
				this._unhookListeners();
				this._hookListeners();
			}
		}));
	}

	static get(editor: ICodeEditor): ContentHoverController | null {
		return editor.getContribution<ContentHoverController>(ContentHoverController.ID);
	}

	private _hookListeners(): void {
		const hoverOpts = this._editor.getOption(EditorOption.hover);
		this._hoverSettings = {
			enabled: hoverOpts.enabled,
			sticky: hoverOpts.sticky,
			hidingDelay: hoverOpts.delay
		};
		if (hoverOpts.enabled) {
			this._listenersStore.add(this._editor.onMouseDown((e: IEditorMouseEvent) => this._onEditorMouseDown(e)));
			this._listenersStore.add(this._editor.onMouseUp(() => this._onEditorMouseUp()));
			this._listenersStore.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._listenersStore.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));

			// Old listeners
			this._listenersStore.add(this._hoverOperation.onResult((result) => {
				if (!this._computer.anchor) {
					// invalid state, ignore result
					return;
				}
				const messages = (result.hasLoadingMessage ? this._addLoadingMessage(result.value) : result.value);
				this._withResult(new HoverResult(this._computer.anchor, messages, result.isComplete));
			}));
			this._listenersStore.add(dom.addStandardDisposableListener(this._contentHoverWidget.getDomNode(), 'keydown', (e) => {
				if (e.equals(KeyCode.Escape)) {
					this.hide();
				}
			}));
			this._listenersStore.add(TokenizationRegistry.onDidChange(() => {
				if (this._contentHoverWidget.position && this._currentResult) {
					this._setCurrentResult(this._currentResult); // render again
				}
			}));
		} else {
			this._listenersStore.add(this._editor.onMouseMove((e: IEditorMouseEvent) => this._onEditorMouseMove(e)));
			this._listenersStore.add(this._editor.onKeyDown((e: IKeyboardEvent) => this._onKeyDown(e)));
		}
		this._listenersStore.add(this._editor.onMouseLeave((e) => this._onEditorMouseLeave(e)));
		this._listenersStore.add(this._editor.onDidChangeModel(() => {
			this._cancelScheduler();
			this._hideWidgets();
		}));
		this._listenersStore.add(this._editor.onDidChangeModelContent(() => this._cancelScheduler()));
		this._listenersStore.add(this._editor.onDidScrollChange((e: IScrollEvent) => this._onEditorScrollChanged(e)));
	}

	private _unhookListeners(): void {
		this._listenersStore.clear();
	}

	private _cancelScheduler() {
		this._mouseMoveEvent = undefined;
		this._reactToEditorMouseMoveRunner.cancel();
	}

	private _onEditorScrollChanged(e: IScrollEvent): void {
		if (e.scrollTopChanged || e.scrollLeftChanged) {
			this._hideWidgets();
		}
	}

	private _onEditorMouseDown(mouseEvent: IEditorMouseEvent): void {
		this._mouseDown = true;
		const shouldNotHideContentHoverWidget = this._shouldNotHideContentHoverWidget(mouseEvent);
		if (shouldNotHideContentHoverWidget) {
			return;
		}
		this._hideWidgets();
	}

	private _shouldNotHideContentHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		if (this._isMouseOnContentHoverWidget(mouseEvent) || this._isContentWidgetResizing()) {
			return true;
		}
		return false;
	}

	private _isMouseOnContentHoverWidget(mouseEvent: IPartialEditorMouseEvent): boolean {
		const target = mouseEvent.target;
		if (!target) {
			return false;
		}
		return target.type === MouseTargetType.CONTENT_WIDGET && target.detail === ContentHoverWidget.ID;
	}

	private _isContentWidgetResizing(): boolean {
		return this.widget.isResizing || false;
	}

	private _onEditorMouseUp(): void {
		this._mouseDown = false;
	}

	private _onEditorMouseLeave(mouseEvent: IPartialEditorMouseEvent): void {
		if (this.shouldKeepOpenOnEditorMouseMoveOrLeave) {
			return;
		}
		this._cancelScheduler();
		const shouldNotHideContentHoverWidget = this._shouldNotHideContentHoverWidget(mouseEvent);
		if (shouldNotHideContentHoverWidget) {
			return;
		}
		if (_sticky) {
			return;
		}
		this._hideWidgets();
	}

	private _shouldNotRecomputeContentHoverWidget(mouseEvent: IEditorMouseEvent): boolean {
		const isHoverSticky = this._hoverSettings.sticky;
		const isMouseOnStickyContentHoverWidget = (mouseEvent: IEditorMouseEvent, isHoverSticky: boolean) => {
			const isMouseOnContentHoverWidget = this._isMouseOnContentHoverWidget(mouseEvent);
			return isHoverSticky && isMouseOnContentHoverWidget;
		};
		const isMouseOnColorPicker = (mouseEvent: IEditorMouseEvent) => {
			const isMouseOnContentHoverWidget = this._isMouseOnContentHoverWidget(mouseEvent);
			const isColorPickerVisible = this.isColorPickerVisible;
			return isMouseOnContentHoverWidget && isColorPickerVisible;
		};
		// TODO@aiday-mar verify if the following is necessary code
		const isTextSelectedWithinContentHoverWidget = (mouseEvent: IEditorMouseEvent, sticky: boolean) => {
			return sticky
				&& this.containsNode(mouseEvent.event.browserEvent.view?.document.activeElement)
				&& !mouseEvent.event.browserEvent.view?.getSelection()?.isCollapsed;
		};
		if (isMouseOnStickyContentHoverWidget(mouseEvent, isHoverSticky)
			|| isMouseOnColorPicker(mouseEvent)
			|| isTextSelectedWithinContentHoverWidget(mouseEvent, isHoverSticky)) {
			return true;
		}
		return false;
	}

	private _onEditorMouseMove(mouseEvent: IEditorMouseEvent): void {
		if (this.shouldKeepOpenOnEditorMouseMoveOrLeave) {
			return;
		}
		this._mouseMoveEvent = mouseEvent;
		if (this.isFocused || this.isResizing) {
			return;
		}
		const sticky = this._hoverSettings.sticky;
		if (sticky && this.isVisibleFromKeyboard) {
			// Sticky mode is on and the hover has been shown via keyboard
			// so moving the mouse has no effect
			return;
		}
		const shouldNotRecomputeContentHoverWidget = this._shouldNotRecomputeContentHoverWidget(mouseEvent);
		if (shouldNotRecomputeContentHoverWidget) {
			this._reactToEditorMouseMoveRunner.cancel();
			return;
		}
		const hidingDelay = this._hoverSettings.hidingDelay;
		const isContentHoverWidgetVisible = this.isVisible;
		// If the mouse is not over the widget, and if sticky is on,
		// then give it a grace period before reacting to the mouse event
		const shouldRescheduleContentHoverComputation = isContentHoverWidgetVisible && sticky && hidingDelay > 0;
		if (shouldRescheduleContentHoverComputation) {
			if (!this._reactToEditorMouseMoveRunner.isScheduled()) {
				this._reactToEditorMouseMoveRunner.schedule(hidingDelay);
			}
			return;
		}
		this._reactToEditorMouseMove(mouseEvent);
	}

	private _reactToEditorMouseMove(mouseEvent: IEditorMouseEvent | undefined): void {
		if (!mouseEvent) {
			return;
		}
		const target = mouseEvent.target;
		const mouseOnDecorator = target.element?.classList.contains('colorpicker-color-decoration');
		const decoratorActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		const enabled = this._hoverSettings.enabled;
		const activatedByDecoratorClick = this._activatedByDecoratorClick;

		if ((mouseOnDecorator && (
			(decoratorActivatedOn === 'click' && !activatedByDecoratorClick) ||
			(decoratorActivatedOn === 'hover' && !enabled && !_sticky) ||
			(decoratorActivatedOn === 'clickAndHover' && !enabled && !activatedByDecoratorClick)))
			|| (!mouseOnDecorator && !enabled && !activatedByDecoratorClick)) {
			this._hideWidgets();
			return;
		}
		const contentHoverShowsOrWillShow = this._contentHoverShowsOrWillShow(mouseEvent);
		if (contentHoverShowsOrWillShow) {
			return;
		}
		if (_sticky) {
			return;
		}
		this._hideWidgets();
	}

	private _onKeyDown(e: IKeyboardEvent): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const resolvedKeyboardEvent = this._keybindingService.softDispatch(e, this._editor.getDomNode());
		// If the beginning of a multi-chord keybinding is pressed,
		// or the command aims to focus the hover,
		// set the variable to true, otherwise false
		const shouldKeepHoverVisible = (resolvedKeyboardEvent.kind === ResultKind.MoreChordsNeeded
			|| (resolvedKeyboardEvent.kind === ResultKind.KbFound
				&& (resolvedKeyboardEvent.commandId === SHOW_OR_FOCUS_HOVER_ACTION_ID
					|| resolvedKeyboardEvent.commandId === INCREASE_HOVER_VERBOSITY_ACTION_ID
					|| resolvedKeyboardEvent.commandId === DECREASE_HOVER_VERBOSITY_ACTION_ID)
				&& this.isVisible));

		if (e.keyCode === KeyCode.Ctrl
			|| e.keyCode === KeyCode.Alt
			|| e.keyCode === KeyCode.Meta
			|| e.keyCode === KeyCode.Shift
			|| shouldKeepHoverVisible) {
			// Do not hide hover when a modifier key is pressed
			return;
		}
		this._hideWidgets();
	}

	private _hideWidgets(): void {
		if (_sticky) {
			return;
		}
		const isMouseDownOnColorPicker = this._mouseDown && this.isColorPickerVisible;
		const isInlineSuggestioHintsDropDownVisible = InlineSuggestionHintsContentWidget.dropDownVisible;
		if (isMouseDownOnColorPicker || isInlineSuggestioHintsDropDownVisible) {
			return;
		}
		this._activatedByDecoratorClick = false;
		this.hide();
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
		return participants;
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
		const currentAnchorEqualsPreviousAnchor = this._currentResult!.anchor.equals(anchor);
		if (currentAnchorEqualsPreviousAnchor) {
			return true;
		}
		// If mouse if not getting closer and anchor is defined, and the new anchor is not compatible with the previous anchor
		const currentAnchorCompatibleWithPreviousAnchor = anchor.canAdoptVisibleHover(this._currentResult!.anchor, this._contentHoverWidget.position);
		if (!currentAnchorCompatibleWithPreviousAnchor) {
			this._setCurrentResult(null);
			this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
			return true;
		}
		// We aren't getting any closer to the hover, so we will filter existing results
		// and keep those which also apply to the new anchor.
		this._setCurrentResult(this._currentResult!.filter(anchor));
		this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
		return true;
	}

	private _startHoverOperationIfNecessary(anchor: HoverAnchor, mode: HoverStartMode, source: HoverStartSource, focus: boolean, insistOnKeepingHoverVisible: boolean): void {
		const currentAnchorEqualToPreviousHover = this._computer.anchor && this._computer.anchor.equals(anchor);
		if (currentAnchorEqualToPreviousHover) {
			return;
		}
		this._hoverOperation.cancel();
		this._computer.anchor = anchor;
		this._computer.shouldFocus = focus;
		this._computer.source = source;
		this._computer.insistOnKeepingHoverVisible = insistOnKeepingHoverVisible;
		this._hoverOperation.start(mode);
	}

	private _setCurrentResult(hoverResult: HoverResult | null): void {
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

	private _addLoadingMessage(result: IHoverPart[]): IHoverPart[] {
		if (!this._computer.anchor) {
			return result;
		}
		for (const participant of this._participants) {
			if (!participant.createLoadingMessage) {
				continue;
			}
			const loadingMessage = participant.createLoadingMessage(this._computer.anchor);
			if (!loadingMessage) {
				continue;
			}
			return result.slice(0).concat([loadingMessage]);
		}
		return result;
	}

	private _withResult(hoverResult: HoverResult): void {
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
		const insistOnKeepingPreviousHoverVisible = this._computer.insistOnKeepingHoverVisible;
		const shouldKeepPreviousHoverVisible = currentHoverResultIsEmpty && insistOnKeepingPreviousHoverVisible;
		if (shouldKeepPreviousHoverVisible) {
			// The hover would now hide normally, so we'll keep the previous messages
			return;
		}
		this._setCurrentResult(hoverResult);
	}

	private _showHover(hoverResult: HoverResult): void {
		const context = this._getHoverContext();
		this._renderedContentHover = new RenderedContentHover(this._editor, hoverResult, this._participants, this._computer, context, this._keybindingService);
		if (this._renderedContentHover.domNodeHasChildren) {
			this._contentHoverWidget.show(this._renderedContentHover);
		} else {
			this._renderedContentHover.dispose();
		}
	}

	private _hideHover(): void {
		this._contentHoverWidget.hide();
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
		return { hide, onContentsChanged, setMinimumDimensions };
	}

	private _contentHoverShowsOrWillShow(mouseEvent: IEditorMouseEvent): boolean {
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

	public showContentHover(range: Range, mode: HoverStartMode, source: HoverStartSource, focus: boolean, activatedByColorDecoratorClick: boolean = false): void {
		this._activatedByDecoratorClick = activatedByColorDecoratorClick;
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
		this._computer.anchor = null;
		this._hoverOperation.cancel();
		this._setCurrentResult(null);
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

	public override dispose(): void {
		super.dispose();
		this._unhookListeners();
		this._listenersStore.dispose();
	}
}
