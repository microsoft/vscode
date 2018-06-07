/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./sash';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { isIPad } from 'vs/base/browser/browser';
import { isMacintosh } from 'vs/base/common/platform';
import * as types from 'vs/base/common/types';
import { EventType, GestureEvent, Gesture } from 'vs/base/browser/touch';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Event, Emitter } from 'vs/base/common/event';
import { getElementsByTagName, EventHelper, createStyleSheet, addDisposableListener, Dimension, append, $, addClass, removeClass } from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';

export interface ISashLayoutProvider { }

export interface IVerticalSashLayoutProvider extends ISashLayoutProvider {
	getVerticalSashLeft(sash: Sash): number;
	getVerticalSashTop?(sash: Sash): number;
	getVerticalSashHeight?(sash: Sash): number;
}

export interface IHorizontalSashLayoutProvider extends ISashLayoutProvider {
	getHorizontalSashTop(sash: Sash): number;
	getHorizontalSashLeft?(sash: Sash): number;
	getHorizontalSashWidth?(sash: Sash): number;
}

export interface ISashEvent {
	startX: number;
	currentX: number;
	startY: number;
	currentY: number;
	altKey: boolean;
}

export interface ISashOptions {
	baseSize?: number;
	orientation?: Orientation;
}

export enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export class Sash {

	private el: HTMLElement;
	private layoutProvider: ISashLayoutProvider;
	private hidden: boolean;
	private orientation: Orientation;
	private size: number;
	private disposables: IDisposable[] = [];

	private _enabled = true;
	get enabled(): boolean { return this._enabled; }
	set enabled(enabled: boolean) {
		this._enabled = enabled;

		if (enabled) {
			removeClass(this.el, 'disabled');
		} else {
			addClass(this.el, 'disabled');
		}

		this._onDidEnablementChange.fire(enabled);
	}

	private readonly _onDidEnablementChange = new Emitter<boolean>();
	readonly onDidEnablementChange: Event<boolean> = this._onDidEnablementChange.event;

	private readonly _onDidStart = new Emitter<ISashEvent>();
	readonly onDidStart: Event<ISashEvent> = this._onDidStart.event;

	private readonly _onDidChange = new Emitter<ISashEvent>();
	readonly onDidChange: Event<ISashEvent> = this._onDidChange.event;

	private readonly _onDidReset = new Emitter<void>();
	readonly onDidReset: Event<void> = this._onDidReset.event;

	private readonly _onDidEnd = new Emitter<void>();
	readonly onDidEnd: Event<void> = this._onDidEnd.event;

	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions = {}) {
		this.el = append(container, $('.monaco-sash'));

		if (isMacintosh) {
			addClass(this.el, 'mac');
		}

		domEvent(this.el, 'mousedown')(this.onMouseDown, this, this.disposables);
		domEvent(this.el, 'dblclick')(this.onMouseDoubleClick, this, this.disposables);

		Gesture.addTarget(this.el);
		domEvent(this.el, EventType.Start)(this.onTouchStart, this, this.disposables);

		this.size = options.baseSize || 5;

		if (isIPad) {
			this.size *= 4; // see also http://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications
			addClass(this.el, 'touch');
		}

		this.setOrientation(options.orientation || Orientation.VERTICAL);

		this.hidden = false;
		this.layoutProvider = layoutProvider;
	}

	setOrientation(orientation: Orientation): void {
		this.orientation = orientation;

		if (this.orientation === Orientation.HORIZONTAL) {
			addClass(this.el, 'horizontal');
			removeClass(this.el, 'vertical');
			this.el.style.height = `${this.size}px`;
		} else {
			removeClass(this.el, 'horizontal');
			addClass(this.el, 'vertical');
			this.el.style.width = `${this.size}px`;
		}

		if (this.layoutProvider) {
			this.layout();
		}
	}

	private onMouseDown(e: MouseEvent): void {
		EventHelper.stop(e, false);

		if (!this.enabled) {
			return;
		}

		const iframes = getElementsByTagName('iframe');
		for (const iframe of iframes) {
			iframe.style.pointerEvents = 'none'; // disable mouse events on iframes as long as we drag the sash
		}

		const mouseDownEvent = new StandardMouseEvent(e);
		const startX = mouseDownEvent.posx;
		const startY = mouseDownEvent.posy;
		const altKey = mouseDownEvent.altKey;

		const startEvent: ISashEvent = {
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY,
			altKey
		};

		addClass(this.el, 'active');
		this._onDidStart.fire(startEvent);

		// fix https://github.com/Microsoft/vscode/issues/21675
		const globalStyle = createStyleSheet(this.el);
		if (this.orientation === Orientation.HORIZONTAL) {
			globalStyle.innerHTML = `* { cursor: ${isMacintosh ? 'row-resize' : 'ns-resize'}; }`;
		} else {
			globalStyle.innerHTML = `* { cursor: ${isMacintosh ? 'col-resize' : 'ew-resize'}; }`;
		}

		const disposables: IDisposable[] = [];

		const onMouseMove = (e: MouseEvent) => {
			EventHelper.stop(e, false);
			const mouseMoveEvent = new StandardMouseEvent(e as MouseEvent);

			const event: ISashEvent = {
				startX: startX,
				currentX: mouseMoveEvent.posx,
				startY: startY,
				currentY: mouseMoveEvent.posy,
				altKey
			};

			this._onDidChange.fire(event);
		};

		const onMouseUp = (e: MouseEvent) => {
			EventHelper.stop(e, false);

			this.el.removeChild(globalStyle);

			removeClass(this.el, 'active');
			this._onDidEnd.fire();

			dispose(disposables);

			const iframes = getElementsByTagName('iframe');
			for (const iframe of iframes) {
				iframe.style.pointerEvents = 'auto';
			}
		};

		domEvent(window, 'mousemove')(onMouseMove, null, disposables);
		domEvent(window, 'mouseup')(onMouseUp, null, disposables);
	}

	private onMouseDoubleClick(event: MouseEvent): void {
		this._onDidReset.fire();
	}

	private onTouchStart(event: GestureEvent): void {
		EventHelper.stop(event);

		const listeners: IDisposable[] = [];

		const startX = event.pageX;
		const startY = event.pageY;
		const altKey = event.altKey;


		this._onDidStart.fire({
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY,
			altKey
		});

		listeners.push(addDisposableListener(this.el, EventType.Change, (event: GestureEvent) => {
			if (types.isNumber(event.pageX) && types.isNumber(event.pageY)) {
				this._onDidChange.fire({
					startX: startX,
					currentX: event.pageX,
					startY: startY,
					currentY: event.pageY,
					altKey
				});
			}
		}));

		listeners.push(addDisposableListener(this.el, EventType.End, (event: GestureEvent) => {
			this._onDidEnd.fire();
			dispose(listeners);
		}));
	}

	layout(): void {
		if (this.orientation === Orientation.VERTICAL) {
			const verticalProvider = (<IVerticalSashLayoutProvider>this.layoutProvider);
			this.el.style.left = verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px';

			if (verticalProvider.getVerticalSashTop) {
				this.el.style.top = verticalProvider.getVerticalSashTop(this) + 'px';
			}

			if (verticalProvider.getVerticalSashHeight) {
				this.el.style.height = verticalProvider.getVerticalSashHeight(this) + 'px';
			}
		} else {
			const horizontalProvider = (<IHorizontalSashLayoutProvider>this.layoutProvider);
			this.el.style.top = horizontalProvider.getHorizontalSashTop(this) - (this.size / 2) + 'px';

			if (horizontalProvider.getHorizontalSashLeft) {
				this.el.style.left = horizontalProvider.getHorizontalSashLeft(this) + 'px';
			}

			if (horizontalProvider.getHorizontalSashWidth) {
				this.el.style.width = horizontalProvider.getHorizontalSashWidth(this) + 'px';
			}
		}
	}

	show(): void {
		this.hidden = false;
		this.el.style.removeProperty('display');
		this.el.setAttribute('aria-hidden', 'false');
	}

	hide(): void {
		this.hidden = true;
		this.el.style.display = 'none';
		this.el.setAttribute('aria-hidden', 'true');
	}

	isHidden(): boolean {
		return this.hidden;
	}

	dispose(): void {
		if (this.el && this.el.parentElement) {
			this.el.parentElement.removeChild(this.el);
		}

		this.el = null;
		this.disposables = dispose(this.disposables);
	}
}

/**
 * A simple Vertical Sash that computes the position of the sash when it is moved between the given dimension.
 * Triggers onPositionChange event when the position is changed
 */
export class VSash extends Disposable implements IVerticalSashLayoutProvider {
	private sash: Sash;
	private ratio: number;
	private startPosition: number;
	private position: number;
	private dimension: Dimension;

	private readonly _onPositionChange: Emitter<number> = new Emitter<number>();
	get onPositionChange(): Event<number> { return this._onPositionChange.event; }

	constructor(container: HTMLElement, private minWidth: number) {
		super();

		this.ratio = 0.5;
		this.sash = new Sash(container, this);

		this._register(this.sash.onDidStart(() => this.onSashDragStart()));
		this._register(this.sash.onDidChange((e: ISashEvent) => this.onSashDrag(e)));
		this._register(this.sash.onDidEnd(() => this.onSashDragEnd()));
		this._register(this.sash.onDidReset(() => this.onSashReset()));
	}

	getVerticalSashTop(): number {
		return 0;
	}

	getVerticalSashLeft(): number {
		return this.position;
	}

	getVerticalSashHeight(): number {
		return this.dimension.height;
	}

	setDimenesion(dimension: Dimension) {
		this.dimension = dimension;
		this.compute(this.ratio);
	}

	private onSashDragStart(): void {
		this.startPosition = this.position;
	}

	private onSashDrag(e: ISashEvent): void {
		this.compute((this.startPosition + (e.currentX - e.startX)) / this.dimension.width);
	}

	private compute(ratio: number) {
		this.computeSashPosition(ratio);
		this.ratio = this.position / this.dimension.width;
		this._onPositionChange.fire(this.position);
	}

	private onSashDragEnd(): void {
		this.sash.layout();
	}

	private onSashReset(): void {
		this.compute(0.5);
		this._onPositionChange.fire(this.position);
		this.sash.layout();
	}

	private computeSashPosition(sashRatio: number = this.ratio) {
		const contentWidth = this.dimension.width;
		let sashPosition = Math.floor((sashRatio || 0.5) * contentWidth);
		const midPoint = Math.floor(0.5 * contentWidth);

		if (contentWidth > this.minWidth * 2) {
			if (sashPosition < this.minWidth) {
				sashPosition = this.minWidth;
			}
			if (sashPosition > contentWidth - this.minWidth) {
				sashPosition = contentWidth - this.minWidth;
			}
		} else {
			sashPosition = midPoint;
		}
		if (this.position !== sashPosition) {
			this.position = sashPosition;
			this.sash.layout();
		}
	}
}
