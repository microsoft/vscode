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
import { ContentWidgetPositionPreference, IActiveCodeEditor, ICodeEditor, IContentWidget, IContentWidgetPosition, IEditorMouseEvent, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType } from 'vs/editor/browser/editorBrowser';
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

class ResizeState {
	constructor(
		readonly persistedSize: dom.Dimension | undefined,
		readonly currentSize: dom.Dimension,
		public persistHeight = false,
		public persistWidth = false,
	) { }
}

export class ContentHoverController extends Disposable {

	private readonly _participants: IEditorHoverParticipant[];
	private readonly _resizableWidget = this._register(this._instantiationService.createInstance(ResizableHoverOverlay, this._editor));
	private readonly _widget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor, this._contextKeyService, this._resizableWidget));

	private readonly _computer: ContentHoverComputer;
	private readonly _hoverOperation: HoverOperation<IHoverPart>;

	private _currentResult: HoverResult | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

		// const widgetPosition = this._widget.getPosition();
		// console.log('widgetPosition : ', widgetPosition);
		// this._resizableWidget.setPosition(widgetPosition);

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
			console.log('this result of the hover operation is attained');
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
		this._register(this._editor.onDidChangeModel(() => {
			this._resizableWidget.hide();
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
			this._resizableWidget.hide();
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
		console.log('Inside of _renderMessage');
		const { showAtPosition, showAtSecondaryPosition, highlightRange } = ContentHoverController.computeHoverRanges(this._editor, anchor.range, messages);

		const disposables = new DisposableStore();
		const statusBar = disposables.add(new EditorHoverStatusBar(this._keybindingService));
		const fragment = document.createDocumentFragment();

		let colorPicker: IEditorHoverColorPickerWidget | null = null;
		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget) => colorPicker = widget,
			onContentsChanged: () => {
				this._widget.onContentsChanged();
				const clientWidth = this._widget.getDomNode().clientWidth;
				const clientHeight = this._widget.getDomNode().clientHeight;
				this._resizableWidget.resizableElement().layout(clientHeight, clientWidth);
				this._editor.layoutOverlayWidget(this._resizableWidget);
				this._editor.render();
			},
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
			const preferAbove = this._editor.getOption(EditorOption.hover).above;
			console.log('Before this._widget.showAt');
			this._widget.showAt(fragment, new ContentHoverVisibleData(
				colorPicker,
				showAtPosition,
				showAtSecondaryPosition,
				preferAbove,
				this._computer.shouldFocus,
				this._computer.source,
				isBeforeContent,
				anchor.initialMousePosX,
				anchor.initialMousePosY,
				disposables
			));
			this._editor.layoutContentWidget(this._widget);
			this._editor.render();

			// showAtPosition.lineNumber = showAtPosition.lineNumber + 10;
			const containerDomNode = this._widget.getDomNode();
			const offsetWidth = containerDomNode.offsetWidth;
			const clientWidth = containerDomNode.clientWidth;
			const scrollWidth = containerDomNode.scrollWidth;
			const width = containerDomNode.style.width;
			console.log('offsetWidth : ', offsetWidth);
			console.log('clientWidth : ', clientWidth);
			console.log('scrollWidth : ', scrollWidth);
			console.log('width : ', width);

			const contentsDomNode = this._widget.getContentsDomNode();
			const contentsOffsetWidth = contentsDomNode.offsetWidth;
			const contentsClientWidth = contentsDomNode.clientWidth;
			const contentsScrollWidth = contentsDomNode.scrollWidth;
			const contentsWidth = contentsDomNode.style.width;
			console.log('contentsOffsetWidth : ', contentsOffsetWidth);
			console.log('contentsClientWidth : ', contentsClientWidth);
			console.log('contentsScrollWidth : ', contentsScrollWidth);
			console.log('contentsWidth : ', contentsWidth);

			console.log('this._widget.getDomNode() : ', this._widget.getDomNode());

			const size = new dom.Dimension(this._widget.getDomNode().clientWidth, this._widget.getDomNode().clientHeight);
			console.log('this._widget.size() : ', this._widget.getSize());
			console.log('Before this._resizableWidget.showAt');
			console.log('clientTop: this._widget.getDomNode().clientTop : ', this._widget.getDomNode().clientTop);
			console.log('clientTop: this._widget.getDomNode().offsetTop : ', this._widget.getDomNode().offsetTop);
			console.log('clientTop: this._widget.getDomNode().style.top : ', this._widget.getDomNode().style.top);
			const position = { clientTop: this._widget.getDomNode().offsetTop, clientLeft: this._widget.getDomNode().offsetLeft };
			this._resizableWidget.showAt(position, size);
			this._editor.layoutOverlayWidget(this._resizableWidget);
			this._editor.render();
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

export class ResizableHoverOverlay extends Disposable implements IOverlayWidget {

	static readonly ID = 'editor.contrib.resizableHoverOverlay';
	private _resizableElement: ResizableHTMLElement = this._register(new ResizableHTMLElement());
	private _position: IContentWidgetPosition | null = null;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		console.log('Inside of constructor of ResizableHoverOverlay');
		// TODO: When the following is added the initial content hover appears to disappear
		this._editor.addOverlayWidget(this);
		this._resizableElement.domNode.style.zIndex = '100';
		this._resizableElement.domNode.style.position = 'fixed';
	}

	public hide(): void {
		console.log('hiding the resizable hover overlay');
		this._resizableElement.clearSashHoverState();
		this._resizableElement.layout(0, 0);
	}

	public resizableElement(): ResizableHTMLElement {
		return this._resizableElement;
	}

	public getId(): string {
		return ResizableHoverOverlay.ID;
	}

	public getDomNode(): HTMLElement {
		console.log('Inside of getDomNode() of ResizableHoverOverlay');
		return this._resizableElement.domNode;
	}

	public setPosition(position: any): void {
		console.log('Inside of setPosition of ResizableHOverOverlay');
		console.log('this._position : ', this._position);
		this._position = position;
		if (!position || !position.position) {
			return;
		}
		this._resizableElement.domNode.style.top = position.clientTop + 'px';
		this._resizableElement.domNode.style.left = position.clientLeft + 'px';
	}

	public getPosition(): IOverlayWidgetPosition | null {
		console.log('Inside of getPosition of ResizableHoverOverlay');
		console.log('this._position : ', this._position);
		return null;
	}

	public showAt(position: any, size: dom.Dimension): void {
		console.log('Inside of showAt of ResizableHoverOverlay');
		// this._position = widgetPosition;
		console.log('position : ', position);
		console.log('size : ', size);

		this._resizableElement.enableSashes(true, true, true, true);
		this._resizableElement.domNode.style.top = position.clientTop + 'px';
		this._resizableElement.domNode.style.left = position.clientLeft + 'px';
		this._resizableElement.layout(size.height + 4, size.width + 4);
		this._editor.layoutOverlayWidget(this);
		this._editor.render();
		const resizableDomNode = this._resizableElement.domNode;
		console.log('this._resizableElement.domNode : ', resizableDomNode);
		console.log('resizableDomNode.clientWidth : ', resizableDomNode.clientWidth);
		console.log('resizableDomNode.clientHeight : ', resizableDomNode.clientHeight);
		console.log('this._resizableElement.size : ', this._resizableElement.size);
	}

}
// TODO: Find the correct initial hover size

export class ContentHoverWidget extends Disposable implements IContentWidget {

	static readonly ID = 'editor.contrib.contentHoverWidget';

	public readonly allowEditorOverflow = true;


	private readonly _hover: HoverWidget = this._register(new HoverWidget());
	private _visibleData: ContentHoverVisibleData | null = null;
	private _resizableElement: ResizableHTMLElement = this._register(new ResizableHTMLElement());
	private _renderingAboveOption: boolean = this._editor.getOption(EditorOption.hover).above;
	private _renderingAbove = this._renderingAboveOption;
	private _maxRenderingHeight: number | undefined = -1;
	private readonly _persistedHoverWidgetSizes = new Map<string, Map<string, dom.Dimension>>();
	private readonly _hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(this._contextKeyService);
	private readonly _hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(this._contextKeyService);
	private readonly _focusTracker = this._register(dom.trackFocus(this.getDomNode()));
	private _resizeObserver: ResizeObserver = new ResizeObserver((entries) => {
		// console.log('inside of resize observer for element: ', entries);
	});
	private _resizeContentsObserver: ResizeObserver = new ResizeObserver((entries) => {
		// console.log('inside of resize observer for contents: ', entries);
	});
	private _resizeContainerObserver: ResizeObserver = new ResizeObserver((entries) => {
		// console.log('inside of resize observer for container: ', entries);
	});

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
		private readonly _resizableWidget: ResizableHoverOverlay
	) {
		super();
		// console.log('Very beginning of constructor');
		// console.log('this._element.domNode : ', this._resizableElement.domNode);
		this._resizeObserver.observe(this._resizableElement.domNode);
		this._resizeContentsObserver.observe(this._hover.contentsDomNode);
		this._resizeContainerObserver.observe(this._hover.containerDomNode);

		this._register(this._editor.onDidLayoutChange(() => this._layout()));
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
			if (e.hasChanged(EditorOption.hover)) {
				this._renderingAbove = this._editor.getOption(EditorOption.hover).above;
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
		/*
		this._editor.onDidChangeModelContent((e) => {
			const uri = this._editor.getModel()?.uri.toString();
			if (!uri || !(uri in this._persistedHoverWidgetSizes)) {
				return;
			}
			const mapToUpdate = this._persistedHoverWidgetSizes.get(uri)!;
			for (const change of e.changes) {
				const changeOffset = change.rangeOffset;
				const length = change.rangeLength;
				const endOffset = changeOffset + length;
				for (const stringifiedEntry of mapToUpdate.keys()) {
					const entry = JSON.parse(stringifiedEntry);
					if (endOffset < entry[0]) {
						const oldSize = mapToUpdate.get(entry)!;
						const newEntry: [number, number] = [entry[0] + length, entry[1]];
						mapToUpdate.set(JSON.stringify(newEntry), oldSize);
						mapToUpdate.delete(entry);
					} else if (changeOffset < entry[0] + entry[1]) {
						mapToUpdate.delete(entry);
					}
				}
			}
		});
		this._resizableElement.domNode.appendChild(this._hover.containerDomNode);
		this._resizableElement.domNode.className = 'resizable-hover';
		this._resizableElement.domNode.tabIndex = 0;
		this._resizableElement.domNode.role = 'tooltip';

		let state: ResizeState | undefined;

		this._register(this._resizableElement.onDidWillResize(() => {
			console.log('this._persistedHoverWidgetSizes ; ', this._persistedHoverWidgetSizes);
			const persistedSize = this._findPersistedSize();
			state = new ResizeState(persistedSize, this._resizableElement.size);
		}));
		this._register(this._resizableElement.onDidResize(e => {
			console.log('* Inside of onDidResize of ContentHoverWidget');
			console.log('e : ', e);
			this._resize(e.dimension.width, e.dimension.height);
			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
			}
			if (!e.done) {
				return;
			}
			if (state) {
				if (!this._editor.hasModel()) {
					return;
				}
				const uri = this._editor.getModel().uri.toString();
				if (!uri) {
					return;
				}
				const { width, height } = this._resizableElement.size;
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this._editor.getModel()?.getWordAtPosition(this._visibleData!.showAtPosition);
				if (!wordPosition || !this._editor.hasModel()) {
					return;
				}
				const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._visibleData!.showAtPosition.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				if (!this._persistedHoverWidgetSizes.get(uri)) {
					const map = new Map<string, dom.Dimension>([]);
					map.set(JSON.stringify([offset, length]), persistedSize);
					this._persistedHoverWidgetSizes.set(uri, map);
				} else {
					const map = this._persistedHoverWidgetSizes.get(uri)!;
					map.set(JSON.stringify([offset, length]), persistedSize);
				}
			}
			state = undefined;

			console.log('this._persistedHoverWidgetSizes ; ', this._persistedHoverWidgetSizes);
		}));

		console.log('Before adding the content widget');
		console.log('this._element.domNode : ', this._resizableElement.domNode);
		this._editor.addContentWidget(this);
		console.log('After adding the content widget');
		console.log('this._element.domNode : ', this._resizableElement.domNode);
		*/
	}

	public getSize() {
		return new dom.Dimension(this._hover.containerDomNode.clientWidth, this._hover.containerDomNode.clientHeight);
	}

	private _findPersistedSize(): dom.Dimension | undefined {
		// console.log('Inside of _findPersistedSize');
		const wordPosition = this._editor.getModel()?.getWordAtPosition(this._visibleData!.showAtPosition);
		if (!wordPosition || !this._editor.hasModel()) {
			return;
		}
		const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._visibleData!.showAtPosition.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this._editor.getModel().uri.toString();
		// console.log('offset : ', offset);
		// console.log('length : ', length);
		const textModelMap = this._persistedHoverWidgetSizes.get(uri);
		// console.log('textModelMap : ', textModelMap);
		if (!textModelMap) {
			return;
		}
		// console.log('textModelMap.value : ', textModelMap.entries().next().value);
		return textModelMap.get(JSON.stringify([offset, length]));
	}

	private _setLayoutOfResizableElement(): void {

		// console.log('* Entered into _setLayoutOfResizableElement of ContentHoverWidget');
		// console.log('this._element.domNode before layoutContentWidget : ', this._resizableElement.domNode);

		if (!this._editor.hasModel() || !this._editor.getDomNode() || !this._visibleData?.showAtPosition) {
			return;
		}

		let height;
		let width;
		const persistedSize = this._findPersistedSize();
		// console.log('persistedSize : ', persistedSize);

		if (persistedSize) {
			// console.log('When using the persisted size');
			height = persistedSize.height;
			width = persistedSize.width;
		} else {
			// console.log('When not using the persisted size');
			const initialMaxHeight = Math.max(this._editor.getLayoutInfo().height / 4, 250);
			const initialMaxWidth = Math.max(this._editor.getLayoutInfo().width * 0.66, 500);
			this._hover.containerDomNode.style.maxHeight = `${initialMaxHeight}px`;
			this._hover.containerDomNode.style.maxWidth = `${initialMaxWidth}px`;
			this._hover.containerDomNode.style.minHeight = '24px';

			this._hover.contentsDomNode.style.width = 'max-content';
			this._hover.contentsDomNode.style.height = 'auto';
			this._hover.containerDomNode.style.width = 'max-content';
			this._hover.containerDomNode.style.height = 'auto';

			// console.log('Before render');
			// console.log('this._element.domNode before layoutContentWidget : ', this._resizableElement.domNode);

			this._editor.layoutContentWidget(this);
			this._editor.render();

			// console.log('After render');
			// console.log('this._element.domNode after layoutContentWidget: ', this._resizableElement.domNode);

			height = this._hover.containerDomNode.offsetHeight;
			width = this._hover.containerDomNode.offsetWidth;
		}

		// console.log('height and width');
		// console.log('height : ', height);
		// console.log('width : ', width);

		// console.log('this._hover.containerDomNode from initial rendering : ', this._hover.containerDomNode);

		// The dimensions of the document in which we are displaying the hover
		const bodyBox = dom.getClientArea(document.body);

		// Hard-code the values for now!
		const maxWidth = bodyBox.width;
		if (width > maxWidth) {
			width = maxWidth;
		}

		// Hard-coded in the hover.css file as 1.5em or 24px
		const minHeight = 24;
		// The full height is already passed in as a parameter
		const fullHeight = height;
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		const mouseBox = this._editor.getScrolledVisiblePosition(this._visibleData?.showAtPosition);
		// Position where the editor box starts + the top of the mouse box relatve to the editor + mouse box height
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		// Total height of the box minus the position of the bottom of the mouse, this is the maximum height below the mouse position
		const availableSpaceBelow = bodyBox.height - mouseBottom;
		// Max height below is the minimum of the available space below and the full height of the widget
		const maxHeightBelow = Math.min(availableSpaceBelow, fullHeight);
		// The available space above the mouse position is the height of the top of the editor plus the top of the mouse box relative to the editor
		const availableSpaceAbove = mouseBox.top; // + 35 + 22; // Removing 35 because that is the height of the tabs // editorBox.top // adding 22 because height of breadcrumbs
		// Max height above is the minimum of the available space above and the full height of the widget
		const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
		// We find the maximum height of the widget possible on the top or on the bottom
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), fullHeight);

		if (height < minHeight) {
			height = minHeight;
		}
		if (height > maxHeight) {
			height = maxHeight;
		}

		if (this._renderingAboveOption) {
			const westSash = false;
			const eastSash = true;
			const northSash = height <= maxHeightAbove;
			const southSash = height > maxHeightAbove;
			this._renderingAbove = height <= maxHeightAbove;
			this._resizableElement.enableSashes(northSash, eastSash, southSash, westSash);
		} else {
			const westSash = false;
			const eastSash = true;
			const northSash = height > maxHeightBelow;
			const southSash = height <= maxHeightBelow;
			this._renderingAbove = height > maxHeightBelow;
			this._resizableElement.enableSashes(northSash, eastSash, southSash, westSash);
			this._resizableElement.minSize = new dom.Dimension(10, minHeight);
			this._maxRenderingHeight = this._findMaxRenderingHeight();
			if (!this._maxRenderingHeight) {
				return;
			}
			this._resizableElement.maxSize = new dom.Dimension(maxWidth, this._maxRenderingHeight);
		}

		// console.log('height : ', height);
		// console.log('width : ', width);

		this._resizableElement.layout(height, width);
		this._hover.containerDomNode.style.height = `${height - 2}px`;
		this._hover.containerDomNode.style.width = `${width - 2}px`;
		this._hover.containerDomNode.style.overflow = 'hidden';
		this._hover.contentsDomNode.style.height = `${height - 2}px`;
		this._hover.contentsDomNode.style.width = `${width - 2}px`;
		this._hover.contentsDomNode.style.overflow = 'hidden';

		// TODO: Replaces the scanDomNode() call below
		/*
		this._hover.scrollbar.setScrollDimensions({
			width: width - 2,
			height: height - 2,
			scrollWidth: this._hover.contentsDomNode.scrollWidth + 20,
			scrollHeight: this._hover.contentsDomNode.scrollHeight + 20
		});
		this._hover.scrollbar.setScrollPosition({
			scrollLeft: this._hover.contentsDomNode.scrollLeft,
			scrollTop: this._hover.contentsDomNode.scrollTop,
		});
		*/

		// console.log('this._hover.contentsDomNode.clientHeight : ', this._hover.contentsDomNode.clientHeight);
		// console.log('this._hover.contentsDomNode.scrollHeight : ', this._hover.contentsDomNode.scrollHeight);
		// console.log('this._hover.contentsDomNode.clientWidth : ', this._hover.contentsDomNode.clientWidth);
		// console.log('this._hover.contentsDomNode.scrollWidth : ', this._hover.contentsDomNode.scrollWidth);

		// TODO: place back
		this._hover.scrollbar.scanDomNode();
		// console.log('Before layoutContentWidget');
		this._editor.layoutContentWidget(this);
		this._editor.render();
		// console.log('this.getDomNode() : ', this.getDomNode());
	}

	private _findMaxRenderingHeight(): number | undefined {
		if (!this._editor || !this._editor.hasModel()) {
			return;
		}
		const preferRenderingAbove = this._editor.getOption(EditorOption.hover).above;
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());
		if (!this._visibleData?.showAtPosition) {
			return;
		}
		const mouseBox = this._editor.getScrolledVisiblePosition(this._visibleData?.showAtPosition);
		const bodyBox = dom.getClientArea(document.body);
		const availableSpaceAboveMinusTabsAndBreadcrumbs = mouseBox!.top - 4;
		const mouseBottom = editorBox.top + mouseBox!.top + mouseBox!.height;
		const availableSpaceBelow = bodyBox.height - mouseBottom;

		let maxRenderingHeight;
		if (preferRenderingAbove) {
			maxRenderingHeight = this._renderingAbove ? availableSpaceAboveMinusTabsAndBreadcrumbs : availableSpaceBelow;
		} else {
			maxRenderingHeight = this._renderingAbove ? availableSpaceBelow : availableSpaceAboveMinusTabsAndBreadcrumbs;
		}
		let actualMaxHeight = 0;
		for (const childHtmlElement of this._hover.contentsDomNode.children) {
			actualMaxHeight += childHtmlElement.clientHeight;
		}
		maxRenderingHeight = Math.min(maxRenderingHeight, actualMaxHeight + 2);
		return maxRenderingHeight;
	}

	// Initiall height and width are the maximmum dimensions to give to the hover
	private _resize(width: number, height: number): void {

		console.log(' * Entered into the _resize function of ContentHoverWidget');

		console.log('width : ', width);
		console.log('height : ', height);

		this._hover.containerDomNode.style.maxHeight = 'none';
		this._hover.containerDomNode.style.maxWidth = 'none';
		this._hover.contentsDomNode.style.maxHeight = 'none';
		this._hover.contentsDomNode.style.maxWidth = 'none';

		const maxWidth = this._resizableElement.maxSize.width;
		const maxHeight = this._resizableElement.maxSize.height;
		width = Math.min(maxWidth, width);
		height = Math.min(maxHeight, height);
		console.log('height : ', height);
		console.log('this._maxRenderingHeight : ', this._maxRenderingHeight);
		if (!this._maxRenderingHeight) {
			return;
		}
		// TODO: the following should be tweaked so that the sashes are still there for making it smaller but, it should not be possible to resize when the maxRenderingHeight is the minimal value of 18 cm
		// if (height >= this._maxRenderingHeight) {
		//	this._element.enableSashes(false, true, false, false);
		// }

		this._resizableElement.layout(height, width);
		this._hover.containerDomNode.style.height = `${height - 2}px`;
		this._hover.containerDomNode.style.width = `${width - 2}px`;
		// TODO: Find out why adding the following two lines changes the scroll dimensions to reflect reality
		// Potentially remove
		this._hover.contentsDomNode.style.height = `${height - 2}px`;
		this._hover.contentsDomNode.style.width = `${width - 2}px`;

		this._hover.scrollbar.scanDomNode();
		this._maxRenderingHeight = this._findMaxRenderingHeight();
		console.log('maxRenderingHeight : ', this._maxRenderingHeight);
		if (!this._maxRenderingHeight) {
			return;
		}
		this._resizableElement.maxSize = new dom.Dimension(maxWidth, this._maxRenderingHeight);
		this._editor.layoutContentWidget(this);

		console.log('this._hover.containerDomNode : ', this._hover.containerDomNode);
		console.log('this._hover.contentsDomNode.clientHeight : ', this._hover.contentsDomNode.clientHeight);
		console.log('this._hover.contentsDomNode.scrollHeight : ', this._hover.contentsDomNode.scrollHeight);
		console.log('this._hover.contentsDomNode.clientWidth : ', this._hover.contentsDomNode.clientWidth);
		console.log('this._hover.contentsDomNode.scrollWidth : ', this._hover.contentsDomNode.scrollWidth);
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
		// return this._resizableElement.domNode;
		// Forcing the visiblity:
		// this._hover.containerDomNode.style.display = 'block';
		// this._hover.containerDomNode.style.visibility = 'visible';
		return this._hover.containerDomNode;
	}

	public getContentsDomNode(): HTMLElement {
		return this._hover.contentsDomNode;
	}

	public getPosition(): IContentWidgetPosition | null {
		console.log('Inside of getPosition of ContentHoverWidget');
		if (!this._visibleData) {
			console.log('Early return');
			return null;
		}
		let preferAbove = this._visibleData.preferAbove;
		if (!preferAbove && this._contextKeyService.getContextKeyValue<boolean>(SuggestContext.Visible.key)) {
			// Prefer rendering above if the suggest widget is visible
			preferAbove = true;
		}

		// :before content can align left of the text content
		const affinity = this._visibleData.isBeforeContent ? PositionAffinity.LeftOfInjectedText : undefined;
		const rendering = this._renderingAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		console.log('position inside of ContentHoverWidget : ', {
			position: this._visibleData.showAtPosition,
			secondaryPosition: this._visibleData.showAtSecondaryPosition,
			// TODO: place back, preference: [rendering],
			preference: (
				preferAbove
					? [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
					: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
			),
			positionAffinity: affinity
		});
		return {
			position: this._visibleData.showAtPosition,
			secondaryPosition: this._visibleData.showAtSecondaryPosition,
			// TODO: place back, preference: [rendering],
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
		this._resizableElement.domNode.classList.toggle('hidden', !this._visibleData);
	}

	private _layout(): void {
		// TODO: place back
		// const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);
		// this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		// this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		const height = Math.max(this._editor.getLayoutInfo().height / 4, 250);
		const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);

		this._hover.contentsDomNode.style.fontSize = `${fontSize}px`;
		this._hover.contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
		this._hover.contentsDomNode.style.maxHeight = `${height}px`;
		this._hover.contentsDomNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	public showAt(node: DocumentFragment, visibleData: ContentHoverVisibleData): void {

		console.log(' * Entered into showAt of ContentHoverWidget');
		// console.log('visibleData : ', visibleData);
		// console.log('node : ', node);
		// console.log('node.baseURI ', node.baseURI);
		// console.log('this._element.domNode : ', this._resizableElement.domNode);

		this._hover.contentsDomNode.style.visibility = 'visibility';

		this._setVisibleData(visibleData);

		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._hover.contentsDomNode.style.paddingBottom = '';
		this._updateFont();

		this.onContentsChanged();

		// Simply force a synchronous render on the editor
		// such that the widget does not really render with left = '0px'
		// console.log('Before render');
		// console.log('this._element.domNode : ', this._resizableElement.domNode);
		this._editor.render();
		// console.log('After render');
		// console.log('this._element.domNode : ', this._resizableElement.domNode);

		// See https://github.com/microsoft/vscode/issues/140339
		// TODO: Doing a second layout of the hover after force rendering the editor
		this.onContentsChanged();
		// console.log('After onContentsChanged');
		// console.log('this._element.domNode : ', this._resizableElement.domNode);

		if (visibleData.stoleFocus) {
			this._hover.containerDomNode.focus();
		}
		visibleData.colorPicker?.layout();
		// TODO: Place back
		// this._setLayoutOfResizableElement();
		console.log('this._hover.containerDomNode : ', this._hover.containerDomNode);
	}

	public hide(): void {
		console.log('Inside of hide');
		this._resizableElement.clearSashHoverState();
		this._resizableElement.layout(0, 0);
		if (this._visibleData) {
			const stoleFocus = this._visibleData.stoleFocus;
			this._setVisibleData(null);
			this._editor.layoutContentWidget(this);
			if (stoleFocus) {
				this._editor.focus();
			}
		}
	}

	public onContentsChanged(): void {
		console.log('Inside of contents changed');
		let containerDomNode = this.getDomNode();
		let offsetWidth = containerDomNode.offsetWidth;
		let clientWidth = containerDomNode.clientWidth;
		let clientHeight = containerDomNode.clientHeight;
		let scrollWidth = containerDomNode.scrollWidth;
		let width = containerDomNode.style.width;
		console.log('offsetWidth : ', offsetWidth);
		console.log('clientWidth : ', clientWidth);
		console.log('scrollWidth : ', scrollWidth);
		console.log('width : ', width);

		let contentsDomNode = this.getContentsDomNode();
		let contentsOffsetWidth = contentsDomNode.offsetWidth;
		let contentsClientWidth = contentsDomNode.clientWidth;
		let contentsScrollWidth = contentsDomNode.scrollWidth;
		let contentsWidth = contentsDomNode.style.width;
		console.log('contentsOffsetWidth : ', contentsOffsetWidth);
		console.log('contentsClientWidth : ', contentsClientWidth);
		console.log('contentsScrollWidth : ', contentsScrollWidth);
		console.log('contentsWidth : ', contentsWidth);

		this._editor.layoutContentWidget(this);
		this._hover.onContentsChanged();

		const scrollDimensions = this._hover.scrollbar.getScrollDimensions();
		// console.log('Inside of onContentsChanged');
		// console.log('scrollDimensions : ', scrollDimensions);
		const hasHorizontalScrollbar = (scrollDimensions.scrollWidth > scrollDimensions.width);
		if (hasHorizontalScrollbar) {
			// console.log('Entered into hasHorizontalScrollbar');
			// There is just a horizontal scrollbar
			const extraBottomPadding = `${this._hover.scrollbar.options.horizontalScrollbarSize}px`;
			if (this._hover.contentsDomNode.style.paddingBottom !== extraBottomPadding) {
				this._hover.contentsDomNode.style.paddingBottom = extraBottomPadding;
				this._editor.layoutContentWidget(this);
				this._hover.onContentsChanged();
			}
		}

		containerDomNode = this.getDomNode();
		offsetWidth = containerDomNode.offsetWidth;
		clientWidth = containerDomNode.clientWidth;
		clientHeight = containerDomNode.clientHeight;
		scrollWidth = containerDomNode.scrollWidth;
		width = containerDomNode.style.width;
		console.log('offsetWidth : ', offsetWidth);
		console.log('clientWidth : ', clientWidth);
		console.log('scrollWidth : ', scrollWidth);
		console.log('width : ', width);

		contentsDomNode = this.getContentsDomNode();
		contentsOffsetWidth = contentsDomNode.offsetWidth;
		contentsClientWidth = contentsDomNode.clientWidth;
		contentsScrollWidth = contentsDomNode.scrollWidth;
		contentsWidth = contentsDomNode.style.width;
		console.log('contentsOffsetWidth : ', contentsOffsetWidth);
		console.log('contentsClientWidth : ', contentsClientWidth);
		console.log('contentsScrollWidth : ', contentsScrollWidth);
		console.log('contentsWidth : ', contentsWidth);


		console.log('this._resizableWidget : ', this._resizableWidget);
		if (!this._resizableWidget) {
			console.log('early returns');
			return;
		}
		console.log('setting the layout of the resizable element');
		this._resizableWidget.resizableElement().layout(clientHeight, clientWidth);
		this._editor.layoutOverlayWidget(this._resizableWidget);
		this._editor.render();
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
