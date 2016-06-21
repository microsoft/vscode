/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import _Event, { Emitter }  from 'vs/base/common/event';

export interface IDomEvent {
	(element: HTMLElement, type: "MSContentZoom", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "MSGestureChange", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGestureDoubleTap", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGestureEnd", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGestureHold", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGestureStart", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGestureTap", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSGotPointerCapture", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSInertiaStart", useCapture?: boolean): _Event<MSGestureEvent>;
	(element: HTMLElement, type: "MSLostPointerCapture", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSManipulationStateChanged", useCapture?: boolean): _Event<MSManipulationEvent>;
	(element: HTMLElement, type: "MSPointerCancel", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerDown", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerEnter", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerLeave", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerMove", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerOut", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerOver", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "MSPointerUp", useCapture?: boolean): _Event<MSPointerEvent>;
	(element: HTMLElement, type: "abort", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "activate", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "ariarequest", useCapture?: boolean): _Event<AriaRequestEvent>;
	(element: HTMLElement, type: "beforeactivate", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "beforecopy", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "beforecut", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "beforedeactivate", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "beforepaste", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "blur", useCapture?: boolean): _Event<FocusEvent>;
	(element: HTMLElement, type: "canplay", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "canplaythrough", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "change", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "click", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "command", useCapture?: boolean): _Event<CommandEvent>;
	(element: HTMLElement, type: "contextmenu", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "copy", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "cuechange", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "cut", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dblclick", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "deactivate", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "drag", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dragend", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dragenter", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dragleave", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dragover", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "dragstart", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "drop", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "durationchange", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "emptied", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "ended", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "error", useCapture?: boolean): _Event<ErrorEvent>;
	(element: HTMLElement, type: "focus", useCapture?: boolean): _Event<FocusEvent>;
	(element: HTMLElement, type: "gotpointercapture", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "input", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "keydown", useCapture?: boolean): _Event<KeyboardEvent>;
	(element: HTMLElement, type: "keypress", useCapture?: boolean): _Event<KeyboardEvent>;
	(element: HTMLElement, type: "keyup", useCapture?: boolean): _Event<KeyboardEvent>;
	(element: HTMLElement, type: "load", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "loadeddata", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "loadedmetadata", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "loadstart", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "lostpointercapture", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "mousedown", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mouseenter", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mouseleave", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mousemove", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mouseout", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mouseover", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mouseup", useCapture?: boolean): _Event<MouseEvent>;
	(element: HTMLElement, type: "mousewheel", useCapture?: boolean): _Event<MouseWheelEvent>;
	(element: HTMLElement, type: "paste", useCapture?: boolean): _Event<DragEvent>;
	(element: HTMLElement, type: "pause", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "play", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "playing", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "pointercancel", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerdown", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerenter", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerleave", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointermove", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerout", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerover", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "pointerup", useCapture?: boolean): _Event<PointerEvent>;
	(element: HTMLElement, type: "progress", useCapture?: boolean): _Event<ProgressEvent>;
	(element: HTMLElement, type: "ratechange", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "reset", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "scroll", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "seeked", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "seeking", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "select", useCapture?: boolean): _Event<UIEvent>;
	(element: HTMLElement, type: "selectstart", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "stalled", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "submit", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "suspend", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "timeupdate", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "touchcancel", useCapture?: boolean): _Event<TouchEvent>;
	(element: HTMLElement, type: "touchend", useCapture?: boolean): _Event<TouchEvent>;
	(element: HTMLElement, type: "touchmove", useCapture?: boolean): _Event<TouchEvent>;
	(element: HTMLElement, type: "touchstart", useCapture?: boolean): _Event<TouchEvent>;
	(element: HTMLElement, type: "volumechange", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "waiting", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "webkitfullscreenchange", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "webkitfullscreenerror", useCapture?: boolean): _Event<Event>;
	(element: HTMLElement, type: "wheel", useCapture?: boolean): _Event<WheelEvent>;
	(element: HTMLElement, type: string, useCapture?: boolean): _Event<any>;
}

export const domEvent: IDomEvent = (element: HTMLElement, type: string, useCapture?) => {
	const fn = e => emitter.fire(e);
	const emitter = new Emitter<any>({
		onFirstListenerAdd: () => {
			element.addEventListener(type, fn);
		},
		onLastListenerRemove: () => {
			element.removeEventListener(type, fn);
		}
	});

	return emitter.event;
};
