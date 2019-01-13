/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getOrDefault } from 'vs/base/common/objects';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Gesture, EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import * as DOM from 'vs/base/browser/dom';
import { Event, Emitter } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollEvent, ScrollbarVisibility, INewScrollDimensions } from 'vs/base/common/scrollable';
import { RangeMap, shift } from './rangeMap';
import { IListVirtualDelegate, IListRenderer, IListMouseEvent, IListTouchEvent, IListGestureEvent, IListDragEvent, IListDragAndDrop, ListDragOverEffect } from './list';
import { RowCache, IRow } from './rowCache';
import { isWindows } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { ISpliceable } from 'vs/base/common/sequence';
import { memoize } from 'vs/base/common/decorators';
import { Range, IRange } from 'vs/base/common/range';
import { equals, distinct } from 'vs/base/common/arrays';
import { DataTransfers, StaticDND, IDragAndDropData } from 'vs/base/browser/dnd';

function canUseTranslate3d(): boolean {
	if (browser.isFirefox) {
		return false;
	}

	if (browser.getZoomLevel() !== 0) {
		return false;
	}

	return true;
}

interface IItem<T> {
	readonly id: string;
	readonly element: T;
	readonly templateId: string;
	row: IRow | null;
	size: number;
	hasDynamicHeight: boolean;
	renderWidth: number | undefined;
	uri: string | undefined;
	dropTarget: boolean;
	dragStartDisposable: IDisposable;
}

export interface IListViewDragAndDrop<T> extends IListDragAndDrop<T> {
	getDragElements(element: T): T[];
}

export interface IListViewOptions<T> {
	readonly dnd?: IListViewDragAndDrop<T>;
	readonly useShadows?: boolean;
	readonly verticalScrollMode?: ScrollbarVisibility;
	readonly setRowLineHeight?: boolean;
	readonly supportDynamicHeights?: boolean;
	readonly mouseSupport?: boolean;
}

const DefaultOptions = {
	useShadows: true,
	verticalScrollMode: ScrollbarVisibility.Auto,
	setRowLineHeight: true,
	supportDynamicHeights: false,
	dnd: {
		getDragElements(e) { return [e]; },
		getDragURI() { return null; },
		onDragStart(): void { },
		onDragOver() { return false; },
		drop() { }
	}
};

export class ElementsDragAndDropData<T> implements IDragAndDropData {

	readonly elements: T[];

	constructor(elements: T[]) {
		this.elements = elements;
	}

	update(): void { }

	getData(): any {
		return this.elements;
	}
}

export class ExternalElementsDragAndDropData<T> implements IDragAndDropData {

	readonly elements: T[];

	constructor(elements: T[]) {
		this.elements = elements;
	}

	update(): void { }

	getData(): any {
		return this.elements;
	}
}

export class DesktopDragAndDropData implements IDragAndDropData {

	readonly types: any[];
	readonly files: any[];

	constructor() {
		this.types = [];
		this.files = [];
	}

	update(dataTransfer: DataTransfer): void {
		if (dataTransfer.types) {
			this.types.splice(0, this.types.length, ...dataTransfer.types);
		}

		if (dataTransfer.files) {
			this.files.splice(0, this.files.length);

			for (let i = 0; i < dataTransfer.files.length; i++) {
				const file = dataTransfer.files.item(i);

				if (file && (file.size || file.type)) {
					this.files.push(file);
				}
			}
		}
	}

	getData(): any {
		return {
			types: this.types,
			files: this.files
		};
	}
}

function equalsDragFeedback(f1: number[] | undefined, f2: number[] | undefined): boolean {
	if (Array.isArray(f1) && Array.isArray(f2)) {
		return equals(f1, f2!);
	}

	return f1 === f2;
}

export class ListView<T> implements ISpliceable<T>, IDisposable {

	readonly domNode: HTMLElement;

	private items: IItem<T>[];
	private itemId: number;
	private rangeMap: RangeMap;
	private cache: RowCache<T>;
	private renderers = new Map<string, IListRenderer<any /* TODO@joao */, any>>();
	private lastRenderTop: number;
	private lastRenderHeight: number;
	private renderWidth = 0;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private scrollableElement: ScrollableElement;
	private _scrollHeight: number;
	private scrollableElementUpdateDisposable: IDisposable | null = null;
	private splicing = false;
	private dragOverAnimationDisposable: IDisposable | undefined;
	private dragOverAnimationStopDisposable: IDisposable = Disposable.None;
	private dragOverMouseY: number;
	private setRowLineHeight: boolean;
	private supportDynamicHeights: boolean;

	private dnd: IListViewDragAndDrop<T>;
	private currentDragData: IDragAndDropData | undefined;
	private currentDragFeedback: number[] | undefined;
	private currentDragFeedbackDisposable: IDisposable = Disposable.None;
	private onDragLeaveTimeout: IDisposable = Disposable.None;

	private disposables: IDisposable[];

	private _onDidChangeContentHeight = new Emitter<number>();
	readonly onDidChangeContentHeight: Event<number> = Event.latch(this._onDidChangeContentHeight.event);
	get contentHeight(): number { return this.rangeMap.size; }

	// private _onDragStart = new Emitter<{ element: T, uri: string, event: DragEvent }>();
	// readonly onDragStart = this._onDragStart.event;

	// readonly onDragOver: Event<IListDragEvent<T>>;
	// readonly onDragLeave: Event<void>;
	// readonly onDrop: Event<IListDragEvent<T>>;
	// readonly onDragEnd: Event<void>;

	constructor(
		container: HTMLElement,
		private virtualDelegate: IListVirtualDelegate<T>,
		renderers: IListRenderer<any /* TODO@joao */, any>[],
		options: IListViewOptions<T> = DefaultOptions
	) {
		this.items = [];
		this.itemId = 0;
		this.rangeMap = new RangeMap();

		for (const renderer of renderers) {
			this.renderers.set(renderer.templateId, renderer);
		}

		this.cache = new RowCache(this.renderers);

		this.lastRenderTop = 0;
		this.lastRenderHeight = 0;

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-list';
		DOM.toggleClass(this.domNode, 'mouse-support', typeof options.mouseSupport === 'boolean' ? options.mouseSupport : true);

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';
		Gesture.addTarget(this.rowsContainer);

		this.scrollableElement = new ScrollableElement(this.rowsContainer, {
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: getOrDefault(options, o => o.verticalScrollMode, DefaultOptions.verticalScrollMode),
			useShadows: getOrDefault(options, o => o.useShadows, DefaultOptions.useShadows)
		});

		this.domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this.domNode);

		this.disposables = [this.rangeMap, this.gesture, this.scrollableElement, this.cache];

		this.scrollableElement.onScroll(this.onScroll, this, this.disposables);
		domEvent(this.rowsContainer, TouchEventType.Change)(this.onTouchChange, this, this.disposables);

		// Prevent the monaco-scrollable-element from scrolling
		// https://github.com/Microsoft/vscode/issues/44181
		domEvent(this.scrollableElement.getDomNode(), 'scroll')
			(e => (e.target as HTMLElement).scrollTop = 0, null, this.disposables);

		Event.map(domEvent(this.domNode, 'dragover'), e => this.toDragEvent(e))(this.onDragOver, this, this.disposables);
		Event.map(domEvent(this.domNode, 'drop'), e => this.toDragEvent(e))(this.onDrop, this, this.disposables);
		domEvent(this.domNode, 'dragleave')(this.onDragLeave, this, this.disposables);
		domEvent(window, 'dragend')(this.onDragEnd, this, this.disposables);

		this.setRowLineHeight = getOrDefault(options, o => o.setRowLineHeight, DefaultOptions.setRowLineHeight);
		this.supportDynamicHeights = getOrDefault(options, o => o.supportDynamicHeights, DefaultOptions.supportDynamicHeights);
		this.dnd = getOrDefault<IListViewOptions<T>, IListViewDragAndDrop<T>>(options, o => o.dnd, DefaultOptions.dnd);

		this.layout();
	}

	splice(start: number, deleteCount: number, elements: T[] = []): T[] {
		if (this.splicing) {
			throw new Error('Can\'t run recursive splices.');
		}

		this.splicing = true;

		try {
			return this._splice(start, deleteCount, elements);
		} finally {
			this.splicing = false;
			this._onDidChangeContentHeight.fire(this.contentHeight);
		}
	}

	private _splice(start: number, deleteCount: number, elements: T[] = []): T[] {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const deleteRange = { start, end: start + deleteCount };
		const removeRange = Range.intersect(previousRenderRange, deleteRange);

		for (let i = removeRange.start; i < removeRange.end; i++) {
			this.removeItemFromDOM(i);
		}

		const previousRestRange: IRange = { start: start + deleteCount, end: this.items.length };
		const previousRenderedRestRange = Range.intersect(previousRestRange, previousRenderRange);
		const previousUnrenderedRestRanges = Range.relativeComplement(previousRestRange, previousRenderRange);

		const inserted = elements.map<IItem<T>>(element => ({
			id: String(this.itemId++),
			element,
			templateId: this.virtualDelegate.getTemplateId(element),
			size: this.virtualDelegate.getHeight(element),
			hasDynamicHeight: !!this.virtualDelegate.hasDynamicHeight && this.virtualDelegate.hasDynamicHeight(element),
			renderWidth: undefined,
			row: null,
			uri: undefined,
			dropTarget: false,
			dragStartDisposable: Disposable.None
		}));

		let deleted: IItem<T>[];

		// TODO@joao: improve this optimization to catch even more cases
		if (start === 0 && deleteCount >= this.items.length) {
			this.rangeMap = new RangeMap();
			this.rangeMap.splice(0, 0, inserted);
			this.items = inserted;
			deleted = [];
		} else {
			this.rangeMap.splice(start, deleteCount, inserted);
			deleted = this.items.splice(start, deleteCount, ...inserted);
		}

		const delta = elements.length - deleteCount;
		const renderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const renderedRestRange = shift(previousRenderedRestRange, delta);
		const updateRange = Range.intersect(renderRange, renderedRestRange);

		for (let i = updateRange.start; i < updateRange.end; i++) {
			this.updateItemInDOM(this.items[i], i);
		}

		const removeRanges = Range.relativeComplement(renderedRestRange, renderRange);

		for (const range of removeRanges) {
			for (let i = range.start; i < range.end; i++) {
				this.removeItemFromDOM(i);
			}
		}

		const unrenderedRestRanges = previousUnrenderedRestRanges.map(r => shift(r, delta));
		const elementsRange = { start, end: start + elements.length };
		const insertRanges = [elementsRange, ...unrenderedRestRanges].map(r => Range.intersect(renderRange, r));
		const beforeElement = this.getNextToLastElement(insertRanges);

		for (const range of insertRanges) {
			for (let i = range.start; i < range.end; i++) {
				this.insertItemInDOM(i, beforeElement);
			}
		}

		this.updateScrollHeight();

		if (this.supportDynamicHeights) {
			this.rerender(this.scrollTop, this.renderHeight);
		}

		return deleted.map(i => i.element);
	}

	private updateScrollHeight(): void {
		this._scrollHeight = this.contentHeight;
		this.rowsContainer.style.height = `${this._scrollHeight}px`;

		if (!this.scrollableElementUpdateDisposable) {
			this.scrollableElementUpdateDisposable = DOM.scheduleAtNextAnimationFrame(() => {
				this.scrollableElement.setScrollDimensions({ scrollHeight: this._scrollHeight });
				this.scrollableElementUpdateDisposable = null;
			});
		}
	}

	get length(): number {
		return this.items.length;
	}

	get renderHeight(): number {
		const scrollDimensions = this.scrollableElement.getScrollDimensions();
		return scrollDimensions.height;
	}

	element(index: number): T {
		return this.items[index].element;
	}

	domElement(index: number): HTMLElement | null {
		const row = this.items[index].row;
		return row && row.domNode;
	}

	elementHeight(index: number): number {
		return this.items[index].size;
	}

	elementTop(index: number): number {
		return this.rangeMap.positionAt(index);
	}

	indexAt(position: number): number {
		return this.rangeMap.indexAt(position);
	}

	indexAfter(position: number): number {
		return this.rangeMap.indexAfter(position);
	}

	layout(height?: number): void {
		let scrollDimensions: INewScrollDimensions = {
			height: height || DOM.getContentHeight(this.domNode)
		};

		if (this.scrollableElementUpdateDisposable) {
			this.scrollableElementUpdateDisposable.dispose();
			this.scrollableElementUpdateDisposable = null;
			scrollDimensions.scrollHeight = this._scrollHeight;
		}

		this.scrollableElement.setScrollDimensions(scrollDimensions);
	}

	layoutWidth(width: number): void {
		this.renderWidth = width;

		if (this.supportDynamicHeights) {
			this.rerender(this.scrollTop, this.renderHeight);
		}
	}

	// Render

	private render(renderTop: number, renderHeight: number): void {
		const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
		const renderRange = this.getRenderRange(renderTop, renderHeight);

		const rangesToInsert = Range.relativeComplement(renderRange, previousRenderRange);
		const rangesToRemove = Range.relativeComplement(previousRenderRange, renderRange);
		const beforeElement = this.getNextToLastElement(rangesToInsert);

		for (const range of rangesToInsert) {
			for (let i = range.start; i < range.end; i++) {
				this.insertItemInDOM(i, beforeElement);
			}
		}

		for (const range of rangesToRemove) {
			for (let i = range.start; i < range.end; i++) {
				this.removeItemFromDOM(i);
			}
		}

		if (canUseTranslate3d() && !isWindows /* Windows: translate3d breaks subpixel-antialias (ClearType) unless a background is defined */) {
			const transform = `translate3d(0px, -${renderTop}px, 0px)`;
			this.rowsContainer.style.transform = transform;
			this.rowsContainer.style.webkitTransform = transform;
		} else {
			this.rowsContainer.style.top = `-${renderTop}px`;
		}

		this.lastRenderTop = renderTop;
		this.lastRenderHeight = renderHeight;
	}

	// DOM operations

	private insertItemInDOM(index: number, beforeElement: HTMLElement | null): void {
		const item = this.items[index];

		if (!item.row) {
			item.row = this.cache.alloc(item.templateId);
		}

		if (!item.row.domNode!.parentElement) {
			if (beforeElement) {
				this.rowsContainer.insertBefore(item.row.domNode!, beforeElement);
			} else {
				this.rowsContainer.appendChild(item.row.domNode!);
			}
		}

		this.updateItemInDOM(item, index);

		const renderer = this.renderers.get(item.templateId);
		if (renderer) {
			renderer.renderElement(item.element, index, item.row.templateData);
		}

		const uri = this.dnd.getDragURI(item.element);
		item.dragStartDisposable.dispose();

		if (uri) {
			item.row.domNode!.draggable = true;
			const onDragStart = domEvent(item.row.domNode!, 'dragstart');
			item.dragStartDisposable = onDragStart(event => this.onDragStart(item.element, uri, event));
		}
	}

	private updateItemInDOM(item: IItem<T>, index: number): void {
		item.row!.domNode!.style.top = `${this.elementTop(index)}px`;
		item.row!.domNode!.style.height = `${item.size}px`;

		if (this.setRowLineHeight) {
			item.row!.domNode!.style.lineHeight = `${item.size}px`;
		}

		item.row!.domNode!.setAttribute('data-index', `${index}`);
		item.row!.domNode!.setAttribute('data-last-element', index === this.length - 1 ? 'true' : 'false');
		item.row!.domNode!.setAttribute('aria-setsize', `${this.length}`);
		item.row!.domNode!.setAttribute('aria-posinset', `${index + 1}`);
		DOM.toggleClass(item.row!.domNode!, 'drop-target', item.dropTarget);
	}

	private removeItemFromDOM(index: number): void {
		const item = this.items[index];
		item.dragStartDisposable.dispose();

		const renderer = this.renderers.get(item.templateId);
		if (renderer && renderer.disposeElement) {
			renderer.disposeElement(item.element, index, item.row!.templateData);
		}

		this.cache.release(item.row!);
		item.row = null;
	}

	getScrollTop(): number {
		const scrollPosition = this.scrollableElement.getScrollPosition();
		return scrollPosition.scrollTop;
	}

	setScrollTop(scrollTop: number): void {
		if (this.scrollableElementUpdateDisposable) {
			this.scrollableElementUpdateDisposable.dispose();
			this.scrollableElementUpdateDisposable = null;
			this.scrollableElement.setScrollDimensions({ scrollHeight: this._scrollHeight });
		}

		this.scrollableElement.setScrollPosition({ scrollTop });
	}

	get scrollTop(): number {
		return this.getScrollTop();
	}

	set scrollTop(scrollTop: number) {
		this.setScrollTop(scrollTop);
	}

	get scrollHeight(): number {
		return this._scrollHeight;
	}

	// Events

	@memoize get onMouseClick(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'click'), e => this.toMouseEvent(e)); }
	@memoize get onMouseDblClick(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'dblclick'), e => this.toMouseEvent(e)); }
	@memoize get onMouseMiddleClick(): Event<IListMouseEvent<T>> { return Event.filter(Event.map(domEvent(this.domNode, 'auxclick'), e => this.toMouseEvent(e as MouseEvent)), e => e.browserEvent.button === 1); }
	@memoize get onMouseUp(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'mouseup'), e => this.toMouseEvent(e)); }
	@memoize get onMouseDown(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'mousedown'), e => this.toMouseEvent(e)); }
	@memoize get onMouseOver(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'mouseover'), e => this.toMouseEvent(e)); }
	@memoize get onMouseMove(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'mousemove'), e => this.toMouseEvent(e)); }
	@memoize get onMouseOut(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'mouseout'), e => this.toMouseEvent(e)); }
	@memoize get onContextMenu(): Event<IListMouseEvent<T>> { return Event.map(domEvent(this.domNode, 'contextmenu'), e => this.toMouseEvent(e)); }
	@memoize get onTouchStart(): Event<IListTouchEvent<T>> { return Event.map(domEvent(this.domNode, 'touchstart'), e => this.toTouchEvent(e)); }
	@memoize get onTap(): Event<IListGestureEvent<T>> { return Event.map(domEvent(this.rowsContainer, TouchEventType.Tap), e => this.toGestureEvent(e)); }

	private toMouseEvent(browserEvent: MouseEvent): IListMouseEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const element = item && item.element;
		return { browserEvent, index, element };
	}

	private toTouchEvent(browserEvent: TouchEvent): IListTouchEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const element = item && item.element;
		return { browserEvent, index, element };
	}

	private toGestureEvent(browserEvent: GestureEvent): IListGestureEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.initialTarget || null);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const element = item && item.element;
		return { browserEvent, index, element };
	}

	private toDragEvent(browserEvent: DragEvent): IListDragEvent<T> {
		const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
		const item = typeof index === 'undefined' ? undefined : this.items[index];
		const element = item && item.element;
		return { browserEvent, index, element };
	}

	private onScroll(e: ScrollEvent): void {
		try {
			this.render(e.scrollTop, e.height);

			if (this.supportDynamicHeights) {
				this.rerender(e.scrollTop, e.height);
			}
		} catch (err) {
			console.error('Got bad scroll event:', e);
			throw err;
		}
	}

	private onTouchChange(event: GestureEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.scrollTop -= event.translationY;
	}

	// DND

	private onDragStart(element: T, uri: string, event: DragEvent): void {
		if (!event.dataTransfer) {
			return;
		}

		const elements = this.dnd.getDragElements(element);

		event.dataTransfer.effectAllowed = 'copyMove';
		event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([uri]));

		if (event.dataTransfer.setDragImage) {
			let label: string | undefined;

			if (this.dnd.getDragLabel) {
				label = this.dnd.getDragLabel(elements);
			}

			if (typeof label === 'undefined') {
				label = String(elements.length);
			}

			const dragImage = DOM.$('.monaco-list-drag-image');
			dragImage.textContent = label;
			document.body.appendChild(dragImage);
			event.dataTransfer.setDragImage(dragImage, -10, -10);
			setTimeout(() => document.body.removeChild(dragImage), 0);
		}

		this.currentDragData = new ElementsDragAndDropData(elements);
		StaticDND.CurrentDragAndDropData = new ExternalElementsDragAndDropData(elements);

		if (this.dnd.onDragStart) {
			this.dnd.onDragStart(this.currentDragData, event);
		}
	}

	private onDragOver(event: IListDragEvent<T>): boolean {
		this.onDragLeaveTimeout.dispose();
		this.setupDragAndDropScrollTopAnimation(event.browserEvent);

		if (!event.browserEvent.dataTransfer) {
			return false;
		}

		// Drag over from outside
		if (!this.currentDragData) {
			if (StaticDND.CurrentDragAndDropData) {
				// Drag over from another list
				this.currentDragData = StaticDND.CurrentDragAndDropData;

			} else {
				// Drag over from the desktop
				if (!event.browserEvent.dataTransfer.types) {
					return false;
				}

				this.currentDragData = new DesktopDragAndDropData();
			}
		}

		const result = this.dnd.onDragOver(this.currentDragData, event.element, event.index, event.browserEvent);
		const canDrop = typeof result === 'boolean' ? result : result.accept;

		if (!canDrop) {
			return false;
		}

		event.browserEvent.dataTransfer.dropEffect = (typeof result !== 'boolean' && result.effect === ListDragOverEffect.Copy) ? 'copy' : 'move';

		let feedback: number[];

		if (typeof result !== 'boolean' && result.feedback) {
			feedback = result.feedback;
		} else {
			if (typeof event.index === 'undefined') {
				feedback = [-1];
			} else {
				feedback = [event.index];
			}
		}

		// sanitize feedback list
		feedback = distinct(feedback).filter(i => i >= -1 && i < this.length).sort();
		feedback = feedback[0] === -1 ? [-1] : feedback;

		if (feedback.length === 0) {
			throw new Error('Invalid empty feedback list');
		}

		if (equalsDragFeedback(this.currentDragFeedback, feedback)) {
			return true;
		}

		this.currentDragFeedback = feedback;
		this.currentDragFeedbackDisposable.dispose();

		if (feedback[0] === -1) { // entire list feedback
			DOM.addClass(this.domNode, 'drop-target');
			this.currentDragFeedbackDisposable = toDisposable(() => DOM.removeClass(this.domNode, 'drop-target'));
		} else {
			for (const index of feedback) {
				const item = this.items[index]!;
				item.dropTarget = true;

				if (item.row && item.row.domNode) {
					DOM.addClass(item.row.domNode, 'drop-target');
				}
			}

			this.currentDragFeedbackDisposable = toDisposable(() => {
				for (const index of feedback) {
					const item = this.items[index]!;
					item.dropTarget = false;

					if (item.row && item.row.domNode) {
						DOM.removeClass(item.row.domNode, 'drop-target');
					}
				}
			});
		}

		return true;
	}

	private onDragLeave(): void {
		this.onDragLeaveTimeout.dispose();
		this.onDragLeaveTimeout = DOM.timeout(() => this.clearDragOverFeedback(), 100);
	}

	private onDrop(event: IListDragEvent<T>): void {
		const dragData = this.currentDragData;
		this.teardownDragAndDropScrollTopAnimation();
		this.clearDragOverFeedback();
		this.currentDragData = undefined;
		StaticDND.CurrentDragAndDropData = undefined;

		if (!dragData || !event.browserEvent.dataTransfer) {
			return;
		}

		event.browserEvent.preventDefault();
		dragData.update(event.browserEvent.dataTransfer);
		this.dnd.drop(dragData, event.element, event.index, event.browserEvent);
	}

	private onDragEnd(): void {
		this.teardownDragAndDropScrollTopAnimation();
		this.clearDragOverFeedback();
		this.currentDragData = undefined;
		StaticDND.CurrentDragAndDropData = undefined;
	}

	private clearDragOverFeedback(): void {
		this.currentDragFeedback = undefined;
		this.currentDragFeedbackDisposable.dispose();
		this.currentDragFeedbackDisposable = Disposable.None;
	}

	// DND scroll top animation

	private setupDragAndDropScrollTopAnimation(event: DragEvent): void {
		if (!this.dragOverAnimationDisposable) {
			const viewTop = DOM.getTopLeftOffset(this.domNode).top;
			this.dragOverAnimationDisposable = DOM.animate(this.animateDragAndDropScrollTop.bind(this, viewTop));
		}

		this.dragOverAnimationStopDisposable.dispose();
		this.dragOverAnimationStopDisposable = DOM.timeout(() => {
			if (this.dragOverAnimationDisposable) {
				this.dragOverAnimationDisposable.dispose();
				this.dragOverAnimationDisposable = undefined;
			}
		}, 1000);

		this.dragOverMouseY = event.pageY;
	}

	private animateDragAndDropScrollTop(viewTop: number): void {
		if (this.dragOverMouseY === undefined) {
			return;
		}

		const diff = this.dragOverMouseY - viewTop;
		const upperLimit = this.renderHeight - 35;

		if (diff < 35) {
			this.scrollTop += Math.max(-14, Math.floor(0.3 * (diff - 35)));
		} else if (diff > upperLimit) {
			this.scrollTop += Math.min(14, Math.floor(0.3 * (diff - upperLimit)));
		}
	}

	private teardownDragAndDropScrollTopAnimation(): void {
		this.dragOverAnimationStopDisposable.dispose();

		if (this.dragOverAnimationDisposable) {
			this.dragOverAnimationDisposable.dispose();
			this.dragOverAnimationDisposable = undefined;
		}
	}

	// Util

	private getItemIndexFromEventTarget(target: EventTarget | null): number | undefined {
		let element: HTMLElement | null = target as (HTMLElement | null);

		while (element instanceof HTMLElement && element !== this.rowsContainer) {
			const rawIndex = element.getAttribute('data-index');

			if (rawIndex) {
				const index = Number(rawIndex);

				if (!isNaN(index)) {
					return index;
				}
			}

			element = element.parentElement;
		}

		return undefined;
	}

	private getRenderRange(renderTop: number, renderHeight: number): IRange {
		return {
			start: this.rangeMap.indexAt(renderTop),
			end: this.rangeMap.indexAfter(renderTop + renderHeight - 1)
		};
	}

	/**
	 * Given a stable rendered state, checks every rendered element whether it needs
	 * to be probed for dynamic height. Adjusts scroll height and top if necessary.
	 */
	private rerender(renderTop: number, renderHeight: number): void {
		const previousRenderRange = this.getRenderRange(renderTop, renderHeight);

		// Let's remember the second element's position, this helps in scrolling up
		// and preserving a linear upwards scroll movement
		let secondElementIndex: number | undefined;
		let secondElementTopDelta: number | undefined;

		if (previousRenderRange.end - previousRenderRange.start > 1) {
			secondElementIndex = previousRenderRange.start + 1;
			secondElementTopDelta = this.elementTop(secondElementIndex) - renderTop;
		}

		let heightDiff = 0;

		while (true) {
			const renderRange = this.getRenderRange(renderTop, renderHeight);

			let didChange = false;

			for (let i = renderRange.start; i < renderRange.end; i++) {
				const diff = this.probeDynamicHeight(i);

				if (diff !== 0) {
					this.rangeMap.splice(i, 1, [this.items[i]]);
				}

				heightDiff += diff;
				didChange = didChange || diff !== 0;
			}

			if (!didChange) {
				if (heightDiff !== 0) {
					this.updateScrollHeight();
				}

				const unrenderRanges = Range.relativeComplement(previousRenderRange, renderRange);

				for (const range of unrenderRanges) {
					for (let i = range.start; i < range.end; i++) {
						if (this.items[i].row) {
							this.removeItemFromDOM(i);
						}
					}
				}

				const renderRanges = Range.relativeComplement(renderRange, previousRenderRange);

				for (const range of renderRanges) {
					for (let i = range.start; i < range.end; i++) {
						const beforeRow = i < this.items.length ? this.items[i + 1].row : null;
						const beforeElement = beforeRow ? beforeRow.domNode : null;
						this.insertItemInDOM(i, beforeElement);
					}
				}

				for (let i = renderRange.start; i < renderRange.end; i++) {
					if (this.items[i].row) {
						this.updateItemInDOM(this.items[i], i);
					}
				}

				if (typeof secondElementIndex === 'number') {
					this.scrollTop = this.elementTop(secondElementIndex) - secondElementTopDelta!;
				}

				this._onDidChangeContentHeight.fire(this.contentHeight);
				return;
			}
		}
	}

	private probeDynamicHeight(index: number): number {
		const item = this.items[index];

		if (!item.hasDynamicHeight || item.renderWidth === this.renderWidth) {
			return 0;
		}

		const size = item.size;
		const renderer = this.renderers.get(item.templateId);
		const row = this.cache.alloc(item.templateId);

		row.domNode!.style.height = '';
		this.rowsContainer.appendChild(row.domNode!);
		if (renderer) {
			renderer.renderElement(item.element, index, row.templateData);
		}
		item.size = row.domNode!.offsetHeight;
		item.renderWidth = this.renderWidth;
		this.rowsContainer.removeChild(row.domNode!);
		this.cache.release(row);

		return item.size - size;
	}

	private getNextToLastElement(ranges: IRange[]): HTMLElement | null {
		const lastRange = ranges[ranges.length - 1];

		if (!lastRange) {
			return null;
		}

		const nextToLastItem = this.items[lastRange.end];

		if (!nextToLastItem) {
			return null;
		}

		if (!nextToLastItem.row) {
			return null;
		}

		return nextToLastItem.row.domNode;
	}

	// Dispose

	dispose() {
		if (this.items) {
			for (const item of this.items) {
				if (item.row) {
					const renderer = this.renderers.get(item.row.templateId);
					if (renderer) {
						renderer.disposeTemplate(item.row.templateData);
					}
				}
			}

			this.items = [];
		}

		if (this.domNode && this.domNode.parentNode) {
			this.domNode.parentNode.removeChild(this.domNode);
		}

		this.disposables = dispose(this.disposables);
	}
}
