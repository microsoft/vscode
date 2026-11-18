/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, screen } from 'electron';
import { release } from 'os';
import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IPoint, IRectangle } from '../../window/common/window.js';
import { ISelectableWindow } from '../common/appWindows.js';
import { INativeScreenSelectionColors } from '../common/native.js';

/** How long the feedback stays at most, should the window that showed it never end it. */
const FEEDBACK_TIMEOUT = 20000;

/** How long the overlays wait, after one lost the focus, for another one to take it, before the selection ends. */
const SELECTION_BLUR_DELAY = 150;

/** How the page of an overlay that lets the user select asks for the keyboard: it sets its title to this, and more. */
const OVERLAY_FOCUS_REQUEST = 'focus:';

/**
 * The page of the overlay, which draws the window as a card: a white light, then the screenshot under it. `flash` lights
 * up the window, `reveal` turns it into its screenshot, which lifts off the window as the light fades, `fly` moves the
 * card into a rectangle, `land` fades it there, `fade` puts it out, and `dim` only the light. All but `flash` resolve
 * once their animation ended, except `reveal`, which resolves once the screenshot shows.
 *
 * Before that, `select` can let the user select what to capture on the display: it dims the display, except for the
 * window under the pointer, which a click captures, or the area that the user drags. It resolves with the selection,
 * which flashes, or with `cancel`, as `cancelSelection` does.
 */
const OVERLAY_PAGE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.card { position: absolute; box-sizing: border-box; overflow: hidden; pointer-events: none; }
.card > * { position: absolute; inset: 0; width: 100%; height: 100%; }
.card > img { object-fit: cover; }
.light { background: white; opacity: 0; }
.select {
	position: absolute; inset: 0; outline: none; user-select: none; -webkit-user-select: none;
	font: 13px/18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	/* A camera, as a click captures what is highlighted. */
	cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M8.6 5.5 9.9 3.8h4.2l1.3 1.7h3.6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2z' fill='%23fff' stroke='%23000' stroke-width='1.5' stroke-linejoin='round'/%3E%3Ccircle cx='12' cy='12.5' r='3.6' fill='%23fff' stroke='%23000' stroke-width='1.5'/%3E%3Ccircle cx='12' cy='12.5' r='1' fill='%23000'/%3E%3C/svg%3E") 12 12, crosshair;
}
.select.appearing { animation: appear 120ms ease-out; }
@keyframes appear { from { opacity: 0; } }
.select.dragging { cursor: crosshair; }
.select .shade { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.3); }
.select .highlight {
	position: absolute; display: none; box-sizing: border-box; pointer-events: none;
	border: 2px solid var(--highlight);
	box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.3);
}
.select.highlighting .shade { display: none; }
.select.highlighting .highlight { display: block; }
.select.moving .highlight { transition: left 90ms ease-out, top 90ms ease-out, width 90ms ease-out, height 90ms ease-out, border-radius 90ms ease-out; }
.select .tag {
	position: absolute; display: none; max-width: 40%; box-sizing: border-box; padding: 2px 8px; pointer-events: none;
	border-radius: 4px; background: var(--labelBackground); color: var(--labelForeground);
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.select.highlighting .tag { display: block; }
.select .hint {
	position: absolute; left: 50%; bottom: 32px; transform: translateX(-50%); max-width: calc(100% - 64px); box-sizing: border-box;
	padding: 6px 12px; pointer-events: none; text-align: center;
	border: 1px solid var(--hintBorder); border-radius: 8px; background: var(--hintBackground); color: var(--hintForeground);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.36);
}
.select.dragging .hint { display: none; }
.select .live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
</head>
<body>
<script>
'use strict';
// The window lights up this fast. As the light fades, the screenshot lifts off the window, until it flies into its
// destination, where it stays a moment before it fades, so that the destination shows under it first.
const FLASH_TIME = 120;
const LIFT_TIME = 180;
const LIFT_SCALE = 0.95;
const FLY_TIME = 280;
const LAND_DELAY = 60;
const LAND_TIME = 140;
const FADE_TIME = 150;
// What the user selects lights up less, as it can be the whole display.
const SELECTION_FLASH = 0.5;
// A press that moves less than this is a click rather than a drag.
const DRAG_THRESHOLD = 4;
const TAG_INSET = 8;
// The page asks for the keyboard this way when the pointer moves onto it, at most this often.
const FOCUS_REQUEST = '${OVERLAY_FOCUS_REQUEST}';
const FOCUS_REQUEST_INTERVAL = 100;
const card = document.createElement('div');
card.className = 'card';
const light = document.createElement('div');
light.className = 'light';
card.append(light);
let target;
let reduceMotion = false;
let peak = 0;
let revealed = false;
let selection;
function frame(rect, radius) {
	return { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: radius + 'px' };
}
function scale(rect, factor) {
	const width = rect.width * factor;
	const height = rect.height * factor;
	return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}
function wait(time) {
	return new Promise(resolve => setTimeout(resolve, Math.max(time, 0)));
}
function fadeOut(element, duration) {
	return element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' }).finished;
}
function flash(rect, radius, reduce, intensity) {
	target = { rect, radius };
	reduceMotion = reduce;
	Object.assign(card.style, frame(rect, radius));
	document.body.append(card);
	peak = performance.now() + FLASH_TIME;
	light.animate([{ opacity: 0 }, { opacity: (intensity || 1) * (reduce ? 0.4 : 1) }], { duration: FLASH_TIME, easing: 'ease-out', fill: 'forwards' });
}
async function reveal(src) {
	let image;
	if (!reduceMotion) {
		image = new Image();
		image.alt = '';
		image.src = src;
		try {
			await image.decode();
		} catch {
			image = undefined;
		}
	}
	// The screenshot takes the place of the window under the light, at its brightest.
	await wait(peak - performance.now());
	if (image) {
		card.insertBefore(image, light);
		revealed = true;
		card.animate([frame(target.rect, target.radius), frame(scale(target.rect, LIFT_SCALE), target.radius)], { duration: LIFT_TIME, easing: 'ease-out', fill: 'forwards' });
	}
	void fadeOut(light, LIFT_TIME);
	await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));
}
async function fly(to, radius, src) {
	if (!revealed && src) {
		await reveal(src);
	}
	if (!revealed) {
		return fade();
	}
	for (const animation of card.getAnimations()) {
		animation.commitStyles();
		animation.cancel();
	}
	const from = { left: card.style.left, top: card.style.top, width: card.style.width, height: card.style.height, borderRadius: card.style.borderRadius };
	if (to) {
		await card.animate([from, frame(to, radius)], { duration: FLY_TIME, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }).finished;
	} else {
		await card.animate([{ ...from, opacity: 1 }, { ...frame(scale(target.rect, 0.2), target.radius), opacity: 0 }], { duration: FLY_TIME, easing: 'ease-in', fill: 'forwards' }).finished;
	}
}
async function land() {
	if (revealed) {
		await wait(LAND_DELAY);
		await fadeOut(card, LAND_TIME);
	}
}
async function fade() {
	await fadeOut(card, FADE_TIME);
}
async function dim() {
	await fadeOut(light, FADE_TIME);
}
function addElement(parent, className) {
	const element = document.createElement('div');
	element.className = className;
	parent.append(element);
	return element;
}
function inside(rect, point) {
	return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}
function clip(rect, bounds) {
	const x = Math.max(rect.x, bounds.x);
	const y = Math.max(rect.y, bounds.y);
	const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
	const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
	return { x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0) };
}
function between(start, end, bounds) {
	return clip({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }, bounds);
}
function select(options) {
	const bounds = { x: 0, y: 0, width: options.size.width, height: options.size.height };
	const root = addElement(document.body, 'select');
	root.tabIndex = -1;
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-label', options.strings.title);
	root.setAttribute('aria-describedby', 'hint');
	for (const name of Object.keys(options.colors)) {
		root.style.setProperty('--' + name, options.colors[name]);
	}
	if (!options.reduceMotion) {
		root.classList.add('appearing');
	}
	addElement(root, 'shade');
	const highlight = addElement(root, 'highlight');
	const tag = addElement(root, 'tag');
	const hint = addElement(root, 'hint');
	hint.id = 'hint';
	hint.textContent = options.strings.hint;
	const live = addElement(root, 'live');
	live.setAttribute('aria-live', 'polite');
	const screenTarget = { kind: 'screen', rect: bounds, radius: 0, label: options.strings.screen };
	const targets = options.windows.map(window => ({ kind: 'window', id: window.id, rect: window.rect, radius: window.radius, label: window.label, description: window.description })).concat([screenTarget]);
	return new Promise(resolve => {
		selection = { options, bounds, root, highlight, tag, live, targets, screenTarget, current: undefined, drag: undefined, pointerInside: !!options.pointer, focusRequested: 0, resolve };
		root.addEventListener('pointerdown', onSelectPointerDown);
		root.addEventListener('pointermove', onSelectPointerMove);
		root.addEventListener('pointerup', onSelectPointerUp);
		root.addEventListener('pointercancel', onSelectPointerCancel);
		root.addEventListener('pointerleave', onSelectPointerLeave);
		root.addEventListener('contextmenu', event => event.preventDefault());
		addEventListener('keydown', onSelectKeyDown, true);
		if (options.pointer) {
			setSelectTarget(hitTest(options.pointer));
		}
		root.focus();
	});
}
// The window under the point, front to back, or else the display.
function hitTest(point) {
	return selection.targets.find(candidate => candidate.kind === 'window' && inside(candidate.rect, point)) || selection.screenTarget;
}
function setSelectTarget(candidate) {
	const state = selection;
	if (!state || state.current === candidate) {
		return;
	}
	state.root.classList.toggle('moving', !!state.current && !state.options.reduceMotion);
	state.root.classList.remove('dragging');
	state.current = candidate;
	showHighlight(clip(candidate.rect, state.bounds), candidate.radius, candidate.label, false);
	state.live.textContent = candidate.description || candidate.label;
}
// Highlights what a click or the drag captures, with a label inside it, or outside the area that the user drags.
function showHighlight(rect, radius, label, outside) {
	const state = selection;
	state.root.classList.add('highlighting');
	Object.assign(state.highlight.style, frame(rect, radius));
	state.tag.textContent = label;
	const height = state.tag.offsetHeight;
	let left = rect.x + TAG_INSET;
	let top = rect.y + TAG_INSET;
	if (outside) {
		left = rect.x;
		top = rect.y + rect.height + TAG_INSET;
		if (top + height > state.bounds.height) {
			top = rect.y - height - TAG_INSET;
		}
		if (top < 0) {
			left = rect.x + TAG_INSET;
			top = rect.y + TAG_INSET;
		}
	}
	state.tag.style.left = Math.max(left, 0) + 'px';
	state.tag.style.top = Math.max(top, 0) + 'px';
}
function onSelectPointerDown(event) {
	const state = selection;
	if (!state || event.button !== 0 || state.drag) {
		return;
	}
	event.preventDefault();
	state.drag = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false };
	try {
		state.root.setPointerCapture(event.pointerId);
	} catch {
		// Only pointers that are down can be captured.
	}
}
function onSelectPointerMove(event) {
	const state = selection;
	if (!state) {
		return;
	}
	state.pointerInside = true;
	// Enter captures what the pointer highlights, on whichever display it is.
	if (!document.hasFocus() && performance.now() - state.focusRequested > FOCUS_REQUEST_INTERVAL) {
		state.focusRequested = performance.now();
		document.title = FOCUS_REQUEST + state.focusRequested;
	}
	const point = { x: event.clientX, y: event.clientY };
	const drag = state.drag;
	if (!drag) {
		setSelectTarget(hitTest(point));
		return;
	}
	if (event.pointerId !== drag.pointerId || (!drag.dragging && Math.abs(point.x - drag.start.x) < DRAG_THRESHOLD && Math.abs(point.y - drag.start.y) < DRAG_THRESHOLD)) {
		return;
	}
	if (!drag.dragging) {
		drag.dragging = true;
		state.current = undefined;
		state.root.classList.remove('moving');
		state.root.classList.add('dragging');
	}
	const rect = between(drag.start, point, state.bounds);
	const size = state.options.strings.size.replace('{0}', String(Math.round(rect.width))).replace('{1}', String(Math.round(rect.height)));
	showHighlight(rect, 0, size, true);
}
function onSelectPointerUp(event) {
	const state = selection;
	const drag = state && state.drag;
	if (!drag || event.pointerId !== drag.pointerId) {
		return;
	}
	event.preventDefault();
	state.drag = undefined;
	const point = { x: event.clientX, y: event.clientY };
	if (drag.dragging) {
		const rect = between(drag.start, point, state.bounds);
		if (rect.width >= 1 && rect.height >= 1) {
			finishSelection({ kind: 'area', rect, radius: 0 });
			return;
		}
	}
	finishSelection(toSelection(hitTest(point)));
}
function onSelectPointerCancel() {
	const state = selection;
	if (state && state.drag) {
		state.drag = undefined;
		state.current = undefined;
		state.root.classList.remove('dragging', 'highlighting');
	}
}
function onSelectPointerLeave() {
	const state = selection;
	if (state && !state.drag) {
		state.pointerInside = false;
		state.current = undefined;
		state.root.classList.remove('highlighting', 'moving');
	}
}
function onSelectKeyDown(event) {
	const state = selection;
	if (!state) {
		return;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		finishSelection({ kind: 'cancel' });
	} else if ((event.key === 'Enter' || event.key === ' ') && !state.drag) {
		event.preventDefault();
		// The display, only when the pointer is on it, as Enter means what the pointer highlights.
		const candidate = state.current || (state.pointerInside ? state.screenTarget : undefined);
		if (candidate) {
			finishSelection(toSelection(candidate));
		}
	} else if (event.key === 'Tab' && !state.drag) {
		event.preventDefault();
		const count = state.targets.length;
		const index = state.targets.indexOf(state.current);
		const next = index < 0 ? (event.shiftKey ? count - 1 : 0) : (index + (event.shiftKey ? count - 1 : 1)) % count;
		setSelectTarget(state.targets[next]);
	}
}
function toSelection(candidate) {
	return candidate.kind === 'window'
		? { kind: 'window', id: candidate.id, rect: candidate.rect, radius: candidate.radius }
		: { kind: 'screen', rect: candidate.rect, radius: 0 };
}
function finishSelection(result) {
	const state = selection;
	if (!state) {
		return;
	}
	selection = undefined;
	removeEventListener('keydown', onSelectKeyDown, true);
	state.root.remove();
	if (result.kind !== 'cancel') {
		flash(result.rect, result.radius, state.options.reduceMotion, SELECTION_FLASH);
	}
	state.resolve(result);
}
function cancelSelection() {
	finishSelection({ kind: 'cancel' });
}
</script>
</body>
</html>`;

export interface IAppWindowCaptureFeedbackOptions {
	/** Whether to flash less, and keep the screenshot from moving. */
	readonly reduceMotion: boolean;
}

/** How the feedback ends, see {@link AppWindowCaptureFeedback.end}. */
export interface IAppWindowCaptureFeedbackEnd {
	/** The screenshot as a `data:` URL, which the feedback needs when the capture didn't show it. */
	readonly image?: string;
	/** The rectangle that the screenshot flies into, in screen coordinates. */
	readonly destination?: IRectangle;
	/** The corner radius of the destination. */
	readonly radius?: number;
}

/** The feedback of a capture, which the capture shows the screenshot in. */
export interface IAppWindowCaptureOverlay {
	/** Turns the window into its screenshot, a PNG, which lifts off the window. Resolves once the screenshot shows. */
	reveal(image: Buffer): Promise<void>;
	/** Puts out the flash when the capture has no screenshot to show yet, so that the window shows meanwhile. */
	dim(): Promise<void>;
	/** Leaves the overlay out of captures of the screen while `capture` runs, so that they capture what it shows above. */
	hideFromCapture<T>(capture: () => Promise<T>): Promise<T>;
}

export interface IScreenSelectionOverlayOptions extends IAppWindowCaptureFeedbackOptions {
	readonly colors: INativeScreenSelectionColors;
}

/** What the user selected to capture, in the coordinates of Electron's `screen`, see {@link AppWindowCaptureFeedback.select}. */
export type ScreenSelection =
	| { readonly kind: 'window'; readonly window: ISelectableWindow }
	/** An area that the user dragged. */
	| { readonly kind: 'area'; readonly rect: IRectangle }
	/** A display, where the user clicked outside the windows. */
	| { readonly kind: 'screen'; readonly rect: IRectangle };

/** What the page of an overlay resolves `select` with, in the coordinates of its display. */
type PageSelection =
	| { readonly kind: 'window'; readonly id: number }
	| { readonly kind: 'area' | 'screen'; readonly rect: IRectangle }
	| { readonly kind: 'cancel' };

/** What the page of an overlay lets the user select, see {@link CaptureOverlay.select}. */
interface IPageSelectOptions {
	/** The windows on the display, front to back, in its coordinates. */
	readonly windows: readonly IPageWindow[];
	/** Where the pointer is, when it is on the display. */
	readonly pointer: IPoint | null;
	readonly size: { readonly width: number; readonly height: number };
	readonly strings: { readonly title: string; readonly hint: string; readonly screen: string; readonly size: string };
	readonly colors: INativeScreenSelectionColors;
	readonly reduceMotion: boolean;
}

/** A window that an overlay lets the user select, in the coordinates of its display. */
interface IPageWindow {
	readonly id: number;
	readonly rect: IRectangle;
	readonly radius: number;
	/** Shows on the window while it is highlighted. */
	readonly label: string;
	/** Announced when the window is highlighted, which tells apart the windows of an application. */
	readonly description: string;
}

/** The overlay on a display that lets the user select, see {@link AppWindowCaptureFeedback.select}. */
interface ISelectionOverlay {
	readonly display: IRectangle;
	/** Whether the pointer was on the display when the selection started. */
	readonly hasPointer: boolean;
	readonly overlay: CaptureOverlay;
}

/** What the user selected on the overlay of a display. */
interface IChosenSelection {
	readonly overlay: CaptureOverlay;
	readonly selection: Exclude<PageSelection, { readonly kind: 'cancel' }>;
}

/**
 * Shows the user which window of another application VS Code captures: the window flashes, then turns into its
 * screenshot, which lifts off the window and flies into the chat input that it goes to, where it fades as its
 * attachment shows. It draws in a transparent panel above every other window, on the display of the captured window,
 * even above applications in full screen. The panel ignores the mouse and never takes focus.
 *
 * It can also let the user select what to capture, see {@link select}, in a panel on every display, which takes the
 * mouse and the keyboard until the user selected. What the user selected then turns into its screenshot that way.
 */
export class AppWindowCaptureFeedback extends Disposable {

	/** The feedback of the capture that is under way, until the capture ends it. */
	private current: CaptureOverlay | undefined;

	/** The selection under way, which another selection or capture cancels by completing it with `undefined`. */
	private selection: DeferredPromise<IChosenSelection | undefined> | undefined;

	private readonly overlays = new Set<CaptureOverlay>();

	constructor(private readonly logService: ILogService) {
		super();
		this._register(toDisposable(() => {
			this.cancelSelection();
			for (const overlay of [...this.overlays]) {
				overlay.dispose();
			}
		}));
	}

	/** Flashes the window at the given bounds, in screen coordinates, and ends the feedback that showed before. */
	show(bounds: IRectangle, options: IAppWindowCaptureFeedbackOptions): IAppWindowCaptureOverlay {
		this.cancelSelection();
		this.current?.dispose();
		const overlay = this.create(screen.getDisplayMatching(bounds).bounds, false);
		overlay.flash(bounds, options);
		this.current = overlay;
		return overlay;
	}

	/**
	 * Lets the user select what to capture, above every window on every display, and ends the feedback that showed
	 * before: a click captures the window under the pointer, of the given ones, or else the display, a drag captures an
	 * area, Enter captures what a click would, Tab moves between the windows, and Escape cancels, as does switching to
	 * another application, or another selection or capture. Resolves with the selection, which flashes and becomes the
	 * feedback of the capture, or `undefined` when the selection ended without one.
	 */
	async select(windows: Promise<readonly ISelectableWindow[]>, options: IScreenSelectionOverlayOptions): Promise<{ readonly selection: ScreenSelection; readonly overlay: IAppWindowCaptureOverlay } | undefined> {
		this.cancelSelection();
		// Earlier feedback, which can still be flying into chat, would show in a capture of the screen.
		this.current = undefined;
		for (const overlay of [...this.overlays]) {
			overlay.dispose();
		}
		const chosen = new DeferredPromise<IChosenSelection | undefined>();
		this.selection = chosen;
		const pointer = screen.getCursorScreenPoint();
		const pointerDisplay = screen.getDisplayNearestPoint(pointer);
		const overlays: ISelectionOverlay[] = screen.getAllDisplays().map(display => ({ display: display.bounds, hasPointer: display.id === pointerDisplay.id, overlay: this.create(display.bounds, true) }));
		const store = new DisposableStore();
		let selectable: readonly ISelectableWindow[] | undefined;
		let choice: IChosenSelection | undefined;
		try {
			// Without the windows, the user can still capture an area or a display.
			selectable = await Promise.race([windows.catch(() => []), chosen.p.then(() => undefined)]);
			if (selectable && !chosen.isSettled) {
				this.showSelection(overlays, selectable, pointer, options, chosen, store);
			}
			choice = await chosen.p;
		} finally {
			store.dispose();
			if (this.selection === chosen) {
				this.selection = undefined;
			}
			for (const { overlay } of overlays) {
				if (overlay !== choice?.overlay) {
					overlay.dispose();
				}
			}
		}
		if (!choice || !selectable) {
			return undefined;
		}
		const { selection, overlay } = choice;
		overlay.endSelection();
		this.current = overlay;
		if (selection.kind === 'window') {
			const window = selectable.find(window => window.id === selection.id);
			if (window) {
				return { selection: { kind: 'window', window }, overlay };
			}
			overlay.dispose();
			return undefined;
		}
		const display = overlay.display;
		return { selection: { kind: selection.kind, rect: { ...selection.rect, x: selection.rect.x + display.x, y: selection.rect.y + display.y } }, overlay };
	}

	/** Shows the overlays once they know the windows, and completes `chosen` with what the user selects on one. */
	private showSelection(overlays: readonly ISelectionOverlay[], windows: readonly ISelectableWindow[], pointer: IPoint, options: IScreenSelectionOverlayOptions, chosen: DeferredPromise<IChosenSelection | undefined>, store: DisposableStore): void {
		const strings = {
			title: localize('screenSelection.title', "Screenshot"),
			hint: localize('screenSelection.hint', "Click a window to capture it, or drag to capture an area. Press Escape to cancel."),
			screen: localize('screenSelection.screen', "Screen"),
			// The page puts in the width and the height of the area.
			size: localize('screenSelection.size', "{0} × {1}"),
		};
		let pending = overlays.length;
		// The overlay on the display with the pointer takes the keyboard, or else one that shows, when it can't.
		let keyboard: CaptureOverlay | undefined;
		let keyboardLost = false;
		const takeKeyboard = (overlay: CaptureOverlay) => {
			keyboard = overlay;
			overlay.focus();
		};
		for (const { display, hasPointer, overlay } of overlays) {
			const pageWindows: IPageWindow[] = windows
				.filter(window => intersects(window.bounds, display))
				.map(window => ({
					id: window.id,
					rect: toLocal(window.bounds, display),
					radius: getWindowRadius(window.bounds, display),
					label: window.appName,
					description: window.name !== window.appName ? localize('screenSelection.window', "{0}, {1}", window.appName, window.name) : window.appName,
				}));
			const onShown = () => {
				if (hasPointer || (keyboardLost && !keyboard)) {
					takeKeyboard(overlay);
				}
			};
			void overlay.select({ windows: pageWindows, pointer: hasPointer ? toLocal(pointer, display) : null, size: { width: display.width, height: display.height }, strings, colors: options.colors, reduceMotion: options.reduceMotion }, onShown).then(selection => {
				if (chosen.isSettled) {
					return;
				}
				if (selection) {
					void chosen.complete(selection.kind === 'cancel' ? undefined : { overlay, selection });
					return;
				}
				if (hasPointer || overlay === keyboard) {
					keyboard = undefined;
					keyboardLost = true;
					const shown = overlays.find(other => other.overlay !== overlay && other.overlay.isShown());
					if (shown) {
						takeKeyboard(shown.overlay);
					}
				}
				if (--pending === 0) {
					void chosen.complete(undefined);
				}
			});
			// The selection ends when the user switches to another application, rather than to another display.
			store.add(overlay.onDidBlur(() => {
				const timer = setTimeout(() => {
					if (!overlays.some(({ overlay }) => overlay.isFocused())) {
						void chosen.complete(undefined);
					}
				}, SELECTION_BLUR_DELAY);
				store.add(toDisposable(() => clearTimeout(timer)));
			}));
		}
	}

	private cancelSelection(): void {
		void this.selection?.complete(undefined);
		this.selection = undefined;
	}

	/**
	 * Ends the feedback. Given a destination on the display of the window, the screenshot flies into it, then fades as
	 * the destination shows under it; without one, it shrinks where the window is. Without a screenshot, the flash
	 * fades. Resolves once the screenshot covers the destination, or once the feedback is gone.
	 */
	async end(screenshot: IAppWindowCaptureFeedbackEnd | undefined): Promise<void> {
		const overlay = this.current;
		this.current = undefined;
		if (!overlay) {
			return;
		}
		if (screenshot && await overlay.fly(screenshot)) {
			void overlay.land().finally(() => overlay.dispose());
			return;
		}
		if (!screenshot) {
			await overlay.fade();
		}
		overlay.dispose();
	}

	private create(display: IRectangle, interactive: boolean): CaptureOverlay {
		const overlay: CaptureOverlay = new CaptureOverlay(display, interactive, this.logService, () => {
			this.overlays.delete(overlay);
			if (this.current === overlay) {
				this.current = undefined;
			}
		});
		this.overlays.add(overlay);
		return overlay;
	}
}

class CaptureOverlay implements IAppWindowCaptureOverlay, IDisposable {

	private readonly window: BrowserWindow;

	/** Resolves whether the page loaded. */
	private readonly ready: Promise<boolean>;

	/** Completes once the overlay is gone, when Electron leaves the page's functions that were running unsettled. */
	private readonly disposed = new DeferredPromise<void>();

	private timeout: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Covers a display, given in screen coordinates. An interactive overlay lets the user select what to capture, see
	 * {@link select}, and takes the mouse and the keyboard until {@link endSelection}.
	 */
	constructor(readonly display: IRectangle, interactive: boolean, private readonly logService: ILogService, private readonly onDidDispose: () => void) {
		this.window = new BrowserWindow({
			...display,
			// Unlike other windows, a panel shows above applications in full screen, and takes the keyboard without bringing
			// VS Code to the front, which would change what the screen shows under it.
			...(isMacintosh ? { type: 'panel' } : {}),
			show: false,
			frame: false,
			transparent: true,
			backgroundColor: '#00000000',
			hasShadow: false,
			resizable: false,
			movable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			focusable: interactive,
			// A click selects, also on a display whose overlay doesn't have the focus.
			acceptFirstMouse: interactive,
			skipTaskbar: true,
			alwaysOnTop: true,
			hiddenInMissionControl: true,
			enableLargerThanScreen: true,
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				spellcheck: false,
				backgroundThrottling: false,
			},
		});
		this.window.setIgnoreMouseEvents(!interactive);
		this.window.setAlwaysOnTop(true, 'screen-saver');
		// The captured window can be on another Space than VS Code, or in full screen.
		this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
		if (isMacintosh) {
			this.window.excludedFromShownWindowsMenu = true;
		}
		if (interactive) {
			// The page asks for the keyboard when the pointer moves onto it, so that Enter captures what the pointer highlights.
			this.window.on('page-title-updated', (event, title) => {
				event.preventDefault();
				if (title.startsWith(OVERLAY_FOCUS_REQUEST)) {
					this.focus();
				}
			});
		}

		this.ready = this.load();
		if (!interactive) {
			this.startTimeout();
		}
	}

	/** Fires when the overlay loses the focus, which only an interactive one takes. */
	onDidBlur(listener: () => void): IDisposable {
		this.window.on('blur', listener);
		return toDisposable(() => {
			if (!this.window.isDestroyed()) {
				this.window.off('blur', listener);
			}
		});
	}

	isFocused(): boolean {
		return !this.window.isDestroyed() && this.window.isFocused();
	}

	/** Whether the overlay shows, as one that lets the user select does once its page is ready. */
	isShown(): boolean {
		return !this.window.isDestroyed() && this.window.isVisible();
	}

	/** Takes the keyboard, when the overlay shows. */
	focus(): void {
		if (this.isShown() && !this.window.isFocused()) {
			this.window.focus();
		}
	}

	/** Flashes the window at the given bounds, in screen coordinates. */
	flash(bounds: IRectangle, options: IAppWindowCaptureFeedbackOptions): void {
		void this.run(`flash(${JSON.stringify(toLocal(bounds, this.display))}, ${getWindowRadius(bounds, this.display)}, ${JSON.stringify(!!options.reduceMotion)})`);
	}

	/**
	 * Lets the user select what to capture on the display, and calls `onShown` once the overlay shows. Resolves with the
	 * selection, or `undefined` when the overlay couldn't show or is gone.
	 */
	async select(options: IPageSelectOptions, onShown: () => void): Promise<PageSelection | undefined> {
		try {
			if (!await this.ready || this.window.isDestroyed()) {
				return undefined;
			}
			const selection = this.evaluate<PageSelection>(`select(${JSON.stringify(options)})`);
			// The page runs scripts in order, so the selection shows from the overlay's first frame.
			await this.evaluate('0');
			if (this.window.isDestroyed()) {
				return undefined;
			}
			this.window.showInactive();
			onShown();
			return await selection;
		} catch (error) {
			if (!this.window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] Selecting what to capture failed:', error);
			}
			return undefined;
		}
	}

	/** Lets the mouse through once the user selected, while the selection turns into its screenshot. */
	endSelection(): void {
		if (!this.window.isDestroyed()) {
			this.window.setIgnoreMouseEvents(true);
		}
		this.startTimeout();
	}

	async reveal(image: Buffer): Promise<void> {
		await this.run(`reveal(${JSON.stringify(`data:image/png;base64,${image.toString('base64')}`)})`);
	}

	async dim(): Promise<void> {
		await this.run('dim()');
	}

	async hideFromCapture<T>(capture: () => Promise<T>): Promise<T> {
		// Only while capturing, so that recordings of the screen show the overlay otherwise.
		this.window.setContentProtection(true);
		try {
			return await capture();
		} finally {
			if (!this.window.isDestroyed()) {
				this.window.setContentProtection(false);
			}
		}
	}

	/** Flies the screenshot into the destination, or shrinks it where the window is. Resolves whether it covers the destination. */
	async fly(screenshot: IAppWindowCaptureFeedbackEnd): Promise<boolean> {
		const destination = this.toOverlay(screenshot.destination);
		const flown = await this.run(`fly(${JSON.stringify(destination ?? null)}, ${JSON.stringify(Number(screenshot.radius) || 0)}, ${JSON.stringify(screenshot.image ?? null)})`);
		return flown && !!destination;
	}

	land(): Promise<boolean> {
		return this.run('land()');
	}

	fade(): Promise<boolean> {
		return this.run('fade()');
	}

	dispose(): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		void this.disposed.complete();
		if (!this.window.isDestroyed()) {
			this.window.destroy();
		}
		this.onDidDispose();
	}

	private startTimeout(): void {
		this.timeout ??= setTimeout(() => this.dispose(), FEEDBACK_TIMEOUT);
	}

	private async load(): Promise<boolean> {
		try {
			await this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_PAGE)}`);
			return !this.window.isDestroyed();
		} catch (error) {
			if (!this.window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] Showing the feedback failed:', error);
			}
			return false;
		}
	}

	/** Shows the overlay and runs a function of the page, and resolves whether it ran. */
	private async run(script: string): Promise<boolean> {
		try {
			if (!await this.ready || this.window.isDestroyed()) {
				return false;
			}
			if (!this.window.isVisible()) {
				this.window.showInactive();
			}
			await this.evaluate(script);
			return !this.window.isDestroyed();
		} catch (error) {
			if (!this.window.isDestroyed()) {
				this.logService.error('[AppWindowCaptureFeedback] The feedback failed:', error);
			}
			return false;
		}
	}

	/** Runs a script in the page, and resolves with its result, or `undefined` once the overlay is gone. */
	private evaluate<T>(script: string): Promise<T | undefined> {
		return Promise.race([this.window.webContents.executeJavaScript(script) as Promise<T>, this.disposed.p.then(() => undefined)]);
	}

	/** The rectangle in the coordinates of the overlay, when its center is on the display of the overlay. */
	private toOverlay(rect: IRectangle | undefined): IRectangle | undefined {
		if (!rect) {
			return undefined;
		}
		const local = toLocal(rect, this.display);
		const centerX = local.x + rect.width / 2;
		const centerY = local.y + rect.height / 2;
		return centerX >= 0 && centerY >= 0 && centerX <= this.display.width && centerY <= this.display.height ? local : undefined;
	}
}

function toLocal<T extends IPoint>(value: T, display: IRectangle): T {
	return { ...value, x: value.x - display.x, y: value.y - display.y };
}

function intersects(a: IRectangle, b: IRectangle): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The corner radius of a window of macOS, which macOS 26 (Darwin 25) rounds more. A window in full screen has none. */
function getWindowRadius(bounds: IRectangle, display: IRectangle): number {
	if (bounds.x <= display.x && bounds.y <= display.y && bounds.x + bounds.width >= display.x + display.width && bounds.y + bounds.height >= display.y + display.height) {
		return 0;
	}
	return parseInt(release(), 10) >= 25 ? 16 : 10;
}
