/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./sash';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import { isIPad } from 'vs/base/browser/browser';
import { isMacintosh } from 'vs/base/common/platform';
import types = require('vs/base/common/types');
import DOM = require('vs/base/browser/dom');
import { Gesture, EventType, GestureEvent } from 'vs/base/browser/touch';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import Event, { Emitter } from 'vs/base/common/event';

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
}

export interface ISashOptions {
	baseSize?: number;
	orientation?: Orientation;
}

export enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export class Sash extends EventEmitter {

	private $e: Builder;
	private gesture: Gesture;
	private layoutProvider: ISashLayoutProvider;
	private isDisabled: boolean;
	private hidden: boolean;
	private orientation: Orientation;
	private size: number;

	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions = {}) {
		super();

		this.$e = $('.monaco-sash').appendTo(container);

		if (isMacintosh) {
			this.$e.addClass('mac');
		}

		this.gesture = new Gesture(this.$e.getHTMLElement());

		this.$e.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => { this.onMouseDown(e); });
		this.$e.on(DOM.EventType.DBLCLICK, (e: MouseEvent) => { this.emit('reset', e); });
		this.$e.on(EventType.Start, (e: GestureEvent) => { this.onTouchStart(e); });

		this.size = options.baseSize || 5;

		if (isIPad) {
			this.size *= 4; // see also http://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications
			this.$e.addClass('touch');
		}

		this.setOrientation(options.orientation || Orientation.VERTICAL);

		this.isDisabled = false;
		this.hidden = false;
		this.layoutProvider = layoutProvider;
	}

	public getHTMLElement(): HTMLElement {
		return this.$e.getHTMLElement();
	}

	public setOrientation(orientation: Orientation): void {
		this.orientation = orientation;

		this.$e.removeClass('horizontal', 'vertical');
		this.$e.addClass(this.getOrientation());

		if (this.orientation === Orientation.HORIZONTAL) {
			this.$e.size(null, this.size);
		} else {
			this.$e.size(this.size);
		}

		if (this.layoutProvider) {
			this.layout();
		}
	}

	private getOrientation(): 'horizontal' | 'vertical' {
		return this.orientation === Orientation.HORIZONTAL ? 'horizontal' : 'vertical';
	}

	private onMouseDown(e: MouseEvent): void {
		DOM.EventHelper.stop(e, false);

		if (this.isDisabled) {
			return;
		}

		const iframes = $(DOM.getElementsByTagName('iframe'));
		if (iframes) {
			iframes.style('pointer-events', 'none'); // disable mouse events on iframes as long as we drag the sash
		}

		let mouseDownEvent = new StandardMouseEvent(e);
		let startX = mouseDownEvent.posx;
		let startY = mouseDownEvent.posy;

		let startEvent: ISashEvent = {
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY
		};

		this.$e.addClass('active');
		this.emit('start', startEvent);

		let $window = $(window);
		let containerCSSClass = `${this.getOrientation()}-cursor-container${isMacintosh ? '-mac' : ''}`;

		let lastCurrentX = startX;
		let lastCurrentY = startY;

		$window.on('mousemove', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			let mouseMoveEvent = new StandardMouseEvent(e);

			let event: ISashEvent = {
				startX: startX,
				currentX: mouseMoveEvent.posx,
				startY: startY,
				currentY: mouseMoveEvent.posy
			};

			lastCurrentX = mouseMoveEvent.posx;
			lastCurrentY = mouseMoveEvent.posy;

			this.emit('change', event);
		}).once('mouseup', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			this.$e.removeClass('active');
			this.emit('end');

			$window.off('mousemove');
			document.body.classList.remove(containerCSSClass);

			const iframes = $(DOM.getElementsByTagName('iframe'));
			if (iframes) {
				iframes.style('pointer-events', 'auto');
			}
		});

		document.body.classList.add(containerCSSClass);
	}

	private onTouchStart(event: GestureEvent): void {
		DOM.EventHelper.stop(event);

		let listeners: IDisposable[] = [];

		let startX = event.pageX;
		let startY = event.pageY;

		this.emit('start', {
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY
		});

		let lastCurrentX = startX;
		let lastCurrentY = startY;

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.Change, (event: GestureEvent) => {
			if (types.isNumber(event.pageX) && types.isNumber(event.pageY)) {
				this.emit('change', {
					startX: startX,
					currentX: event.pageX,
					startY: startY,
					currentY: event.pageY
				});

				lastCurrentX = event.pageX;
				lastCurrentY = event.pageY;
			}
		}));

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.End, (event: GestureEvent) => {
			this.emit('end');
			dispose(listeners);
		}));
	}

	public layout(): void {
		let style: { top?: string; left?: string; height?: string; width?: string; };

		if (this.orientation === Orientation.VERTICAL) {
			let verticalProvider = (<IVerticalSashLayoutProvider>this.layoutProvider);
			style = { left: verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px' };

			if (verticalProvider.getVerticalSashTop) {
				style.top = verticalProvider.getVerticalSashTop(this) + 'px';
			}

			if (verticalProvider.getVerticalSashHeight) {
				style.height = verticalProvider.getVerticalSashHeight(this) + 'px';
			}
		} else {
			let horizontalProvider = (<IHorizontalSashLayoutProvider>this.layoutProvider);
			style = { top: horizontalProvider.getHorizontalSashTop(this) - (this.size / 2) + 'px' };

			if (horizontalProvider.getHorizontalSashLeft) {
				style.left = horizontalProvider.getHorizontalSashLeft(this) + 'px';
			}

			if (horizontalProvider.getHorizontalSashWidth) {
				style.width = horizontalProvider.getHorizontalSashWidth(this) + 'px';
			}
		}

		this.$e.style(style);
	}

	public show(): void {
		this.hidden = false;
		this.$e.show();
	}

	public hide(): void {
		this.hidden = true;
		this.$e.hide();
	}

	public isHidden(): boolean {
		return this.hidden;
	}

	public enable(): void {
		this.$e.removeClass('disabled');
		this.isDisabled = false;
	}

	public disable(): void {
		this.$e.addClass('disabled');
		this.isDisabled = true;
	}

	public dispose(): void {
		if (this.$e) {
			this.$e.destroy();
			this.$e = null;
		}

		super.dispose();
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

	private _onPositionChange: Emitter<number> = new Emitter<number>();
	public get onPositionChange(): Event<number> { return this._onPositionChange.event; }

	constructor(container: HTMLElement, private minWidth: number) {
		super();
		this.ratio = 0.5;
		this.sash = new Sash(container, this);

		this._register(this.sash.addListener2('start', () => this.onSashDragStart()));
		this._register(this.sash.addListener2('change', (e: ISashEvent) => this.onSashDrag(e)));
		this._register(this.sash.addListener2('end', () => this.onSashDragEnd()));
		this._register(this.sash.addListener2('reset', () => this.onSashReset()));
	}

	public getVerticalSashTop(): number {
		return 0;
	}

	public getVerticalSashLeft(): number {
		return this.position;
	}

	public getVerticalSashHeight(): number {
		return this.dimension.height;
	}

	public setDimenesion(dimension: Dimension) {
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
		this.ratio = 0.5;
		this._onPositionChange.fire(this.position);
		this.sash.layout();
	}

	private computeSashPosition(sashRatio: number = this.ratio) {
		let contentWidth = this.dimension.width;
		let sashPosition = Math.floor((sashRatio || 0.5) * contentWidth);
		let midPoint = Math.floor(0.5 * contentWidth);

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