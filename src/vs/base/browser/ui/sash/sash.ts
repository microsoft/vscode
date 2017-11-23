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
import { EventType, GestureEvent, Gesture } from 'vs/base/browser/touch';
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

export class Sash {

	private $e: Builder;
	private layoutProvider: ISashLayoutProvider;
	private isDisabled: boolean;
	private hidden: boolean;
	private orientation: Orientation;
	private size: number;

	private _onDidStart = new Emitter<ISashEvent>();
	private _onDidChange = new Emitter<ISashEvent>();
	private _onDidReset = new Emitter<void>();
	private _onDidEnd = new Emitter<void>();

	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions = {}) {

		this.$e = $('.monaco-sash').appendTo(container);

		if (isMacintosh) {
			this.$e.addClass('mac');
		}

		this.$e.on(DOM.EventType.MOUSE_DOWN, (e) => { this.onMouseDown(e as MouseEvent); });
		this.$e.on(DOM.EventType.DBLCLICK, (e) => this._onDidReset.fire());
		Gesture.addTarget(this.$e.getHTMLElement());
		this.$e.on(EventType.Start, (e) => { this.onTouchStart(e as GestureEvent); });

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

	public get onDidStart(): Event<ISashEvent> {
		return this._onDidStart.event;
	}

	public get onDidChange(): Event<ISashEvent> {
		return this._onDidChange.event;
	}

	public get onDidReset(): Event<void> {
		return this._onDidReset.event;
	}

	public get onDidEnd(): Event<void> {
		return this._onDidEnd.event;
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
		this._onDidStart.fire(startEvent);

		let $window = $(window);
		let containerCSSClass = `${this.getOrientation()}-cursor-container${isMacintosh ? '-mac' : ''}`;

		$window.on('mousemove', (e) => {
			DOM.EventHelper.stop(e, false);
			let mouseMoveEvent = new StandardMouseEvent(e as MouseEvent);

			let event: ISashEvent = {
				startX: startX,
				currentX: mouseMoveEvent.posx,
				startY: startY,
				currentY: mouseMoveEvent.posy
			};

			this._onDidChange.fire(event);
		}).once('mouseup', (e) => {
			DOM.EventHelper.stop(e, false);
			this.$e.removeClass('active');
			this._onDidEnd.fire();

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

		this._onDidStart.fire({
			startX: startX,
			currentX: startX,
			startY: startY,
			currentY: startY
		});

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.Change, (event: GestureEvent) => {
			if (types.isNumber(event.pageX) && types.isNumber(event.pageY)) {
				this._onDidChange.fire({
					startX: startX,
					currentX: event.pageX,
					startY: startY,
					currentY: event.pageY
				});
			}
		}));

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), EventType.End, (event: GestureEvent) => {
			this._onDidEnd.fire();
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

	get enabled(): boolean {
		return !this.isDisabled;
	}

	public dispose(): void {
		if (this.$e) {
			this.$e.destroy();
			this.$e = null;
		}
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

		this._register(this.sash.onDidStart(() => this.onSashDragStart()));
		this._register(this.sash.onDidChange((e: ISashEvent) => this.onSashDrag(e)));
		this._register(this.sash.onDidEnd(() => this.onSashDragEnd()));
		this._register(this.sash.onDidReset(() => this.onSashReset()));
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
		this.compute(0.5);
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