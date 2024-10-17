/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFirefox } from '../../browser.js';
import { DataTransfers } from '../../dnd.js';
import { $, addDisposableListener, append, clearNode, EventHelper, EventType, getWindow, isHTMLElement, trackFocus } from '../../dom.js';
import { DomEmitter } from '../../event.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { Gesture, EventType as TouchEventType } from '../../touch.js';
import { IBoundarySashes, Orientation } from '../sash/sash.js';
import { Color, RGBA } from '../../../common/color.js';
import { Emitter, Event } from '../../../common/event.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../common/lifecycle.js';
import { ScrollEvent } from '../../../common/scrollable.js';
import './paneview.css';
import { localize } from '../../../../nls.js';
import { IView, Sizing, SplitView } from './splitview.js';

export interface IPaneOptions {
	minimumBodySize?: number;
	maximumBodySize?: number;
	expanded?: boolean;
	orientation?: Orientation;
	title: string;
	titleDescription?: string;
}

export interface IPaneStyles {
	readonly dropBackground: string | undefined;
	readonly headerForeground: string | undefined;
	readonly headerBackground: string | undefined;
	readonly headerBorder: string | undefined;
	readonly leftBorder: string | undefined;
}

/**
 * A Pane is a structured SplitView view.
 *
 * WARNING: You must call `render()` after you construct it.
 * It can't be done automatically at the end of the ctor
 * because of the order of property initialization in TypeScript.
 * Subclasses wouldn't be able to set own properties
 * before the `render()` call, thus forbidding their use.
 */
export abstract class Pane extends Disposable implements IView {

	private static readonly HEADER_SIZE = 22;

	readonly element: HTMLElement;
	private header!: HTMLElement;
	private body!: HTMLElement;

	protected _expanded: boolean;
	protected _orientation: Orientation;

	private expandedSize: number | undefined = undefined;
	private _headerVisible = true;
	private _collapsible = true;
	private _bodyRendered = false;
	private _minimumBodySize: number;
	private _maximumBodySize: number;
	private _ariaHeaderLabel: string;
	private styles: IPaneStyles = {
		dropBackground: undefined,
		headerBackground: undefined,
		headerBorder: undefined,
		headerForeground: undefined,
		leftBorder: undefined
	};
	private animationTimer: number | undefined = undefined;

	private readonly _onDidChange = this._register(new Emitter<number | undefined>());
	readonly onDidChange: Event<number | undefined> = this._onDidChange.event;

	private readonly _onDidChangeExpansionState = this._register(new Emitter<boolean>());
	readonly onDidChangeExpansionState: Event<boolean> = this._onDidChangeExpansionState.event;

	get ariaHeaderLabel(): string {
		return this._ariaHeaderLabel;
	}

	set ariaHeaderLabel(newLabel: string) {
		this._ariaHeaderLabel = newLabel;
		this.header.setAttribute('aria-label', this.ariaHeaderLabel);
	}

	get draggableElement(): HTMLElement {
		return this.header;
	}

	get dropTargetElement(): HTMLElement {
		return this.element;
	}

	get dropBackground(): string | undefined {
		return this.styles.dropBackground;
	}

	get minimumBodySize(): number {
		return this._minimumBodySize;
	}

	set minimumBodySize(size: number) {
		this._minimumBodySize = size;
		this._onDidChange.fire(undefined);
	}

	get maximumBodySize(): number {
		return this._maximumBodySize;
	}

	set maximumBodySize(size: number) {
		this._maximumBodySize = size;
		this._onDidChange.fire(undefined);
	}

	private get headerSize(): number {
		return this.headerVisible ? Pane.HEADER_SIZE : 0;
	}

	get minimumSize(): number {
		const headerSize = this.headerSize;
		const expanded = !this.headerVisible || this.isExpanded();
		const minimumBodySize = expanded ? this.minimumBodySize : 0;

		return headerSize + minimumBodySize;
	}

	get maximumSize(): number {
		const headerSize = this.headerSize;
		const expanded = !this.headerVisible || this.isExpanded();
		const maximumBodySize = expanded ? this.maximumBodySize : 0;

		return headerSize + maximumBodySize;
	}

	orthogonalSize: number = 0;

	constructor(options: IPaneOptions) {
		super();
		this._expanded = typeof options.expanded === 'undefined' ? true : !!options.expanded;
		this._orientation = typeof options.orientation === 'undefined' ? Orientation.VERTICAL : options.orientation;
		this._ariaHeaderLabel = localize('viewSection', "{0} Section", options.title);
		this._minimumBodySize = typeof options.minimumBodySize === 'number' ? options.minimumBodySize : this._orientation === Orientation.HORIZONTAL ? 200 : 120;
		this._maximumBodySize = typeof options.maximumBodySize === 'number' ? options.maximumBodySize : Number.POSITIVE_INFINITY;

		this.element = $('.pane');
	}

	isExpanded(): boolean {
		return this._expanded;
	}

	setExpanded(expanded: boolean): boolean {
		if (!expanded && !this.collapsible) {
			return false;
		}

		if (this._expanded === !!expanded) {
			return false;
		}

		this.element?.classList.toggle('expanded', expanded);

		this._expanded = !!expanded;
		this.updateHeader();

		if (expanded) {
			if (!this._bodyRendered) {
				this.renderBody(this.body);
				this._bodyRendered = true;
			}

			if (typeof this.animationTimer === 'number') {
				getWindow(this.element).clearTimeout(this.animationTimer);
			}
			append(this.element, this.body);
		} else {
			this.animationTimer = getWindow(this.element).setTimeout(() => {
				this.body.remove();
			}, 200);
		}

		this._onDidChangeExpansionState.fire(expanded);
		this._onDidChange.fire(expanded ? this.expandedSize : undefined);
		return true;
	}

	get headerVisible(): boolean {
		return this._headerVisible;
	}

	set headerVisible(visible: boolean) {
		if (this._headerVisible === !!visible) {
			return;
		}

		this._headerVisible = !!visible;
		this.updateHeader();
		this._onDidChange.fire(undefined);
	}

	get collapsible(): boolean {
		return this._collapsible;
	}

	set collapsible(collapsible: boolean) {
		if (this._collapsible === !!collapsible) {
			return;
		}

		this._collapsible = !!collapsible;
		this.updateHeader();
	}

	get orientation(): Orientation {
		return this._orientation;
	}

	set orientation(orientation: Orientation) {
		if (this._orientation === orientation) {
			return;
		}

		this._orientation = orientation;

		if (this.element) {
			this.element.classList.toggle('horizontal', this.orientation === Orientation.HORIZONTAL);
			this.element.classList.toggle('vertical', this.orientation === Orientation.VERTICAL);
		}

		if (this.header) {
			this.updateHeader();
		}
	}

	render(): void {
		this.element.classList.toggle('expanded', this.isExpanded());
		this.element.classList.toggle('horizontal', this.orientation === Orientation.HORIZONTAL);
		this.element.classList.toggle('vertical', this.orientation === Orientation.VERTICAL);

		this.header = $('.pane-header');
		append(this.element, this.header);
		this.header.setAttribute('tabindex', '0');
		// Use role button so the aria-expanded state gets read https://github.com/microsoft/vscode/issues/95996
		this.header.setAttribute('role', 'button');
		this.header.setAttribute('aria-label', this.ariaHeaderLabel);
		this.renderHeader(this.header);

		const focusTracker = trackFocus(this.header);
		this._register(focusTracker);
		this._register(focusTracker.onDidFocus(() => this.header.classList.add('focused'), null));
		this._register(focusTracker.onDidBlur(() => this.header.classList.remove('focused'), null));

		this.updateHeader();

		const eventDisposables = this._register(new DisposableStore());
		const onKeyDown = this._register(new DomEmitter(this.header, 'keydown'));
		const onHeaderKeyDown = Event.map(onKeyDown.event, e => new StandardKeyboardEvent(e), eventDisposables);

		this._register(Event.filter(onHeaderKeyDown, e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space, eventDisposables)(() => this.setExpanded(!this.isExpanded()), null));

		this._register(Event.filter(onHeaderKeyDown, e => e.keyCode === KeyCode.LeftArrow, eventDisposables)(() => this.setExpanded(false), null));

		this._register(Event.filter(onHeaderKeyDown, e => e.keyCode === KeyCode.RightArrow, eventDisposables)(() => this.setExpanded(true), null));

		this._register(Gesture.addTarget(this.header));

		[EventType.CLICK, TouchEventType.Tap].forEach(eventType => {
			this._register(addDisposableListener(this.header, eventType, e => {
				if (!e.defaultPrevented) {
					this.setExpanded(!this.isExpanded());
				}
			}));
		});

		this.body = append(this.element, $('.pane-body'));

		// Only render the body if it will be visible
		// Otherwise, render it when the pane is expanded
		if (!this._bodyRendered && this.isExpanded()) {
			this.renderBody(this.body);
			this._bodyRendered = true;
		}

		if (!this.isExpanded()) {
			this.body.remove();
		}
	}

	layout(size: number): void {
		const headerSize = this.headerVisible ? Pane.HEADER_SIZE : 0;

		const width = this._orientation === Orientation.VERTICAL ? this.orthogonalSize : size;
		const height = this._orientation === Orientation.VERTICAL ? size - headerSize : this.orthogonalSize - headerSize;

		if (this.isExpanded()) {
			this.body.classList.toggle('wide', width >= 600);
			this.layoutBody(height, width);
			this.expandedSize = size;
		}
	}

	style(styles: IPaneStyles): void {
		this.styles = styles;

		if (!this.header) {
			return;
		}

		this.updateHeader();
	}

	protected updateHeader(): void {
		const expanded = !this.headerVisible || this.isExpanded();

		if (this.collapsible) {
			this.header.setAttribute('tabindex', '0');
			this.header.setAttribute('role', 'button');
		} else {
			this.header.removeAttribute('tabindex');
			this.header.removeAttribute('role');
		}

		this.header.style.lineHeight = `${this.headerSize}px`;
		this.header.classList.toggle('hidden', !this.headerVisible);
		this.header.classList.toggle('expanded', expanded);
		this.header.classList.toggle('not-collapsible', !this.collapsible);
		this.header.setAttribute('aria-expanded', String(expanded));

		this.header.style.color = this.collapsible ? this.styles.headerForeground ?? '' : '';
		this.header.style.backgroundColor = (this.collapsible ? this.styles.headerBackground : 'transparent') ?? '';
		this.header.style.borderTop = this.styles.headerBorder && this.orientation === Orientation.VERTICAL ? `1px solid ${this.styles.headerBorder}` : '';
		this.element.style.borderLeft = this.styles.leftBorder && this.orientation === Orientation.HORIZONTAL ? `1px solid ${this.styles.leftBorder}` : '';
	}

	protected abstract renderHeader(container: HTMLElement): void;
	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(height: number, width: number): void;
}

interface IDndContext {
	draggable: PaneDraggable | null;
}

class PaneDraggable extends Disposable {

	private static readonly DefaultDragOverBackgroundColor = new Color(new RGBA(128, 128, 128, 0.5));

	private dragOverCounter = 0; // see https://github.com/microsoft/vscode/issues/14470

	private _onDidDrop = this._register(new Emitter<{ from: Pane; to: Pane }>());
	readonly onDidDrop = this._onDidDrop.event;

	constructor(private pane: Pane, private dnd: IPaneDndController, private context: IDndContext) {
		super();

		pane.draggableElement.draggable = true;
		this._register(addDisposableListener(pane.draggableElement, 'dragstart', e => this.onDragStart(e)));
		this._register(addDisposableListener(pane.dropTargetElement, 'dragenter', e => this.onDragEnter(e)));
		this._register(addDisposableListener(pane.dropTargetElement, 'dragleave', e => this.onDragLeave(e)));
		this._register(addDisposableListener(pane.dropTargetElement, 'dragend', e => this.onDragEnd(e)));
		this._register(addDisposableListener(pane.dropTargetElement, 'drop', e => this.onDrop(e)));
	}

	private onDragStart(e: DragEvent): void {
		if (!this.dnd.canDrag(this.pane) || !e.dataTransfer) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		e.dataTransfer.effectAllowed = 'move';

		if (isFirefox) {
			// Firefox: requires to set a text data transfer to get going
			e.dataTransfer?.setData(DataTransfers.TEXT, this.pane.draggableElement.textContent || '');
		}

		const dragImage = append(this.pane.element.ownerDocument.body, $('.monaco-drag-image', {}, this.pane.draggableElement.textContent || ''));
		e.dataTransfer.setDragImage(dragImage, -10, -10);
		setTimeout(() => dragImage.remove(), 0);

		this.context.draggable = this;
	}

	private onDragEnter(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
			return;
		}

		this.dragOverCounter++;
		this.render();
	}

	private onDragLeave(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		if (!this.dnd.canDrop(this.context.draggable.pane, this.pane)) {
			return;
		}

		this.dragOverCounter--;

		if (this.dragOverCounter === 0) {
			this.render();
		}
	}

	private onDragEnd(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.render();
		this.context.draggable = null;
	}

	private onDrop(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		EventHelper.stop(e);

		this.dragOverCounter = 0;
		this.render();

		if (this.dnd.canDrop(this.context.draggable.pane, this.pane) && this.context.draggable !== this) {
			this._onDidDrop.fire({ from: this.context.draggable.pane, to: this.pane });
		}

		this.context.draggable = null;
	}

	private render(): void {
		let backgroundColor: string | null = null;

		if (this.dragOverCounter > 0) {
			backgroundColor = this.pane.dropBackground ?? PaneDraggable.DefaultDragOverBackgroundColor.toString();
		}

		this.pane.dropTargetElement.style.backgroundColor = backgroundColor || '';
	}
}

export interface IPaneDndController {
	canDrag(pane: Pane): boolean;
	canDrop(pane: Pane, overPane: Pane): boolean;
}

export class DefaultPaneDndController implements IPaneDndController {

	canDrag(pane: Pane): boolean {
		return true;
	}

	canDrop(pane: Pane, overPane: Pane): boolean {
		return true;
	}
}

export interface IPaneViewOptions {
	dnd?: IPaneDndController;
	orientation?: Orientation;
}

interface IPaneItem {
	pane: Pane;
	disposable: IDisposable;
}

export class PaneView extends Disposable {

	private dnd: IPaneDndController | undefined;
	private dndContext: IDndContext = { draggable: null };
	readonly element: HTMLElement;
	private paneItems: IPaneItem[] = [];
	private orthogonalSize: number = 0;
	private size: number = 0;
	private splitview: SplitView;
	private animationTimer: number | undefined = undefined;

	private _onDidDrop = this._register(new Emitter<{ from: Pane; to: Pane }>());
	readonly onDidDrop: Event<{ from: Pane; to: Pane }> = this._onDidDrop.event;

	orientation: Orientation;
	private boundarySashes: IBoundarySashes | undefined;
	readonly onDidSashChange: Event<number>;
	readonly onDidSashReset: Event<number>;
	readonly onDidScroll: Event<ScrollEvent>;

	constructor(container: HTMLElement, options: IPaneViewOptions = {}) {
		super();

		this.dnd = options.dnd;
		this.orientation = options.orientation ?? Orientation.VERTICAL;
		this.element = append(container, $('.monaco-pane-view'));
		this.splitview = this._register(new SplitView(this.element, { orientation: this.orientation }));
		this.onDidSashReset = this.splitview.onDidSashReset;
		this.onDidSashChange = this.splitview.onDidSashChange;
		this.onDidScroll = this.splitview.onDidScroll;

		const eventDisposables = this._register(new DisposableStore());
		const onKeyDown = this._register(new DomEmitter(this.element, 'keydown'));
		const onHeaderKeyDown = Event.map(Event.filter(onKeyDown.event, e => isHTMLElement(e.target) && e.target.classList.contains('pane-header'), eventDisposables), e => new StandardKeyboardEvent(e), eventDisposables);

		this._register(Event.filter(onHeaderKeyDown, e => e.keyCode === KeyCode.UpArrow, eventDisposables)(() => this.focusPrevious()));
		this._register(Event.filter(onHeaderKeyDown, e => e.keyCode === KeyCode.DownArrow, eventDisposables)(() => this.focusNext()));
	}

	addPane(pane: Pane, size: number, index = this.splitview.length): void {
		const disposables = new DisposableStore();
		pane.onDidChangeExpansionState(this.setupAnimation, this, disposables);

		const paneItem = { pane: pane, disposable: disposables };
		this.paneItems.splice(index, 0, paneItem);
		pane.orientation = this.orientation;
		pane.orthogonalSize = this.orthogonalSize;
		this.splitview.addView(pane, size, index);

		if (this.dnd) {
			const draggable = new PaneDraggable(pane, this.dnd, this.dndContext);
			disposables.add(draggable);
			disposables.add(draggable.onDidDrop(this._onDidDrop.fire, this._onDidDrop));
		}
	}

	removePane(pane: Pane): void {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			return;
		}

		this.splitview.removeView(index, pane.isExpanded() ? Sizing.Distribute : undefined);
		const paneItem = this.paneItems.splice(index, 1)[0];
		paneItem.disposable.dispose();
	}

	movePane(from: Pane, to: Pane): void {
		const fromIndex = this.paneItems.findIndex(item => item.pane === from);
		const toIndex = this.paneItems.findIndex(item => item.pane === to);

		if (fromIndex === -1 || toIndex === -1) {
			return;
		}

		const [paneItem] = this.paneItems.splice(fromIndex, 1);
		this.paneItems.splice(toIndex, 0, paneItem);

		this.splitview.moveView(fromIndex, toIndex);
	}

	resizePane(pane: Pane, size: number): void {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			return;
		}

		this.splitview.resizeView(index, size);
	}

	getPaneSize(pane: Pane): number {
		const index = this.paneItems.findIndex(item => item.pane === pane);

		if (index === -1) {
			return -1;
		}

		return this.splitview.getViewSize(index);
	}

	layout(height: number, width: number): void {
		this.orthogonalSize = this.orientation === Orientation.VERTICAL ? width : height;
		this.size = this.orientation === Orientation.HORIZONTAL ? width : height;

		for (const paneItem of this.paneItems) {
			paneItem.pane.orthogonalSize = this.orthogonalSize;
		}

		this.splitview.layout(this.size);
	}

	setBoundarySashes(sashes: IBoundarySashes) {
		this.boundarySashes = sashes;
		this.updateSplitviewOrthogonalSashes(sashes);
	}

	private updateSplitviewOrthogonalSashes(sashes: IBoundarySashes | undefined) {
		if (this.orientation === Orientation.VERTICAL) {
			this.splitview.orthogonalStartSash = sashes?.left;
			this.splitview.orthogonalEndSash = sashes?.right;
		} else {
			this.splitview.orthogonalEndSash = sashes?.bottom;
		}
	}

	flipOrientation(height: number, width: number): void {
		this.orientation = this.orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
		const paneSizes = this.paneItems.map(pane => this.getPaneSize(pane.pane));

		this.splitview.dispose();
		clearNode(this.element);

		this.splitview = this._register(new SplitView(this.element, { orientation: this.orientation }));
		this.updateSplitviewOrthogonalSashes(this.boundarySashes);

		const newOrthogonalSize = this.orientation === Orientation.VERTICAL ? width : height;
		const newSize = this.orientation === Orientation.HORIZONTAL ? width : height;

		this.paneItems.forEach((pane, index) => {
			pane.pane.orthogonalSize = newOrthogonalSize;
			pane.pane.orientation = this.orientation;

			const viewSize = this.size === 0 ? 0 : (newSize * paneSizes[index]) / this.size;
			this.splitview.addView(pane.pane, viewSize, index);
		});

		this.size = newSize;
		this.orthogonalSize = newOrthogonalSize;

		this.splitview.layout(this.size);
	}

	private setupAnimation(): void {
		if (typeof this.animationTimer === 'number') {
			getWindow(this.element).clearTimeout(this.animationTimer);
		}

		this.element.classList.add('animated');

		this.animationTimer = getWindow(this.element).setTimeout(() => {
			this.animationTimer = undefined;
			this.element.classList.remove('animated');
		}, 200);
	}

	private getPaneHeaderElements(): HTMLElement[] {
		return [...this.element.querySelectorAll('.pane-header')] as HTMLElement[];
	}

	private focusPrevious(): void {
		const headers = this.getPaneHeaderElements();
		const index = headers.indexOf(this.element.ownerDocument.activeElement as HTMLElement);

		if (index === -1) {
			return;
		}

		headers[Math.max(index - 1, 0)].focus();
	}

	private focusNext(): void {
		const headers = this.getPaneHeaderElements();
		const index = headers.indexOf(this.element.ownerDocument.activeElement as HTMLElement);

		if (index === -1) {
			return;
		}

		headers[Math.min(index + 1, headers.length - 1)].focus();
	}

	override dispose(): void {
		super.dispose();

		this.paneItems.forEach(i => i.disposable.dispose());
	}
}
