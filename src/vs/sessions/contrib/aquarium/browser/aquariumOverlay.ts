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
import { Bubble } from './bubble.js';
import { disposeSharedFishDefs, Fish, FishSpecies, pickRandomSpecies } from './fish.js';

export const SESSIONS_DEVELOPER_JOY_ENABLED_SETTING = 'sessions.developerJoy.enabled';

/**
 * Hidden, **unregistered** configuration key that activates the
 * sessions-aware aquarium experience (1:1 fish ↔ session, activity bubbles,
 * collapse-mode chat input, submit-grows-a-fish).
 *
 * Intentionally NOT registered with the configuration schema: it must not
 * appear in Settings UI, IntelliSense for `settings.json`, default settings
 * exports, or product docs. To opt in, hand-edit `settings.json` and set the
 * key to `true`.
 *
 * **Do not add this to `aquarium.contribution.ts`'s `registerConfiguration`
 * block.** The combined gate (this + {@link SESSIONS_DEVELOPER_JOY_ENABLED_SETTING}
 * + agent-host scope) is what flips the feature on.
 */
export const SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING = 'sessions.developerJoy.aquariumAsSessions';

/**
 * Read the hidden gate. Strictly compares to `true` so a misformatted value
 * (e.g. the string `"true"`) does not silently activate the experience.
 */
export function isAquariumAsSessionsEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(SESSIONS_DEVELOPER_JOY_AQUARIUM_AS_SESSIONS_SETTING) === true;
}

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

/** Soft cap on simultaneously visible activity bubbles to keep the scene legible. */
const MAX_BUBBLES = 6;

interface IFoodPellet {
	readonly element: HTMLDivElement;
	positionX: number;
	positionY: number;
	fallSpeed: number;
}

// #region --- Population driver API -------------------------------------------------------

/**
 * Options accepted by {@link IAquariumHost.addFish}. Any field left undefined
 * falls back to the random-crowd defaults the engine has always used (random
 * size in [{@link FISH_MIN_SIZE}, {@link FISH_MAX_SIZE}], random heading,
 * weighted random species, random position inside the water bounds).
 */
export interface IAddFishOptions {
	readonly species?: FishSpecies;
	readonly size?: number;
	readonly positionX?: number;
	readonly positionY?: number;
	readonly velocityX?: number;
	readonly velocityY?: number;
	/** Stagger delay applied as `transition-delay` before adding `.visible`. */
	readonly fadeInDelayMs?: number;
}

/**
 * Handle returned to drivers for each fish they add. Owns the underlying
 * {@link Fish} and provides a fade-out path that respects the engine's exit
 * timing. Disposing the handle removes the fish synchronously without a fade.
 */
export interface IFishHandle extends IDisposable {
	readonly fish: Fish;
	/**
	 * Start a swim-out fade and dispose this handle when it completes.
	 * Idempotent: subsequent calls (or a direct dispose) are no-ops.
	 */
	fadeOut(delayMs?: number): void;
}

/**
 * Driver-facing surface for an active aquarium. The engine owns the water,
 * the food/RAF loop, mouse handling, and exit animation; drivers only decide
 * which fish exist.
 */
export interface IAquariumHost {
	readonly targetWindow: Window;
	readonly mainContainer: HTMLElement;
	/** Reflects the current size of the water in pixels. Mutated in place by the engine. */
	readonly bounds: { readonly width: number; readonly height: number };
	addFish(opts?: IAddFishOptions): IFishHandle;
	/**
	 * Show (or update) an activity bubble above the given fish. When a bubble
	 * already exists for this fish, the text is replaced and the dwell timer
	 * is reset; otherwise a fresh bubble is created (subject to the engine's
	 * global cap, which evicts the oldest non-hovered bubble when exceeded).
	 *
	 * No-op if the handle is unknown to the engine (already disposed) or the
	 * aquarium is exiting.
	 */
	showBubble(handle: IFishHandle, text: string): void;
}

/**
 * Strategy supplied to the engine to populate an active aquarium. The engine
 * calls {@link IAquariumPopulationDriver.attach} once during activation; the
 * driver typically registers reactive listeners and calls
 * {@link IAquariumHost.addFish} as data changes. Disposing the driver runs
 * when the aquarium is being torn down or the driver is being swapped.
 */
export interface IAquariumPopulationDriver extends IDisposable {
	attach(host: IAquariumHost): void;
}

/**
 * Optional mount configuration. Today the only knob is the population
 * driver factory; future per-mount knobs (e.g. opt out of the toggle button)
 * land here.
 */
export interface IMountToggleOptions {
	/**
	 * If supplied, the active aquarium will use a driver instantiated from
	 * this factory instead of the default random-crowd driver. Pass
	 * `undefined` (or omit) to keep the default.
	 *
	 * Equivalent to {@link IMountedToggleHandle.setDriverFactory} called
	 * with the same value at mount time.
	 */
	readonly driverFactory?: () => IAquariumPopulationDriver;
}

// #endregion

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
	 *
	 * `opts.driverFactory` selects a custom population driver. The most
	 * recently set factory across all mounts wins; this is fine because today
	 * there is only one consumer (the new chat view).
	 */
	mountToggle(parent: HTMLElement, opts?: IMountToggleOptions): IMountedToggleHandle;
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

	/**
	 * Replace the population driver. Pass `undefined` to revert to the
	 * default random-crowd driver.
	 *
	 * If the aquarium is currently active, the running driver is disposed,
	 * all existing fish are removed synchronously (no fade — used for an
	 * internal swap, not a user-visible exit), and the new driver is
	 * attached. If no aquarium is active, the factory is just stored for
	 * the next activation.
	 */
	setDriverFactory(factory: (() => IAquariumPopulationDriver) | undefined): void;
}

interface IMountedToggle {
	readonly button: HTMLButtonElement;
	hostVisible: boolean;
	driverFactory: (() => IAquariumPopulationDriver) | undefined;
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

	mountToggle(parent: HTMLElement, opts?: IMountToggleOptions): IMountedToggleHandle {
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

		const mount: IMountedToggle = { button, hostVisible: true, driverFactory: opts?.driverFactory };
		this.mounts.add(mount);
		this.applyButtonVisibility(mount);
		this.applyDriverFactoryToActive();
		this.reconcileActivation();

		return {
			setHostVisible: (visible: boolean) => {
				if (mount.hostVisible === visible) {
					return;
				}
				mount.hostVisible = visible;
				this.reconcileActivation();
			},
			setDriverFactory: (factory: (() => IAquariumPopulationDriver) | undefined) => {
				if (mount.driverFactory === factory) {
					return;
				}
				const wasActive = !!this.activeRef.value;
				mount.driverFactory = factory;
				// A non-undefined factory is a developer-joy gate forcing the
				// aquarium on, so hide the manual toggle button to avoid
				// conflict; setting it back to undefined restores the button.
				this.applyButtonVisibility(mount);
				this.reconcileActivation();
				if (wasActive && this.activeRef.value) {
					// Stayed active across the change — propagate the new
					// factory by swapping drivers in place. (When newly
					// activated we skip this: activate() already created the
					// aquarium with the right factory. When newly deactivated
					// we also skip: there's nothing to swap into.)
					this.applyDriverFactoryToActive();
				}
			},
			dispose: () => {
				store.dispose();
				button.remove();
				this.mounts.delete(mount);
				this.applyDriverFactoryToActive();
				this.reconcileActivation();
			},
		};
	}

	/**
	 * Compute the most-recent driver factory across mounts (most recently
	 * set wins) and push it to the active aquarium so it can swap drivers
	 * in place. No-op if no aquarium is active or the factory is unchanged.
	 */
	private applyDriverFactoryToActive(): void {
		const factory = this.selectedDriverFactory();
		if (!this.activeRef.value) {
			return;
		}
		this.activeRef.value.swapDriver(factory);
	}

	/**
	 * The most recently set driver factory across all mounts (insertion order
	 * for `Set`). With a single consumer today this collapses to "the chat
	 * view's factory if any".
	 */
	private selectedDriverFactory(): (() => IAquariumPopulationDriver) | undefined {
		let factory: (() => IAquariumPopulationDriver) | undefined;
		for (const mount of this.mounts) {
			if (mount.driverFactory) {
				factory = mount.driverFactory;
			}
		}
		return factory;
	}

	/**
	 * Activate when at least one mount is host-visible and either the user
	 * has the aquarium toggled on or a mount has supplied a driver factory
	 * (developer-joy gate forces the aquarium on). When the host disappears,
	 * tear down synchronously so the aquarium can't flash behind a sibling
	 * view during a swap. When the activation reason goes away (factory
	 * unset and toggle off), fade out without persisting.
	 */
	private reconcileActivation(): void {
		const anyHostVisible = this.hasVisibleMount();
		if (!anyHostVisible) {
			// Host hide: dispose any active aquarium synchronously AND cancel
			// any in-flight animated exit (from a prior user toggle-off) so it
			// can't keep painting fish behind whatever view took our place.
			this.pendingExit.clear();
			if (this.activeRef.value) {
				this.deactivate(/* persist */ false, /* animate */ false);
			}
			return;
		}
		if (!this.isFeatureEnabled()) {
			return;
		}
		const shouldBeActive = this.isStoredEnabled() || this.hasAnyDriverFactory();
		if (shouldBeActive && !this.activeRef.value) {
			this.activate(/* persist */ false);
		} else if (!shouldBeActive && this.activeRef.value) {
			// Reason for being active is gone (gate flipped off, user hadn't
			// toggled the legacy aquarium on) — fade out without persisting
			// so a future toggle still reflects user preference.
			this.deactivate(/* persist */ false);
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

	private hasAnyDriverFactory(): boolean {
		for (const m of this.mounts) {
			if (m.driverFactory) {
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
			this.applyButtonVisibility(mount);
		}
		if (!this.isFeatureEnabled() && this.activeRef.value) {
			// Setting turned off — don't persist so the prior preference survives a re-enable.
			this.deactivate(/* persist */ false);
		} else if (this.isFeatureEnabled()) {
			this.reconcileActivation();
		}
	}

	private applyButtonVisibility(mount: IMountedToggle): void {
		// Hide the button when the public feature flag is off, or when this
		// mount is being externally driven by a population driver factory —
		// in that case the host is forcing the aquarium on and a manual
		// hide-toggle would just create a confusing visual conflict.
		const shouldShow = this.isFeatureEnabled() && !mount.driverFactory;
		mount.button.style.display = shouldShow ? '' : 'none';
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
			active = createActiveAquarium(
				this.mainContainer,
				this.layoutService,
				this.accessibilityService,
				this.selectedDriverFactory(),
			);
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

	/**
	 * Replace the active population driver in place. The previous driver is
	 * disposed, all current fish are removed synchronously (no fade — used
	 * for an internal swap, not a user-visible exit), and the new driver is
	 * attached. Pass `undefined` to revert to the default random crowd.
	 *
	 * No-op if the aquarium is already exiting.
	 */
	swapDriver(factory: (() => IAquariumPopulationDriver) | undefined): void;
}

/**
 * Build the live aquarium: water, fish, food, mouse handling, RAF loop.
 * Returns `undefined` if the chat bar isn't available so callers can bail
 * without leaving the toggle button stuck in an "active but invisible" state.
 */
function createActiveAquarium(
	mainContainer: HTMLElement,
	layoutService: IWorkbenchLayoutService,
	accessibilityService: IAccessibilityService,
	populationDriverFactory: (() => IAquariumPopulationDriver) | undefined,
): IActiveAquarium | undefined {
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

	// Bubble layer is ABOVE fish/food so activity bubbles paint on top and
	// remain readable even when fish school over each other.
	const bubbleLayer = doc.createElement('div');
	bubbleLayer.className = 'agents-aquarium-bubble-layer';
	bubbleLayer.setAttribute('aria-hidden', 'true');
	water.appendChild(bubbleLayer);

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

	// Live fish keyed by allocation id. Insertion order is preserved by the
	// `Map` spec, which the staggered exit animation leans on.
	const fishHandles = new Map<number, FishHandle>();
	/** Active bubbles keyed by their parent fish id. */
	const bubblesByFishId = new Map<number, Bubble>();
	let nextFishId = 0;
	let exiting = false;
	let currentDriver: IAquariumPopulationDriver | undefined;

	updateBounds();
	const resizeObserver = new ResizeObserver(() => {
		updateBounds();
		for (const handle of fishHandles.values()) {
			const f = handle.fish;
			f.positionX = Math.min(f.positionX, Math.max(0, bounds.width - f.size));
			f.positionY = Math.min(f.positionY, Math.max(0, bounds.height - f.size));
		}
	});
	resizeObserver.observe(water);
	store.add(toDisposable(() => resizeObserver.disconnect()));

	// Local impl class so closure-captured state (fishHandles) is reachable
	// without making the public IFishHandle interface leak engine internals.
	class FishHandle implements IFishHandle {
		readonly id = nextFishId++;
		private _fadeOutTimer: ReturnType<typeof setTimeout> | undefined;
		private _disposed = false;
		constructor(readonly fish: Fish) { }
		fadeOut(delayMs: number = 0): void {
			if (this._disposed || this._fadeOutTimer !== undefined) {
				return;
			}
			const adjustedDelay = Math.max(0, delayMs);
			this.fish.element.style.transitionDelay = `${adjustedDelay}ms`;
			this.fish.element.classList.remove('visible');
			// The bubble (if any) should fade alongside the fish; don't leave
			// orphan markup parented to a disappearing creature.
			bubblesByFishId.get(this.id)?.fadeOut();
			this._fadeOutTimer = setTimeout(() => {
				this._fadeOutTimer = undefined;
				this.dispose();
			}, adjustedDelay + EXIT_DURATION_MS);
		}
		dispose(): void {
			if (this._disposed) {
				return;
			}
			this._disposed = true;
			if (this._fadeOutTimer !== undefined) {
				clearTimeout(this._fadeOutTimer);
				this._fadeOutTimer = undefined;
			}
			// Synchronously drop any associated bubble so a sync `dispose()`
			// (e.g. swapDriver) doesn't leak DOM.
			const bubble = bubblesByFishId.get(this.id);
			if (bubble) {
				bubblesByFishId.delete(this.id);
				bubble.dispose();
			}
			this.fish.element.remove();
			fishHandles.delete(this.id);
		}
	}

	function evictOldestEvictableBubble(): void {
		if (bubblesByFishId.size < MAX_BUBBLES) {
			return;
		}
		// Prefer the oldest non-hovered, non-already-fading bubble.
		let oldestId: number | undefined;
		let oldestCreatedAt = Infinity;
		for (const [fishId, bubble] of bubblesByFishId) {
			if (bubble.isHovered || bubble.isFading) {
				continue;
			}
			if (bubble.createdAt < oldestCreatedAt) {
				oldestCreatedAt = bubble.createdAt;
				oldestId = fishId;
			}
		}
		if (oldestId !== undefined) {
			// Trigger a fade-out; the bubble's onExpired handler will clean up.
			bubblesByFishId.get(oldestId)?.fadeOut();
		}
	}

	const host: IAquariumHost = {
		targetWindow,
		mainContainer,
		bounds,
		addFish: (opts: IAddFishOptions = {}): IFishHandle => {
			const size = opts.size ?? randomBetween(FISH_MIN_SIZE, FISH_MAX_SIZE);
			const positionX = opts.positionX ?? randomBetween(0, Math.max(1, bounds.width - size));
			const positionY = opts.positionY ?? randomBetween(0, Math.max(1, bounds.height - size));
			let velocityX = opts.velocityX;
			let velocityY = opts.velocityY;
			if (velocityX === undefined || velocityY === undefined) {
				const angle = Math.random() * Math.PI * 2;
				const speed = randomBetween(BASE_SPEED * 0.6, BASE_SPEED * 1.2);
				velocityX = Math.cos(angle) * speed;
				velocityY = Math.sin(angle) * speed;
			}
			const species = opts.species ?? pickRandomSpecies();
			const fish = new Fish({
				species,
				size,
				positionX,
				positionY,
				velocityX,
				velocityY,
			}, doc);
			fishLayer.appendChild(fish.element);
			const handle = new FishHandle(fish);
			fishHandles.set(handle.id, handle);
			// Add `.visible` on the NEXT frame so a paint at opacity:0 happens
			// first — guarantees the CSS transition fires.
			const fadeInDelayMs = Math.max(0, opts.fadeInDelayMs ?? 0);
			const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
				// Bail if we're exiting or the handle was disposed before the
				// frame ran (a `Map.has` lookup avoids touching private state).
				if (exiting || !fishHandles.has(handle.id)) {
					return;
				}
				fish.element.style.transitionDelay = `${fadeInDelayMs}ms`;
				fish.element.classList.add('visible');
			});
			store.add(fadeIn);
			return handle;
		},
		showBubble: (handle: IFishHandle, text: string): void => {
			if (exiting) {
				return;
			}
			// Reject handles we no longer own. A driver could be holding a
			// stale reference after a swapDriver or fadeOut.
			const fishId = (handle as FishHandle).id;
			if (typeof fishId !== 'number' || !fishHandles.has(fishId)) {
				return;
			}
			const trimmed = text.trim();
			if (!trimmed) {
				// Clearing activity removes any active bubble.
				bubblesByFishId.get(fishId)?.fadeOut();
				return;
			}
			const existing = bubblesByFishId.get(fishId);
			if (existing) {
				existing.setText(trimmed);
				return;
			}
			evictOldestEvictableBubble();
			const bubble = new Bubble(doc, bubbleLayer, trimmed, () => {
				bubblesByFishId.delete(fishId);
			});
			bubblesByFishId.set(fishId, bubble);
		},
	};

	// Instantiate the population driver and let it populate the water.
	// Default to RandomPopulationDriver when no factory is supplied so the
	// long-standing "decorative crowd" behavior is preserved unchanged.
	const initFactory = populationDriverFactory ?? (() => new RandomPopulationDriver(targetWindow));
	currentDriver = initFactory();
	currentDriver.attach(host);

	// Final cleanup: dispose the driver, remove any remaining fish + bubbles,
	// and tear down the shared SVG defs so we don't leak across reloads.
	// Driver first so its bookkeeping doesn't try to touch fish that are
	// about to be removed.
	store.add(toDisposable(() => {
		currentDriver?.dispose();
		currentDriver = undefined;
		for (const bubble of bubblesByFishId.values()) {
			bubble.dispose();
		}
		bubblesByFishId.clear();
		for (const handle of [...fishHandles.values()]) {
			handle.dispose();
		}
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
		for (const handle of fishHandles.values()) {
			const f = handle.fish;
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

			f.tickSize(now);
			f.applyTransform(dt);
		}

		// Position any active bubbles directly above their fish. Cheap because
		// the bubble count is small (capped by MAX_BUBBLES) and we already
		// have all the fish positions locally.
		if (bubblesByFishId.size > 0) {
			for (const [fishId, bubble] of bubblesByFishId) {
				const handle = fishHandles.get(fishId);
				if (!handle) {
					continue;
				}
				const f = handle.fish;
				bubble.setPosition(f.positionX, f.positionY, f.size);
			}
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

	// Water fade-in (per-fish fade-in is handled inside `host.addFish`).
	const fadeIn = scheduleAtNextAnimationFrame(targetWindow, () => {
		if (exiting) {
			return;
		}
		water.classList.add('visible');
	});
	store.add(fadeIn);

	const result = new class extends Disposable implements IActiveAquarium {

		constructor() {
			super();
			this._register(store);
		}

		swapDriver(factory: (() => IAquariumPopulationDriver) | undefined): void {
			if (exiting) {
				return;
			}
			currentDriver?.dispose();
			currentDriver = undefined;
			// Sync clear (no fade): this is an internal swap, not a
			// user-visible exit. A staggered fade would let the previous
			// crowd briefly mix with the incoming one.
			for (const handle of [...fishHandles.values()]) {
				handle.dispose();
			}
			const nextFactory = factory ?? (() => new RandomPopulationDriver(targetWindow));
			currentDriver = nextFactory();
			currentDriver.attach(host);
		}

		exit(onDidComplete: () => void): IDisposable {
			if (exiting) {
				return toDisposable(() => this.dispose());
			}
			exiting = true;

			// Stop the driver from spawning more fish during the fade-out;
			// the engine remains alive until the animation completes.
			currentDriver?.dispose();
			currentDriver = undefined;

			// Fade bubbles alongside the fish so they don't pop out.
			for (const bubble of bubblesByFishId.values()) {
				bubble.fadeOut();
			}

			let i = 0;
			for (const handle of fishHandles.values()) {
				const delay = Math.min(i * 12, 400);
				handle.fish.element.style.transitionDelay = `${delay}ms`;
				handle.fish.element.classList.remove('visible');
				i++;
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

/**
 * Default population driver: spawns the long-standing decorative crowd of
 * {@link FISH_COUNT} fish. Split into two batches — first half synchronous,
 * rest deferred to the next animation frame — so a toggle click stays snappy.
 */
class RandomPopulationDriver extends Disposable implements IAquariumPopulationDriver {

	constructor(private readonly _targetWindow: Window) {
		super();
	}

	attach(host: IAquariumHost): void {
		const SYNC_BATCH = Math.ceil(FISH_COUNT / 2);
		for (let i = 0; i < SYNC_BATCH; i++) {
			const delay = Math.min(i * 12, 400);
			host.addFish({ fadeInDelayMs: delay });
		}
		if (SYNC_BATCH < FISH_COUNT) {
			const deferred = scheduleAtNextAnimationFrame(this._targetWindow, () => {
				for (let i = SYNC_BATCH; i < FISH_COUNT; i++) {
					const localIndex = i - SYNC_BATCH;
					const delay = Math.min(localIndex * 12, 400);
					host.addFish({ fadeInDelayMs: delay });
				}
			});
			this._register(deferred);
		}
	}
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
