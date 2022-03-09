/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export interface IPointerMoveEventData {
	leftButton: boolean;
	buttons: number;
	pageX: number;
	pageY: number;
}

export interface IEventMerger<R> {
	(lastEvent: R | null, currentEvent: PointerEvent): R;
}

export interface IPointerMoveCallback<R> {
	(pointerMoveData: R): void;
}

export interface IOnStopCallback {
	(browserEvent?: PointerEvent | KeyboardEvent): void;
}

export function standardPointerMoveMerger(lastEvent: IPointerMoveEventData | null, currentEvent: PointerEvent): IPointerMoveEventData {
	currentEvent.preventDefault();
	return {
		leftButton: (currentEvent.button === 0),
		buttons: currentEvent.buttons,
		pageX: currentEvent.pageX,
		pageY: currentEvent.pageY
	};
}

export class GlobalPointerMoveMonitor<R extends { buttons: number } = IPointerMoveEventData> implements IDisposable {

	private readonly _hooks = new DisposableStore();
	private _pointerMoveEventMerger: IEventMerger<R> | null = null;
	private _pointerMoveCallback: IPointerMoveCallback<R> | null = null;
	private _onStopCallback: IOnStopCallback | null = null;

	public dispose(): void {
		this.stopMonitoring(false);
		this._hooks.dispose();
	}

	public stopMonitoring(invokeStopCallback: boolean, browserEvent?: PointerEvent | KeyboardEvent): void {
		if (!this.isMonitoring()) {
			// Not monitoring
			return;
		}

		// Unhook
		this._hooks.clear();
		this._pointerMoveEventMerger = null;
		this._pointerMoveCallback = null;
		const onStopCallback = this._onStopCallback;
		this._onStopCallback = null;

		if (invokeStopCallback && onStopCallback) {
			onStopCallback(browserEvent);
		}
	}

	public isMonitoring(): boolean {
		return !!this._pointerMoveEventMerger;
	}

	public startMonitoring(
		initialElement: Element,
		pointerId: number,
		initialButtons: number,
		pointerMoveEventMerger: IEventMerger<R>,
		pointerMoveCallback: IPointerMoveCallback<R>,
		onStopCallback: IOnStopCallback
	): void {
		if (this.isMonitoring()) {
			this.stopMonitoring(false);
		}
		this._pointerMoveEventMerger = pointerMoveEventMerger;
		this._pointerMoveCallback = pointerMoveCallback;
		this._onStopCallback = onStopCallback;

		initialElement.setPointerCapture(pointerId);

		this._hooks.add(toDisposable(() => {
			initialElement.releasePointerCapture(pointerId);
		}));

		this._hooks.add(dom.addDisposableThrottledListener<R, PointerEvent>(
			initialElement,
			dom.EventType.POINTER_MOVE,
			(data: R) => {
				if (data.buttons !== initialButtons) {
					// Buttons state has changed in the meantime
					this.stopMonitoring(true);
					return;
				}
				this._pointerMoveCallback!(data);
			},
			(lastEvent: R | null, currentEvent) => this._pointerMoveEventMerger!(lastEvent, currentEvent)
		));

		this._hooks.add(dom.addDisposableListener(
			initialElement,
			dom.EventType.POINTER_UP,
			(e: PointerEvent) => this.stopMonitoring(true)
		));
	}
}
