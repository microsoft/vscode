/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Platform from 'vs/base/common/platform';
import * as Browser from 'vs/base/browser/browser';
import * as Lifecycle from 'vs/base/common/lifecycle';
import * as DOM from 'vs/base/browser/dom';
import * as Diff from 'vs/base/common/diff/diff';
import * as Touch from 'vs/base/browser/touch';
import * as strings from 'vs/base/common/strings';
import * as Mouse from 'vs/base/browser/mouseEvent';
import * as Keyboard from 'vs/base/browser/keyboardEvent';
import * as Model from 'vs/base/parts/tree/browser/treeModel';
import * as dnd from './treeDnd';
import { ArrayIterator, MappedIterator } from 'vs/base/common/iterator';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { HeightMap, IViewItem } from 'vs/base/parts/tree/browser/treeViewModel';
import * as _ from 'vs/base/parts/tree/browser/tree';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Event, Emitter } from 'vs/base/common/event';
import { DataTransfers, StaticDND, IDragAndDropData } from 'vs/base/browser/dnd';
import { DefaultTreestyler } from './treeDefaults';
import { Delayer, timeout } from 'vs/base/common/async';

export interface IRow {
	element: HTMLElement | null;
	templateId: string;
	templateData: any;
}

function removeFromParent(element: HTMLElement): void {
	try {
		element.parentElement!.removeChild(element);
	} catch (e) {
		// this will throw if this happens due to a blur event, nasty business
	}
}

export class RowCache implements Lifecycle.IDisposable {

	private _cache: { [templateId: string]: IRow[]; } | null;

	constructor(private context: _.ITreeContext) {
		this._cache = { '': [] };
	}

	public alloc(templateId: string): IRow {
		let result = this.cache(templateId).pop();

		if (!result) {
			let content = document.createElement('div');
			content.className = 'content';

			let row = document.createElement('div');
			row.appendChild(content);

			let templateData: any = null;

			try {
				templateData = this.context.renderer!.renderTemplate(this.context.tree, templateId, content);
			} catch (err) {
				console.error('Tree usage error: exception while rendering template');
				console.error(err);
			}

			result = {
				element: row,
				templateId: templateId,
				templateData
			};
		}

		return result;
	}

	public release(templateId: string, row: IRow): void {
		removeFromParent(row.element!);
		this.cache(templateId).push(row);
	}

	private cache(templateId: string): IRow[] {
		return this._cache![templateId] || (this._cache![templateId] = []);
	}

	public garbageCollect(): void {
		if (this._cache) {
			Object.keys(this._cache).forEach(templateId => {
				this._cache![templateId].forEach(cachedRow => {
					this.context.renderer!.disposeTemplate(this.context.tree, templateId, cachedRow.templateData);
					cachedRow.element = null;
					cachedRow.templateData = null;
				});

				delete this._cache![templateId];
			});
		}
	}

	public dispose(): void {
		this.garbageCollect();
		this._cache = null;
	}
}

export interface IViewContext extends _.ITreeContext {
	cache: RowCache;
	horizontalScrolling: boolean;
}

export class ViewItem implements IViewItem {

	private context: IViewContext;

	public model: Model.Item;
	public id: string;
	protected row: IRow | null;

	public top: number;
	public height: number;
	public width: number = 0;
	public onDragStart!: (e: DragEvent) => void;

	public needsRender: boolean = false;
	public uri: string | null = null;
	public unbindDragStart: Lifecycle.IDisposable = Lifecycle.Disposable.None;
	public loadingTimer: any;

	public _styles: any;
	private _draggable: boolean = false;

	constructor(context: IViewContext, model: Model.Item) {
		this.context = context;
		this.model = model;

		this.id = this.model.id;
		this.row = null;

		this.top = 0;
		this.height = model.getHeight();

		this._styles = {};
		model.getAllTraits().forEach(t => this._styles[t] = true);

		if (model.isExpanded()) {
			this.addClass('expanded');
		}
	}

	set expanded(value: boolean) {
		value ? this.addClass('expanded') : this.removeClass('expanded');
	}

	set loading(value: boolean) {
		value ? this.addClass('loading') : this.removeClass('loading');
	}

	set draggable(value: boolean) {
		this._draggable = value;
		this.render(true);
	}

	get draggable() {
		return this._draggable;
	}

	set dropTarget(value: boolean) {
		value ? this.addClass('drop-target') : this.removeClass('drop-target');
	}

	public get element(): HTMLElement {
		return (this.row && this.row.element)!;
	}

	private _templateId: string | undefined;
	private get templateId(): string {
		return this._templateId || (this._templateId = (this.context.renderer!.getTemplateId && this.context.renderer!.getTemplateId(this.context.tree, this.model.getElement())));
	}

	public addClass(name: string): void {
		this._styles[name] = true;
		this.render(true);
	}

	public removeClass(name: string): void {
		delete this._styles[name]; // is this slow?
		this.render(true);
	}

	public render(skipUserRender = false): void {
		if (!this.model || !this.element) {
			return;
		}

		let classes = ['monaco-tree-row'];
		classes.push.apply(classes, Object.keys(this._styles));

		if (this.model.hasChildren()) {
			classes.push('has-children');
		}

		this.element.className = classes.join(' ');
		this.element.draggable = this.draggable;
		this.element.style.height = this.height + 'px';

		// ARIA
		this.element.setAttribute('role', 'treeitem');
		const accessibility = this.context.accessibilityProvider!;
		const ariaLabel = accessibility.getAriaLabel(this.context.tree, this.model.getElement());
		if (ariaLabel) {
			this.element.setAttribute('aria-label', ariaLabel);
		}
		if (accessibility.getPosInSet && accessibility.getSetSize) {
			this.element.setAttribute('aria-setsize', accessibility.getSetSize());
			this.element.setAttribute('aria-posinset', accessibility.getPosInSet(this.context.tree, this.model.getElement()));
		}
		if (this.model.hasTrait('focused')) {
			const base64Id = strings.safeBtoa(this.model.id);

			this.element.setAttribute('aria-selected', 'true');
			this.element.setAttribute('id', base64Id);
		} else {
			this.element.setAttribute('aria-selected', 'false');
			this.element.removeAttribute('id');
		}
		if (this.model.hasChildren()) {
			this.element.setAttribute('aria-expanded', String(!!this._styles['expanded']));
		} else {
			this.element.removeAttribute('aria-expanded');
		}
		this.element.setAttribute('aria-level', String(this.model.getDepth()));

		if (this.context.options.paddingOnRow) {
			this.element.style.paddingLeft = this.context.options.twistiePixels! + ((this.model.getDepth() - 1) * this.context.options.indentPixels!) + 'px';
		} else {
			this.element.style.paddingLeft = ((this.model.getDepth() - 1) * this.context.options.indentPixels!) + 'px';
			(<HTMLElement>this.row!.element!.firstElementChild).style.paddingLeft = this.context.options.twistiePixels + 'px';
		}

		let uri = this.context.dnd!.getDragURI(this.context.tree, this.model.getElement());

		if (uri !== this.uri) {
			if (this.unbindDragStart) {
				this.unbindDragStart.dispose();
			}

			if (uri) {
				this.uri = uri;
				this.draggable = true;
				this.unbindDragStart = DOM.addDisposableListener(this.element, 'dragstart', (e) => {
					this.onDragStart(e);
				});
			} else {
				this.uri = null;
			}
		}

		if (!skipUserRender && this.element) {
			let paddingLeft: number = 0;
			if (this.context.horizontalScrolling) {
				const style = window.getComputedStyle(this.element);
				paddingLeft = parseFloat(style.paddingLeft!);
			}

			if (this.context.horizontalScrolling) {
				this.element.style.width = 'fit-content';
			}

			try {
				this.context.renderer!.renderElement(this.context.tree, this.model.getElement(), this.templateId, this.row!.templateData);
			} catch (err) {
				console.error('Tree usage error: exception while rendering element');
				console.error(err);
			}

			if (this.context.horizontalScrolling) {
				this.width = DOM.getContentWidth(this.element) + paddingLeft;
				this.element.style.width = '';
			}
		}
	}

	updateWidth(): any {
		if (!this.context.horizontalScrolling || !this.element) {
			return;
		}

		const style = window.getComputedStyle(this.element);
		const paddingLeft = parseFloat(style.paddingLeft!);
		this.element.style.width = 'fit-content';
		this.width = DOM.getContentWidth(this.element) + paddingLeft;
		this.element.style.width = '';
	}

	public insertInDOM(container: HTMLElement, afterElement: HTMLElement | null): void {
		if (!this.row) {
			this.row = this.context.cache.alloc(this.templateId);

			// used in reverse lookup from HTMLElement to Item
			(<any>this.element)[TreeView.BINDING] = this;
		}

		if (this.element.parentElement) {
			return;
		}

		if (afterElement === null) {
			container.appendChild(this.element);
		} else {
			try {
				container.insertBefore(this.element, afterElement);
			} catch (e) {
				console.warn('Failed to locate previous tree element');
				container.appendChild(this.element);
			}
		}

		this.render();
	}

	public removeFromDOM(): void {
		if (!this.row) {
			return;
		}

		this.unbindDragStart.dispose();

		this.uri = null;

		(<any>this.element)[TreeView.BINDING] = null;
		this.context.cache.release(this.templateId, this.row);
		this.row = null;
	}

	public dispose(): void {
		this.row = null;
	}
}

class RootViewItem extends ViewItem {

	constructor(context: IViewContext, model: Model.Item, wrapper: HTMLElement) {
		super(context, model);

		this.row = {
			element: wrapper,
			templateData: null,
			templateId: null!
		};
	}

	public render(): void {
		if (!this.model || !this.element) {
			return;
		}

		let classes = ['monaco-tree-wrapper'];
		classes.push.apply(classes, Object.keys(this._styles));

		if (this.model.hasChildren()) {
			classes.push('has-children');
		}

		this.element.className = classes.join(' ');
	}

	public insertInDOM(container: HTMLElement, afterElement: HTMLElement): void {
		// noop
	}

	public removeFromDOM(): void {
		// noop
	}
}

interface IThrottledGestureEvent {
	translationX: number;
	translationY: number;
}

function reactionEquals(one: _.IDragOverReaction, other: _.IDragOverReaction | null): boolean {
	if (!one && !other) {
		return true;
	} else if (!one || !other) {
		return false;
	} else if (one.accept !== other.accept) {
		return false;
	} else if (one.bubble !== other.bubble) {
		return false;
	} else if (one.effect !== other.effect) {
		return false;
	} else {
		return true;
	}
}

export class TreeView extends HeightMap {

	static BINDING = 'monaco-tree-row';
	static LOADING_DECORATION_DELAY = 800;

	private static counter: number = 0;
	private instance: number;

	private context: IViewContext;
	private modelListeners: Lifecycle.IDisposable[];
	private model: Model.TreeModel | null = null;

	private viewListeners: Lifecycle.IDisposable[];
	private domNode: HTMLElement;
	private wrapper: HTMLElement;
	private styleElement: HTMLStyleElement;
	private treeStyler: _.ITreeStyler;
	private rowsContainer: HTMLElement;
	private scrollableElement: ScrollableElement;
	private msGesture: MSGesture | undefined;
	private lastPointerType: string = '';
	private lastClickTimeStamp: number = 0;

	private horizontalScrolling: boolean;
	private contentWidthUpdateDelayer = new Delayer<void>(50);

	private lastRenderTop: number;
	private lastRenderHeight: number;

	private inputItem!: ViewItem;
	private items: { [id: string]: ViewItem; };

	private isRefreshing = false;
	private refreshingPreviousChildrenIds: { [id: string]: string[] } = {};
	private currentDragAndDropData: IDragAndDropData | null = null;
	private currentDropElement: any;
	private currentDropElementReaction!: _.IDragOverReaction;
	private currentDropTarget: ViewItem | null = null;
	private shouldInvalidateDropReaction: boolean;
	private currentDropTargets: ViewItem[] | null = null;
	private currentDropDisposable: Lifecycle.IDisposable = Lifecycle.Disposable.None;
	private dragAndDropScrollInterval: number | null = null;
	private dragAndDropScrollTimeout: number | null = null;
	private dragAndDropMouseY: number | null = null;

	private didJustPressContextMenuKey: boolean;

	private highlightedItemWasDraggable: boolean = false;
	private onHiddenScrollTop: number | null = null;

	private readonly _onDOMFocus = new Emitter<void>();
	readonly onDOMFocus: Event<void> = this._onDOMFocus.event;

	private readonly _onDOMBlur = new Emitter<void>();
	readonly onDOMBlur: Event<void> = this._onDOMBlur.event;

	private readonly _onDidScroll = new Emitter<void>();
	readonly onDidScroll: Event<void> = this._onDidScroll.event;

	constructor(context: _.ITreeContext, container: HTMLElement) {
		super();

		TreeView.counter++;
		this.instance = TreeView.counter;

		const horizontalScrollMode = typeof context.options.horizontalScrollMode === 'undefined' ? ScrollbarVisibility.Hidden : context.options.horizontalScrollMode;
		this.horizontalScrolling = horizontalScrollMode !== ScrollbarVisibility.Hidden;

		this.context = {
			dataSource: context.dataSource,
			renderer: context.renderer,
			controller: context.controller,
			dnd: context.dnd,
			filter: context.filter,
			sorter: context.sorter,
			tree: context.tree,
			accessibilityProvider: context.accessibilityProvider,
			options: context.options,
			cache: new RowCache(context),
			horizontalScrolling: this.horizontalScrolling
		};

		this.modelListeners = [];
		this.viewListeners = [];

		this.items = {};

		this.domNode = document.createElement('div');
		this.domNode.className = `monaco-tree no-focused-item monaco-tree-instance-${this.instance}`;
		// to allow direct tabbing into the tree instead of first focusing the tree
		this.domNode.tabIndex = context.options.preventRootFocus ? -1 : 0;

		this.styleElement = DOM.createStyleSheet(this.domNode);

		this.treeStyler = context.styler || new DefaultTreestyler(this.styleElement, `monaco-tree-instance-${this.instance}`);

		// ARIA
		this.domNode.setAttribute('role', 'tree');
		if (this.context.options.ariaLabel) {
			this.domNode.setAttribute('aria-label', this.context.options.ariaLabel);
		}

		if (this.context.options.alwaysFocused) {
			DOM.addClass(this.domNode, 'focused');
		}

		if (!this.context.options.paddingOnRow) {
			DOM.addClass(this.domNode, 'no-row-padding');
		}

		this.wrapper = document.createElement('div');
		this.wrapper.className = 'monaco-tree-wrapper';
		this.scrollableElement = new ScrollableElement(this.wrapper, {
			alwaysConsumeMouseWheel: true,
			horizontal: horizontalScrollMode,
			vertical: (typeof context.options.verticalScrollMode !== 'undefined' ? context.options.verticalScrollMode : ScrollbarVisibility.Auto),
			useShadows: context.options.useShadows
		});
		this.scrollableElement.onScroll((e) => {
			this.render(e.scrollTop, e.height, e.scrollLeft, e.width, e.scrollWidth);
			this._onDidScroll.fire();
		});

		if (Browser.isIE) {
			this.wrapper.style.msTouchAction = 'none';
			this.wrapper.style.msContentZooming = 'none';
		} else {
			Touch.Gesture.addTarget(this.wrapper);
		}

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-tree-rows';
		if (context.options.showTwistie) {
			this.rowsContainer.className += ' show-twisties';
		}

		let focusTracker = DOM.trackFocus(this.domNode);
		this.viewListeners.push(focusTracker.onDidFocus(() => this.onFocus()));
		this.viewListeners.push(focusTracker.onDidBlur(() => this.onBlur()));
		this.viewListeners.push(focusTracker);

		this.viewListeners.push(DOM.addDisposableListener(this.domNode, 'keydown', (e) => this.onKeyDown(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.domNode, 'keyup', (e) => this.onKeyUp(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.domNode, 'mousedown', (e) => this.onMouseDown(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.domNode, 'mouseup', (e) => this.onMouseUp(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.wrapper, 'auxclick', (e: MouseEvent) => {
			if (e && e.button === 1) {
				this.onMouseMiddleClick(e);
			}
		}));
		this.viewListeners.push(DOM.addDisposableListener(this.wrapper, 'click', (e) => this.onClick(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.domNode, 'contextmenu', (e) => this.onContextMenu(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.wrapper, Touch.EventType.Tap, (e) => this.onTap(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.wrapper, Touch.EventType.Change, (e) => this.onTouchChange(e)));

		if (Browser.isIE) {
			this.viewListeners.push(DOM.addDisposableListener(this.wrapper, 'MSPointerDown', (e) => this.onMsPointerDown(e)));
			this.viewListeners.push(DOM.addDisposableListener(this.wrapper, 'MSGestureTap', (e) => this.onMsGestureTap(e)));

			// these events come too fast, we throttle them
			this.viewListeners.push(DOM.addDisposableThrottledListener<IThrottledGestureEvent>(this.wrapper, 'MSGestureChange', (e) => this.onThrottledMsGestureChange(e), (lastEvent: IThrottledGestureEvent, event: MSGestureEvent): IThrottledGestureEvent => {
				event.stopPropagation();
				event.preventDefault();

				let result = { translationY: event.translationY, translationX: event.translationX };

				if (lastEvent) {
					result.translationY += lastEvent.translationY;
					result.translationX += lastEvent.translationX;
				}

				return result;
			}));
		}

		this.viewListeners.push(DOM.addDisposableListener(window, 'dragover', (e) => this.onDragOver(e)));
		this.viewListeners.push(DOM.addDisposableListener(this.wrapper, 'drop', (e) => this.onDrop(e)));
		this.viewListeners.push(DOM.addDisposableListener(window, 'dragend', (e) => this.onDragEnd(e)));
		this.viewListeners.push(DOM.addDisposableListener(window, 'dragleave', (e) => this.onDragOver(e)));

		this.wrapper.appendChild(this.rowsContainer);
		this.domNode.appendChild(this.scrollableElement.getDomNode());
		container.appendChild(this.domNode);

		this.lastRenderTop = 0;
		this.lastRenderHeight = 0;

		this.didJustPressContextMenuKey = false;

		this.currentDropTarget = null;
		this.currentDropTargets = [];
		this.shouldInvalidateDropReaction = false;

		this.dragAndDropScrollInterval = null;
		this.dragAndDropScrollTimeout = null;

		this.onRowsChanged();
		this.layout();

		this.setupMSGesture();

		this.applyStyles(context.options);
	}

	public applyStyles(styles: _.ITreeStyles): void {
		this.treeStyler.style(styles);
	}

	protected createViewItem(item: Model.Item): IViewItem {
		return new ViewItem(this.context, item);
	}

	public getHTMLElement(): HTMLElement {
		return this.domNode;
	}

	public focus(): void {
		this.domNode.focus();
	}

	public isFocused(): boolean {
		return document.activeElement === this.domNode;
	}

	public blur(): void {
		this.domNode.blur();
	}

	public onVisible(): void {
		this.scrollTop = this.onHiddenScrollTop!;
		this.onHiddenScrollTop = null;
		this.setupMSGesture();
	}

	private setupMSGesture(): void {
		if ((<any>window).MSGesture) {
			this.msGesture = new MSGesture();
			setTimeout(() => this.msGesture!.target = this.wrapper, 100); // TODO@joh, TODO@IETeam
		}
	}

	public onHidden(): void {
		this.onHiddenScrollTop = this.scrollTop;
	}

	private isTreeVisible(): boolean {
		return this.onHiddenScrollTop === null;
	}

	public layout(height?: number, width?: number): void {
		if (!this.isTreeVisible()) {
			return;
		}

		this.viewHeight = height || DOM.getContentHeight(this.wrapper); // render
		this.scrollHeight = this.getContentHeight();

		if (this.horizontalScrolling) {
			this.viewWidth = width || DOM.getContentWidth(this.wrapper);
		}
	}

	private render(scrollTop: number, viewHeight: number, scrollLeft: number, viewWidth: number, scrollWidth: number): void {
		let i: number;
		let stop: number;

		let renderTop = scrollTop;
		let renderBottom = scrollTop + viewHeight;
		let thisRenderBottom = this.lastRenderTop + this.lastRenderHeight;

		// when view scrolls down, start rendering from the renderBottom
		for (i = this.indexAfter(renderBottom) - 1, stop = this.indexAt(Math.max(thisRenderBottom, renderTop)); i >= stop; i--) {
			this.insertItemInDOM(<ViewItem>this.itemAtIndex(i));
		}

		// when view scrolls up, start rendering from either this.renderTop or renderBottom
		for (i = Math.min(this.indexAt(this.lastRenderTop), this.indexAfter(renderBottom)) - 1, stop = this.indexAt(renderTop); i >= stop; i--) {
			this.insertItemInDOM(<ViewItem>this.itemAtIndex(i));
		}

		// when view scrolls down, start unrendering from renderTop
		for (i = this.indexAt(this.lastRenderTop), stop = Math.min(this.indexAt(renderTop), this.indexAfter(thisRenderBottom)); i < stop; i++) {
			this.removeItemFromDOM(<ViewItem>this.itemAtIndex(i));
		}

		// when view scrolls up, start unrendering from either renderBottom this.renderTop
		for (i = Math.max(this.indexAfter(renderBottom), this.indexAt(this.lastRenderTop)), stop = this.indexAfter(thisRenderBottom); i < stop; i++) {
			this.removeItemFromDOM(<ViewItem>this.itemAtIndex(i));
		}

		let topItem = this.itemAtIndex(this.indexAt(renderTop));

		if (topItem) {
			this.rowsContainer.style.top = (topItem.top - renderTop) + 'px';
		}

		if (this.horizontalScrolling) {
			this.rowsContainer.style.left = -scrollLeft + 'px';
			this.rowsContainer.style.width = `${Math.max(scrollWidth, viewWidth)}px`;
		}

		this.lastRenderTop = renderTop;
		this.lastRenderHeight = renderBottom - renderTop;
	}

	public setModel(newModel: Model.TreeModel): void {
		this.releaseModel();
		this.model = newModel;

		this.model.onRefresh(this.onRefreshing, this, this.modelListeners);
		this.model.onDidRefresh(this.onRefreshed, this, this.modelListeners);
		this.model.onSetInput(this.onClearingInput, this, this.modelListeners);
		this.model.onDidSetInput(this.onSetInput, this, this.modelListeners);
		this.model.onDidFocus(this.onModelFocusChange, this, this.modelListeners);

		this.model.onRefreshItemChildren(this.onItemChildrenRefreshing, this, this.modelListeners);
		this.model.onDidRefreshItemChildren(this.onItemChildrenRefreshed, this, this.modelListeners);
		this.model.onDidRefreshItem(this.onItemRefresh, this, this.modelListeners);
		this.model.onExpandItem(this.onItemExpanding, this, this.modelListeners);
		this.model.onDidExpandItem(this.onItemExpanded, this, this.modelListeners);
		this.model.onCollapseItem(this.onItemCollapsing, this, this.modelListeners);
		this.model.onDidRevealItem(this.onItemReveal, this, this.modelListeners);
		this.model.onDidAddTraitItem(this.onItemAddTrait, this, this.modelListeners);
		this.model.onDidRemoveTraitItem(this.onItemRemoveTrait, this, this.modelListeners);
	}

	private onRefreshing(): void {
		this.isRefreshing = true;
	}

	private onRefreshed(): void {
		this.isRefreshing = false;
		this.onRowsChanged();
	}

	private onRowsChanged(scrollTop: number = this.scrollTop): void {
		if (this.isRefreshing) {
			return;
		}

		this.scrollTop = scrollTop;
		this.updateScrollWidth();
	}

	private updateScrollWidth(): void {
		if (!this.horizontalScrolling) {
			return;
		}

		this.contentWidthUpdateDelayer.trigger(() => {
			const keys = Object.keys(this.items);
			let scrollWidth = 0;

			for (const key of keys) {
				scrollWidth = Math.max(scrollWidth, this.items[key].width);
			}

			this.scrollWidth = scrollWidth + 10 /* scrollbar */;
		});
	}

	public focusNextPage(eventPayload?: any): void {
		let lastPageIndex = this.indexAt(this.scrollTop + this.viewHeight);
		lastPageIndex = lastPageIndex === 0 ? 0 : lastPageIndex - 1;
		let lastPageElement = this.itemAtIndex(lastPageIndex).model.getElement();
		let currentlyFocusedElement = this.model!.getFocus();

		if (currentlyFocusedElement !== lastPageElement) {
			this.model!.setFocus(lastPageElement, eventPayload);
		} else {
			let previousScrollTop = this.scrollTop;
			this.scrollTop += this.viewHeight;

			if (this.scrollTop !== previousScrollTop) {

				// Let the scroll event listener run
				setTimeout(() => {
					this.focusNextPage(eventPayload);
				}, 0);
			}
		}
	}

	public focusPreviousPage(eventPayload?: any): void {
		let firstPageIndex: number;

		if (this.scrollTop === 0) {
			firstPageIndex = this.indexAt(this.scrollTop);
		} else {
			firstPageIndex = this.indexAfter(this.scrollTop - 1);
		}

		let firstPageElement = this.itemAtIndex(firstPageIndex).model.getElement();
		let currentlyFocusedElement = this.model!.getFocus();

		if (currentlyFocusedElement !== firstPageElement) {
			this.model!.setFocus(firstPageElement, eventPayload);
		} else {
			let previousScrollTop = this.scrollTop;
			this.scrollTop -= this.viewHeight;

			if (this.scrollTop !== previousScrollTop) {

				// Let the scroll event listener run
				setTimeout(() => {
					this.focusPreviousPage(eventPayload);
				}, 0);
			}
		}
	}

	public get viewHeight() {
		const scrollDimensions = this.scrollableElement.getScrollDimensions();
		return scrollDimensions.height;
	}

	public set viewHeight(height: number) {
		this.scrollableElement.setScrollDimensions({ height });
	}

	private set scrollHeight(scrollHeight: number) {
		scrollHeight = scrollHeight + (this.horizontalScrolling ? 10 : 0);
		this.scrollableElement.setScrollDimensions({ scrollHeight });
	}

	public get viewWidth(): number {
		const scrollDimensions = this.scrollableElement.getScrollDimensions();
		return scrollDimensions.width;
	}

	public set viewWidth(viewWidth: number) {
		this.scrollableElement.setScrollDimensions({ width: viewWidth });
	}

	private set scrollWidth(scrollWidth: number) {
		this.scrollableElement.setScrollDimensions({ scrollWidth });
	}

	public get scrollTop(): number {
		const scrollPosition = this.scrollableElement.getScrollPosition();
		return scrollPosition.scrollTop;
	}

	public set scrollTop(scrollTop: number) {
		const scrollHeight = this.getContentHeight() + (this.horizontalScrolling ? 10 : 0);
		this.scrollableElement.setScrollDimensions({ scrollHeight });
		this.scrollableElement.setScrollPosition({ scrollTop });
	}

	public getScrollPosition(): number {
		const height = this.getContentHeight() - this.viewHeight;
		return height <= 0 ? 1 : this.scrollTop / height;
	}

	public setScrollPosition(pos: number): void {
		const height = this.getContentHeight() - this.viewHeight;
		this.scrollTop = height * pos;
	}

	// Events

	private onClearingInput(e: Model.IInputEvent): void {
		let item = <Model.Item>e.item;
		if (item) {
			this.onRemoveItems(new MappedIterator(item.getNavigator(), item => item && item.id));
			this.onRowsChanged();
		}
	}

	private onSetInput(e: Model.IInputEvent): void {
		this.context.cache.garbageCollect();
		this.inputItem = new RootViewItem(this.context, <Model.Item>e.item, this.wrapper);
	}

	private onItemChildrenRefreshing(e: Model.IItemChildrenRefreshEvent): void {
		let item = <Model.Item>e.item;
		let viewItem = this.items[item.id];

		if (viewItem && this.context.options.showLoading) {
			viewItem.loadingTimer = setTimeout(() => {
				viewItem.loadingTimer = 0;
				viewItem.loading = true;
			}, TreeView.LOADING_DECORATION_DELAY);
		}

		if (!e.isNested) {
			let childrenIds: string[] = [];
			let navigator = item.getNavigator();
			let childItem: Model.Item | null;

			while (childItem = navigator.next()) {
				childrenIds.push(childItem.id);
			}

			this.refreshingPreviousChildrenIds[item.id] = childrenIds;
		}
	}

	private onItemChildrenRefreshed(e: Model.IItemChildrenRefreshEvent): void {
		let item = <Model.Item>e.item;
		let viewItem = this.items[item.id];

		if (viewItem) {
			if (viewItem.loadingTimer) {
				clearTimeout(viewItem.loadingTimer);
				viewItem.loadingTimer = 0;
			}

			viewItem.loading = false;
		}

		if (!e.isNested) {
			let previousChildrenIds = this.refreshingPreviousChildrenIds[item.id];
			let afterModelItems: Model.Item[] = [];
			let navigator = item.getNavigator();
			let childItem: Model.Item | null;

			while (childItem = navigator.next()) {
				afterModelItems.push(childItem);
			}

			let skipDiff = Math.abs(previousChildrenIds.length - afterModelItems.length) > 1000;
			let diff: Diff.IDiffChange[] = [];
			let doToInsertItemsAlreadyExist: boolean = false;

			if (!skipDiff) {
				const lcs = new Diff.LcsDiff(
					{
						getLength: () => previousChildrenIds.length,
						getElementAtIndex: (i: number) => previousChildrenIds[i]
					}, {
						getLength: () => afterModelItems.length,
						getElementAtIndex: (i: number) => afterModelItems[i].id
					},
					null
				);

				diff = lcs.ComputeDiff(false);

				// this means that the result of the diff algorithm would result
				// in inserting items that were already registered. this can only
				// happen if the data provider returns bad ids OR if the sorting
				// of the elements has changed
				doToInsertItemsAlreadyExist = diff.some(d => {
					if (d.modifiedLength > 0) {
						for (let i = d.modifiedStart, len = d.modifiedStart + d.modifiedLength; i < len; i++) {
							if (this.items.hasOwnProperty(afterModelItems[i].id)) {
								return true;
							}
						}
					}
					return false;
				});
			}

			// 50 is an optimization number, at some point we're better off
			// just replacing everything
			if (!skipDiff && !doToInsertItemsAlreadyExist && diff.length < 50) {
				for (const diffChange of diff) {

					if (diffChange.originalLength > 0) {
						this.onRemoveItems(new ArrayIterator(previousChildrenIds, diffChange.originalStart, diffChange.originalStart + diffChange.originalLength));
					}

					if (diffChange.modifiedLength > 0) {
						let beforeItem: Model.Item | null = afterModelItems[diffChange.modifiedStart - 1] || item;
						beforeItem = beforeItem.getDepth() > 0 ? beforeItem : null;

						this.onInsertItems(new ArrayIterator(afterModelItems, diffChange.modifiedStart, diffChange.modifiedStart + diffChange.modifiedLength), beforeItem ? beforeItem.id : null);
					}
				}

			} else if (skipDiff || diff.length) {
				this.onRemoveItems(new ArrayIterator(previousChildrenIds));
				this.onInsertItems(new ArrayIterator(afterModelItems), item.getDepth() > 0 ? item.id : null);
			}

			if (skipDiff || diff.length) {
				this.onRowsChanged();
			}
		}
	}

	private onItemRefresh(item: Model.Item): void {
		this.onItemsRefresh([item]);
	}

	private onItemsRefresh(items: Model.Item[]): void {
		this.onRefreshItemSet(items.filter(item => this.items.hasOwnProperty(item.id)));
		this.onRowsChanged();
	}

	private onItemExpanding(e: Model.IItemExpandEvent): void {
		let viewItem = this.items[e.item.id];
		if (viewItem) {
			viewItem.expanded = true;
		}
	}

	private onItemExpanded(e: Model.IItemExpandEvent): void {
		let item = <Model.Item>e.item;
		let viewItem = this.items[item.id];
		if (viewItem) {
			viewItem.expanded = true;

			let height = this.onInsertItems(item.getNavigator(), item.id) || 0;
			let scrollTop = this.scrollTop;

			if (viewItem.top + viewItem.height <= this.scrollTop) {
				scrollTop += height;
			}

			this.onRowsChanged(scrollTop);
		}
	}

	private onItemCollapsing(e: Model.IItemCollapseEvent): void {
		let item = <Model.Item>e.item;
		let viewItem = this.items[item.id];
		if (viewItem) {
			viewItem.expanded = false;
			this.onRemoveItems(new MappedIterator(item.getNavigator(), item => item && item.id));
			this.onRowsChanged();
		}
	}

	private onItemReveal(e: Model.IItemRevealEvent): void {
		let item = <Model.Item>e.item;
		let relativeTop = <number>e.relativeTop;
		let viewItem = this.items[item.id];
		if (viewItem) {
			if (relativeTop !== null) {
				relativeTop = relativeTop < 0 ? 0 : relativeTop;
				relativeTop = relativeTop > 1 ? 1 : relativeTop;

				// y = mx + b
				let m = viewItem.height - this.viewHeight;
				this.scrollTop = m * relativeTop + viewItem.top;
			} else {
				let viewItemBottom = viewItem.top + viewItem.height;
				let wrapperBottom = this.scrollTop + this.viewHeight;

				if (viewItem.top < this.scrollTop) {
					this.scrollTop = viewItem.top;
				} else if (viewItemBottom >= wrapperBottom) {
					this.scrollTop = viewItemBottom - this.viewHeight;
				}
			}
		}
	}

	private onItemAddTrait(e: Model.IItemTraitEvent): void {
		let item = <Model.Item>e.item;
		let trait = <string>e.trait;
		let viewItem = this.items[item.id];
		if (viewItem) {
			viewItem.addClass(trait);
		}
		if (trait === 'highlighted') {
			DOM.addClass(this.domNode, trait);

			// Ugly Firefox fix: input fields can't be selected if parent nodes are draggable
			if (viewItem) {
				this.highlightedItemWasDraggable = !!viewItem.draggable;
				if (viewItem.draggable) {
					viewItem.draggable = false;
				}
			}
		}
	}

	private onItemRemoveTrait(e: Model.IItemTraitEvent): void {
		let item = <Model.Item>e.item;
		let trait = <string>e.trait;
		let viewItem = this.items[item.id];
		if (viewItem) {
			viewItem.removeClass(trait);
		}
		if (trait === 'highlighted') {
			DOM.removeClass(this.domNode, trait);

			// Ugly Firefox fix: input fields can't be selected if parent nodes are draggable
			if (this.highlightedItemWasDraggable) {
				viewItem.draggable = true;
			}
			this.highlightedItemWasDraggable = false;
		}
	}

	private onModelFocusChange(): void {
		const focus = this.model && this.model.getFocus();

		DOM.toggleClass(this.domNode, 'no-focused-item', !focus);

		// ARIA
		if (focus) {
			this.domNode.setAttribute('aria-activedescendant', strings.safeBtoa(this.context.dataSource.getId(this.context.tree, focus)));
		} else {
			this.domNode.removeAttribute('aria-activedescendant');
		}
	}

	// HeightMap "events"

	public onInsertItem(item: ViewItem): void {
		item.onDragStart = (e) => { this.onDragStart(item, e); };
		item.needsRender = true;
		this.refreshViewItem(item);
		this.items[item.id] = item;
	}

	public onRefreshItem(item: ViewItem, needsRender = false): void {
		item.needsRender = item.needsRender || needsRender;
		this.refreshViewItem(item);
	}

	public onRemoveItem(item: ViewItem): void {
		this.removeItemFromDOM(item);
		item.dispose();
		delete this.items[item.id];
	}

	// ViewItem refresh

	private refreshViewItem(item: ViewItem): void {
		item.render();

		if (this.shouldBeRendered(item)) {
			this.insertItemInDOM(item);
		} else {
			this.removeItemFromDOM(item);
		}
	}

	// DOM Events

	private onClick(e: MouseEvent): void {
		if (this.lastPointerType && this.lastPointerType !== 'mouse') {
			return;
		}

		let event = new Mouse.StandardMouseEvent(e);
		let item = this.getItemAround(event.target);

		if (!item) {
			return;
		}

		if (Browser.isIE && Date.now() - this.lastClickTimeStamp < 300) {
			// IE10+ doesn't set the detail property correctly. While IE10 simply
			// counts the number of clicks, IE11 reports always 1. To align with
			// other browser, we set the value to 2 if clicks events come in a 300ms
			// sequence.
			event.detail = 2;
		}
		this.lastClickTimeStamp = Date.now();

		this.context.controller!.onClick(this.context.tree, item.model.getElement(), event);
	}

	private onMouseMiddleClick(e: MouseEvent): void {
		if (!this.context.controller!.onMouseMiddleClick!) {
			return;
		}

		let event = new Mouse.StandardMouseEvent(e);
		let item = this.getItemAround(event.target);

		if (!item) {
			return;
		}
		this.context.controller!.onMouseMiddleClick!(this.context.tree, item.model.getElement(), event);
	}

	private onMouseDown(e: MouseEvent): void {
		this.didJustPressContextMenuKey = false;

		if (!this.context.controller!.onMouseDown!) {
			return;
		}

		if (this.lastPointerType && this.lastPointerType !== 'mouse') {
			return;
		}

		let event = new Mouse.StandardMouseEvent(e);

		if (event.ctrlKey && Platform.isNative && Platform.isMacintosh) {
			return;
		}

		let item = this.getItemAround(event.target);

		if (!item) {
			return;
		}

		this.context.controller!.onMouseDown!(this.context.tree, item.model.getElement(), event);
	}

	private onMouseUp(e: MouseEvent): void {
		if (!this.context.controller!.onMouseUp!) {
			return;
		}

		if (this.lastPointerType && this.lastPointerType !== 'mouse') {
			return;
		}

		let event = new Mouse.StandardMouseEvent(e);

		if (event.ctrlKey && Platform.isNative && Platform.isMacintosh) {
			return;
		}

		let item = this.getItemAround(event.target);

		if (!item) {
			return;
		}

		this.context.controller!.onMouseUp!(this.context.tree, item.model.getElement(), event);
	}

	private onTap(e: Touch.GestureEvent): void {
		let item = this.getItemAround(<HTMLElement>e.initialTarget);

		if (!item) {
			return;
		}

		this.context.controller!.onTap(this.context.tree, item.model.getElement(), e);
	}

	private onTouchChange(event: Touch.GestureEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.scrollTop -= event.translationY;
	}

	private onContextMenu(keyboardEvent: KeyboardEvent): void;
	private onContextMenu(mouseEvent: MouseEvent): void;
	private onContextMenu(event: KeyboardEvent | MouseEvent): void {
		let resultEvent: _.ContextMenuEvent;
		let element: any;

		if (event instanceof KeyboardEvent || this.didJustPressContextMenuKey) {
			this.didJustPressContextMenuKey = false;

			let keyboardEvent = new Keyboard.StandardKeyboardEvent(<KeyboardEvent>event);
			element = this.model!.getFocus();

			let position: DOM.IDomNodePagePosition;

			if (!element) {
				element = this.model!.getInput();
				position = DOM.getDomNodePagePosition(this.inputItem.element);
			} else {
				const id = this.context.dataSource.getId(this.context.tree, element);
				const viewItem = this.items[id!];
				position = DOM.getDomNodePagePosition(viewItem.element);
			}

			resultEvent = new _.KeyboardContextMenuEvent(position.left + position.width, position.top, keyboardEvent);

		} else {
			let mouseEvent = new Mouse.StandardMouseEvent(<MouseEvent>event);
			let item = this.getItemAround(mouseEvent.target);

			if (!item) {
				return;
			}

			element = item.model.getElement();
			resultEvent = new _.MouseContextMenuEvent(mouseEvent);
		}

		this.context.controller!.onContextMenu(this.context.tree, element, resultEvent);
	}

	private onKeyDown(e: KeyboardEvent): void {
		let event = new Keyboard.StandardKeyboardEvent(e);

		this.didJustPressContextMenuKey = event.keyCode === KeyCode.ContextMenu || (event.shiftKey && event.keyCode === KeyCode.F10);

		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return; // Ignore event if target is a form input field (avoids browser specific issues)
		}

		if (this.didJustPressContextMenuKey) {
			event.preventDefault();
			event.stopPropagation();
		}

		this.context.controller!.onKeyDown(this.context.tree, event);
	}

	private onKeyUp(e: KeyboardEvent): void {
		if (this.didJustPressContextMenuKey) {
			this.onContextMenu(e);
		}

		this.didJustPressContextMenuKey = false;
		this.context.controller!.onKeyUp(this.context.tree, new Keyboard.StandardKeyboardEvent(e));
	}

	private onDragStart(item: ViewItem, e: any): void {
		if (this.model!.getHighlight()) {
			return;
		}

		let element = item.model.getElement();
		let selection = this.model!.getSelection();
		let elements: any[];

		if (selection.indexOf(element) > -1) {
			elements = selection;
		} else {
			elements = [element];
		}

		e.dataTransfer.effectAllowed = 'copyMove';
		e.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([item.uri]));
		if (e.dataTransfer.setDragImage) {
			let label: string;

			if (this.context.dnd!.getDragLabel) {
				label = this.context.dnd!.getDragLabel!(this.context.tree, elements);
			} else {
				label = String(elements.length);
			}

			const dragImage = document.createElement('div');
			dragImage.className = 'monaco-tree-drag-image';
			dragImage.textContent = label;
			document.body.appendChild(dragImage);
			e.dataTransfer.setDragImage(dragImage, -10, -10);
			setTimeout(() => document.body.removeChild(dragImage), 0);
		}

		this.currentDragAndDropData = new dnd.ElementsDragAndDropData(elements);
		StaticDND.CurrentDragAndDropData = new dnd.ExternalElementsDragAndDropData(elements);

		this.context.dnd!.onDragStart(this.context.tree, this.currentDragAndDropData, new Mouse.DragMouseEvent(e));
	}

	private setupDragAndDropScrollInterval(): void {
		let viewTop = DOM.getTopLeftOffset(this.wrapper).top;

		if (!this.dragAndDropScrollInterval) {
			this.dragAndDropScrollInterval = window.setInterval(() => {
				if (this.dragAndDropMouseY === null) {
					return;
				}

				let diff = this.dragAndDropMouseY - viewTop;
				let scrollDiff = 0;
				let upperLimit = this.viewHeight - 35;

				if (diff < 35) {
					scrollDiff = Math.max(-14, 0.2 * (diff - 35));
				} else if (diff > upperLimit) {
					scrollDiff = Math.min(14, 0.2 * (diff - upperLimit));
				}

				this.scrollTop += scrollDiff;
			}, 10);

			this.cancelDragAndDropScrollTimeout();

			this.dragAndDropScrollTimeout = window.setTimeout(() => {
				this.cancelDragAndDropScrollInterval();
				this.dragAndDropScrollTimeout = null;
			}, 1000);
		}
	}

	private cancelDragAndDropScrollInterval(): void {
		if (this.dragAndDropScrollInterval) {
			window.clearInterval(this.dragAndDropScrollInterval);
			this.dragAndDropScrollInterval = null;
		}

		this.cancelDragAndDropScrollTimeout();
	}

	private cancelDragAndDropScrollTimeout(): void {
		if (this.dragAndDropScrollTimeout) {
			window.clearTimeout(this.dragAndDropScrollTimeout);
			this.dragAndDropScrollTimeout = null;
		}
	}

	private onDragOver(e: DragEvent): boolean {
		e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)

		let event = new Mouse.DragMouseEvent(e);

		let viewItem = this.getItemAround(event.target);

		if (!viewItem || (event.posx === 0 && event.posy === 0 && event.browserEvent.type === DOM.EventType.DRAG_LEAVE)) {
			// dragging outside of tree

			if (this.currentDropTarget) {
				// clear previously hovered element feedback

				this.currentDropTargets!.forEach(i => i.dropTarget = false);
				this.currentDropTargets = [];
				this.currentDropDisposable.dispose();
			}

			this.cancelDragAndDropScrollInterval();
			this.currentDropTarget = null;
			this.currentDropElement = null;
			this.dragAndDropMouseY = null;

			return false;
		}

		// dragging inside the tree
		this.setupDragAndDropScrollInterval();
		this.dragAndDropMouseY = event.posy;

		if (!this.currentDragAndDropData) {
			// just started dragging

			if (StaticDND.CurrentDragAndDropData) {
				this.currentDragAndDropData = StaticDND.CurrentDragAndDropData;
			} else {
				if (!event.dataTransfer.types) {
					return false;
				}

				this.currentDragAndDropData = new dnd.DesktopDragAndDropData();
			}
		}

		this.currentDragAndDropData.update((event.browserEvent as DragEvent).dataTransfer!);

		let element: any;
		let item: Model.Item | null = viewItem.model;
		let reaction: _.IDragOverReaction | null;

		// check the bubble up behavior
		do {
			element = item ? item.getElement() : this.model!.getInput();
			reaction = this.context.dnd!.onDragOver(this.context.tree, this.currentDragAndDropData, element, event);

			if (!reaction || reaction.bubble !== _.DragOverBubble.BUBBLE_UP) {
				break;
			}

			item = item && item.parent;
		} while (item);

		if (!item) {
			this.currentDropElement = null;
			return false;
		}

		let canDrop = reaction && reaction.accept;

		if (canDrop) {
			this.currentDropElement = item.getElement();
			event.preventDefault();
			event.dataTransfer.dropEffect = reaction!.effect === _.DragOverEffect.COPY ? 'copy' : 'move';
		} else {
			this.currentDropElement = null;
		}

		// item is the model item where drop() should be called

		// can be null
		let currentDropTarget = item.id === this.inputItem.id ? this.inputItem : this.items[item.id];

		if (this.shouldInvalidateDropReaction || this.currentDropTarget !== currentDropTarget || !reactionEquals(this.currentDropElementReaction, reaction)) {
			this.shouldInvalidateDropReaction = false;

			if (this.currentDropTarget) {
				this.currentDropTargets!.forEach(i => i.dropTarget = false);
				this.currentDropTargets = [];
				this.currentDropDisposable.dispose();
			}

			this.currentDropTarget = currentDropTarget;
			this.currentDropElementReaction = reaction!;

			if (canDrop) {
				// setup hover feedback for drop target

				if (this.currentDropTarget) {
					this.currentDropTarget.dropTarget = true;
					this.currentDropTargets!.push(this.currentDropTarget);
				}

				if (reaction!.bubble === _.DragOverBubble.BUBBLE_DOWN) {
					let nav = item.getNavigator();
					let child: Model.Item | null;
					while (child = nav.next()) {
						viewItem = this.items[child.id];
						if (viewItem) {
							viewItem.dropTarget = true;
							this.currentDropTargets!.push(viewItem);
						}
					}
				}

				if (reaction!.autoExpand) {
					const timeoutPromise = timeout(500);
					this.currentDropDisposable = Lifecycle.toDisposable(() => timeoutPromise.cancel());

					timeoutPromise
						.then(() => this.context.tree.expand(this.currentDropElement))
						.then(() => this.shouldInvalidateDropReaction = true);
				}
			}
		}

		return true;
	}

	private onDrop(e: DragEvent): void {
		if (this.currentDropElement) {
			let event = new Mouse.DragMouseEvent(e);
			event.preventDefault();
			this.currentDragAndDropData!.update((event.browserEvent as DragEvent).dataTransfer!);
			this.context.dnd!.drop(this.context.tree, this.currentDragAndDropData!, this.currentDropElement, event);
			this.onDragEnd(e);
		}
		this.cancelDragAndDropScrollInterval();
	}

	private onDragEnd(e: DragEvent): void {
		if (this.currentDropTarget) {
			this.currentDropTargets!.forEach(i => i.dropTarget = false);
			this.currentDropTargets = [];
		}

		this.currentDropDisposable.dispose();

		this.cancelDragAndDropScrollInterval();
		this.currentDragAndDropData = null;
		StaticDND.CurrentDragAndDropData = undefined;
		this.currentDropElement = null;
		this.currentDropTarget = null;
		this.dragAndDropMouseY = null;
	}

	private onFocus(): void {
		if (!this.context.options.alwaysFocused) {
			DOM.addClass(this.domNode, 'focused');
		}

		this._onDOMFocus.fire();
	}

	private onBlur(): void {
		if (!this.context.options.alwaysFocused) {
			DOM.removeClass(this.domNode, 'focused');
		}

		this.domNode.removeAttribute('aria-activedescendant'); // ARIA

		this._onDOMBlur.fire();
	}

	// MS specific DOM Events

	private onMsPointerDown(event: MSPointerEvent): void {
		if (!this.msGesture) {
			return;
		}

		// Circumvent IE11 breaking change in e.pointerType & TypeScript's stale definitions
		let pointerType = event.pointerType;
		if (pointerType === ((<any>event).MSPOINTER_TYPE_MOUSE || 'mouse')) {
			this.lastPointerType = 'mouse';
			return;
		} else if (pointerType === ((<any>event).MSPOINTER_TYPE_TOUCH || 'touch')) {
			this.lastPointerType = 'touch';
		} else {
			return;
		}

		event.stopPropagation();
		event.preventDefault();

		this.msGesture.addPointer(event.pointerId);
	}

	private onThrottledMsGestureChange(event: IThrottledGestureEvent): void {
		this.scrollTop -= event.translationY;
	}

	private onMsGestureTap(event: MSGestureEvent): void {
		(<any>event).initialTarget = document.elementFromPoint(event.clientX, event.clientY);
		this.onTap(<any>event);
	}

	// DOM changes

	private insertItemInDOM(item: ViewItem): void {
		let elementAfter: HTMLElement | null = null;
		let itemAfter = <ViewItem>this.itemAfter(item);

		if (itemAfter && itemAfter.element) {
			elementAfter = itemAfter.element;
		}

		item.insertInDOM(this.rowsContainer, elementAfter);
	}

	private removeItemFromDOM(item: ViewItem): void {
		if (!item) {
			return;
		}

		item.removeFromDOM();
	}

	// Helpers

	private shouldBeRendered(item: ViewItem): boolean {
		return item.top < this.lastRenderTop + this.lastRenderHeight && item.top + item.height > this.lastRenderTop;
	}

	private getItemAround(element: HTMLElement): ViewItem | undefined {
		let candidate: ViewItem = this.inputItem;
		let el: HTMLElement | null = element;

		do {
			if ((<any>el)[TreeView.BINDING]) {
				candidate = (<any>el)[TreeView.BINDING];
			}

			if (el === this.wrapper || el === this.domNode) {
				return candidate;
			}

			if (el === this.scrollableElement.getDomNode() || el === document.body) {
				return undefined;
			}
		} while (el = el.parentElement);

		return undefined;
	}

	// Cleanup

	private releaseModel(): void {
		if (this.model) {
			this.modelListeners = Lifecycle.dispose(this.modelListeners);
			this.model = null;
		}
	}

	public dispose(): void {
		// TODO@joao: improve
		this.scrollableElement.dispose();

		this.releaseModel();

		this.viewListeners = Lifecycle.dispose(this.viewListeners);

		this._onDOMFocus.dispose();
		this._onDOMBlur.dispose();

		if (this.domNode.parentNode) {
			this.domNode.parentNode.removeChild(this.domNode);
		}

		if (this.items) {
			Object.keys(this.items).forEach(key => this.items[key].removeFromDOM());
		}

		if (this.context.cache) {
			this.context.cache.dispose();
		}

		super.dispose();
	}
}
