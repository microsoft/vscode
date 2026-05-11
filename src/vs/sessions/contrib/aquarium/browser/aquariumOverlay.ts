/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableGenericMouseDownListener, addDisposableGenericMouseMoveListener, addDisposableListener, EventType, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { SessionsAquariumActiveContext } from '../../../common/contextkeys.js';
import { disposeSharedFishDefs, Fish, pickRandomSpecies } from './fish.js';

export const SESSIONS_DEVELOPER_JOY_ENABLED_SETTING = 'sessions.developerJoy.enabled';

const FISH_COUNT = 50;
const FISH_MIN_SIZE = 22;
const FISH_MAX_SIZE = 48;

const SCATTER_RADIUS = 145;
const SCATTER_RADIUS_SQ = SCATTER_RADIUS * SCATTER_RADIUS;
const EAT_RADIUS = 14;
const FOOD_DETECT_RADIUS = 160;
const FOOD_DETECT_RADIUS_SQ = FOOD_DETECT_RADIUS * FOOD_DETECT_RADIUS;
const MAX_FOOD = 12;
/** Soft margin where fish start to turn back. */
const WALL_MARGIN = 36;

const BASE_SPEED = 24;
const MAX_SPEED = 50;
const MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;
const PANIC_MAX_SPEED = 240;
const PANIC_MAX_SPEED_SQ = PANIC_MAX_SPEED * PANIC_MAX_SPEED;
const PANIC_DURATION_MS = 600;
const EXIT_DURATION_MS = 900;

/** Decorative effect: 30Hz keeps motion smooth enough while halving JS work. */
const ACTIVE_FRAME_INTERVAL_MS = 1000 / 30;

/** Per-fish per-second probability of starting a spontaneous burst. */
const DART_RATE_PER_SECOND = 0.04;
const DART_IMPULSE = 150;

const ENABLED_STORAGE_KEY = 'sessions.developerJoy.enabled';

interface IFoodPellet {
	readonly element: HTMLDivElement;
	positionX: number;
	positionY: number;
	fallSpeed: number;
}

/**
 * Owns the toggle button(s), the persisted on/off preference, and the active
 * aquarium. Hosts call {@link IAquariumService.mountToggle} to attach a button
 * as a child of their container; the active aquarium itself is mounted inside
 * the chat bar part so the chat input naturally paints on top of the water.
 */
export const IAquariumService = createDecorator<IAquariumService>('aquariumService');

export interface IAquariumService {
	readonly _serviceBrand: undefined;

	/**
	 * Mount a toggle button into `parent`. Returns a handle that exposes a
	 * {@link IMountedToggleHandle.setHostVisible} hook so callers can keep the
	 * aquarium tied to their own visibility (e.g. a view pane). Disposing the
	 * handle removes the button and tears down the active aquarium if it was
	 * the last mount.
	 */
	mountToggle(parent: HTMLElement): IMountedToggleHandle;
}

export interface IMountedToggleHandle extends IDisposable {
	/**
	 * Inform the service whether this mount's host is currently visible. The
	 * aquarium is only considered active when at least one mount is visible;
	 * when the last visible mount goes invisible the aquarium is disposed
	 * synchronously (no fade-out) so it cannot flash behind a sibling view.
	 * Hosts that don't care can leave this alone — mounts default to visible.
	 */
	setHostVisible(visible: boolean): void;
}

interface IMountedToggle {
	readonly button: HTMLButtonElement;
	hostVisible: boolean;
}

export class AquariumService extends Disposable implements IAquariumService {

	declare readonly _serviceBrand: undefined;

	private readonly mainContainer: HTMLElement;

	private readonly mounts = new Set<IMountedToggle>();
	private readonly activeRef = this._register(new MutableDisposable<IActiveAquarium>());
	private readonly pendingExit = this._register(new MutableDisposable<IDisposable>());
	private readonly activeContextKey: IContextKey<boolean>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super();

		this.mainContainer = layoutService.mainContainer;
		this.activeContextKey = SessionsAquariumActiveContext.bindTo(contextKeyService);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING)) {
				this.applyFeatureEnabledState();
			}
		}));
	}

	mountToggle(parent: HTMLElement): IMountedToggleHandle {
		const doc = parent.ownerDocument;
		const button = doc.createElement('button');
		button.className = 'agents-aquarium-toggle';
		button.type = 'button';
		this.updateToggleButtonVisual(button, !!this.activeRef.value);

		const store = new DisposableStore();
		store.add(addDisposableListener(button, EventType.CLICK, e => {
			// Don't bubble into the chat widget's own click handlers.
			e.preventDefault();
			e.stopPropagation();
			this.toggle();
		}));
		const hoverDelegate = store.add(createInstantHoverDelegate());
		store.add(this.hoverService.setupManagedHover(
			hoverDelegate,
			button,
			() => this.getToggleLabel(!!this.activeRef.value),
		));

		parent.appendChild(button);

		const mount: IMountedToggle = { button, hostVisible: true };
		this.mounts.add(mount);
		this.applyFeatureEnabledStateForButton(button);
		this.reconcileActivation();

		return {
			setHostVisible: (visible: boolean) => {
				if (mount.hostVisible === visible) {
					return;
				}
				mount.hostVisible = visible;
				this.reconcileActivation();
			},
			dispose: () => {
				store.dispose();
				button.remove();
				this.mounts.delete(mount);
				this.reconcileActivation();
			},
		};
	}

	/**
	 * Activate when at least one mount is host-visible and the user has it on;
	 * otherwise deactivate synchronously (no fade) so the aquarium can't flash
	 * behind a sibling view during a view swap.
	 */
	private reconcileActivation(): void {
		const anyHostVisible = this.hasVisibleMount();
		if (anyHostVisible && this.isFeatureEnabled() && this.isStoredEnabled() && !this.activeRef.value) {
			this.activate(/* persist */ false);
		} else if (!anyHostVisible) {
			// Host hide: dispose any active aquarium synchronously AND cancel
			// any in-flight animated exit (from a prior user toggle-off) so it
			// can't keep painting fish behind whatever view took our place.
			this.pendingExit.clear();
			if (this.activeRef.value) {
				this.deactivate(/* persist */ false, /* animate */ false);
			}
		}
	}

	private hasVisibleMount(): boolean {
		for (const m of this.mounts) {
			if (m.hostVisible) {
				return true;
			}
		}
		return false;
	}

	private isFeatureEnabled(): boolean {
		return this.configurationService.getValue<boolean>(SESSIONS_DEVELOPER_JOY_ENABLED_SETTING) === true;
	}

	private isStoredEnabled(): boolean {
		return this.storageService.getBoolean(ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private setStoredEnabled(enabled: boolean): void {
		this.storageService.store(ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private applyFeatureEnabledState(): void {
		for (const mount of this.mounts) {
			this.applyFeatureEnabledStateForButton(mount.button);
		}
		if (!this.isFeatureEnabled() && this.activeRef.value) {
			// Setting turned off — don't persist so the prior preference survives a re-enable.
			this.deactivate(/* persist */ false);
		} else if (this.isFeatureEnabled()) {
			this.reconcileActivation();
		}
	}

	private applyFeatureEnabledStateForButton(button: HTMLButtonElement): void {
		button.style.display = this.isFeatureEnabled() ? '' : 'none';
	}

	private updateToggleButtonVisual(button: HTMLButtonElement, active: boolean): void {
		button.classList.toggle('active', active);
		// Build the icon as a real DOM child instead of innerHTML to satisfy Trusted Types.
		button.replaceChildren();
		const iconSpan = button.ownerDocument.createElement('span');
		if (active) {
			const iconClasses = ThemeIcon.asClassName(Codicon.close).split(/\s+/).filter(Boolean);
			for (const cls of iconClasses) {
				iconSpan.classList.add(cls);
			}
		} else {
			iconSpan.classList.add('agents-aquarium-toggle-logo');
		}
		button.appendChild(iconSpan);
		const label = this.getToggleLabel(active);
		button.setAttribute('aria-pressed', String(active));
		button.setAttribute('aria-label', label);
	}

	private getToggleLabel(active: boolean): string {
		return active ? localize('aquarium.hide', "Hide Aquarium") : localize('aquarium.show', "Show Aquarium");
	}

	private toggle(): void {
		if (this.activeRef.value) {
			this.deactivate(/* persist */ true);
		} else if (this.hasVisibleMount()) {
			this.activate(/* persist */ true);
		}
	}

	private updateAllToggleButtonsVisual(active: boolean): void {
		for (const mount of this.mounts) {
			this.updateToggleButtonVisual(mount.button, active);
		}
	}

	/** @param persist false when restoring previously-stored state. */
	private activate(persist: boolean): void {
		if (this.activeRef.value) {
			return;
		}
		// Cancel any in-flight exit so its delayed dispose can't tear down
		// the new aquarium's shared SVG defs.
		this.pendingExit.clear();
		let active: IActiveAquarium | undefined;
		try {
			active = createActiveAquarium(this.mainContainer, this.layoutService, this.accessibilityService);
		} catch (e) {
			console.error('[aquarium] failed to activate', e);
			return;
		}
		// No host (e.g. chat bar isn't visible yet) — leave the toggle
		// untouched and don't persist; a later toggle attempt will retry.
		if (!active) {
			return;
		}
		this.activeRef.value = active;
		this.activeContextKey.set(true);
		this.updateAllToggleButtonsVisual(true);
		if (persist) {
			this.setStoredEnabled(true);
		}
	}

	/**
	 * @param persist false when tearing down for non-user reasons.
	 * @param animate false to dispose synchronously (no fade-out). Used for
	 * host-driven teardown where running a 900ms fade would let fish stay
	 * visible while the next view layers on top.
	 */
	private deactivate(persist: boolean, animate: boolean = true): void {
		if (!animate) {
			this.activeRef.clear();
			this.activeContextKey.set(false);
			this.updateAllToggleButtonsVisual(false);
			if (persist) {
				this.setStoredEnabled(false);
			}
			return;
		}
		// Detach from activeRef WITHOUT disposing (clearAndLeak) so the exit
		// animation can run; the returned handle from active.exit() is parked
		// in `pendingExit` and disposes the underlying store either when the
		// animation completes, when the service tears down, or when a rapid
		// re-activate replaces it.
		const active = this.activeRef.clearAndLeak();
		if (!active) {
			return;
		}
		this.activeContextKey.set(false);
		this.updateAllToggleButtonsVisual(false);
		const pending = active.exit(() => {
			if (this.pendingExit.value === pending) {
				this.pendingExit.clear();
			}
		});
		this.pendingExit.value = pending;
		if (persist) {
			this.setStoredEnabled(false);
		}
	}
}

interface IActiveAquarium extends IDisposable {
	/**
	 * Trigger the exit animation and dispose when it completes. Disposing the
	 * returned handle before the animation finishes disposes immediately.
	 */
	exit(onDidComplete: () => void): IDisposable;
}

/**
 * Build the live aquarium: water, fish, food, mouse handling, RAF loop.
 * Returns `undefined` if the chat bar isn't available so callers can bail
 * without leaving the toggle button stuck in an "active but invisible" state.
 */
function createActiveAquarium(mainContainer: HTMLElement, layoutService: IWorkbenchLayoutService, accessibilityService: IAccessibilityService): IActiveAquarium | undefined {
	const targetWindow = getWindow(mainContainer);

	// Host inside the chat bar so chat input UI naturally paints on top —
	// no z-index gymnastics required.
	const chatBar = layoutService.getContainer(targetWindow, Parts.CHATBAR_PART);
	if (!chatBar || !layoutService.isVisible(Parts.CHATBAR_PART, targetWindow)) {
		return undefined;
	}

	const store = new DisposableStore();
	const doc = targetWindow.document;
	const water = doc.createElement('div');
	water.className = 'agents-aquarium-water';
	// Decorative: hide the entire subtree from a11y tree.
	water.setAttribute('aria-hidden', 'true');
	// First child so subsequent chat bar content paints over it.
	chatBar.insertBefore(water, chatBar.firstChild);
	store.add(toDisposable(() => water.remove()));

	const fishLayer = doc.createElement('div');
	fishLayer.className = 'agents-aquarium-fish-layer';
	water.appendChild(fishLayer);

	const foodLayer = doc.createElement('div');
	foodLayer.className = 'agents-aquarium-food-layer';
	water.appendChild(foodLayer);

	const bounds = { width: 0, height: 0 };
	// Cached so the per-mousemove handler doesn't trigger a layout flush.
	const waterScreenOffset = { left: 0, top: 0 };
	const updateBounds = () => {
		bounds.width = water.clientWidth;
		bounds.height = water.clientHeight;
		const rect = water.getBoundingClientRect();
		waterScreenOffset.left = rect.left;
		waterScreenOffset.top = rect.top;
	};

	const fish: Fish[] = [];

	updateBounds();
	const resizeObserver = new ResizeObserver(() => {
		updateBounds();
		for (const f of fish) {
			f.positionX = Math.min(f.positionX, Math.max(0, bounds.width - f.size));
			f.positionY = Math.min(f.positionY, Math.max(0, bounds.height - f.size));
		}
	});
	resizeObserver.observe(water);
	store.add(toDisposable(() => resizeObserver.disconnect()));

	for (let i = 0; i < FISH_COUNT; i++) {
		const size = randomBetween(FISH_MIN_SIZE, FISH_MAX_SIZE);
		const angle = Math.random() * Math.PI * 2;
		const speed = randomBetween(BASE_SPEED * 0.6, BASE_SPEED * 1.2);
		const f = new Fish({
			species: pickRandomSpecies(),
			size,
			positionX: randomBetween(0, Math.max(1, bounds.width - size)),
			positionY: randomBetween(0, Math.max(1, bounds.height - size)),
			velocityX: Math.cos(angle) * speed,
			velocityY: Math.sin(angle) * speed,
		}, targetWindow.document);
		fish.push(f);
	}
	// Spawn in two batches: first half synchronous (single layout pass via
	// DocumentFragment), rest on the next frame so the toggle click stays snappy.
	const SYNC_BATCH = Math.ceil(FISH_COUNT / 2);
	const firstBatch = targetWindow.document.createDocumentFragment();
	for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
		firstBatch.appendChild(fish[i].element);
	}
	fishLayer.appendChild(firstBatch);
	let exiting = false;

	if (SYNC_BATCH < fish.length) {
		const deferred = scheduleAtNextAnimationFrame(targetWindow, () => {
			if (exiting) {
				return;
			}
			const restBatch = targetWindow.document.createDocumentFragment();
			for (let i = SYNC_BATCH; i < fish.length; i++) {
				restBatch.appendChild(fish[i].element);
			}
			fishLayer.appendChild(restBatch);
			// Add `.visible` on the NEXT frame so a paint at opacity:0 happens
			// first — guarantees the CSS transition fires.
			const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
				if (exiting) {
					return;
				}
				for (let i = SYNC_BATCH; i < fish.length; i++) {
					const localIndex = i - SYNC_BATCH;
					const delay = Math.min(localIndex * 12, 400);
					fish[i].element.style.transitionDelay = `${delay}ms`;
					fish[i].element.classList.add('visible');
				}
			});
			store.add(fadeIn);
		});
		store.add(deferred);
	}
	store.add(toDisposable(() => {
		for (const f of fish) {
			f.element.remove();
		}
		// Tear down shared SVG defs so we don't leak across reloads.
		disposeSharedFishDefs(targetWindow.document);
	}));

	const food: IFoodPellet[] = [];
	const removeFood = (pellet: IFoodPellet) => {
		const idx = food.indexOf(pellet);
		if (idx !== -1) {
			food.splice(idx, 1);
			pellet.element.remove();
		}
	};

	// Listen on the main container so we always know cursor position even
	// when over the chat input (water has pointer-events:none).
	//
	// Coalesce updateBounds() across scroll/resize storms: scroll with capture
	// fires for ANY descendant scroll, and updateBounds() reads layout. Mark
	// dirty here and let the RAF tick refresh at most once per frame.
	let boundsDirty = false;
	const markBoundsDirty = () => { boundsDirty = true; };
	store.add(addDisposableListener(targetWindow, EventType.RESIZE, markBoundsDirty, { passive: true }));
	store.add(addDisposableListener(targetWindow, 'scroll', markBoundsDirty, { passive: true, capture: true }));

	let mouseX = -1e6;
	let mouseY = -1e6;
	const resetMousePosition = () => {
		mouseX = -1e6;
		mouseY = -1e6;
	};
	// Generic helpers so this also works under iOS pointer events.
	store.add(addDisposableGenericMouseMoveListener(mainContainer, (e: MouseEvent) => {
		mouseX = e.clientX - waterScreenOffset.left;
		mouseY = e.clientY - waterScreenOffset.top;
	}));
	// Both mouseleave AND pointerleave so reset works on touch/pointer-only platforms.
	store.add(addDisposableListener(mainContainer, EventType.MOUSE_LEAVE, resetMousePosition, { passive: true }));
	store.add(addDisposableListener(mainContainer, EventType.POINTER_LEAVE, resetMousePosition, { passive: true }));

	store.add(addDisposableGenericMouseDownListener(mainContainer, (e: MouseEvent) => {
		// Only spawn food on plain left clicks against background-ish surfaces.
		if (e.button !== 0) {
			return;
		}
		const target = e.target as HTMLElement | null;
		if (!isBackgroundClick(target)) {
			return;
		}
		// Refresh once to be safe (mousedown is rare).
		updateBounds();
		const dropX = e.clientX - waterScreenOffset.left;
		const dropY = e.clientY - waterScreenOffset.top;
		if (dropX < 0 || dropY < 0 || dropX > bounds.width || dropY > bounds.height) {
			return;
		}
		spawnFood(dropX, dropY);
	}));

	function spawnFood(dropX: number, dropY: number): void {
		// Cap concurrent food: drop the oldest pellet to make room.
		while (food.length >= MAX_FOOD) {
			const oldest = food[0];
			removeFood(oldest);
		}
		const el = doc.createElement('div');
		el.className = 'agents-aquarium-food';
		el.style.transform = `translate(${dropX}px, ${dropY}px)`;
		foodLayer.appendChild(el);
		food.push({ element: el, positionX: dropX, positionY: dropY, fallSpeed: randomBetween(20, 35) });
	}

	let lastFrame = performance.now();
	let rafDisposable: IDisposable | undefined;

	const stopAnimation = () => {
		rafDisposable?.dispose();
		rafDisposable = undefined;
	};
	const startAnimation = () => {
		if (rafDisposable || accessibilityService.isMotionReduced()) {
			return;
		}
		lastFrame = performance.now();
		rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
	};

	const tick = () => {
		rafDisposable = undefined;
		const now = performance.now();
		const elapsedMs = now - lastFrame;
		if (elapsedMs < ACTIVE_FRAME_INTERVAL_MS) {
			rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
			return;
		}

		const dtMs = Math.min(elapsedMs, 100); // clamp big stalls
		const dt = dtMs / 1000;
		lastFrame = now;

		if (boundsDirty) {
			boundsDirty = false;
			updateBounds();
		}

		// Skip work when window is hidden (RAF stays alive lazily).
		if (!accessibilityService.isMotionReduced() && targetWindow.document.visibilityState !== 'hidden') {
			updateFood(dt);
			updateFish(dt);
		}

		if (!accessibilityService.isMotionReduced()) {
			rafDisposable = scheduleAtNextAnimationFrame(targetWindow, tick);
		}
	};

	function updateFood(dt: number): void {
		for (let i = food.length - 1; i >= 0; i--) {
			const pellet = food[i];
			pellet.positionY += pellet.fallSpeed * dt;
			pellet.element.style.transform = `translate(${pellet.positionX.toFixed(1)}px, ${pellet.positionY.toFixed(1)}px)`;
			if (pellet.positionY > bounds.height + 10) {
				removeFood(pellet);
			}
		}
	}

	function updateFish(dt: number): void {
		const now = performance.now();
		for (const f of fish) {
			const centerX = f.positionX + f.size / 2;
			const centerY = f.positionY + f.size / 2;

			// Wall steering: turn the heading (not just acceleration) away from
			// walls, otherwise fish park against the edge with their thrust
			// pinning them in place.
			const wallEscapeAngle = computeWallAvoidAngle(centerX, centerY, bounds.width, bounds.height);
			if (wallEscapeAngle !== undefined) {
				// Turn at up to 4 rad/s toward the safe direction.
				const turnDelta = shortestAngleDelta(f.wanderAngle, wallEscapeAngle);
				const maxTurnPerFrame = 4 * dt;
				f.wanderAngle += Math.max(-maxTurnPerFrame, Math.min(maxTurnPerFrame, turnDelta));
			} else {
				// Free water: drift the heading by a small random delta.
				f.wanderAngle += (Math.random() - 0.5) * 1.2 * dt + (Math.random() - 0.5) * 0.04;
			}

			const thrust = 32;
			let accelX = Math.cos(f.wanderAngle) * thrust;
			let accelY = Math.sin(f.wanderAngle) * thrust;

			// Spontaneous dart with brief panic so it can exceed normal max speed.
			if (Math.random() < DART_RATE_PER_SECOND * dt) {
				const dartAngle = Math.random() * Math.PI * 2;
				f.velocityX += Math.cos(dartAngle) * DART_IMPULSE;
				f.velocityY += Math.sin(dartAngle) * DART_IMPULSE;
				f.panicUntil = now + PANIC_DURATION_MS;
			}

			// Wall repel — backstop so a fish entering the margin is pushed inward immediately.
			if (centerX < WALL_MARGIN) {
				accelX += (WALL_MARGIN - centerX) * 6;
			} else if (centerX > bounds.width - WALL_MARGIN) {
				accelX -= (centerX - (bounds.width - WALL_MARGIN)) * 6;
			}
			if (centerY < WALL_MARGIN) {
				accelY += (WALL_MARGIN - centerY) * 6;
			} else if (centerY > bounds.height - WALL_MARGIN) {
				accelY -= (centerY - (bounds.height - WALL_MARGIN)) * 6;
			}

			// Mouse scatter
			const mouseDeltaX = centerX - mouseX;
			const mouseDeltaY = centerY - mouseY;
			const mouseDistSq = mouseDeltaX * mouseDeltaX + mouseDeltaY * mouseDeltaY;
			if (mouseDistSq < SCATTER_RADIUS_SQ) {
				const mouseDist = Math.max(Math.sqrt(mouseDistSq), 1);
				const force = (1 - mouseDist / SCATTER_RADIUS) * 1100;
				accelX += (mouseDeltaX / mouseDist) * force;
				accelY += (mouseDeltaY / mouseDist) * force;
				f.panicUntil = now + PANIC_DURATION_MS;
			}

			// Seek nearest food within FOOD_DETECT_RADIUS
			let nearestPellet: IFoodPellet | undefined;
			let nearestDistSq = FOOD_DETECT_RADIUS_SQ;
			for (const pellet of food) {
				const foodDeltaX = pellet.positionX - centerX;
				const foodDeltaY = pellet.positionY - centerY;
				const distSq = foodDeltaX * foodDeltaX + foodDeltaY * foodDeltaY;
				if (distSq < nearestDistSq) {
					nearestDistSq = distSq;
					nearestPellet = pellet;
				}
			}
			if (nearestPellet) {
				const nearestDist = Math.max(Math.sqrt(nearestDistSq), 1);
				if (nearestDist < EAT_RADIUS) {
					removeFood(nearestPellet);
				} else {
					accelX += (nearestPellet.positionX - centerX) / nearestDist * 200;
					accelY += (nearestPellet.positionY - centerY) / nearestDist * 200;
				}
			}

			f.velocityX += accelX * dt;
			f.velocityY += accelY * dt;

			const speedSq = f.velocityX * f.velocityX + f.velocityY * f.velocityY;
			const maxSpeed = now < f.panicUntil ? PANIC_MAX_SPEED : MAX_SPEED;
			const maxSpeedSq = now < f.panicUntil ? PANIC_MAX_SPEED_SQ : MAX_SPEED_SQ;
			if (speedSq > maxSpeedSq) {
				const speed = Math.sqrt(speedSq);
				f.velocityX = (f.velocityX / speed) * maxSpeed;
				f.velocityY = (f.velocityY / speed) * maxSpeed;
			}

			f.positionX += f.velocityX * dt;
			f.positionY += f.velocityY * dt;

			// Hard clamp safety net.
			f.positionX = clamp(f.positionX, -f.size * 0.25, bounds.width - f.size * 0.75);
			f.positionY = clamp(f.positionY, -f.size * 0.25, bounds.height - f.size * 0.75);

			f.applyTransform(dt);
		}
	}

	store.add(accessibilityService.onDidChangeReducedMotion(() => {
		if (accessibilityService.isMotionReduced()) {
			stopAnimation();
		} else {
			startAnimation();
		}
	}));
	store.add(toDisposable(() => stopAnimation()));
	startAnimation();

	// First-batch fade-in (the deferred batch fades in when it mounts).
	const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
		if (exiting) {
			return;
		}
		water.classList.add('visible');
		for (let i = 0; i < Math.min(SYNC_BATCH, fish.length); i++) {
			const f = fish[i];
			// Slight stagger, capped at ~400ms so it doesn't drag on.
			const delay = Math.min(i * 12, 400);
			f.element.style.transitionDelay = `${delay}ms`;
			f.element.classList.add('visible');
		}
	});
	store.add(fadeIn);

	const result = new class extends Disposable implements IActiveAquarium {

		constructor() {
			super();
			this._register(store);
		}

		exit(onDidComplete: () => void): IDisposable {
			if (exiting) {
				return toDisposable(() => this.dispose());
			}
			exiting = true;

			for (let i = 0; i < fish.length; i++) {
				const f = fish[i];
				const delay = Math.min(i * 12, 400);
				f.element.style.transitionDelay = `${delay}ms`;
				f.element.classList.remove('visible');
			}
			water.classList.remove('visible');

			let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
				timer = undefined;
				this.dispose();
				onDidComplete();
			}, EXIT_DURATION_MS);
			return toDisposable(() => {
				if (timer !== undefined) {
					clearTimeout(timer);
					timer = undefined;
				}
				this.dispose();
			});
		}
	};

	return result;
}

/** True for clicks not on a control — i.e. safe targets for spawning food. */
function isBackgroundClick(target: HTMLElement | null): boolean {
	if (!target) {
		return false;
	}
	if (target.closest('input, textarea, select, button, a, [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="menuitem"], [role="tab"], .monaco-editor, .scroll-decoration, .monaco-list-row')) {
		return false;
	}
	return true;
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

/**
 * If the fish is inside the wall margin, return the heading (radians) pointing
 * back into open water. Returns `undefined` when the fish is comfortably away
 * from all walls. Direction sums per-wall vectors weighted by encroachment,
 * with a small tangential perturbation so neighbors don't all converge to the
 * same heading.
 */
function computeWallAvoidAngle(centerX: number, centerY: number, width: number, height: number): number | undefined {
	let escapeX = 0;
	let escapeY = 0;
	if (centerX < WALL_MARGIN) {
		escapeX += (WALL_MARGIN - centerX) / WALL_MARGIN;
	} else if (centerX > width - WALL_MARGIN) {
		escapeX -= (centerX - (width - WALL_MARGIN)) / WALL_MARGIN;
	}
	if (centerY < WALL_MARGIN) {
		escapeY += (WALL_MARGIN - centerY) / WALL_MARGIN;
	} else if (centerY > height - WALL_MARGIN) {
		escapeY -= (centerY - (height - WALL_MARGIN)) / WALL_MARGIN;
	}
	if (escapeX === 0 && escapeY === 0) {
		return undefined;
	}
	return Math.atan2(escapeY, escapeX) + (Math.random() - 0.5) * 0.4;
}

/** Smallest signed angular delta from `from` to `to`, in [-PI, PI]. */
function shortestAngleDelta(from: number, to: number): number {
	let delta = (to - from) % (Math.PI * 2);
	if (delta > Math.PI) {
		delta -= Math.PI * 2;
	} else if (delta < -Math.PI) {
		delta += Math.PI * 2;
	}
	return delta;
}
