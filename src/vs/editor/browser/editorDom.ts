/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { GlobalMouseMoveMonitor } from 'vs/base/browser/globalMouseMoveMonitor';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';

/**
 * Coordinates relative to the whole document (e.g. mouse event's pageX and pageY)
 */
export class PageCoordinates {
	_pageCoordinatesBrand: void;

	constructor(
		public readonly x: number,
		public readonly y: number
	) { }

	public toClientCoordinates(): ClientCoordinates {
		return new ClientCoordinates(this.x - dom.StandardWindow.scrollX, this.y - dom.StandardWindow.scrollY);
	}
}

/**
 * Coordinates within the application's client area (i.e. origin is document's scroll position).
 *
 * For example, clicking in the top-left corner of the client area will
 * always result in a mouse event with a client.x value of 0, regardless
 * of whether the page is scrolled horizontally.
 */
export class ClientCoordinates {
	_clientCoordinatesBrand: void;

	constructor(
		public readonly clientX: number,
		public readonly clientY: number
	) { }

	public toPageCoordinates(): PageCoordinates {
		return new PageCoordinates(this.clientX + dom.StandardWindow.scrollX, this.clientY + dom.StandardWindow.scrollY);
	}
}

/**
 * The position of the editor in the page.
 */
export class EditorPagePosition {
	_editorPagePositionBrand: void;

	constructor(
		public readonly x: number,
		public readonly y: number,
		public readonly width: number,
		public readonly height: number
	) { }
}

export function createEditorPagePosition(editorViewDomNode: HTMLElement): EditorPagePosition {
	const editorPos = dom.getDomNodePagePosition(editorViewDomNode);
	return new EditorPagePosition(editorPos.left, editorPos.top, editorPos.width, editorPos.height);
}

export class EditorMouseEvent extends StandardMouseEvent {
	_editorMouseEventBrand: void;

	/**
	 * Coordinates relative to the whole document.
	 */
	public readonly pos: PageCoordinates;

	/**
	 * Editor's coordinates relative to the whole document.
	 */
	public readonly editorPos: EditorPagePosition;

	constructor(e: MouseEvent, editorViewDomNode: HTMLElement) {
		super(e);
		this.pos = new PageCoordinates(this.posx, this.posy);
		this.editorPos = createEditorPagePosition(editorViewDomNode);
	}
}

export interface EditorMouseEventMerger {
	(lastEvent: EditorMouseEvent | null, currentEvent: EditorMouseEvent): EditorMouseEvent;
}

export class EditorMouseEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, this._editorViewDomNode);
	}

	public onContextMenu(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'contextmenu', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseUp(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'mouseup', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseDown(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'mousedown', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableNonBubblingMouseOutListener(target, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onMouseMoveThrottled(target: HTMLElement, callback: (e: EditorMouseEvent) => void, merger: EditorMouseEventMerger, minimumTimeMs: number): IDisposable {
		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, this._create(currentEvent));
		};
		return dom.addDisposableThrottledListener<EditorMouseEvent, MouseEvent>(target, 'mousemove', callback, myMerger, minimumTimeMs);
	}
}

export class EditorPointerEventFactory {

	private readonly _editorViewDomNode: HTMLElement;

	constructor(editorViewDomNode: HTMLElement) {
		this._editorViewDomNode = editorViewDomNode;
	}

	private _create(e: MouseEvent): EditorMouseEvent {
		return new EditorMouseEvent(e, this._editorViewDomNode);
	}

	public onPointerUp(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointerup', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerDown(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableListener(target, 'pointerdown', (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerLeave(target: HTMLElement, callback: (e: EditorMouseEvent) => void): IDisposable {
		return dom.addDisposableNonBubblingPointerOutListener(target, (e: MouseEvent) => {
			callback(this._create(e));
		});
	}

	public onPointerMoveThrottled(target: HTMLElement, callback: (e: EditorMouseEvent) => void, merger: EditorMouseEventMerger, minimumTimeMs: number): IDisposable {
		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, this._create(currentEvent));
		};
		return dom.addDisposableThrottledListener<EditorMouseEvent, MouseEvent>(target, 'pointermove', callback, myMerger, minimumTimeMs);
	}
}

export class GlobalEditorMouseMoveMonitor extends Disposable {

	private readonly _editorViewDomNode: HTMLElement;
	private readonly _globalMouseMoveMonitor: GlobalMouseMoveMonitor<EditorMouseEvent>;
	private _keydownListener: IDisposable | null;

	constructor(editorViewDomNode: HTMLElement) {
		super();
		this._editorViewDomNode = editorViewDomNode;
		this._globalMouseMoveMonitor = this._register(new GlobalMouseMoveMonitor<EditorMouseEvent>());
		this._keydownListener = null;
	}

	public startMonitoring(initialButtons: number, merger: EditorMouseEventMerger, mouseMoveCallback: (e: EditorMouseEvent) => void, onStopCallback: () => void): void {

		// Add a <<capture>> keydown event listener that will cancel the monitoring
		// if something other than a modifier key is pressed
		this._keydownListener = dom.addStandardDisposableListener(<any>document, 'keydown', (e) => {
			const kb = e.toKeybinding();
			if (kb.isModifierKey()) {
				// Allow modifier keys
				return;
			}
			this._globalMouseMoveMonitor.stopMonitoring(true);
		}, true);

		const myMerger: dom.IEventMerger<EditorMouseEvent, MouseEvent> = (lastEvent: EditorMouseEvent | null, currentEvent: MouseEvent): EditorMouseEvent => {
			return merger(lastEvent, new EditorMouseEvent(currentEvent, this._editorViewDomNode));
		};

		this._globalMouseMoveMonitor.startMonitoring(initialButtons, myMerger, mouseMoveCallback, () => {
			this._keydownListener!.dispose();
			onStopCallback();
		});
	}
}


if (typeof ShadowRoot.prototype.caretRangeFromPoint === 'undefined') {

	ShadowRoot.prototype.caretRangeFromPoint = function (x, y) {

		let range = document.createRange();

		// Get the element under the point
		let el: Element | null = this.elementFromPoint(x, y);

		if (el !== null) {
			// Get the last child of the element until its firstChild is a text node
			// This assumes that the pointer is on the right of the line, out of the tokens
			// and that we want to get the offset of the last token of the line
			while ((el as any).firstChild.nodeType !== (el as any).firstChild.TEXT_NODE) {
				el = (el as any).lastChild;
			}

			// Grab its rect
			let rect = (el as any).getBoundingClientRect();

			// And its font
			let font = window.getComputedStyle(el as any, null).getPropertyValue('font');

			// And also its txt content
			let text = (el as any).innerText;

			// Position the pixel cursor at the left of the element
			let pixelCursor = rect.left;
			let offset = 0;
			let step;

			// If the point is on the right of the box put the cursor after the last character
			if (x > rect.left + rect.width) {
				offset = text.length;
			} else {
				// Goes through all the characters of the innerText, and checks if the x of the point
				// belongs to the character.
				for (let i = 0; i < text.length + 1; i++) {
					// The step is half the width of the character
					step = (window as any)._getCharWidth(text.charAt(i), font) / 2;
					// Move to the center of the character
					pixelCursor += step;
					// If the x of the point is smaller that the position of the cursor, the point is over that character
					if (x < pixelCursor) {
						offset = i;
						break;
					}
					// Move between the current character and the next
					pixelCursor += step;
				}
			}

			// Creates a range with the text node of the element and set the offset found
			range.setStart((el as any).firstChild, offset);
			range.setEnd((el as any).firstChild, offset);
		}

		return range;
	};
}

(function (window) {
	(window as any)._getCharWidth = (char: any, font: any) => {
		let cacheKey = char + font;
		if ((window as any)._getCharWidth._cache[cacheKey]) {
			return (window as any)._getCharWidth._cache[cacheKey];
		}

		let context = (window as any)._getCharWidth._canvas.getContext('2d');
		context.font = font;
		let metrics = context.measureText(char);
		let width = metrics.width;
		(window as any)._getCharWidth._cache[cacheKey] = width;
		return width;
	};

	(window as any)._getCharWidth._cache = {};
	(window as any)._getCharWidth._canvas = document.createElement('canvas');
})(window);
