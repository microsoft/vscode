/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./sash';
import Lifecycle = require('vs/base/common/lifecycle');
import Builder = require('vs/base/browser/builder');
import Browser = require('vs/base/browser/browser');
import Types = require('vs/base/common/types');
import DOM = require('vs/base/browser/dom');
import Touch = require('vs/base/browser/touch');
import Events = require('vs/base/common/eventEmitter');
import Mouse = require('vs/base/browser/mouseEvent');

var $ = <Builder.QuickBuilder> Builder.$;

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
	instantDiffX: number;
	startY: number;
	currentY: number;
	instantDiffY: number;
}

export interface ISashOptions {
	baseSize?: number;
	orientation?: Orientation;
}

export enum Orientation {
	VERTICAL,
	HORIZONTAL
}

export class Sash extends Events.EventEmitter {

	private $e: Builder.Builder;
	private gesture: Touch.Gesture;
	private layoutProvider: ISashLayoutProvider;
	private isDisabled: boolean;
	private hidden: boolean;
	private orientation: Orientation;
	private size: number;

	constructor(container: HTMLElement, layoutProvider: ISashLayoutProvider, options: ISashOptions = {}) {
		super();

		this.$e = $('.monaco-sash').appendTo(container);

		this.gesture = new Touch.Gesture(this.$e.getHTMLElement());

		this.$e.on('mousedown', (e: MouseEvent) => { this.onMouseDown(e); });
		this.$e.on(Touch.EventType.Start, (e: Touch.GestureEvent) => { this.onTouchStart(e); });

		this.orientation = options.orientation || Orientation.VERTICAL;
		this.$e.addClass(this.orientation === Orientation.HORIZONTAL ? 'horizontal' : 'vertical');

		this.size = options.baseSize || 5;

		if (Browser.isIPad) {
			this.size *= 4; // see also http://ux.stackexchange.com/questions/39023/what-is-the-optimum-button-size-of-touch-screen-applications
			this.$e.addClass('touch');
		}

		if (this.orientation === Orientation.HORIZONTAL) {
			this.$e.size(null, this.size);
		} else {
			this.$e.size(this.size);
		}

		this.isDisabled = false;
		this.hidden = false;
		this.layoutProvider = layoutProvider;
	}

	public getHTMLElement(): HTMLElement {
		return this.$e.getHTMLElement();
	}

	private onMouseDown(e: MouseEvent): void {
		DOM.EventHelper.stop(e, false);

		if (this.isDisabled) {
			return;
		}

		var mouseDownEvent = new Mouse.StandardMouseEvent(e);
		var startX = mouseDownEvent.posx;
		var startY = mouseDownEvent.posy;

		var startEvent: ISashEvent = {
			startX: startX,
			currentX: startX,
			instantDiffX: 0,
			startY: startY,
			currentY: startY,
			instantDiffY: 0
		};

		this.$e.addClass('active');
		this.emit('start', startEvent);

		var overlayDiv = $('div').style({
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: 1000000,
			cursor: this.orientation === Orientation.VERTICAL ? 'ew-resize' : 'ns-resize'
		});

		var $window = $(window);

		var lastCurrentX = startX;
		var lastCurrentY = startY;

		$window.on('mousemove', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			var mouseMoveEvent = new Mouse.StandardMouseEvent(e);

			var event: ISashEvent = {
				startX: startX,
				currentX: mouseMoveEvent.posx,
				instantDiffX: mouseMoveEvent.posx - lastCurrentX,
				startY: startY,
				currentY: mouseMoveEvent.posy,
				instantDiffY: mouseMoveEvent.posy - lastCurrentY
			};

			lastCurrentX = mouseMoveEvent.posx;
			lastCurrentY = mouseMoveEvent.posy;

			this.emit('change', event);
		}).once('mouseup', (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);
			this.$e.removeClass('active');
			this.emit('end');

			$window.off('mousemove');
			overlayDiv.destroy();
		});

		overlayDiv.appendTo(document.body);
	}

	private onTouchStart(event: Touch.GestureEvent): void {
		DOM.EventHelper.stop(event);

		var listeners: Lifecycle.IDisposable[] = [];

		var startX = event.pageX;
		var startY = event.pageY;

		this.emit('start', {
			startX: startX,
			currentX: startX,
			instantDiffX: 0,
			startY: startY,
			currentY: startY,
			instantDiffY: 0
		});

		var lastCurrentX = startX;
		var lastCurrentY = startY;

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), Touch.EventType.Change, (event: Touch.GestureEvent) => {
			if (Types.isNumber(event.pageX) && Types.isNumber(event.pageY)) {
				this.emit('change', {
					startX: startX,
					currentX: event.pageX,
					instantDiffX: event.pageX - lastCurrentX,
					startY: startY,
					currentY: event.pageY,
					instantDiffY: event.pageY - lastCurrentY
				});

				lastCurrentX = event.pageX;
				lastCurrentY = event.pageY;
			}
		}));

		listeners.push(DOM.addDisposableListener(this.$e.getHTMLElement(), Touch.EventType.End, (event: Touch.GestureEvent) => {
			this.emit('end');
			Lifecycle.disposeAll(listeners);
		}));
	}

	public layout(): void {
		var style: { top?: string; left?: string; height?: string; width?: string; };

		if (this.orientation === Orientation.VERTICAL) {
			var verticalProvider = (<IVerticalSashLayoutProvider>this.layoutProvider);
			style = { left: verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px' };

			if (verticalProvider.getVerticalSashTop) {
				style.top = verticalProvider.getVerticalSashTop(this) + 'px';
			}

			if (verticalProvider.getVerticalSashHeight) {
				style.height = verticalProvider.getVerticalSashHeight(this) + 'px';
			}
		} else {
			var horizontalProvider = (<IHorizontalSashLayoutProvider>this.layoutProvider);
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
