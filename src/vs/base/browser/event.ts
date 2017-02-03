/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import _Event, { Emitter, mapEvent } from 'vs/base/common/event';

export type EventHandler = HTMLElement | HTMLDocument | Window;

export interface IDomEvent {
	(element: EventHandler, type: 'MSContentZoom', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'MSGestureChange', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGestureDoubleTap', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGestureEnd', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGestureHold', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGestureStart', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGestureTap', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSGotPointerCapture', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSInertiaStart', useCapture?: boolean): _Event<MSGestureEvent>;
	(element: EventHandler, type: 'MSLostPointerCapture', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSManipulationStateChanged', useCapture?: boolean): _Event<MSManipulationEvent>;
	(element: EventHandler, type: 'MSPointerCancel', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerDown', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerEnter', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerLeave', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerMove', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerOut', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerOver', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'MSPointerUp', useCapture?: boolean): _Event<MSPointerEvent>;
	(element: EventHandler, type: 'abort', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'activate', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'ariarequest', useCapture?: boolean): _Event<AriaRequestEvent>;
	(element: EventHandler, type: 'beforeactivate', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'beforecopy', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'beforecut', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'beforedeactivate', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'beforepaste', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'blur', useCapture?: boolean): _Event<FocusEvent>;
	(element: EventHandler, type: 'canplay', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'canplaythrough', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'change', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'click', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'command', useCapture?: boolean): _Event<CommandEvent>;
	(element: EventHandler, type: 'contextmenu', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'copy', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'cuechange', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'cut', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dblclick', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'deactivate', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'drag', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dragend', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dragenter', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dragleave', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dragover', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'dragstart', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'drop', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'durationchange', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'emptied', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'ended', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'error', useCapture?: boolean): _Event<ErrorEvent>;
	(element: EventHandler, type: 'focus', useCapture?: boolean): _Event<FocusEvent>;
	(element: EventHandler, type: 'gotpointercapture', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'input', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'keydown', useCapture?: boolean): _Event<KeyboardEvent>;
	(element: EventHandler, type: 'keypress', useCapture?: boolean): _Event<KeyboardEvent>;
	(element: EventHandler, type: 'keyup', useCapture?: boolean): _Event<KeyboardEvent>;
	(element: EventHandler, type: 'load', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'loadeddata', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'loadedmetadata', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'loadstart', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'lostpointercapture', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'mousedown', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mouseenter', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mouseleave', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mousemove', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mouseout', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mouseover', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mouseup', useCapture?: boolean): _Event<MouseEvent>;
	(element: EventHandler, type: 'mousewheel', useCapture?: boolean): _Event<MouseWheelEvent>;
	(element: EventHandler, type: 'paste', useCapture?: boolean): _Event<DragEvent>;
	(element: EventHandler, type: 'pause', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'play', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'playing', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'pointercancel', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerdown', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerenter', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerleave', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointermove', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerout', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerover', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'pointerup', useCapture?: boolean): _Event<PointerEvent>;
	(element: EventHandler, type: 'progress', useCapture?: boolean): _Event<ProgressEvent>;
	(element: EventHandler, type: 'ratechange', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'reset', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'scroll', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'seeked', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'seeking', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'select', useCapture?: boolean): _Event<UIEvent>;
	(element: EventHandler, type: 'selectstart', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'stalled', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'submit', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'suspend', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'timeupdate', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'touchcancel', useCapture?: boolean): _Event<TouchEvent>;
	(element: EventHandler, type: 'touchend', useCapture?: boolean): _Event<TouchEvent>;
	(element: EventHandler, type: 'touchmove', useCapture?: boolean): _Event<TouchEvent>;
	(element: EventHandler, type: 'touchstart', useCapture?: boolean): _Event<TouchEvent>;
	(element: EventHandler, type: 'volumechange', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'waiting', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'webkitfullscreenchange', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'webkitfullscreenerror', useCapture?: boolean): _Event<Event>;
	(element: EventHandler, type: 'wheel', useCapture?: boolean): _Event<WheelEvent>;
	(element: EventHandler, type: string, useCapture?: boolean): _Event<any>;
}

export const domEvent: IDomEvent = (element: EventHandler, type: string, useCapture?: boolean) => {
	const fn = e => emitter.fire(e);
	const emitter = new Emitter<any>({
		onFirstListenerAdd: () => {
			element.addEventListener(type, fn, useCapture);
		},
		onLastListenerRemove: () => {
			element.removeEventListener(type, fn, useCapture);
		}
	});

	return emitter.event;
};

export function stop<T extends Event>(event: _Event<T>): _Event<T> {
	return mapEvent(event, e => {
		e.preventDefault();
		e.stopPropagation();
		return e;
	});
}