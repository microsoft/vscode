/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import arrays = require('vs/base/common/arrays');
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import DomUtils = require('vs/base/browser/dom');

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
	initialTarget: EventTarget;
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

export class Gesture implements IDisposable {

	private static HOLD_DELAY = 700;
	private static SCROLL_FRICTION = -0.005;

	private targetElement: HTMLElement;
	private callOnTarget: IDisposable[];
	private handle: IDisposable;

	private activeTouches: { [id: number]: TouchData; };

	constructor(target: HTMLElement) {
		this.callOnTarget = [];
		this.activeTouches = {};
		this.target = target;
		this.handle = null;
	}

	public dispose(): void {
		this.target = null;
		if (this.handle) {
			this.handle.dispose();
			this.handle = null;
		}
	}

	public set target(element: HTMLElement) {
		this.callOnTarget = dispose(this.callOnTarget);

		this.activeTouches = {};

		this.targetElement = element;

		if (!this.targetElement) {
			return;
		}

		this.callOnTarget.push(DomUtils.addDisposableListener(this.targetElement, 'touchstart', (e) => this.onTouchStart(e)));
		this.callOnTarget.push(DomUtils.addDisposableListener(this.targetElement, 'touchend', (e) => this.onTouchEnd(e)));
		this.callOnTarget.push(DomUtils.addDisposableListener(this.targetElement, 'touchmove', (e) => this.onTouchMove(e)));
	}

	private static newGestureEvent(type: string): GestureEvent {
		let event = <GestureEvent>(<any>document.createEvent('CustomEvent'));
		event.initEvent(type, false, true);
		return event;
	}

	private onTouchStart(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

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

			let evt = Gesture.newGestureEvent(EventType.Start);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.targetElement.dispatchEvent(evt);
		}
	}

	private onTouchEnd(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

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

				let evt = Gesture.newGestureEvent(EventType.Tap);
				evt.initialTarget = data.initialTarget;
				evt.pageX = arrays.tail(data.rollingPageX);
				evt.pageY = arrays.tail(data.rollingPageY);
				this.targetElement.dispatchEvent(evt);

			} else if (holdTime >= Gesture.HOLD_DELAY
				&& Math.abs(data.initialPageX - arrays.tail(data.rollingPageX)) < 30
				&& Math.abs(data.initialPageY - arrays.tail(data.rollingPageY)) < 30) {

				let evt = Gesture.newGestureEvent(EventType.Contextmenu);
				evt.initialTarget = data.initialTarget;
				evt.pageX = arrays.tail(data.rollingPageX);
				evt.pageY = arrays.tail(data.rollingPageY);
				this.targetElement.dispatchEvent(evt);

			} else if (activeTouchCount === 1) {
				let finalX = arrays.tail(data.rollingPageX);
				let finalY = arrays.tail(data.rollingPageY);

				let deltaT = arrays.tail(data.rollingTimestamps) - data.rollingTimestamps[0];
				let deltaX = finalX - data.rollingPageX[0];
				let deltaY = finalY - data.rollingPageY[0];

				this.inertia(timestamp,		// time now
					Math.abs(deltaX) / deltaT,	// speed
					deltaX > 0 ? 1 : -1,		// x direction
					finalX,						// x now
					Math.abs(deltaY) / deltaT,  // y speed
					deltaY > 0 ? 1 : -1,		// y direction
					finalY						// y now
				);
			}

			// forget about this touch
			delete this.activeTouches[touch.identifier];
		}
	}

	private inertia(t1: number, vX: number, dirX: number, x: number, vY: number, dirY: number, y: number): void {
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
			let evt = Gesture.newGestureEvent(EventType.Change);
			evt.translationX = delta_pos_x;
			evt.translationY = delta_pos_y;
			this.targetElement.dispatchEvent(evt);

			if (!stopped) {
				this.inertia(now, vX, dirX, x + delta_pos_x, vY, dirY, y + delta_pos_y);
			}
		});
	}

	private onTouchMove(e: TouchEvent): void {
		let timestamp = Date.now(); // use Date.now() because on FF e.timeStamp is not epoch based.
		e.preventDefault();
		e.stopPropagation();

		for (let i = 0, len = e.changedTouches.length; i < len; i++) {

			let touch = e.changedTouches.item(i);

			if (!this.activeTouches.hasOwnProperty(String(touch.identifier))) {
				console.warn('end of an UNKNOWN touch', touch);
				continue;
			}

			let data = this.activeTouches[touch.identifier];

			let evt = Gesture.newGestureEvent(EventType.Change);
			evt.translationX = touch.pageX - arrays.tail(data.rollingPageX);
			evt.translationY = touch.pageY - arrays.tail(data.rollingPageY);
			evt.pageX = touch.pageX;
			evt.pageY = touch.pageY;
			this.targetElement.dispatchEvent(evt);

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
	}
}
