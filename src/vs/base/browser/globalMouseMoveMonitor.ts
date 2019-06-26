/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IframeUtils } from 'vs/base/browser/iframe';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';

export interface IStandardMouseMoveEventData {
	leftButton: boolean;
	posx: number;
	posy: number;
}

export interface IEventMerger<R> {
	(lastEvent: R, currentEvent: MouseEvent): R;
}

export interface IMouseMoveCallback<R> {
	(mouseMoveData: R): void;
}

export interface IOnStopCallback {
	(): void;
}

export function standardMouseMoveMerger(lastEvent: IStandardMouseMoveEventData, currentEvent: MouseEvent): IStandardMouseMoveEventData {
	let ev = new StandardMouseEvent(currentEvent);
	ev.preventDefault();
	return {
		leftButton: ev.leftButton,
		posx: ev.posx,
		posy: ev.posy
	};
}

export class GlobalMouseMoveMonitor<R> implements IDisposable {

	private readonly hooks = new DisposableStore();
	private mouseMoveEventMerger: IEventMerger<R> | null = null;
	private mouseMoveCallback: IMouseMoveCallback<R> | null = null;
	private onStopCallback: IOnStopCallback | null = null;

	public dispose(): void {
		this.stopMonitoring(false);
		this.hooks.dispose();
	}

	public stopMonitoring(invokeStopCallback: boolean): void {
		if (!this.isMonitoring()) {
			// Not monitoring
			return;
		}

		// Unhook
		this.hooks.clear();
		this.mouseMoveEventMerger = null;
		this.mouseMoveCallback = null;
		const onStopCallback = this.onStopCallback;
		this.onStopCallback = null;

		if (invokeStopCallback && onStopCallback) {
			onStopCallback();
		}
	}

	public isMonitoring(): boolean {
		return !!this.mouseMoveEventMerger;
	}

	public startMonitoring(
		mouseMoveEventMerger: IEventMerger<R>,
		mouseMoveCallback: IMouseMoveCallback<R>,
		onStopCallback: IOnStopCallback
	): void {
		if (this.isMonitoring()) {
			// I am already hooked
			return;
		}
		this.mouseMoveEventMerger = mouseMoveEventMerger;
		this.mouseMoveCallback = mouseMoveCallback;
		this.onStopCallback = onStopCallback;

		let windowChain = IframeUtils.getSameOriginWindowChain();
		for (const element of windowChain) {
			this.hooks.add(dom.addDisposableThrottledListener(element.window.document, 'mousemove',
				(data: R) => this.mouseMoveCallback!(data),
				(lastEvent: R, currentEvent) => this.mouseMoveEventMerger!(lastEvent, currentEvent as MouseEvent)
			));
			this.hooks.add(dom.addDisposableListener(element.window.document, 'mouseup', (e: MouseEvent) => this.stopMonitoring(true)));
		}

		if (IframeUtils.hasDifferentOriginAncestor()) {
			let lastSameOriginAncestor = windowChain[windowChain.length - 1];
			// We might miss a mouse up if it happens outside the iframe
			// This one is for Chrome
			this.hooks.add(dom.addDisposableListener(lastSameOriginAncestor.window.document, 'mouseout', (browserEvent: MouseEvent) => {
				let e = new StandardMouseEvent(browserEvent);
				if (e.target.tagName.toLowerCase() === 'html') {
					this.stopMonitoring(true);
				}
			}));
			// This one is for FF
			this.hooks.add(dom.addDisposableListener(lastSameOriginAncestor.window.document, 'mouseover', (browserEvent: MouseEvent) => {
				let e = new StandardMouseEvent(browserEvent);
				if (e.target.tagName.toLowerCase() === 'html') {
					this.stopMonitoring(true);
				}
			}));
			// This one is for IE
			this.hooks.add(dom.addDisposableListener(lastSameOriginAncestor.window.document.body, 'mouseleave', (browserEvent: MouseEvent) => {
				this.stopMonitoring(true);
			}));
		}
	}
}
