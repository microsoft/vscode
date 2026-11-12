/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getWindow } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import './media/screenshotTool.css';

export interface IScreenshotRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** What the user selected, in CSS pixels relative to the window. */
export type ScreenshotSelection =
	/** All of the window. */
	| { readonly kind: 'all' }
	| { readonly kind: 'area'; readonly rect: IScreenshotRect };

/** Pointer travel, in CSS pixels, below which a press counts as a click rather than a drag. */
export const SCREENSHOT_DRAG_THRESHOLD = 4;

/** Resolves a press and release into a click, which selects all of `bounds`, or an area clamped to `bounds`. */
export function resolveScreenshotSelection(start: { x: number; y: number }, end: { x: number; y: number }, bounds: IScreenshotRect): ScreenshotSelection {
	if (Math.abs(end.x - start.x) < SCREENSHOT_DRAG_THRESHOLD && Math.abs(end.y - start.y) < SCREENSHOT_DRAG_THRESHOLD) {
		return { kind: 'all' };
	}
	const rect = getSelectionRect(start, end, bounds);
	return rect.width < 1 || rect.height < 1 ? { kind: 'all' } : { kind: 'area', rect };
}

function getSelectionRect(start: { x: number; y: number }, end: { x: number; y: number }, bounds: IScreenshotRect): IScreenshotRect {
	const left = clamp(Math.min(start.x, end.x), bounds.x, bounds.x + bounds.width);
	const top = clamp(Math.min(start.y, end.y), bounds.y, bounds.y + bounds.height);
	const right = clamp(Math.max(start.x, end.x), bounds.x, bounds.x + bounds.width);
	const bottom = clamp(Math.max(start.y, end.y), bounds.y, bounds.y + bounds.height);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface IScreenshotSelectionOverlayOptions {
	/** Whether a key press should reach the workbench, such as the one that opens accessibility help. */
	readonly shouldForwardKey: (event: StandardKeyboardEvent) => boolean;
}

/**
 * A layer above the window that lets the user select a capture: a click or Enter selects all of the window, a drag
 * selects an area, and Escape cancels. The window keeps running underneath.
 */
export class ScreenshotSelectionOverlay extends Disposable {

	static readonly CLASS_NAME = 'screenshot-tool-overlay';

	private readonly element: HTMLElement;
	private readonly selectionElement: HTMLElement;
	private readonly result = new DeferredPromise<ScreenshotSelection | undefined>();
	private drag: { readonly pointerId: number; readonly start: { x: number; y: number }; dragging: boolean } | undefined;

	constructor(container: HTMLElement, private readonly options: IScreenshotSelectionOverlayOptions) {
		super();
		this.element = append(container, $(`.${ScreenshotSelectionOverlay.CLASS_NAME}`));
		this.element.tabIndex = -1;
		this.element.setAttribute('role', 'dialog');
		this.element.setAttribute('aria-modal', 'true');
		this.element.setAttribute('aria-label', localize('screenshotTool', "Screenshot"));
		this._register(toDisposable(() => this.element.remove()));

		const hint = append(this.element, $('.screenshot-tool-hint'));
		hint.textContent = getScreenshotSelectionHint();
		hint.setAttribute('aria-hidden', 'true');
		this.selectionElement = append(this.element, $('.screenshot-tool-selection'));

		this._register(addDisposableListener(this.element, EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(addDisposableListener(this.element, EventType.POINTER_MOVE, e => this.onPointerMove(e)));
		this._register(addDisposableListener(this.element, EventType.POINTER_UP, e => this.onPointerUp(e)));
		this._register(addDisposableListener(this.element, 'pointercancel', () => this.resetDrag()));
		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, e => e.preventDefault()));
		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => this.onKeyDown(e)));
		this._register(addDisposableListener(this.element, EventType.KEY_UP, e => this.onKeyUp(e)));
		this._register(toDisposable(() => this.complete(undefined)));
	}

	/** Resolves with the selection, or `undefined` when the user cancels. */
	get selection(): Promise<ScreenshotSelection | undefined> {
		return this.result.p;
	}

	focus(): void {
		this.element.focus();
	}

	cancel(): void {
		this.complete(undefined);
	}

	private complete(selection: ScreenshotSelection | undefined): void {
		if (!this.result.isSettled) {
			void this.result.complete(selection);
		}
	}

	private get bounds(): IScreenshotRect {
		const targetWindow = getWindow(this.element);
		return { x: 0, y: 0, width: targetWindow.innerWidth, height: targetWindow.innerHeight };
	}

	private onPointerDown(e: PointerEvent): void {
		e.preventDefault();
		if (e.button !== 0 || this.drag) {
			return;
		}
		this.drag = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, dragging: false };
		try {
			// The capturing element's cursor shows while the pointer is down.
			this.element.setPointerCapture(e.pointerId);
		} catch {
			// Only pointers that are down can be captured, so synthetic events cannot.
		}
	}

	private onPointerMove(e: PointerEvent): void {
		if (!this.drag || e.pointerId !== this.drag.pointerId) {
			return;
		}
		const end = { x: e.clientX, y: e.clientY };
		const selection = resolveScreenshotSelection(this.drag.start, end, this.bounds);
		this.drag.dragging ||= selection.kind === 'area';
		if (this.drag.dragging) {
			this.showSelection(getSelectionRect(this.drag.start, end, this.bounds));
		}
	}

	private onPointerUp(e: PointerEvent): void {
		if (!this.drag || e.pointerId !== this.drag.pointerId) {
			return;
		}
		e.preventDefault();
		const { start } = this.drag;
		this.resetDrag();
		this.complete(resolveScreenshotSelection(start, { x: e.clientX, y: e.clientY }, this.bounds));
	}

	private resetDrag(): void {
		this.drag = undefined;
		this.showSelection(undefined);
	}

	private onKeyDown(e: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(e);
		if (event.equals(KeyCode.Escape)) {
			event.preventDefault();
			event.stopPropagation();
			this.complete(undefined);
		} else if (event.equals(KeyCode.Enter)) {
			event.preventDefault();
			event.stopPropagation();
			this.complete({ kind: 'all' });
		} else if (!this.options.shouldForwardKey(event)) {
			// Workbench shortcuts would open UI underneath the overlay and take focus from it.
			event.preventDefault();
			event.stopPropagation();
		}
	}

	private onKeyUp(e: KeyboardEvent): void {
		if (!this.options.shouldForwardKey(new StandardKeyboardEvent(e))) {
			e.stopPropagation();
		}
	}

	private showSelection(rect: IScreenshotRect | undefined): void {
		setBounds(this.selectionElement, rect);
		this.element.classList.toggle('selecting', !!rect);
	}
}

/** The instructions of the selection overlay, shown at its bottom and announced when it opens. */
export function getScreenshotSelectionHint(): string {
	return localize('screenshotSelectionHint', "Click to capture the window, or drag to capture an area. Press Enter to capture the window or Escape to cancel.");
}

function setBounds(element: HTMLElement, rect: IScreenshotRect | undefined): void {
	element.classList.toggle('visible', !!rect);
	if (rect) {
		element.style.left = `${rect.x}px`;
		element.style.top = `${rect.y}px`;
		element.style.width = `${rect.width}px`;
		element.style.height = `${rect.height}px`;
	}
}
