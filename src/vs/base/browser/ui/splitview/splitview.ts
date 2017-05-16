/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import lifecycle = require('vs/base/common/lifecycle');
import ee = require('vs/base/common/eventEmitter');
import types = require('vs/base/common/types');
import objects = require('vs/base/common/objects');
import dom = require('vs/base/browser/dom');
import numbers = require('vs/base/common/numbers');
import sash = require('vs/base/browser/ui/sash/sash');
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import Event, { Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';

export enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export enum ViewSizing {
	Flexible,
	Fixed
}

export interface IOptions {
	orientation?: Orientation; // default Orientation.VERTICAL
}

export interface ISashEvent {
	start: number;
	current: number;
}

export interface IViewOptions {
	sizing?: ViewSizing;
	fixedSize?: number;
	minimumSize?: number;
}

export interface IView extends ee.IEventEmitter {
	size: number;
	sizing: ViewSizing;
	fixedSize: number;
	minimumSize: number;
	maximumSize: number;
	render(container: HTMLElement, orientation: Orientation): void;
	layout(size: number, orientation: Orientation): void;
	focus(): void;
}

interface IState {
	start?: number;
	sizes?: number[];
	up?: number[];
	down?: number[];
	maxUp?: number;
	maxDown?: number;
	collapses: number[];
	expands: number[];
}

export abstract class View extends ee.EventEmitter implements IView {

	size: number;
	protected _sizing: ViewSizing;
	protected _fixedSize: number;
	protected _minimumSize: number;

	constructor(opts: IViewOptions) {
		super();

		this.size = 0;
		this._sizing = types.isUndefined(opts.sizing) ? ViewSizing.Flexible : opts.sizing;
		this._fixedSize = types.isUndefined(opts.fixedSize) ? 22 : opts.fixedSize;
		this._minimumSize = types.isUndefined(opts.minimumSize) ? 22 : opts.minimumSize;
	}

	get sizing(): ViewSizing { return this._sizing; }
	get fixedSize(): number { return this._fixedSize; }
	get minimumSize(): number { return this.sizing === ViewSizing.Fixed ? this.fixedSize : this._minimumSize; }
	get maximumSize(): number { return this.sizing === ViewSizing.Fixed ? this.fixedSize : Number.POSITIVE_INFINITY; }

	protected setFlexible(size?: number): void {
		this._sizing = ViewSizing.Flexible;
		this.emit('change', types.isUndefined(size) ? this._minimumSize : size);
	}

	protected setFixed(size?: number): void {
		this._sizing = ViewSizing.Fixed;
		this._fixedSize = types.isUndefined(size) ? this._fixedSize : size;
		this.emit('change', this._fixedSize);
	}

	abstract render(container: HTMLElement, orientation: Orientation): void;
	abstract focus(): void;
	abstract layout(size: number, orientation: Orientation): void;
}

export interface IHeaderViewOptions extends IHeaderViewStyles {
	headerSize?: number;
}

export interface IHeaderViewStyles {
	headerBackground?: Color;
	headerHighContrastBorder?: Color;
}

const headerDefaultOpts = {
	headerBackground: Color.fromHex('#808080').transparent(0.2)
};

export abstract class HeaderView extends View {

	protected headerSize: number;
	protected header: HTMLElement;
	protected body: HTMLElement;

	private headerBackground: Color;
	private headerHighContrastBorder;

	constructor(opts: IHeaderViewOptions) {
		super(opts);

		this.headerSize = types.isUndefined(opts.headerSize) ? 22 : opts.headerSize;

		this.headerBackground = opts.headerBackground || headerDefaultOpts.headerBackground;
		this.headerHighContrastBorder = opts.headerHighContrastBorder;
	}

	style(styles: IHeaderViewStyles): void {
		this.headerBackground = styles.headerBackground;
		this.headerHighContrastBorder = styles.headerHighContrastBorder;

		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.header) {
			const headerBackgroundColor = this.headerBackground ? this.headerBackground.toString() : null;
			const headerHighContrastBorderColor = this.headerHighContrastBorder ? this.headerHighContrastBorder.toString() : null;

			this.header.style.backgroundColor = headerBackgroundColor;
			this.header.style.borderTop = headerHighContrastBorderColor ? `1px solid ${headerHighContrastBorderColor}` : null;
		}
	}

	render(container: HTMLElement, orientation: Orientation): void {
		this.header = document.createElement('div');
		this.header.className = 'header';

		let headerSize = this.headerSize + 'px';

		if (orientation === Orientation.HORIZONTAL) {
			this.header.style.width = headerSize;
		} else {
			this.header.style.height = headerSize;
		}

		if (this.headerSize > 0) {
			this.renderHeader(this.header);
			container.appendChild(this.header);
		}

		this.body = document.createElement('div');
		this.body.className = 'body';

		this.layoutBodyContainer(orientation);
		this.renderBody(this.body);
		container.appendChild(this.body);

		this.applyStyles();
	}

	layout(size: number, orientation: Orientation): void {
		this.layoutBodyContainer(orientation);
		this.layoutBody(size - this.headerSize);
	}

	private layoutBodyContainer(orientation: Orientation): void {
		let size = `calc(100% - ${this.headerSize}px)`;

		if (orientation === Orientation.HORIZONTAL) {
			this.body.style.width = size;
		} else {
			this.body.style.height = size;
		}
	}

	dispose(): void {
		this.header = null;
		this.body = null;

		super.dispose();
	}

	protected abstract renderHeader(container: HTMLElement): void;
	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(size: number): void;
}

export interface ICollapsibleViewOptions {
	ariaHeaderLabel?: string;
	fixedSize?: number;
	minimumSize?: number;
	headerSize?: number;
	initialState?: CollapsibleState;
}

export enum CollapsibleState {
	EXPANDED,
	COLLAPSED
}

export abstract class AbstractCollapsibleView extends HeaderView {

	protected state: CollapsibleState;

	private ariaHeaderLabel: string;
	private headerClickListener: lifecycle.IDisposable;
	private headerKeyListener: lifecycle.IDisposable;
	private focusTracker: dom.IFocusTracker;

	constructor(opts: ICollapsibleViewOptions) {
		super(opts);

		this.ariaHeaderLabel = opts && opts.ariaHeaderLabel;
		this.changeState(types.isUndefined(opts.initialState) ? CollapsibleState.EXPANDED : opts.initialState);
	}

	render(container: HTMLElement, orientation: Orientation): void {
		super.render(container, orientation);

		dom.addClass(this.header, 'collapsible');
		dom.addClass(this.body, 'collapsible');

		// Keyboard access
		this.header.setAttribute('tabindex', '0');
		this.header.setAttribute('role', 'toolbar');
		if (this.ariaHeaderLabel) {
			this.header.setAttribute('aria-label', this.ariaHeaderLabel);
		}
		this.header.setAttribute('aria-expanded', String(this.state === CollapsibleState.EXPANDED));
		this.headerKeyListener = dom.addDisposableListener(this.header, dom.EventType.KEY_DOWN, (e) => {
			let event = new StandardKeyboardEvent(e);
			let eventHandled = false;
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space) || (event.equals(KeyCode.LeftArrow) && this.state === CollapsibleState.EXPANDED) || (event.equals(KeyCode.RightArrow) && this.state === CollapsibleState.COLLAPSED)) {
				this.toggleExpansion();
				eventHandled = true;
			} else if (event.equals(KeyCode.Escape)) {
				this.header.blur();
				eventHandled = true;
			} else if (event.equals(KeyCode.UpArrow)) {
				this.emit('focusPrevious');
				eventHandled = true;
			} else if (event.equals(KeyCode.DownArrow)) {
				this.emit('focusNext');
				eventHandled = true;
			}

			if (eventHandled) {
				dom.EventHelper.stop(event, true);
			}
		});

		// Mouse access
		this.headerClickListener = dom.addDisposableListener(this.header, dom.EventType.CLICK, () => this.toggleExpansion());

		// Track state of focus in header so that other components can adjust styles based on that
		// (for example show or hide actions based on the state of being focused or not)
		this.focusTracker = dom.trackFocus(this.header);
		this.focusTracker.addFocusListener(() => {
			dom.addClass(this.header, 'focused');
		});

		this.focusTracker.addBlurListener(() => {
			dom.removeClass(this.header, 'focused');
		});
	}

	focus(): void {
		if (this.header) {
			this.header.focus();
		}
	}

	layout(size: number, orientation: Orientation): void {
		this.layoutHeader();
		super.layout(size, orientation);
	}

	isExpanded(): boolean {
		return this.state === CollapsibleState.EXPANDED;
	}

	expand(): void {
		if (this.isExpanded()) {
			return;
		}

		this.changeState(CollapsibleState.EXPANDED);
	}

	collapse(): void {
		if (!this.isExpanded()) {
			return;
		}

		this.changeState(CollapsibleState.COLLAPSED);
	}

	toggleExpansion(): void {
		if (this.isExpanded()) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	private layoutHeader(): void {
		if (!this.header) {
			return;
		}

		if (this.state === CollapsibleState.COLLAPSED) {
			dom.addClass(this.header, 'collapsed');
		} else {
			dom.removeClass(this.header, 'collapsed');
		}
	}

	protected changeState(state: CollapsibleState): void {
		this.state = state;

		if (this.header) {
			this.header.setAttribute('aria-expanded', String(this.state === CollapsibleState.EXPANDED));
		}

		this.layoutHeader();
	}

	dispose(): void {
		if (this.headerClickListener) {
			this.headerClickListener.dispose();
			this.headerClickListener = null;
		}

		if (this.headerKeyListener) {
			this.headerKeyListener.dispose();
			this.headerKeyListener = null;
		}

		if (this.focusTracker) {
			this.focusTracker.dispose();
			this.focusTracker = null;
		}

		super.dispose();
	}
}

export abstract class CollapsibleView extends AbstractCollapsibleView {

	private previousSize: number;

	constructor(opts: ICollapsibleViewOptions) {
		super(opts);
		this.previousSize = null;
	}

	protected changeState(state: CollapsibleState): void {
		super.changeState(state);

		if (state === CollapsibleState.EXPANDED) {
			this.setFlexible(this.previousSize || this._minimumSize);
		} else {
			this.previousSize = this.size;
			this.setFixed();
		}
	}
}

export interface IFixedCollapsibleViewOptions extends ICollapsibleViewOptions {
	expandedBodySize?: number;
}

export abstract class FixedCollapsibleView extends AbstractCollapsibleView {

	private _expandedBodySize: number;

	constructor(opts: IFixedCollapsibleViewOptions) {
		super(objects.mixin({ sizing: ViewSizing.Fixed }, opts));
		this._expandedBodySize = types.isUndefined(opts.expandedBodySize) ? 22 : opts.expandedBodySize;
	}

	get fixedSize(): number { return this.state === CollapsibleState.EXPANDED ? this.expandedSize : this.headerSize; }
	private get expandedSize(): number { return this.expandedBodySize + this.headerSize; }

	get expandedBodySize(): number { return this._expandedBodySize; }
	set expandedBodySize(size: number) {
		this._expandedBodySize = size;
		this.setFixed(this.fixedSize);
	}

	protected changeState(state: CollapsibleState): void {
		super.changeState(state);
		this.setFixed(this.fixedSize);
	}
}

class PlainView extends View {
	render() { }
	focus() { }
	layout() { }
}

class DeadView extends PlainView {

	constructor(view: IView) {
		super({ sizing: ViewSizing.Fixed, fixedSize: 0 });
		this.size = view.size;
	}
}

class VoidView extends PlainView {

	constructor() {
		super({ sizing: ViewSizing.Fixed, minimumSize: 0, fixedSize: 0 });
	}

	setFlexible(size?: number): void {
		super.setFlexible(size);
	}

	setFixed(size?: number): void {
		super.setFixed(size);
	}
}

function sum(arr: number[]): number {
	return arr.reduce((a, b) => a + b);
}

export class SplitView implements
	sash.IHorizontalSashLayoutProvider,
	sash.IVerticalSashLayoutProvider {
	private orientation: Orientation;
	private el: HTMLElement;
	private size: number;
	private viewElements: HTMLElement[];
	private views: IView[];
	private viewChangeListeners: lifecycle.IDisposable[];
	private viewFocusPreviousListeners: lifecycle.IDisposable[];
	private viewFocusNextListeners: lifecycle.IDisposable[];
	private viewFocusListeners: lifecycle.IDisposable[];
	private initialWeights: number[];
	private sashOrientation: sash.Orientation;
	private sashes: sash.Sash[];
	private sashesListeners: lifecycle.IDisposable[];
	private measureContainerSize: () => number;
	private layoutViewElement: (viewElement: HTMLElement, size: number) => void;
	private eventWrapper: (event: sash.ISashEvent) => ISashEvent;
	private animationTimeout: number;
	private _onFocus: Emitter<IView>;
	private state: IState;

	constructor(container: HTMLElement, options?: IOptions) {
		options = options || {};

		this.orientation = types.isUndefined(options.orientation) ? Orientation.VERTICAL : options.orientation;

		this.el = document.createElement('div');
		dom.addClass(this.el, 'monaco-split-view');
		dom.addClass(this.el, this.orientation === Orientation.VERTICAL ? 'vertical' : 'horizontal');
		container.appendChild(this.el);

		this.size = null;
		this.viewElements = [];
		this.views = [];
		this.viewChangeListeners = [];
		this.viewFocusPreviousListeners = [];
		this.viewFocusNextListeners = [];
		this.viewFocusListeners = [];
		this.initialWeights = [];
		this.sashes = [];
		this.sashesListeners = [];
		this.animationTimeout = null;
		this._onFocus = new Emitter<IView>();

		this.sashOrientation = this.orientation === Orientation.VERTICAL
			? sash.Orientation.HORIZONTAL
			: sash.Orientation.VERTICAL;

		if (this.orientation === Orientation.VERTICAL) {
			this.measureContainerSize = () => dom.getContentHeight(container);
			this.layoutViewElement = (viewElement, size) => viewElement.style.height = size + 'px';
			this.eventWrapper = e => { return { start: e.startY, current: e.currentY }; };
		} else {
			this.measureContainerSize = () => dom.getContentWidth(container);
			this.layoutViewElement = (viewElement, size) => viewElement.style.width = size + 'px';
			this.eventWrapper = e => { return { start: e.startX, current: e.currentX }; };
		}

		// The void space exists to handle the case where all other views are fixed size
		this.addView(new VoidView(), 1, 0);
	}

	get onFocus(): Event<IView> {
		return this._onFocus.event;
	}

	addView(view: IView, initialWeight: number = 1, index = this.views.length - 1): void {
		if (initialWeight <= 0) {
			throw new Error('Initial weight must be a positive number.');
		}

		let viewCount = this.views.length;

		// Create view container
		let viewElement = document.createElement('div');
		dom.addClass(viewElement, 'split-view-view');
		this.viewElements.splice(index, 0, viewElement);

		// Create view
		view.render(viewElement, this.orientation);
		this.views.splice(index, 0, view);

		// Initial weight
		this.initialWeights.splice(index, 0, initialWeight);

		// Render view
		if (index === viewCount) {
			this.el.appendChild(viewElement);
		} else {
			this.el.insertBefore(viewElement, this.el.children.item(index));
		}

		// Add sash
		if (this.views.length > 2) {
			let s = new sash.Sash(this.el, this, { orientation: this.sashOrientation });
			this.sashes.splice(index - 1, 0, s);
			this.sashesListeners.push(s.addListener('start', e => this.onSashStart(s, this.eventWrapper(e))));
			this.sashesListeners.push(s.addListener('change', e => this.onSashChange(s, this.eventWrapper(e))));
		}

		this.viewChangeListeners.splice(index, 0, view.addListener('change', size => this.onViewChange(view, size)));
		this.onViewChange(view, view.minimumSize);

		let viewFocusTracker = dom.trackFocus(viewElement);
		this.viewFocusListeners.splice(index, 0, viewFocusTracker);
		viewFocusTracker.addFocusListener(() => this._onFocus.fire(view));

		this.viewFocusPreviousListeners.splice(index, 0, view.addListener('focusPrevious', () => index > 0 && this.views[index - 1].focus()));
		this.viewFocusNextListeners.splice(index, 0, view.addListener('focusNext', () => index < this.views.length && this.views[index + 1].focus()));
	}

	removeView(view: IView): void {
		let index = this.views.indexOf(view);

		if (index < 0) {
			return;
		}

		let deadView = new DeadView(view);
		this.views[index] = deadView;
		this.onViewChange(deadView, 0);

		let sashIndex = Math.max(index - 1, 0);
		this.sashes[sashIndex].dispose();
		this.sashes.splice(sashIndex, 1);

		this.viewChangeListeners[index].dispose();
		this.viewChangeListeners.splice(index, 1);

		this.viewFocusPreviousListeners[index].dispose();
		this.viewFocusPreviousListeners.splice(index, 1);

		this.viewFocusListeners[index].dispose();
		this.viewFocusListeners.splice(index, 1);

		this.viewFocusNextListeners[index].dispose();
		this.viewFocusNextListeners.splice(index, 1);

		this.views.splice(index, 1);
		this.el.removeChild(this.viewElements[index]);
		this.viewElements.splice(index, 1);

		deadView.dispose();
		view.dispose();
	}

	layout(size?: number): void {
		size = size || this.measureContainerSize();

		if (this.size === null) {
			this.size = size;
			this.initialLayout();
			return;
		}

		size = Math.max(size, this.views.reduce((t, v) => t + v.minimumSize, 0));

		let diff = Math.abs(this.size - size);
		let up = numbers.countToArray(this.views.length - 1, -1);

		let collapses = this.views.map(v => v.size - v.minimumSize);
		let expands = this.views.map(v => v.maximumSize - v.size);

		if (size < this.size) {
			this.expandCollapse(Math.min(diff, sum(collapses)), collapses, expands, up, []);
		} else if (size > this.size) {
			this.expandCollapse(Math.min(diff, sum(expands)), collapses, expands, [], up);
		}

		this.size = size;
		this.layoutViews();
	}

	private onSashStart(sash: sash.Sash, event: ISashEvent): void {
		let i = this.sashes.indexOf(sash);
		let collapses = this.views.map(v => v.size - v.minimumSize);
		let expands = this.views.map(v => v.maximumSize - v.size);

		let up = numbers.countToArray(i, -1);
		let down = numbers.countToArray(i + 1, this.views.length);

		let collapsesUp = up.map(i => collapses[i]);
		let collapsesDown = down.map(i => collapses[i]);
		let expandsUp = up.map(i => expands[i]);
		let expandsDown = down.map(i => expands[i]);

		this.state = {
			start: event.start,
			sizes: this.views.map(v => v.size),
			up: up,
			down: down,
			maxUp: Math.min(sum(collapsesUp), sum(expandsDown)),
			maxDown: Math.min(sum(expandsUp), sum(collapsesDown)),
			collapses: collapses,
			expands: expands
		};
	}

	private onSashChange(sash: sash.Sash, event: ISashEvent): void {
		let diff = event.current - this.state.start;

		for (let i = 0; i < this.views.length; i++) {
			this.views[i].size = this.state.sizes[i];
		}

		if (diff < 0) {
			this.expandCollapse(Math.min(-diff, this.state.maxUp), this.state.collapses, this.state.expands, this.state.up, this.state.down);
		} else {
			this.expandCollapse(Math.min(diff, this.state.maxDown), this.state.collapses, this.state.expands, this.state.down, this.state.up);
		}

		this.layoutViews();
	}

	// Main algorithm
	private expandCollapse(collapse: number, collapses: number[], expands: number[], collapseIndexes: number[], expandIndexes: number[]): void {
		let totalCollapse = collapse;
		let totalExpand = totalCollapse;

		collapseIndexes.forEach(i => {
			let collapse = Math.min(collapses[i], totalCollapse);
			totalCollapse -= collapse;
			this.views[i].size -= collapse;
		});

		expandIndexes.forEach(i => {
			let expand = Math.min(expands[i], totalExpand);
			totalExpand -= expand;
			this.views[i].size += expand;
		});
	}

	private initialLayout(): void {
		let totalWeight = 0;
		let fixedSize = 0;

		this.views.forEach((v, i) => {
			if (v.sizing === ViewSizing.Flexible) {
				totalWeight += this.initialWeights[i];
			} else {
				fixedSize += v.fixedSize;
			}
		});

		let flexibleSize = this.size - fixedSize;

		this.views.forEach((v, i) => {
			if (v.sizing === ViewSizing.Flexible) {
				v.size = this.initialWeights[i] * flexibleSize / totalWeight;
			} else {
				v.size = v.fixedSize;
			}
		});

		// Leftover
		let index = this.getLastFlexibleViewIndex();
		if (index >= 0) {
			this.views[index].size += this.size - this.views.reduce((t, v) => t + v.size, 0);
		}

		// Layout
		this.layoutViews();
	}

	private getLastFlexibleViewIndex(exceptIndex: number = null): number {
		for (let i = this.views.length - 1; i >= 0; i--) {
			if (exceptIndex === i) {
				continue;
			}
			if (this.views[i].sizing === ViewSizing.Flexible) {
				return i;
			}
		}

		return -1;
	}

	private layoutViews(): void {
		for (let i = 0; i < this.views.length; i++) {
			// Layout the view elements
			this.layoutViewElement(this.viewElements[i], this.views[i].size);

			// Layout the views themselves
			this.views[i].layout(this.views[i].size, this.orientation);
		}

		// Layout the sashes
		this.sashes.forEach(s => s.layout());

		// Update sashes enablement
		let previous = false;
		let collapsesDown = this.views.map(v => previous = (v.size - v.minimumSize > 0) || previous);

		previous = false;
		let expandsDown = this.views.map(v => previous = (v.maximumSize - v.size > 0) || previous);

		let reverseViews = this.views.slice().reverse();
		previous = false;
		let collapsesUp = reverseViews.map(v => previous = (v.size - v.minimumSize > 0) || previous).reverse();

		previous = false;
		let expandsUp = reverseViews.map(v => previous = (v.maximumSize - v.size > 0) || previous).reverse();

		this.sashes.forEach((s, i) => {
			if ((collapsesDown[i] && expandsUp[i + 1]) || (expandsDown[i] && collapsesUp[i + 1])) {
				s.enable();
			} else {
				s.disable();
			}
		});
	}

	private onViewChange(view: IView, size: number): void {
		if (view !== this.voidView) {
			if (this.areAllViewsFixed()) {
				this.voidView.setFlexible();
			} else {
				this.voidView.setFixed();
			}
		}

		if (this.size === null) {
			return;
		}

		if (size === view.size) {
			return;
		}

		this.setupAnimation();

		let index = this.views.indexOf(view);
		let diff = Math.abs(size - view.size);
		let up = numbers.countToArray(index - 1, -1);
		let down = numbers.countToArray(index + 1, this.views.length);
		let downUp = down.concat(up);

		let collapses = this.views.map(v => Math.max(v.size - v.minimumSize, 0));
		let expands = this.views.map(v => Math.max(v.maximumSize - v.size, 0));

		let collapse: number, collapseIndexes: number[], expandIndexes: number[];

		if (size < view.size) {
			collapse = Math.min(downUp.reduce((t, i) => t + expands[i], 0), diff);
			collapseIndexes = [index];
			expandIndexes = downUp;

		} else {
			collapse = Math.min(downUp.reduce((t, i) => t + collapses[i], 0), diff);
			collapseIndexes = downUp;
			expandIndexes = [index];
		}

		this.expandCollapse(collapse, collapses, expands, collapseIndexes, expandIndexes);
		this.layoutViews();
	}

	private setupAnimation(): void {
		if (types.isNumber(this.animationTimeout)) {
			window.clearTimeout(this.animationTimeout);
		}

		dom.addClass(this.el, 'animated');
		this.animationTimeout = window.setTimeout(() => this.clearAnimation(), 200);
	}

	private clearAnimation(): void {
		this.animationTimeout = null;
		dom.removeClass(this.el, 'animated');
	}

	private get voidView(): VoidView {
		return this.views[this.views.length - 1] as VoidView;
	}

	private areAllViewsFixed(): boolean {
		return this.views.every((v, i) => v.sizing === ViewSizing.Fixed || i === this.views.length - 1);
	}

	getVerticalSashLeft(sash: sash.Sash): number {
		return this.getSashPosition(sash);
	}

	getHorizontalSashTop(sash: sash.Sash): number {
		return this.getSashPosition(sash);
	}

	private getSashPosition(sash: sash.Sash): number {
		let index = this.sashes.indexOf(sash);
		let position = 0;

		for (let i = 0; i <= index; i++) {
			position += this.views[i].size;
		}

		return position;
	}

	dispose(): void {
		if (types.isNumber(this.animationTimeout)) {
			window.clearTimeout(this.animationTimeout);
		}
		this.orientation = null;
		this.size = null;
		this.viewElements.forEach(e => this.el.removeChild(e));
		this.el = null;
		this.viewElements = [];
		this.views = lifecycle.dispose(this.views);
		this.sashes = lifecycle.dispose(this.sashes);
		this.sashesListeners = lifecycle.dispose(this.sashesListeners);
		this.measureContainerSize = null;
		this.layoutViewElement = null;
		this.eventWrapper = null;
		this.state = null;
	}
}
