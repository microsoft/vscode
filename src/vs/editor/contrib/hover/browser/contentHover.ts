/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverAction, HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { coalesce } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, PositionAffinity } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { HoverOperation, HoverStartMode, HoverStartSource, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, HoverRangeAnchor, IEditorHoverColorPickerWidget, IEditorHoverAction, IEditorHoverParticipant, IEditorHoverRenderContext, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/browser/suggest';
import { AsyncIterableObject } from 'vs/base/common/async';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';

const $ = dom.$;

export class ContentHoverController extends Disposable {

	private readonly _participants: IEditorHoverParticipant[];
	private readonly _widget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
	private readonly _computer: ContentHoverComputer;
	private readonly _hoverOperation: HoverOperation<IHoverPart>;

	private _currentResult: HoverResult | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();

		// Instantiate participants and sort them by `hoverOrdinal` which is relevant for rendering order.
		this._participants = [];
		for (const participant of HoverParticipantRegistry.getAll()) {
			this._participants.push(this._instantiationService.createInstance(participant, this._editor));
		}
		this._participants.sort((p1, p2) => p1.hoverOrdinal - p2.hoverOrdinal);

		this._computer = new ContentHoverComputer(this._editor, this._participants);
		this._hoverOperation = this._register(new HoverOperation(this._editor, this._computer));

		this._register(this._hoverOperation.onResult((result) => {
			if (!this._computer.anchor) {
				// invalid state, ignore result
				return;
			}
			const messages = (result.hasLoadingMessage ? this._addLoadingMessage(result.value) : result.value);
			this._withResult(new HoverResult(this._computer.anchor, messages, result.isComplete));
		}));
		this._register(dom.addStandardDisposableListener(this._widget.getDomNode(), 'keydown', (e) => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
			}
		}));
		this._register(TokenizationRegistry.onDidChange(() => {
			if (this._widget.position && this._currentResult) {
				this._widget.clear();
				this._setCurrentResult(this._currentResult); // render again
			}
		}));
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	public maybeShowAt(mouseEvent: IEditorMouseEvent): boolean {
		const anchorCandidates: HoverAnchor[] = [];

		for (const participant of this._participants) {
			if (participant.suggestHoverAnchor) {
				const anchor = participant.suggestHoverAnchor(mouseEvent);
				if (anchor) {
					anchorCandidates.push(anchor);
				}
			}
		}

		const target = mouseEvent.target;

		if (target.type === MouseTargetType.CONTENT_TEXT) {
			anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
		}

		if (target.type === MouseTargetType.CONTENT_EMPTY) {
			const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
			if (!target.detail.isAfterLines && typeof target.detail.horizontalDistanceToText === 'number' && target.detail.horizontalDistanceToText < epsilon) {
				// Let hover kick in even when the mouse is technically in the empty area after a line, given the distance is small enough
				anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
			}
		}

		if (anchorCandidates.length === 0) {
			return this._startShowingOrUpdateHover(null, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
		}

		anchorCandidates.sort((a, b) => b.priority - a.priority);
		return this._startShowingOrUpdateHover(anchorCandidates[0], HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
	}

	public startShowingAtRange(range: Range, mode: HoverStartMode, source: HoverStartSource, focus: boolean): void {
		this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, undefined, undefined), mode, source, focus, null);
	}

	/**
	 * Returns true if the hover shows now or will show.
	 */
	private _startShowingOrUpdateHover(anchor: HoverAnchor | null, mode: HoverStartMode, source: HoverStartSource, focus: boolean, mouseEvent: IEditorMouseEvent | null): boolean {
		if (!this._widget.position || !this._currentResult) {
			// The hover is not visible
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
				return true;
			}
			return false;
		}

		// The hover is currently visible
		const hoverIsSticky = this._editor.getOption(EditorOption.hover).sticky;
		const isGettingCloser = (hoverIsSticky && mouseEvent && this._widget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy));
		if (isGettingCloser) {
			// The mouse is getting closer to the hover, so we will keep the hover untouched
			// But we will kick off a hover update at the new anchor, insisting on keeping the hover visible.
			if (anchor) {
				this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
			}
			return true;
		}

		if (!anchor) {
			this._setCurrentResult(null);
			return false;
		}

		if (anchor && this._currentResult.anchor.equals(anchor)) {
			// The widget is currently showing results for the exact same anchor, so no update is needed
			return true;
		}

		if (!anchor.canAdoptVisibleHover(this._currentResult.anchor, this._widget.position)) {
			// The new anchor is not compatible with the previous anchor
			this._setCurrentResult(null);
			this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
			return true;
		}

		// We aren't getting any closer to the hover, so we will filter existing results
		// and keep those which also apply to the new anchor.
		this._setCurrentResult(this._currentResult.filter(anchor));
		this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
		return true;
	}

	private _startHoverOperationIfNecessary(anchor: HoverAnchor, mode: HoverStartMode, source: HoverStartSource, focus: boolean, insistOnKeepingHoverVisible: boolean): void {
		if (this._computer.anchor && this._computer.anchor.equals(anchor)) {
			// We have to start a hover operation at the exact same anchor as before, so no work is needed
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
		if (this._currentResult === hoverResult) {
			// avoid updating the DOM to avoid resetting the user selection
			return;
		}
		if (hoverResult && hoverResult.messages.length === 0) {
			hoverResult = null;
		}
		this._currentResult = hoverResult;
		if (this._currentResult) {
			this._renderMessages(this._currentResult.anchor, this._currentResult.messages);
		} else {
			this._widget.hide();
		}
	}

	public hide(): void {
		this._computer.anchor = null;
		this._hoverOperation.cancel();
		this._setCurrentResult(null);
	}

	public isColorPickerVisible(): boolean {
		return this._widget.isColorPickerVisible;
	}

	public isVisibleFromKeyboard(): boolean {
		return this._widget.isVisibleFromKeyboard;
	}

	public isVisible(): boolean {
		return this._widget.isVisible;
	}

	public containsNode(node: Node): boolean {
		return this._widget.getDomNode().contains(node);
	}

	private _addLoadingMessage(result: IHoverPart[]): IHoverPart[] {
		if (this._computer.anchor) {
			for (const participant of this._participants) {
				if (participant.createLoadingMessage) {
					const loadingMessage = participant.createLoadingMessage(this._computer.anchor);
					if (loadingMessage) {
						return result.slice(0).concat([loadingMessage]);
					}
				}
			}
		}
		return result;
	}

	private _withResult(hoverResult: HoverResult): void {
		if (this._widget.position && this._currentResult && this._currentResult.isComplete) {
			// The hover is visible with a previous complete result.

			if (!hoverResult.isComplete) {
				// Instead of rendering the new partial result, we wait for the result to be complete.
				return;
			}

			if (this._computer.insistOnKeepingHoverVisible && hoverResult.messages.length === 0) {
				// The hover would now hide normally, so we'll keep the previous messages
				return;
			}
		}

		this._setCurrentResult(hoverResult);
	}

	private _renderMessages(anchor: HoverAnchor, messages: IHoverPart[]): void {
		const { showAtPosition, showAtSecondaryPosition, highlightRange } = ContentHoverController.computeHoverRanges(this._editor, anchor.range, messages);

		const disposables = new DisposableStore();
		const statusBar = disposables.add(new EditorHoverStatusBar(this._keybindingService));
		const fragment = document.createDocumentFragment();

		let colorPicker: IEditorHoverColorPickerWidget | null = null;
		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget) => colorPicker = widget,
			onContentsChanged: () => this._widget.onContentsChanged(),
			hide: () => this.hide()
		};

		for (const participant of this._participants) {
			const hoverParts = messages.filter(msg => msg.owner === participant);
			if (hoverParts.length > 0) {
				disposables.add(participant.renderHoverParts(context, hoverParts));
			}
		}

		const isBeforeContent = messages.some(m => m.isBeforeContent);

		if (statusBar.hasContent) {
			fragment.appendChild(statusBar.hoverElement);
		}

		if (fragment.hasChildNodes()) {
			if (highlightRange) {
				const highlightDecoration = this._editor.createDecorationsCollection();
				highlightDecoration.set([{
					range: highlightRange,
					options: ContentHoverController._DECORATION_OPTIONS
				}]);
				disposables.add(toDisposable(() => {
					highlightDecoration.clear();
				}));
			}

			this._widget.showAt(fragment, new ContentHoverVisibleData(
				colorPicker,
				showAtPosition,
				showAtSecondaryPosition,
				this._editor.getOption(EditorOption.hover).above,
				this._computer.shouldFocus,
				this._computer.source,
				isBeforeContent,
				anchor.initialMousePosX,
				anchor.initialMousePosY,
				disposables
			));
		} else {
			disposables.dispose();
		}
	}

	private static readonly _DECORATION_OPTIONS = ModelDecorationOptions.register({
		description: 'content-hover-highlight',
		className: 'hoverHighlight'
	});

	public static computeHoverRanges(editor: ICodeEditor, anchorRange: Range, messages: IHoverPart[]) {
		let startColumnBoundary = 1;
		if (editor.hasModel()) {
			// Ensure the range is on the current view line
			const viewModel = editor._getViewModel();
			const coordinatesConverter = viewModel.coordinatesConverter;
			const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
			const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, viewModel.getLineMinColumn(anchorViewRange.startLineNumber));
			startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
		}
		// The anchor range is always on a single line
		const anchorLineNumber = anchorRange.startLineNumber;
		let renderStartColumn = anchorRange.startColumn;
		let highlightRange: Range = messages[0].range;
		let forceShowAtRange: Range | null = null;

		for (const msg of messages) {
			highlightRange = Range.plusRange(highlightRange, msg.range);
			if (msg.range.startLineNumber === anchorLineNumber && msg.range.endLineNumber === anchorLineNumber) {
				// this message has a range that is completely sitting on the line of the anchor
				renderStartColumn = Math.max(Math.min(renderStartColumn, msg.range.startColumn), startColumnBoundary);
			}
			if (msg.forceShowAtRange) {
				forceShowAtRange = msg.range;
			}
		}

		return {
			showAtPosition: forceShowAtRange ? forceShowAtRange.getStartPosition() : new Position(anchorLineNumber, anchorRange.startColumn),
			showAtSecondaryPosition: forceShowAtRange ? forceShowAtRange.getStartPosition() : new Position(anchorLineNumber, renderStartColumn),
			highlightRange
		};
	}

	public focus(): void {
		this._widget.focus();
	}

	public scrollUp(): void {
		this._widget.scrollUp();
	}

	public scrollDown(): void {
		this._widget.scrollDown();
	}

	public pageUp(): void {
		this._widget.pageUp();
	}

	public pageDown(): void {
		this._widget.pageDown();
	}
}

class HoverResult {

	constructor(
		public readonly anchor: HoverAnchor,
		public readonly messages: IHoverPart[],
		public readonly isComplete: boolean
	) { }

	public filter(anchor: HoverAnchor): HoverResult {
		const filteredMessages = this.messages.filter((m) => m.isValidForHoverAnchor(anchor));
		if (filteredMessages.length === this.messages.length) {
			return this;
		}
		return new FilteredHoverResult(this, this.anchor, filteredMessages, this.isComplete);
	}
}

class FilteredHoverResult extends HoverResult {

	constructor(
		private readonly original: HoverResult,
		anchor: HoverAnchor,
		messages: IHoverPart[],
		isComplete: boolean
	) {
		super(anchor, messages, isComplete);
	}

	public override filter(anchor: HoverAnchor): HoverResult {
		return this.original.filter(anchor);
	}
}

class ContentHoverVisibleData {

	public closestMouseDistance: number | undefined = undefined;

	constructor(
		public readonly colorPicker: IEditorHoverColorPickerWidget | null,
		public readonly showAtPosition: Position,
		public readonly showAtSecondaryPosition: Position,
		public readonly preferAbove: boolean,
		public readonly stoleFocus: boolean,
		public readonly source: HoverStartSource,
		public readonly isBeforeContent: boolean,
		public initialMousePosX: number | undefined,
		public initialMousePosY: number | undefined,
		public readonly disposables: DisposableStore
	) { }
}

export class ContentHoverWidget extends Disposable implements IContentWidget {

	static readonly ID = 'editor.contrib.contentHoverWidget';

	public readonly allowEditorOverflow = true;

	private readonly _hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly _hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly _hover: HoverWidget = this._register(new HoverWidget());
	// private readonly _hoverCopy: HoverWidget = this._register(new HoverWidget());

	// Adding a resizable element directly to the content hover widget
	private readonly _element: ResizableHTMLElement = this._register(new ResizableHTMLElement());
	// The mouse position in the editor is needed in order to calculate the space above and below it
	private _mousePosition: IPosition | null = null;
	private _initialMousePosition: IPosition | null = null;
	private readonly _focusTracker = this._register(dom.trackFocus(this.getDomNode()));
	// When the content hover is rendered, the following two variables store the initial position from the top and the initial height
	private _initialTop: number = -1;
	private _initialHeight: number = -1;
	// Storing the preference of whether we want to render above or below
	private _renderingAbove: boolean = this._editor.getOption(EditorOption.hover).above;
	private _visibleData: ContentHoverVisibleData | null = null;

	/**
	 * Returns `null` if the hover is not visible.
	 */
	public get position(): Position | null {
		return this._visibleData?.showAtPosition ?? null;
	}

	public get isColorPickerVisible(): boolean {
		return Boolean(this._visibleData?.colorPicker);
	}

	public get isVisibleFromKeyboard(): boolean {
		return (this._visibleData?.source === HoverStartSource.Keyboard);
	}

	public get isVisible(): boolean {
		return this._hoverVisibleKey.get() ?? false;
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this._register(this._editor.onDidLayoutChange(() => this._layout()));
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._setVisibleData(null);
		this._layout();
		this._editor.addContentWidget(this);

		this._register(this._focusTracker.onDidFocus(() => {
			this._hoverFocusedKey.set(true);
		}));
		this._register(this._focusTracker.onDidBlur(() => {
			this._hoverFocusedKey.set(false);
		}));

		// Saving the approximate position of the mouse
		this._register(this._editor.onMouseMove(e => {
			this._mousePosition = e.target.position;
		}));

		this._element.domNode.appendChild(this._hover.containerDomNode);

		// Place also the hover container dom node on top of the resizable element
		// const boundingBox = this._hover.containerDomNode.getBoundingClientRect();
		// this._hoverCopy.containerDomNode.style.top = boundingBox.top + 'px';
		// this._hoverCopy.containerDomNode.style.left = boundingBox.left + 'px';
		// this._hoverCopy.containerDomNode.style.width = boundingBox.width + 'px';
		// this._hoverCopy.containerDomNode.style.height = boundingBox.height + 'px';
		// this._hoverCopy.containerDomNode.style.zIndex = '1000';
		// console.log('this_hoverCopy.containerDomNode : ', this._hoverCopy.containerDomNode);

		this._register(this._element.onDidWillResize(() => {
			console.log('* Inside of onDidWillResize of ContentHoverWidget');
		}));
		// The below is called when the resizable element is reized
		this._register(this._element.onDidResize(e => {
			console.log('* Inside of onDidResize of ContentHoverWidget');
			console.log('e : ', e);
			this._resize(e.dimension.width, e.dimension.height, this._renderingAbove);
		}));
	}

	// Only called once, define here a default size
	private _setLayoutOfResizableElement(defaultSize: dom.Dimension): void {

		// TODO: 1) Polish code, annotate, make it cleaner. Understand what all the entites correspond to, if some are superfluous, not needed
		// TODO: 3) Find out why sometimes when resizing the element now jumps, should not jump!
		// TODO: 5) Find out why even if smaller than default max size, the whole widget is not shown, want the whole widget to be shown when smaller than default size
		// TODO: 6) Find why the content hover widget changes as hover mouse is moved, ever so slight movement
		// TODO: 7) find why sashes go over board with somewhat longer sashes than should be

		console.log('* Entered into _resizableLayout of ContentHoverWidget');
		console.log('defaultSize : ', defaultSize);
		console.log('this._mousePosition : ', this._mousePosition);
		console.log('this._hover.containerDomNode : ', this._hover.containerDomNode);
		console.log('this._hover.contentsDomNode : ', this._hover.contentsDomNode);

		if (!this._editor.hasModel()) {
			return;
		}
		if (!this._editor.getDomNode()) {
			return;
		}
		if (!this._mousePosition) {
			return;
		}

		// The dimensions of the document in which we are displaying the hover
		const bodyBox = dom.getClientArea(document.body);
		console.log('bodyBox : ', bodyBox);

		// Hard-coded in the hover.css file as 1.5em or 24px
		const minHeight = 24;

		console.log('defaultSize : ', defaultSize);
		let height = defaultSize.height;
		let width = defaultSize.width;

		// Hard-code the values for now!
		const maxWidth = bodyBox.width;
		if (width > maxWidth) {
			console.log('width capped at the maxWidth');
			width = maxWidth;
		}

		// The full height is already passed in as a parameter
		const fullHeight = defaultSize.height;
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		console.log('editorBox : ', editorBox);
		const mouseBox = this._editor.getScrolledVisiblePosition(this._mousePosition);
		console.log('mouseBox : ', mouseBox);
		// Position where the editor box starts + the top of the mouse box relatve to the editor + mouse box height
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		console.log('mouseBottom : ', mouseBottom);
		// Total height of the box minus the position of the bottom of the mouse, this is the maximum height below the mouse position
		const availableSpaceBelow = bodyBox.height - mouseBottom;
		console.log('availableSpaceBelow : ', availableSpaceBelow);
		// Max height below is the minimum of the available space below and the full height of the widget
		const maxHeightBelow = Math.min(availableSpaceBelow, fullHeight);
		console.log('maxHeightBelow : ', maxHeightBelow);
		// The available space above the mouse position is the height of the top of the editor plus the top of the mouse box relative to the editor
		const availableSpaceAbove = mouseBox.top + 35 + 22; // Removing 35 because that is the height of the tabs // editorBox.top // adding 22 because height of breadcrumbs
		console.log('availableSpaceAbove : ', availableSpaceAbove);
		// Max height above is the minimum of the available space above and the full height of the widget
		const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
		console.log('maxHeightAbove : ', maxHeightAbove);
		// We find the maximum height of the widget possible on the top or on the bottom
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), fullHeight);
		console.log('maxHeight : ', maxHeight);

		if (height < minHeight) {
			console.log('height capped at the min height');
			height = minHeight;
		}
		if (height > maxHeight) {
			console.log('height capped at the maximum height');
			// The maximum height has been limited due to not enough
			height = maxHeight;
		}

		const preferRenderingAbove = this._editor.getOption(EditorOption.hover).above;
		console.log('preferRenderingAbove : ', preferRenderingAbove);

		console.log('Before enabling sashes');
		if (preferRenderingAbove) {
			console.log('first if condition');

			const westSash = false;
			const eastSash = true;
			const northSash = height <= maxHeightAbove;
			const southSash = height > maxHeightAbove;
			this._renderingAbove = height <= maxHeightAbove;
			console.log('this._renderingAbove : ', this._renderingAbove);
			this._element.enableSashes(northSash, eastSash, southSash, westSash);

		} else {
			console.log('Second if condition');
			const westSash = false;
			const eastSash = true;
			const northSash = height > maxHeightBelow;
			const southSash = height <= maxHeightBelow;

			this._renderingAbove = height > maxHeightBelow;
			console.log('this._renderingAbove : ', this._renderingAbove);
			this._element.enableSashes(northSash, eastSash, southSash, westSash);
		}

		// TODO: Place the following line in order to use the calculated max width and max height
		// this._element.maxSize = new dom.Dimension(maxWidth, maxHeight);
		// TODO: It would appear that if the minimum width is 0, it will disappear, set some value larger than 0
		this._element.minSize = new dom.Dimension(10, minHeight);
		const maxRenderingHeight = this._findMaxRenderingHeight(this._renderingAbove);
		console.log('maxRenderingHeight : ', maxRenderingHeight);
		if (!maxRenderingHeight) {
			return;
		}
		this._element.maxSize = new dom.Dimension(maxWidth, maxRenderingHeight);

		this._resize(width, height, this._renderingAbove);

		// TODO: Enable sashes on different places depending on if hover shown on the top or on the bottom
		// TODO: When the hover is extended too much, so that part of it disappears, it disappears completely
		// TODO: Eastern sash disappears when the hover is too small? or after extending too much?

		// The below works!!
		// this._element.enableSashes(true, true, false, false);
		// const height = size ? size.height : 200;
		// const width = size ? size.width : 200;
		// this._resize(width, height);

	}

	private _findMaxRenderingHeight(renderingAbove: boolean): number | undefined {
		if (!this._initialMousePosition || !this._editor || !this._editor.hasModel()) {
			return;
		}
		const preferRenderingAbove = this._editor.getOption(EditorOption.hover).above;
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		console.log('this._mousePosition : ', this._mousePosition);
		const mouseBox = this._editor.getScrolledVisiblePosition(this._initialMousePosition);
		const bodyBox = dom.getClientArea(document.body);
		// Different to availableSpaceAbove because we want to remove the tabs and breadcrumbs, since the content hover disappears as soon as below the tabs or breadcrumbs
		const availableSpaceAboveMinusTabsAndBreadcrumbs = mouseBox!.top;
		const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
		const availableSpaceBelow = bodyBox.height - mouseBottom;

		let maxRenderingHeight;
		if (preferRenderingAbove) {
			maxRenderingHeight = renderingAbove ? availableSpaceAboveMinusTabsAndBreadcrumbs : availableSpaceBelow;
		} else {
			maxRenderingHeight = renderingAbove ? availableSpaceBelow : availableSpaceAboveMinusTabsAndBreadcrumbs;
		}
		console.log('maxRenderingHeight : ', maxRenderingHeight);
		let actualMaxHeight = 0;
		for (const childHtmlElement of this._hover.contentsDomNode.children) {
			actualMaxHeight += childHtmlElement.clientHeight;
		}
		console.log('actualMaxHeight : ', actualMaxHeight);
		maxRenderingHeight = Math.min(maxRenderingHeight, actualMaxHeight + 2);
		return maxRenderingHeight;
	}

	private _resize(width: number, height: number, renderingAbove: boolean): void {

		console.log(' * Entered into the _resize function of ContentHoverWidget');

		console.log('this._initialHeight : ', this._initialHeight);
		console.log('this._initialTop : ', this._initialTop);

		// Suppose that this is not the first time the resize is called after the initial rendering and we are rendering above
		// Then update the top position of the widget
		if (this._initialHeight !== -1 && renderingAbove) {
			console.log('Entered into case when initial height !== -1');
			const diff = height - this._initialHeight;
			console.log('diff : ', diff);
			// When difference positive, means that the widget grew, place it higher up
			console.log('this._initialTop - diff : ', this._initialTop - diff);
			this._element.domNode.style.top = this._initialTop - diff + 'px';
		}

		const { width: maxWidth, height: maxHeight } = this._element.maxSize;
		// console.log('maxWidth : ', maxWidth, ' width : ', width);
		width = Math.min(maxWidth, width);
		// console.log('maxHeight : ', maxHeight, ' height : ', height);
		height = Math.min(maxHeight, height);

		// Setting the size of the resizable element with the height and width given
		this._element.layout(height, width);
		// console.log('this._element.domNode.style.height : ', this._element.domNode.style.height);
		// console.log('this._element.domNode.style.width : ', this._element.domNode.style.width);

		// Making the hover container dom node have height and width of the resizable element minus the pixels needed in order to show the sashes
		this._hover.containerDomNode.style.height = `${height - 2}px`;
		this._hover.containerDomNode.style.width = `${width - 2}px`;
		// Client height and scroll height should not be the same so that the scroll bar is needed
		this._hover.contentsDomNode.style.height = `${height - 2}px`;
		this._hover.contentsDomNode.style.width = `${width - 2}px`;
		// console.log('this._hover.contentsDomNode.clientHeight : ', this._hover.contentsDomNode.clientHeight);
		// console.log('this._hover.contentsDomNode.scrollHeight : ', this._hover.contentsDomNode.scrollHeight);


		// TODO Experimentation done for finding the maximum current size to give to the resizable element
		const containerOffsetHeight = this._hover.containerDomNode.offsetHeight;
		const contentsOffsetHeight = this._hover.contentsDomNode.offsetHeight;
		// console.log('this._hover.containerDomNode.offsetWidth : ', this._hover.containerDomNode.offsetWidth);
		// console.log('this._hover.containerDomNode.offsetHeight : ', containerOffsetHeight);
		// console.log('this._hover.contentsDomNode.offsetWidth : ', this._hover.contentsDomNode.offsetWidth);
		// console.log('this._hover.contentsDomNode.offsetHeight : ', contentsOffsetHeight);

		const maxResizableWidth = this._hover.contentsDomNode.offsetWidth;
		const maxResizableHeight = this._hover.contentsDomNode.offsetHeight;
		const currentMaxSize = new dom.Dimension(maxResizableWidth, maxResizableHeight);
		// console.log('currentMaxSize : ', currentMaxSize);
		// this._element.maxSize = currentMaxSize;

		// Find when to make the scroll-bar visible
		if (containerOffsetHeight < contentsOffsetHeight) {
			// make scrollbar visible?
			// console.log('container height offset smaller than contents height offset');
		}

		// console.log('this._element.domNode.style.maxWidth : ', this._element.domNode.style.maxWidth);
		// console.log('this._element.domNode.style.maxHeight : ', this._element.domNode.style.maxHeight);

		// If the initial top and height values have not been updated yet, update them the first time the content is rendered
		if (this._initialTop === -1) {
			// console.log('Entered into update of initial top');
			// console.log('this._element.domNode.clientTop : ', this._element.domNode.clientTop);
			// console.log('this._element.domNode.style : ', this._element.domNode.style);
			// console.log('this._element.domNode.style.top : ', this._element.domNode.style.top);
			// console.log('this._element.domNode.style[0] : ', this._element.domNode.style[0]);
			// console.log('this._element.domNode.clientHeight : ', this._element.domNode.clientHeight);
			// console.log('this._element.domNode.offsetTop : ', this._element.domNode.offsetTop);
			// console.log('this._element.domNode.scrollTop : ', this._element.domNode.scrollTop);
			this._initialTop = this._element.domNode.offsetTop + 4;
			this._initialHeight = this._element.domNode.clientHeight;
			// TODO: The problem is that the offset top is not correctly set! Hence the jumping of the dom node
			// console.log('this._element.domNode.getClientRects() : ', this._element.domNode.getClientRects()[0].top);
			console.log('this._element.domNode.style.top : ', this._element.domNode.style.top);
			console.log('this._element.domNode.offsetTop : ', this._element.domNode.offsetTop);
			console.log('this._element.domNode.clientTop : ', this._element.domNode.clientTop);
			console.log('this._element.domNode.scrollTop : ', this._element.domNode.scrollTop);
			console.log('this._hover.containerDomNode.style.top : ', this._hover.containerDomNode.style.top);
			console.log('this._initialTop : ', this._initialTop);
			console.log('this._initialHeight ; ', this._initialHeight);
		}

		this._hover.scrollbar.scanDomNode();

		const maxRenderingHeight = this._findMaxRenderingHeight(this._renderingAbove);
		console.log('maxRenderingHeight : ', maxRenderingHeight);
		if (!maxRenderingHeight) {
			return;
		}
		this._element.maxSize = new dom.Dimension(maxWidth, maxRenderingHeight);
		// console.log('this._element.domNode : ', this._element.domNode);

		// this._hoverCopy.scrollbar.scanDomNode();
		// console.log('this._hover.scrollbar : ', this._hover.scrollbar);
		// Adding code for hover copy!!
		// const boundingBox = this._hover.containerDomNode.getBoundingClientRect();
		// this._hoverCopy.containerDomNode.style.top = boundingBox.top + 'px';
		// this._hoverCopy.containerDomNode.style.left = boundingBox.left + 'px';
		// this._hoverCopy.containerDomNode.style.width = boundingBox.width + 'px';
		// this._hoverCopy.containerDomNode.style.height = boundingBox.height + 'px';
		// console.log('this_hoverCopy.containerDomNode : ', this._hoverCopy.containerDomNode);
	}

	public override dispose(): void {
		this._editor.removeContentWidget(this);
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		super.dispose();
	}

	public getId(): string {
		return ContentHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		// return this._hover.containerDomNode;
		// Returning instead the resizable element
		return this._element.domNode;
	}

	public getPosition(): IContentWidgetPosition | null {
		console.log('Inside of getPosition of the ContentHoverWidget');
		if (!this._visibleData) {
			return null;
		}
		let preferAbove = this._visibleData.preferAbove;
		if (!preferAbove && this._contextKeyService.getContextKeyValue<boolean>(SuggestContext.Visible.key)) {
			// Prefer rendering above if the suggest widget is visible
			preferAbove = true;
		}

		// :before content can align left of the text content
		const affinity = this._visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;

		return {
			position: this._visibleData.showAtPosition,
			secondaryPosition: this._visibleData.showAtSecondaryPosition,
			preference: (
				preferAbove
					? [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
					: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
			),
			positionAffinity: affinity
		};
	}

	public isMouseGettingCloser(posx: number, posy: number): boolean {
		if (!this._visibleData) {
			return false;
		}
		if (typeof this._visibleData.initialMousePosX === 'undefined' || typeof this._visibleData.initialMousePosY === 'undefined') {
			this._visibleData.initialMousePosX = posx;
			this._visibleData.initialMousePosY = posy;
			return false;
		}

		const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
		if (typeof this._visibleData.closestMouseDistance === 'undefined') {
			this._visibleData.closestMouseDistance = computeDistanceFromPointToRectangle(this._visibleData.initialMousePosX, this._visibleData.initialMousePosY, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		}
		const distance = computeDistanceFromPointToRectangle(posx, posy, widgetRect.left, widgetRect.top, widgetRect.width, widgetRect.height);
		if (distance > this._visibleData.closestMouseDistance + 4 /* tolerance of 4 pixels */) {
			// The mouse is getting farther away
			return false;
		}
		this._visibleData.closestMouseDistance = Math.min(this._visibleData.closestMouseDistance, distance);
		return true;
	}

	private _setVisibleData(visibleData: ContentHoverVisibleData | null): void {
		if (this._visibleData) {
			this._visibleData.disposables.dispose();
		}
		this._visibleData = visibleData;
		this._hoverVisibleKey.set(!!this._visibleData);
		this._hover.containerDomNode.classList.toggle('hidden', !this._visibleData);
		// Also need to set the element dom node to hidden when hidden
		this._element.domNode.classList.toggle('hidden', !this._visibleData);
	}

	private _layout(): void {
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);

		this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		// Removing the max width and the max height on the content
		// this._hover.contentsDomNode.style.maxHeight = `${height}px`;
		// this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;

		// TODO: Do we need this?
		this._hover.maxHeight = height;
		this._hover.maxWidth = Math.max(this._editor.getLayoutInfo().width * 0.66, 500);
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverVisibleData): void {

		// Setting maximum so that the hover initially made to respect these conditions
		// this._hover.containerDomNode.style.maxHeight = '150px';
		// this._hover.containerDomNode.style.maxWidth = '300px';

		// Setting the initial mouse position
		if (!this._initialMousePosition) {
			this._initialMousePosition = this._mousePosition;
		}

		console.log(' * Entered into showAt of ContentHoverWidget');
		console.log('visibleData : ', visibleData);

		this._setVisibleData(visibleData);

		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._hover.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		this.onContentsChanged();

		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		this._editor.render();

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		this.onContentsChanged();

		if (visibleData.stoleFocus) {
			this._hover.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();

		// Only called once, when the widget is first shown
		// TODO: Set a better default, this is causing small initial sizes
		console.log('this._hover.containerDomNode : ', this._hover.containerDomNode);
		console.log('this._hover.contentsDomNode : ', this._hover.contentsDomNode);
		console.log('this._hover.containerDomNode.clientHeight : ', this._hover.containerDomNode.clientHeight);
		console.log('this._hover.containerDomNode.clientWidth : ', this._hover.containerDomNode.clientWidth);
		let height;
		let width;
		if (this._initialTop === -1) {
			height = this._hover.containerDomNode.offsetHeight;
			width = this._hover.containerDomNode.offsetWidth;
		} else {
			height = this._hover.containerDomNode.offsetHeight + 4;
			width = this._hover.containerDomNode.offsetWidth + 2; // not sure why adding only 2
		}
		const defaultMaxHeight = Math.min(150, height);
		const defaultMaxWidth = Math.min(300, width);
		const defaultSize = new dom.Dimension(defaultMaxWidth, defaultMaxHeight);
		this._setLayoutOfResizableElement(defaultSize);
	}

	public hide(): void {
		console.log('calling hide');
		this._element.enableSashes(false, false, false, false);
		if (this._visibleData) {
			const stoleFocus = this._visibleData.stoleFocus;
			this._setVisibleData(null);
			this._editor.layoutContentWidget(this);
			if (stoleFocus) {
				this._editor.focus();
			}
		}

		// resetting the distance to the top from the hover
		this._initialTop = -1;
		this._initialHeight = -1;
		this._initialMousePosition = null;
	}

	public onContentsChanged(): void {
		this._editor.layoutContentWidget(this);
		this._hover.onContentsChanged();

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				this._editor.layoutContentWidget(this);
				this._hover.onContentsChanged();
			}
		}
	}

	public clear(): void {
		this._hover.contentsDomNode.textContent = '';
	}

	public focus(): void {
		this._hover.containerDomNode.focus();
	}

	public scrollUp(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
	}

	public scrollDown(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
	}

	public pageUp(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
	}

	public pageDown(): void {
		const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
		const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
		this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
	}
}

class EditorHoverStatusBar extends Disposable implements IEditorHoverStatusBar {

	public readonly hoverElement: HTMLElement;
	private readonly actionsElement: HTMLElement;
	private _hasContent: boolean = false;

	public get hasContent() {
		return this._hasContent;
	}

	constructor(
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this.hoverElement = $('div.hover-row.status-bar');
		this.actionsElement = dom.append(this.hoverElement, $('div.actions'));
	}

	public addAction(actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string }): IEditorHoverAction {
		const keybinding = this._keybindingService.lookupKeybinding(actionOptions.commandId);
		const keybindingLabel = keybinding ? keybinding.getLabel() : null;
		this._hasContent = true;
		return this._register(HoverAction.render(this.actionsElement, actionOptions, keybindingLabel));
	}

	public append(element: HTMLElement): HTMLElement {
		const result = dom.append(this.actionsElement, element);
		this._hasContent = true;
		return result;
	}
}

class ContentHoverComputer implements IHoverComputer<IHoverPart> {

	private _anchor: HoverAnchor | null = null;
	public get anchor(): HoverAnchor | null { return this._anchor; }
	public set anchor(value: HoverAnchor | null) { this._anchor = value; }

	private _shouldFocus: boolean = false;
	public get shouldFocus(): boolean { return this._shouldFocus; }
	public set shouldFocus(value: boolean) { this._shouldFocus = value; }

	private _source: HoverStartSource = HoverStartSource.Mouse;
	public get source(): HoverStartSource { return this._source; }
	public set source(value: HoverStartSource) { this._source = value; }

	private _insistOnKeepingHoverVisible: boolean = false;
	public get insistOnKeepingHoverVisible(): boolean { return this._insistOnKeepingHoverVisible; }
	public set insistOnKeepingHoverVisible(value: boolean) { this._insistOnKeepingHoverVisible = value; }

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _participants: readonly IEditorHoverParticipant[]
	) {
	}

	private static _getLineDecorations(editor: IActiveCodeEditor, anchor: HoverAnchor): IModelDecoration[] {
		if (anchor.type !== HoverAnchorType.Range && !anchor.supportsMarkerHover) {
			return [];
		}

		const model = editor.getModel();
		const lineNumber = anchor.range.startLineNumber;

		if (lineNumber > model.getLineCount()) {
			// invalid line
			return [];
		}

		const maxColumn = model.getLineMaxColumn(lineNumber);
		return editor.getLineDecorations(lineNumber).filter((d) => {
			if (d.options.isWholeLine) {
				return true;
			}

			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;
			if (d.options.showIfCollapsed) {
				// Relax check around `showIfCollapsed` decorations to also include +/- 1 character
				if (startColumn > anchor.range.startColumn + 1 || anchor.range.endColumn - 1 > endColumn) {
					return false;
				}
			} else {
				if (startColumn > anchor.range.startColumn || anchor.range.endColumn > endColumn) {
					return false;
				}
			}

			return true;
		});
	}

	public computeAsync(token: CancellationToken): AsyncIterableObject<IHoverPart> {
		const anchor = this._anchor;

		if (!this._editor.hasModel() || !anchor) {
			return AsyncIterableObject.EMPTY;
		}

		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, anchor);
		return AsyncIterableObject.merge(
			this._participants.map((participant) => {
				if (!participant.computeAsync) {
					return AsyncIterableObject.EMPTY;
				}
				return participant.computeAsync(anchor, lineDecorations, token);
			})
		);
	}

	public computeSync(): IHoverPart[] {
		if (!this._editor.hasModel() || !this._anchor) {
			return [];
		}

		const lineDecorations = ContentHoverComputer._getLineDecorations(this._editor, this._anchor);

		let result: IHoverPart[] = [];
		for (const participant of this._participants) {
			result = result.concat(participant.computeSync(this._anchor, lineDecorations));
		}

		return coalesce(result);
	}
}

function computeDistanceFromPointToRectangle(pointX: number, pointY: number, left: number, top: number, width: number, height: number): number {
	const x = (left + width / 2); // x center of rectangle
	const y = (top + height / 2); // y center of rectangle
	const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
	const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
	return Math.sqrt(dx * dx + dy * dy);
}
