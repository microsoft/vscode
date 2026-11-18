/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { INewSessionDraftSlot, ISessionsManagementService, trackNewSessionRequestEnd, trackNewSessionRequestSent } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';

const AGENTS_LAUNCHER_WIDTH = 640;
const AGENTS_LAUNCHER_HORIZONTAL_MARGIN = 48;
const AGENTS_LAUNCHER_MIN_HEIGHT = 120;
const AGENTS_LAUNCHER_MAX_HEIGHT_RATIO = 0.6;
const AGENTS_LAUNCHER_TOP_RATIO = 0.22;
/** The room in CSS pixels that a transparent window leaves beside the card for its shadow. */
const AGENTS_LAUNCHER_SHADOW_MARGIN = 24;

/** Where the Agents Launcher shows: its window, and the card in it that holds the composer, both in the display's coordinates. */
export interface IAgentsLauncherLayout {
	readonly window: IRectangle;
	readonly card: IRectangle;
}

/**
 * Lays out the Agents Launcher on the display beneath the pointer, whose `workArea` leaves out its menu bar and dock, for a composer whose
 * content is `contentHeight` CSS pixels high at `zoomFactor`. The card is as wide as zoomed content allows. An opaque window is the card.
 * A `transparent` one spans the height of the work area, so that the composer's popups, such as its pickers, which cannot show beyond the
 * window, have the room above and below the card that the display has, and leaves room beside the card for its shadow.
 */
export function computeAgentsLauncherLayout(display: IRectangle, workArea: IRectangle, contentHeight: number, zoomFactor: number, transparent: boolean): IAgentsLauncherLayout {
	const width = Math.min(Math.round(AGENTS_LAUNCHER_WIDTH * zoomFactor), Math.max(1, display.width - AGENTS_LAUNCHER_HORIZONTAL_MARGIN));
	const maximumHeight = Math.max(1, Math.floor(display.height * AGENTS_LAUNCHER_MAX_HEIGHT_RATIO));
	const height = Math.min(Math.max(Math.round(AGENTS_LAUNCHER_MIN_HEIGHT * zoomFactor), Math.ceil(contentHeight * zoomFactor)), maximumHeight);
	const card = {
		x: Math.round(display.x + (display.width - width) / 2),
		y: Math.round(display.y + display.height * AGENTS_LAUNCHER_TOP_RATIO),
		width,
		height,
	};
	if (!transparent) {
		return { window: card, card };
	}

	// Always around the whole card, even where the work area leaves part of it out.
	const margin = Math.round(AGENTS_LAUNCHER_SHADOW_MARGIN * zoomFactor);
	const left = Math.min(card.x, Math.max(workArea.x, card.x - margin));
	const right = Math.max(card.x + card.width, Math.min(workArea.x + workArea.width, card.x + card.width + margin));
	const top = Math.min(card.y, workArea.y);
	const bottom = Math.max(card.y + card.height, workArea.y + workArea.height);
	return { window: { x: left, y: top, width: right - left, height: bottom - top }, card };
}

/**
 * Lets clicks through the transparent window of the Agents Launcher where it renders nothing, so that they reach what is below it, which
 * dismisses the launcher as it blurs. The window keeps receiving mouse moves meanwhile, and captures clicks again once the pointer is over
 * what it renders: its card, or a popup. What the pointer is over is checked as it moves, as a drag ends, and as the window's content
 * changes or moves beneath it, such as a popup opened or closed with the keyboard, or growing as it opens, while the pointer rests.
 */
export class AgentsLauncherClickThrough extends Disposable {

	private _ignoring: boolean | undefined;
	/** Where the pointer is in the window's CSS pixels, as of its latest mouse event or show, should it be known. */
	private _pointer: { readonly x: number; readonly y: number } | undefined;
	/** Whether a button is pressed, as while dragging a selection out of the card, which the window keeps receiving until released. */
	private _pressed = false;
	/** Counts the pointer's mouse events and resets, so that a location sampled meanwhile, which is older, is not applied. */
	private _pointerVersion = 0;
	private readonly _pendingCheck = this._register(new MutableDisposable());
	/** The open shadow roots in the window, which some popups render into, such as the editor's context menu, and which are watched too. */
	private readonly _shadowRoots = this._register(new DisposableMap<ShadowRoot>());

	/**
	 * @param _container The window's container, which holds the card and the popups.
	 * @param _card The card that holds the composer.
	 * @param _setIgnoreMouseEvents Lets mouse events through the window, or stops.
	 * @param onBackgroundMouseDown Called for a click outside the card that the window still receives, such as right after the pointer left it.
	 * @param _schedule Runs a check once for any number of content changes: at the next animation frame by default.
	 */
	constructor(
		private readonly _container: HTMLElement,
		private readonly _card: HTMLElement,
		private readonly _setIgnoreMouseEvents: (ignore: boolean) => void,
		onBackgroundMouseDown: () => void,
		private readonly _schedule: (check: () => void) => IDisposable = check => dom.scheduleAtNextAnimationFrame(dom.getWindow(_container), check),
	) {
		super();
		const targetDocument = _container.ownerDocument;
		this._register(dom.addDisposableListener(targetDocument, dom.EventType.MOUSE_MOVE, (event: MouseEvent) => {
			this._track(event);
			if (!this._pressed) {
				this._update(this._isContent(innermostTarget(event), event.clientX, event.clientY));
			}
		}, true));
		this._register(dom.addDisposableListener(targetDocument, dom.EventType.MOUSE_UP, (event: MouseEvent) => {
			this._track(event);
			this._check();
		}, true));
		this._register(dom.addDisposableListener(targetDocument, dom.EventType.MOUSE_DOWN, (event: MouseEvent) => {
			this._track(event);
			if (!this._isContent(innermostTarget(event), event.clientX, event.clientY)) {
				this._update(false);
				onBackgroundMouseDown();
			}
		}, true));
		this._register(this._watch(_container));
	}

	/** The version of the pointer's location, to pass to {@link resetPointer} or {@link relocatePointer} with a location sampled as of it. */
	get pointerVersion(): number {
		return this._pointerVersion;
	}

	/**
	 * Sets where the pointer is as the launcher shows or hides, in the window's CSS pixels, or that it is not over the window, and checks
	 * what it is over. Unless the pointer moved since `version`, as of which `pointer` was sampled.
	 */
	resetPointer(pointer: { readonly x: number; readonly y: number } | undefined, version = this._pointerVersion): void {
		if (version === this._pointerVersion) {
			this._pointerVersion++;
			this._pointer = pointer;
			this._pressed = false;
			this._check();
		}
	}

	/**
	 * Sets where a pointer at rest is in the window's CSS pixels once the window's zoom or bounds changed, which changes where it is in the
	 * window though it did not move, or that it is not over the window, and checks what it is over. Unless the pointer moved since `version`,
	 * as of which `pointer` was sampled.
	 */
	relocatePointer(pointer: { readonly x: number; readonly y: number } | undefined, version: number): void {
		if (version === this._pointerVersion) {
			this._pointer = pointer;
			this._check();
		}
	}

	/** Checks what the pointer is over as `root`'s content changes or moves, including within the shadow roots it gains. */
	private _watch(root: HTMLElement | ShadowRoot): IDisposable {
		const store = new DisposableStore();
		const scheduleCheck = () => {
			if (this._pointer && !this._pendingCheck.value) {
				this._pendingCheck.value = this._schedule(() => {
					this._pendingCheck.clear();
					this._check();
				});
			}
		};
		store.add(dom.sharedMutationObserver.observe(root, store, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })(mutations => {
			this._watchShadowRoots(mutations);
			scheduleCheck();
		}));
		// Animations and transitions, such as of a popup growing as it opens, move content without changing the DOM.
		for (const type of ['animationend', 'animationcancel', 'transitionend', 'transitioncancel']) {
			store.add(dom.addDisposableListener(root, type, scheduleCheck, true));
		}
		return store;
	}

	/** Watches the shadow roots of added elements, which the observer of their light DOM does not see into, until their host is removed. */
	private _watchShadowRoots(mutations: readonly MutationRecord[]): void {
		const visit = (element: Element) => {
			if (element.shadowRoot && !this._shadowRoots.has(element.shadowRoot)) {
				this._shadowRoots.set(element.shadowRoot, this._watch(element.shadowRoot));
			}
			for (const child of element.children) {
				visit(child);
			}
		};
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (dom.isHTMLElement(node)) {
					visit(node);
				}
			}
		}
		for (const [shadowRoot] of this._shadowRoots) {
			if (!shadowRoot.host.isConnected) {
				this._shadowRoots.deleteAndDispose(shadowRoot);
			}
		}
	}

	private _track(event: MouseEvent): void {
		this._pointerVersion++;
		this._pointer = { x: event.clientX, y: event.clientY };
		this._pressed = event.buttons !== 0;
	}

	/** Checks what is under the pointer rather than an event's target, which an element that captured the pointer for a drag can be. */
	private _check(): void {
		if (this._pointer && !this._pressed) {
			const { x, y } = this._pointer;
			this._update(this._isContent(this._elementFromPoint(x, y), x, y));
		}
	}

	/** The element at a point, within the open shadow roots that some popups render into, such as the editor's context menu. */
	private _elementFromPoint(x: number, y: number): Element | null {
		let element = this._container.ownerDocument.elementFromPoint(x, y);
		while (element?.shadowRoot) {
			const inner = element.shadowRoot.elementFromPoint(x, y);
			if (!inner || inner === element) {
				break;
			}
			element = inner;
		}
		return element;
	}

	private _isContent(target: EventTarget | null, x: number, y: number): boolean {
		const targetDocument = this._container.ownerDocument;
		if (!target || target === targetDocument.documentElement || target === targetDocument.body || target === this._container) {
			return false;
		}
		// The transparent block that a menu puts behind itself, to close on a click outside it, covers the whole window. Outside the card,
		// clicks go through it, as they did beyond a window as small as the card, which closes the menu as the window blurs.
		if (dom.isHTMLElement(target) && target.classList.contains('context-view-block')) {
			const card = this._card.getBoundingClientRect();
			return x >= card.left && x < card.right && y >= card.top && y < card.bottom;
		}
		return true;
	}

	private _update(overContent: boolean): void {
		const ignore = !overContent;
		if (ignore !== this._ignoring) {
			this._ignoring = ignore;
			this._setIgnoreMouseEvents(ignore);
		}
	}
}

/** The element an event is dispatched to, within the open shadow roots that some popups render into, such as the editor's context menu. */
function innermostTarget(event: MouseEvent): EventTarget | null {
	return event.composedPath()[0] ?? event.target;
}

/** The window operations that present the Agents Launcher, which {@link AgentsLauncherPresenter} sequences. */
export interface IAgentsLauncherWindowPresentation {
	/** The ID of the Agents Launcher's window, should it have one. */
	getWindowId(): number | undefined;
	/** Creates the window should there be none, and lays it out to show: resolves to its ID, or to `undefined` should it be unable to show. */
	prepare(): Promise<number | undefined>;
	setOpacity(windowId: number, opacity: number): Promise<void>;
	/** Moves the window to the bounds {@link prepare} laid it out for. */
	position(windowId: number): Promise<void>;
	show(windowId: number): Promise<void>;
	focus(windowId: number): void;
	/** Resolves once the window has rendered a frame since the call, or after a timeout should it render none. */
	whenRendered(windowId: number): Promise<unknown>;
	hide(windowId: number): Promise<void>;
}

/**
 * Shows and hides the Agents Launcher's window as requested last. A show is a sequence of window operations, any of which a
 * later request interrupts, so that a hide while showing never leaves the window shown, focused, or transparent.
 */
export class AgentsLauncherPresenter {

	private readonly _visible = observableValue<boolean>(this, false);
	/** Whether the Agents Launcher is requested to be visible, as of the latest show or hide. */
	readonly visible: IObservable<boolean> = this._visible;

	/** Counts requests, so that each show continues only while it is the latest one. */
	private _generation = 0;

	constructor(private readonly _presentation: IAgentsLauncherWindowPresentation) { }

	async show(): Promise<void> {
		const generation = ++this._generation;
		const isCurrent = () => generation === this._generation;
		this._visible.set(true, undefined);

		let windowId: number | undefined;
		try {
			const id = windowId = await this._presentation.prepare();
			if (id === undefined) {
				if (isCurrent()) {
					this._visible.set(false, undefined);
				}
				return;
			}
			// Transparent until it has painted: a window shown again can present an old or empty frame for a moment, such
			// as after it was hidden for a while, which flickers.
			for (const step of [
				() => this._presentation.setOpacity(id, 0),
				() => this._presentation.position(id),
				() => this._presentation.show(id),
				() => {
					this._presentation.focus(id);
					return this._presentation.whenRendered(id);
				},
				() => this._presentation.setOpacity(id, 1),
			]) {
				if (!isCurrent()) {
					return this._abandon(id);
				}
				await step();
			}
		} catch (error) {
			if (isCurrent()) {
				this._visible.set(false, undefined);
				if (windowId !== undefined) {
					await this._abandon(windowId);
				}
			}
			throw error;
		}
	}

	async hide(): Promise<void> {
		this._generation++;
		this._visible.set(false, undefined);
		const windowId = this._presentation.getWindowId();
		if (windowId !== undefined) {
			await this._presentation.hide(windowId);
		}
	}

	toggle(): Promise<void> {
		return this._visible.get() ? this.hide() : this.show();
	}

	/** Forgets the window, which has closed, without operating on it. */
	reset(): void {
		this._generation++;
		this._visible.set(false, undefined);
	}

	/** Hides the window of an interrupted show unless a later show presents it. */
	private async _abandon(windowId: number): Promise<void> {
		// A hide before the window was created had no window to hide yet.
		if (!this._visible.get()) {
			await this._presentation.hide(windowId).catch(() => { /* the window may have closed meanwhile */ });
		}
	}
}

/**
 * Follows an ordinary send of `draft`, one the user did not send in the background, by the Agents Launcher's composer of `slot`:
 * calls `leave` as it goes out, and `open` once with its session, as soon as its message was sent and the session can be shown
 * ({@link trackNewSessionRequestSent}), which can be well before it has started: the Agents window then shows the request as it
 * goes, as it does for a send of its own composer, and follows the session as it starts. Otherwise it opens the session once it
 * has started. It opens only once `leave` resolved, so that the session takes the focus as it opens, and opens the session as it
 * is then, after its replacements. It opens nothing for a request that fails, also while `leave` is pending. Disposing the
 * result stops following it, including an open that waits for `leave`, such as for a send that the composer does not dispatch
 * or that a newer send supersedes.
 */
export function followOrdinarySend(sessionsManagementService: ISessionsManagementService, slot: INewSessionDraftSlot, draft: ISession, handlers: { leave(): Promise<void>; open(session: ISession): void }): IDisposable {
	const store = new DisposableStore();
	let left = Promise.resolve();
	let target: ISession | undefined;
	let cancelled = false;
	const open = (session: ISession) => {
		if (target) {
			return;
		}
		target = session;
		void left.then(() => {
			if (!cancelled && target) {
				handlers.open(target);
			}
		});
	};
	store.add(sessionsManagementService.onDidReplaceSession(({ from, to }) => {
		if (target && from.sessionId === target.sessionId) {
			target = to;
		}
	}));
	// A background send is accepted as it goes out, with the draft it sends.
	store.add(Event.once(Event.filter(sessionsManagementService.onDidAcceptNewSessionRequest, ({ owner, session }) => owner === slot && session.sessionId === draft.sessionId))(() => {
		left = handlers.leave();
	}));
	store.add(trackNewSessionRequestSent(sessionsManagementService, slot, draft, open));
	store.add(trackNewSessionRequestEnd(sessionsManagementService, slot, draft, ({ session, started }) => {
		store.dispose();
		if (!started) {
			cancelled = true;
		} else if (target) {
			target = session;
		} else {
			open(session);
		}
	}));
	return toDisposable(() => {
		cancelled = true;
		store.dispose();
	});
}

/** What {@link dismissWhenAllowed} does as it checks: dismiss now, check again later, or stop checking. */
export const enum DismissalCheck {
	Dismiss,
	Defer,
	Keep,
}

/**
 * Calls `dismiss` `delay` milliseconds from now, should `check` then allow it. While `check` defers it, such as during a
 * send or with a popup open, it checks again after each `delay`, so that the launcher still hides once nothing defers it.
 * Disposing the result stops checking.
 */
export function dismissWhenAllowed(check: () => DismissalCheck, delay: number, dismiss: () => void): IDisposable {
	const timer = new MutableDisposable();
	const schedule = () => {
		timer.value = disposableTimeout(() => {
			switch (check()) {
				case DismissalCheck.Dismiss:
					dismiss();
					break;
				case DismissalCheck.Defer:
					schedule();
					break;
			}
		}, delay);
	};
	schedule();
	return timer;
}
