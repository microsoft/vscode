/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import * as DomUtils from 'vs/base/browser/dom';
import { memoize } from 'vs/base/common/decorators';

export namespace EventType {
	export const Tap = '-monaco-gesturetap';
	export const Change = '-monaco-gesturechange';
	export const Start = '-monaco-gesturestart';
	export const End = '-monaco-gesturesend';
	export const Contextmenu = '-monaco-gesturecontextmenu';
}

interface TouchData {
	id: number;
	initialTarget: EventTarget;
	initialTimeStamp: number;
	initialPageX: number;
	initialPageY: number;
	rollingTimestamps: number[];
	rollingPageX: number[];
	rollingPageY: number[];
}

export interface GestureEvent extends MouseEvent {
	initialTarget: EventTarget | undefined;
	translationX: number;
	translationY: number;
	pageX: number;
	pageY: number;
}

interface Touch {
	identifier: number;
	screenX: number;
	screenY: number;
	clientX: number;
	clientY: number;
	pageX: number;
	pageY: number;
	radiusX: number;
	radiusY: number;
	rotationAngle: number;
	force: number;
	target: Element;
}

interface TouchList {
	[i: number]: Touch;
	length: number;
	item(index: number): Touch;
	identifiedTouch(id: number): Touch;
}

interface TouchEvent extends Event {
	touches: TouchList;
	targetTouches: TouchList;
	changedTouches: TouchList;
}

export class Gesture extends Disposable {

	private static readonly SCROLL_FRICTION = -0.005;
	private static INSTANCE: Gesture;
	private static HOLD_DELAY = 700;

	private dispatched = false;
	private targets: HTMLElement[];
	private handle: IDisposable | null;

	private activeTouches: { [id: number]: TouchData; };

	private constructor() {
		super();

		this.activeTouches = {};
		this.handle = null;
		this.targets = [];
		this._register(DomUtils.addDisposableListener(document, 'touchstart', (e: TouchEvent) => this.onTouchStart(e)));
		this._register(DomUtils.addDisposableListener(document, 'touchend', (e: TouchEvent) => this.onTouchEnd(e)));
		this._register(DomUtils.addDisposableListener(document, 'touchmove', (e: TouchEvent) => this.onTouchMove(e)));
	}

	public static addTarget(element: HTMLElement): void {
		if (!Gesture.isTouchDevice()) {
			return;
		}
		if (!Gesture.INSTANCE) {
			Gesture.INSTANCE = new Gesture();
		}

		Gesture.INSTANCE.targets.push(element);
	}

	@memoize
	private static isTouchDevice(): boolean {
		return 'ontouchstart' in window as any || navigator.maxTouchPoints > 0 || window.navigator.msMaxTouchPoints > 0;
	}

	public dispose(): void {
		if (this.handle) {
			this.handle.dispose();
			this.handle = null;
		}

		super.dispose();
	}

	private onTouchStart(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		if (this.handle) {
			this.handle.dispose();
			this.handle = null;
		}

		for (let i = 0, len = e.targetTouches.length; i < len; i++) {
			let touch = e.targetTouches.item(i);

			this.activeTouches[touch.identifier] = {
				id: touch.identifier,
				initialTarget: touch.target,
				initialTimeStamp: timestamp,
				initialPageX: touch.pageX,
				initialPageY: touch.pageY,
				rollingTimestamps: [timestamp],
				rollingPageX: [touch.pageX],
				rollingPageY: [touch.pageY]
			};

			let evt = this.newGestureEvent(EventType.Start, touch.target);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.dispatchEvent(evt);
		}

		if (this.dispatched) {
			e.preventDefault();
			e.stopPropagation();
			this.dispatched = false;
		}
	}

	private onTouchEnd(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		let activeTouchCount = Object.keys(this.activeTouches).length;

		for (let i = 0, len = e.changedTouches.length; i < len; i++) {

			let touch = e.changedTouches.item(i);

			if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
				console.warn('move of an UNKNOWN touch', touch);
				continue;
			}

			let data = this.activeTouches[touch.identifier],
				holdTime = Date.now() - data.initialTimeStamp;

			if (holdTime < Gesture.HOLD_DELAY
				&& Math.abs(data.initialPageX - arrays.tail(data.rollingPageX)) < 30
				&& Math.abs(data.initialPageY - arrays.tail(data.rollingPageY)) < 30) {

				let evt = this.newGestureEvent(EventType.Tap, data.initialTarget);
				evt.pageX = arrays.tail(data.rollingPageX);
				evt.pageY = arrays.tail(data.rollingPageY);
				this.dispatchEvent(evt);

			} else if (holdTime >= Gesture.HOLD_DELAY
				&& Math.abs(data.initialPageX - arrays.tail(data.rollingPageX)) < 30
				&& Math.abs(data.initialPageY - arrays.tail(data.rollingPageY)) < 30) {

				let evt = this.newGestureEvent(EventType.Contextmenu, data.initialTarget);
				evt.pageX = arrays.tail(data.rollingPageX);
				evt.pageY = arrays.tail(data.rollingPageY);
				this.dispatchEvent(evt);

			} else if (activeTouchCount === 1) {
				let finalX = arrays.tail(data.rollingPageX);
				let finalY = arrays.tail(data.rollingPageY);

				let deltaT = arrays.tail(data.rollingTimestamps) - data.rollingTimestamps[0];
				let deltaX = finalX - data.rollingPageX[0];
				let deltaY = finalY - data.rollingPageY[0];

				// We need to get all the dispatch targets on the start of the inertia event
				const dispatchTo = this.targets.filter(t => data.initialTarget instanceof Node && t.contains(data.initialTarget));
				this.inertia(dispatchTo, timestamp,		// time now
					Math.abs(deltaX) / deltaT,	// speed
					deltaX > 0 ? 1 : -1,		// x direction
					finalX,						// x now
					Math.abs(deltaY) / deltaT,  // y speed
					deltaY > 0 ? 1 : -1,		// y direction
					finalY						// y now
				);
			}


			this.dispatchEvent(this.newGestureEvent(EventType.End, data.initialTarget));
			// forget about this touch
			delete this.activeTouches[touch.identifier];
		}

		if (this.dispatched) {
			e.preventDefault();
			e.stopPropagation();
			this.dispatched = false;
		}
	}

	private newGestureEvent(type: string, initialTarget?: EventTarget): GestureEvent {
		let event = <GestureEvent>(<any>document.createEvent('CustomEvent'));
		event.initEvent(type, false, true);
		event.initialTarget = initialTarget;
		return event;
	}

	private dispatchEvent(event: GestureEvent): void {
		this.targets.forEach(target => {
			if (event.initialTarget instanceof Node && target.contains(event.initialTarget)) {
				target.dispatchEvent(event);
				this.dispatched = true;
			}
		});
	}

	private inertia(dispatchTo: EventTarget[], t1: number, vX: number, dirX: number, x: number, vY: number, dirY: number, y: number): void {
		this.handle = DomUtils.scheduleAtNextAnimationFrame(() => {
			let now = Date.now();

			// velocity: old speed + accel_over_time
			let deltaT = now - t1,
				delta_pos_x = 0, delta_pos_y = 0,
				stopped = true;

			vX += Gesture.SCROLL_FRICTION * deltaT;
			vY += Gesture.SCROLL_FRICTION * deltaT;

			if (vX > 0) {
				stopped = false;
				delta_pos_x = dirX * vX * deltaT;
			}

			if (vY > 0) {
				stopped = false;
				delta_pos_y = dirY * vY * deltaT;
			}

			// dispatch translation event
			let evt = this.newGestureEvent(EventType.Change);
			evt.translationX = delta_pos_x;
			evt.translationY = delta_pos_y;
			dispatchTo.forEach(d => d.dispatchEvent(evt));

			if (!stopped) {
				this.inertia(dispatchTo, now, vX, dirX, x + delta_pos_x, vY, dirY, y + delta_pos_y);
			}
		});
	}

	private onTouchMove(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.

		for (let i = 0, len = e.changedTouches.length; i < len; i++) {

			let touch = e.changedTouches.item(i);

			if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
				console.warn('end of an UNKNOWN touch', touch);
				continue;
			}

			let data = this.activeTouches[touch.identifier];

			let evt = this.newGestureEvent(EventType.Change, data.initialTarget);
			evt.translationX = touch.pageX - arrays.tail(data.rollingPageX);
			evt.translationY = touch.pageY - arrays.tail(data.rollingPageY);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.dispatchEvent(evt);

			// only keep a few data points, to average the final speed
			if (data.rollingPageX.length > 3) {
				data.rollingPageX.shift();
				data.rollingPageY.shift();
				data.rollingTimestamps.shift();
			}

			data.rollingPageX.push(touch.pageX);
			data.rollingPageY.push(touch.pageY);
			data.rollingTimestamps.push(timestamp);
		}

		if (this.dispatched) {
			e.preventDefault();
			e.stopPropagation();
			this.dispatched = false;
		}
	}
}
