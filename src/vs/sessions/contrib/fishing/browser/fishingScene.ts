/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import './media/fishing.css';

/**
 * The boat sits on top of the chat input box (which visually acts as the
 * lake). The scene starts hidden behind a small entry button in the top-
 * right corner; clicking it reveals the boat. Click the boat to take
 * control; once active, the left/right arrow keys move it across the lake.
 * Press Space to cast and reel in a logo. Click anywhere outside the boat
 * to release control and return to idle. The scene resets to hidden each
 * time a new session is created (the host element is recreated).
 */
export class FishingScene extends Disposable {

	private static readonly BOAT_WIDTH = 132;
	private static readonly EDGE_PADDING = 12;
	private static readonly SPEED_PX_PER_SEC = 280;
	private static readonly CATCH_DURATION_MS = 1800;

	private readonly sceneHost: HTMLElement;
	private readonly boatGroup: HTMLElement;
	private readonly entryButton: HTMLButtonElement;

	private revealed = false;
	private active = false;
	private catching = false;
	private boatX = 0;
	private readonly heldKeys = new Set<string>();
	private rafHandle = 0;
	private lastFrameTime = 0;
	private catchTimeout = 0;

	constructor(parent: HTMLElement) {
		super();

		this.sceneHost = parent;
		this.sceneHost.dataset.state = 'hidden';

		// Entry button — small icon in the top-right of the scene strip.
		this.entryButton = append(this.sceneHost, $('button.fishing-entry')) as HTMLButtonElement;
		this.entryButton.type = 'button';
		this.entryButton.title = localize('fishing.entry.tooltip', "Go fishing");
		this.entryButton.setAttribute('aria-label', localize('fishing.entry.aria', "Go fishing"));
		append(this.entryButton, $('span.codicon.codicon-sparkle'));

		this.boatGroup = append(this.sceneHost, $('div.boat-group'));
		this.boatGroup.setAttribute('role', 'button');
		this.boatGroup.tabIndex = 0;
		this.boatGroup.title = localize('fishing.boat.tooltip', "Click to control with arrow keys; press Space to cast");
		this.boatGroup.setAttribute('aria-label', localize('fishing.boat.aria', "Fishing boat"));
		append(this.boatGroup, $('.row-sprite'));

		this.applyBoatPosition();

		this._register(addDisposableListener(this.entryButton, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this.reveal();
		}));

		this._register(addDisposableListener(this.boatGroup, EventType.MOUSE_DOWN, e => {
			if (!this.revealed) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			this.activate();
		}));

		const doc = parent.ownerDocument;
		this._register(addDisposableListener(doc, EventType.MOUSE_DOWN, e => {
			if (!this.active) {
				return;
			}
			if (e.target instanceof Node && this.boatGroup.contains(e.target)) {
				return;
			}
			this.deactivate();
		}, true));

		this._register(addDisposableListener(doc, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (!this.active) {
				return;
			}
			if (e.key === ' ' || e.key === 'Spacebar') {
				e.preventDefault();
				if (!e.repeat) {
					this.startCatch();
				}
				return;
			}
			if (this.catching) {
				return;
			}
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
				return;
			}
			e.preventDefault();
			if (!this.heldKeys.has(e.key)) {
				this.heldKeys.add(e.key);
				this.updateMovingState();
				this.startLoop();
			}
		}));

		this._register(addDisposableListener(doc, EventType.KEY_UP, (e: KeyboardEvent) => {
			if (this.heldKeys.delete(e.key)) {
				this.updateMovingState();
			}
		}));

		this._register(toDisposable(() => {
			const win = getWindow(this.sceneHost);
			if (this.rafHandle) {
				win.cancelAnimationFrame(this.rafHandle);
				this.rafHandle = 0;
			}
			if (this.catchTimeout) {
				win.clearTimeout(this.catchTimeout);
				this.catchTimeout = 0;
			}
		}));
	}

	private reveal(): void {
		if (this.revealed) {
			return;
		}
		this.revealed = true;
		this.sceneHost.dataset.state = 'idle';
	}

	private startCatch(): void {
		if (this.catching) {
			return;
		}
		this.catching = true;
		this.heldKeys.clear();
		this.updateMovingState();
		this.boatGroup.classList.add('caught');
		const win = getWindow(this.sceneHost);
		this.catchTimeout = win.setTimeout(() => {
			this.catchTimeout = 0;
			this.catching = false;
			this.boatGroup.classList.remove('caught');
		}, FishingScene.CATCH_DURATION_MS);
	}

	private activate(): void {
		if (this.active) {
			return;
		}
		this.active = true;
		this.sceneHost.dataset.state = 'active';
		this.boatGroup.focus({ preventScroll: true });
	}

	private deactivate(): void {
		if (!this.active) {
			return;
		}
		this.active = false;
		this.heldKeys.clear();
		this.sceneHost.dataset.state = 'idle';
		this.updateMovingState();
		if (this.catching) {
			this.catching = false;
			this.boatGroup.classList.remove('caught');
			const win = getWindow(this.sceneHost);
			if (this.catchTimeout) {
				win.clearTimeout(this.catchTimeout);
				this.catchTimeout = 0;
			}
		}
	}

	private updateMovingState(): void {
		const left = this.heldKeys.has('ArrowLeft');
		const right = this.heldKeys.has('ArrowRight');
		const moving = this.active && (left !== right); // exactly one direction
		this.boatGroup.classList.toggle('moving', moving);
		if (left && !right) {
			this.boatGroup.classList.add('face-left');
		} else if (right && !left) {
			this.boatGroup.classList.remove('face-left');
		}
	}

	private startLoop(): void {
		if (this.rafHandle) {
			return;
		}
		const win = getWindow(this.sceneHost);
		this.lastFrameTime = win.performance.now();
		const tick = (now: number) => {
			this.rafHandle = 0;
			if (!this.active) {
				return;
			}
			const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
			this.lastFrameTime = now;

			const left = this.heldKeys.has('ArrowLeft');
			const right = this.heldKeys.has('ArrowRight');
			const dir = (right ? 1 : 0) - (left ? 1 : 0);

			if (dir !== 0) {
				const maxX = Math.max(0, this.sceneHost.clientWidth - FishingScene.BOAT_WIDTH - FishingScene.EDGE_PADDING * 2);
				this.boatX = Math.max(0, Math.min(maxX, this.boatX + dir * FishingScene.SPEED_PX_PER_SEC * dt));
				this.applyBoatPosition();
				this.rafHandle = win.requestAnimationFrame(tick);
			}
		};
		this.rafHandle = win.requestAnimationFrame(tick);
	}

	private applyBoatPosition(): void {
		this.boatGroup.style.setProperty('--boat-x', `${this.boatX}px`);
	}
}
