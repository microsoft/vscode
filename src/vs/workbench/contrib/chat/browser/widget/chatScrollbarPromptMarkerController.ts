/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import {
	Disposable,
	IDisposable,
	MutableDisposable,
	toDisposable,
} from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import {
	ChatConfiguration,
	ChatScrollbarPromptMarkerClickBehavior,
} from '../../common/constants.js';
import {
	IChatRequestViewModel,
	IChatResponseViewModel,
	isRequestVM,
	isResponseVM,
} from '../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import {
	applyScrollbarPromptMarkerClickBehavior,
	getFocusedScrollbarPromptMarkerId,
	getScrollbarPromptMarkerDescriptors,
} from '../actions/chatPromptNavigationActions.js';

/**
 * The host surface that {@link ChatScrollbarPromptMarkerController} depends on.
 * This interface captures the subset of {@link ChatListWidget} methods used by
 * the controller, allowing it to be tested in isolation with a fake host.
 */
export interface IChatScrollbarPromptMarkerHost {
	readonly renderHeight: number;
	readonly scrollHeight: number;
	getOverviewRulerLayoutInfo(): { parent: HTMLElement; insertBefore: HTMLElement } | undefined;
	getItems(): ChatTreeItem[];
	hasElement(element: ChatTreeItem): boolean;
	getElementTop(element: ChatTreeItem): number;
	getElementHeight(element: ChatTreeItem): number;
	getFocus(): ChatTreeItem[];
	reveal(element: ChatTreeItem, relativeTop?: number): void;
	focusItem(item: ChatTreeItem): void;
}

/**
 * Manages the lifecycle, layout, and interaction of scrollbar markers on the
 * chat overview ruler.
 *
 * The controller is responsible for:
 * - Computing marker positions from chat item heights and scroll dimensions
 * - Rendering marker DOM elements (reusing existing elements across renders
 *   so CSS transitions can animate position/size changes)
 * - Resolving overlapping markers via collision detection and priority sorting
 * - Handling pointer/click events on the overview ruler, with full-width
 *   hit-testing so narrow lane markers are as clickable as the full scrollbar
 * - Deferring focus to the target chat row after scroll-induced re-renders settle
 */
export class ChatScrollbarPromptMarkerController extends Disposable {
	private readonly container = document.createElement('div');
	private readonly markerById = new Map<string, HTMLElement>();
	private readonly targetById = new Map<
		string,
		IChatRequestViewModel | IChatResponseViewModel
	>();
	private readonly parentPointerDownListener = this._register(
		new MutableDisposable(),
	);
	private readonly parentClickListener = this._register(
		new MutableDisposable(),
	);
	private readonly parentPointerUpListener = this._register(
		new MutableDisposable(),
	);
	private readonly parentPointerCancelListener = this._register(
		new MutableDisposable(),
	);
	private pointerDownListenerParent: HTMLElement | undefined;
	private visible = true;
	private enabled = true;
	private markerActivated = false;
	private suppressNextClick = false;
	private _lastScrollHeight = -1;
	private _lastRenderHeight = -1;
	private readonly _focusRetryDisposable = this._register(new MutableDisposable());
	private readonly _clickSuppressionDisposable = this._register(new MutableDisposable());

	constructor(
		private readonly host: IChatScrollbarPromptMarkerHost,
		private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(
			toDisposable(() => {
				this.cancelPendingFocusRetries();
				this.container.remove();
			}),
		);
		this.container.classList.add('chat-scrollbar-prompt-markers');
		// The marker overlay is a mouse-only visual aid. It is hidden from the
		// accessibility tree because it has no keyboard interaction path.
		// Keyboard users can navigate prompts via the Next/Previous User Prompt
		// commands, which are documented in the chat accessibility help dialog.
		this.container.setAttribute('aria-hidden', 'true');
		this.container.style.position = 'absolute';
		this.container.style.top = '0';
		this.container.style.bottom = '0';
		this.container.style.pointerEvents = 'none';
		this.container.style.display = 'none';
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (!visible) {
			this.resetGestureState();
			this.cancelPendingFocusRetries();
		}
		this.updateContainerVisibility();
	}

	/**
	 * Enable or disable the marker overlay at runtime (e.g. when the
	 * `chat.scrollbarPromptMarkers.enabled` setting changes). When disabled,
	 * the overlay container is hidden and all marker DOM nodes are cleared.
	 * When re-enabled, the overlay is re-laid-out and markers are refreshed.
	 */
	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) {
			return;
		}
		this.enabled = enabled;
		if (!enabled) {
			this.resetGestureState();
			this.cancelPendingFocusRetries();
			this.clearMarkers();
			// Fully detach the overlay and dispose the capture listeners on the
			// overview-ruler parent so the feature is a true no-op when disabled.
			// Re-enabling via layout() re-attaches the container and listeners.
			this.detachOverlay();
		}
		this.updateContainerVisibility();
		if (enabled) {
			this.layout();
		}
	}

	layout(): void {
		if (!this.enabled) {
			return;
		}

		const layoutInfo = this.host.getOverviewRulerLayoutInfo();
		if (!layoutInfo) {
			return;
		}

		if (
			this.container.parentElement !== layoutInfo.parent ||
			this.container.nextElementSibling !== layoutInfo.insertBefore
		) {
			layoutInfo.parent.insertBefore(this.container, layoutInfo.insertBefore);
		}

		const scrollbarWidth = Math.max(
			0,
			Math.round(layoutInfo.insertBefore.getBoundingClientRect().width),
		);
		this.container.style.right = '0';
		this.container.style.height = `${this.host.renderHeight}px`;
		this.container.style.width = `${scrollbarWidth}px`;
		if (this.pointerDownListenerParent !== layoutInfo.parent) {
			this.pointerDownListenerParent = layoutInfo.parent;
			this.parentPointerDownListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.POINTER_DOWN,
				(event) => this.onOverviewRulerPointerDown(event),
				true,
			);
			this.parentClickListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.CLICK,
				(event) => this.onOverviewRulerClick(event),
				true,
			);
			this.parentPointerUpListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				dom.EventType.POINTER_UP,
				(event) => this.onOverviewRulerPointerUp(event),
				true,
			);
			this.parentPointerCancelListener.value = dom.addDisposableListener(
				layoutInfo.parent,
				'pointercancel',
				() => this.onOverviewRulerPointerCancel(),
				true,
			);
		}
		this.updateContainerVisibility();
		this.renderMarkers();
	}

	refresh(): void {
		this.renderMarkers();
	}

	/**
	 * Refreshes markers only when the scroll dimensions (scrollHeight or
	 * renderHeight) have changed since the last render. This is used for
	 * scroll events, where the viewport moves but marker geometry — which
	 * is computed from element positions relative to total scroll height —
	 * does not change unless virtualization re-measures row heights.
	 */
	refreshIfDimensionsChanged(): void {
		if (this.host.scrollHeight !== this._lastScrollHeight || this.host.renderHeight !== this._lastRenderHeight) {
			this.renderMarkers();
		}
	}

	private updateContainerVisibility(): void {
		const shouldShow = this.visible && this.enabled && this.host.renderHeight > 0;
		this.container.style.display = shouldShow ? '' : 'none';
	}

	/**
	 * Detaches the overlay container from the DOM and disposes the capture
	 * listeners installed on the overview-ruler parent. Used when the marker
	 * feature is disabled so it becomes a true no-op (no DOM presence, no
	 * pointer-event interception). {@link layout} re-attaches both on re-enable.
	 */
	private detachOverlay(): void {
		this.container.remove();
		this.parentPointerDownListener.clear();
		this.parentClickListener.clear();
		this.parentPointerUpListener.clear();
		this.parentPointerCancelListener.clear();
		this.pointerDownListenerParent = undefined;
	}

	private cancelPendingFocusRetries(): void {
		this._focusRetryDisposable.clear();
	}

	private clearClickSuppression(): void {
		this.suppressNextClick = false;
		this._clickSuppressionDisposable.clear();
	}

	private resetGestureState(): void {
		this.markerActivated = false;
		this.clearClickSuppression();
	}

	private scheduleFocusRetry(targetWindow: Window, callback: () => void): IDisposable {
		let disposed = false;
		let settled = false;
		const runOnce = () => {
			if (!disposed && !settled) {
				settled = true;
				callback();
			}
		};

		const requestAnimationFrameFn = targetWindow.requestAnimationFrame?.bind(targetWindow)
			?? globalThis.requestAnimationFrame?.bind(globalThis);

		let frameHandle: number | undefined;
		if (typeof requestAnimationFrameFn === 'function') {
			frameHandle = requestAnimationFrameFn(runOnce);
		} else if (typeof queueMicrotask === 'function') {
			queueMicrotask(runOnce);
		} else {
			Promise.resolve().then(runOnce);
		}

		return toDisposable(() => {
			disposed = true;
			if (typeof frameHandle === 'number') {
				if (typeof targetWindow.cancelAnimationFrame === 'function') {
					targetWindow.cancelAnimationFrame(frameHandle);
				} else if (typeof globalThis.cancelAnimationFrame === 'function') {
					globalThis.cancelAnimationFrame(frameHandle);
				}
			}
		});
	}

	private clearMarkers(): void {
		for (const [, marker] of this.markerById) { marker.remove(); }
		this.markerById.clear();
		this.targetById.clear();
	}

	private renderMarkers(): void {
		if (!this.visible || !this.enabled) {
			this.updateContainerVisibility();
			return;
		}

		if (!this.host.getOverviewRulerLayoutInfo()) {
			return;
		}

		const scrollHeight = this.host.scrollHeight;
		const rulerHeight = this.host.renderHeight;
		if (scrollHeight <= 0 || rulerHeight <= 0) {
			for (const [, marker] of this.markerById) { marker.remove(); }
			this.markerById.clear();
			this.targetById.clear();
			this.updateContainerVisibility();
			return;
		}

		const descriptors = getScrollbarPromptMarkerDescriptors(
			this.host.getItems(),
		).filter((descriptor) => this.host.hasElement(descriptor.target));
		const activeMarkerId = this.getFocusedMarkerId();
		const markerHeightScale = rulerHeight / scrollHeight;

		const nextMarkerById = new Map<string, HTMLElement>();
		const nextTargetById = new Map<string, IChatRequestViewModel | IChatResponseViewModel>();

		const markerLayouts = descriptors.map((descriptor) => {
			const elementTop = this.host.getElementTop(descriptor.target);
			const elementHeight = this.host.getElementHeight(descriptor.target);
			const topRatio = descriptor.topRatio ?? 0;
			const heightRatio = descriptor.heightRatio ?? 1;
			const scaledTop = (elementTop + (elementHeight * topRatio)) * markerHeightScale;
			const scaledHeight = (elementHeight * heightRatio) * markerHeightScale;
			const height = Math.min(Math.max(descriptor.minHeight, Math.round(scaledHeight)), rulerHeight);
			const top = scaledHeight < descriptor.minHeight
				? scaledTop + (scaledHeight / 2) - (height / 2)
				: scaledTop;
			return { descriptor, top, height };
		}).sort((a, b) => a.top - b.top || b.descriptor.priority - a.descriptor.priority);

		for (let i = 1; i < markerLayouts.length; i++) {
			const previous = markerLayouts[i - 1];
			const current = markerLayouts[i];
			const minimumTop = previous.top + previous.height + 1;
			if (current.top < minimumTop) {
				current.top = minimumTop;
			}
		}

		for (let i = markerLayouts.length - 2; i >= 0; i--) {
			const current = markerLayouts[i];
			const next = markerLayouts[i + 1];
			const rulerMaxTop = Math.max(rulerHeight - current.height, 0);
			current.top = Math.min(current.top, next.top - current.height - 1, rulerMaxTop);
		}

		// Second forward pass: the backward pass may have pushed markers up and re-introduced overlaps;
		// re-run the forward pass to resolve any such collisions.
		for (let i = 1; i < markerLayouts.length; i++) {
			const previous = markerLayouts[i - 1];
			const current = markerLayouts[i];
			const minimumTop = previous.top + previous.height + 1;
			if (current.top < minimumTop) {
				current.top = minimumTop;
			}
		}

		for (const { descriptor, top, height } of markerLayouts) {
			const clampedTop = Math.max(0, Math.min(Math.round(top), Math.max(rulerHeight - height, 0)));

			// Reuse existing marker element so CSS transitions can animate position/size changes
			let marker = this.markerById.get(descriptor.id);
			if (!marker) {
				marker = dom.$('.chat-scrollbar-prompt-marker');
				marker.style.position = 'absolute';
				marker.style.pointerEvents = 'auto';
				marker.style.cursor = 'pointer';
				this.container.appendChild(marker);
			}

			switch (descriptor.lane) {
				case 'left':
					marker.style.left = '0';
					marker.style.right = 'auto';
					marker.style.width = '50%';
					break;
				case 'right':
					marker.style.left = 'auto';
					marker.style.right = '0';
					marker.style.width = '50%';
					break;
				default:
					marker.style.left = '0';
					marker.style.right = '0';
					marker.style.width = 'auto';
					break;
			}

			marker.dataset.markerId = descriptor.id;
			marker.dataset.requestId = descriptor.request.id;
			marker.dataset.markerType = descriptor.markerType;
			marker.dataset.lane = descriptor.lane;
			marker.style.top = `${clampedTop}px`;
			marker.style.height = `${height}px`;
			marker.style.zIndex = String(descriptor.priority);
			marker.className = `chat-scrollbar-prompt-marker chat-scrollbar-prompt-marker-type-${descriptor.markerType} chat-scrollbar-prompt-marker-lane-${descriptor.lane}`;
			marker.classList.toggle(
				'active',
				descriptor.target.id === activeMarkerId,
			);

			nextMarkerById.set(descriptor.id, marker);
			nextTargetById.set(descriptor.id, descriptor.target);
		}

		// Remove stale markers that are no longer present
		for (const [id, marker] of this.markerById) {
			if (!nextMarkerById.has(id)) {
				marker.remove();
			}
		}

		this.markerById.clear();
		for (const [id, marker] of nextMarkerById) {
			this.markerById.set(id, marker);
		}
		this.targetById.clear();
		for (const [id, target] of nextTargetById) {
			this.targetById.set(id, target);
		}
		this._lastScrollHeight = scrollHeight;
		this._lastRenderHeight = rulerHeight;
		this.updateContainerVisibility();
	}

	private onOverviewRulerPointerDown(event: PointerEvent): void {
		// Only the primary button activates markers for mouse pointers; touch/pen
		// always go through since they have no button semantics.
		if (event.pointerType === 'mouse' && event.button !== 0) {
			return;
		}

		const target = this.getTargetAtPoint(event.clientX, event.clientY);
		if (!target) {
			return;
		}

		this.resetGestureState();
		this.markerActivated = true;
		event.preventDefault();
		event.stopPropagation();
		this.revealItem(target);
	}

	private onOverviewRulerPointerUp(event: PointerEvent): void {
		if (!this.markerActivated) {
			return;
		}
		// Suppress pointerup so the scrollbar doesn't process it and steal focus,
		// then swallow the follow-on click if it arrives.
		this.markerActivated = false;
		this.suppressNextClick = true;
		this._clickSuppressionDisposable.value = this.scheduleFocusRetry(dom.getWindow(this.container), () => {
			this.suppressNextClick = false;
		});
		event.preventDefault();
		event.stopPropagation();
	}

	private onOverviewRulerPointerCancel(): void {
		// The gesture was interrupted (e.g. OS scroll/zoom takeover, pointer left
		// the page). Drop any armed suppression so a later unrelated pointerup or
		// click is not swallowed.
		this.resetGestureState();
	}

	private onOverviewRulerClick(event: MouseEvent): void {
		if (!this.suppressNextClick) {
			return;
		}
		// Swallow the click that follows pointerdown so the scrollbar doesn't
		// process it and steal focus from the target request.
		this.clearClickSuppression();
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * Resolves which chat row a pointer event should navigate to, using
	 * full-width Y-axis hit-testing against all rendered markers.
	 *
	 * Unlike standard DOM hit-testing (which checks each marker's actual rect),
	 * this method matches any marker whose Y range contains the click — even if
	 * the click landed outside the marker's narrow lane. This makes 50%-width
	 * lane markers as clickable as the full scrollbar width.
	 *
	 * When multiple markers overlap at the same Y position, priority is:
	 * right-lane (prompt) > left-lane (ask-question) > full-lane (file-change/error).
	 */
	private getTargetAtPoint(
		clientX: number,
		clientY: number,
	): IChatRequestViewModel | IChatResponseViewModel | undefined {
		if (!this.visible || this.container.style.display === 'none') {
			return undefined;
		}

		// Hit-test against the full container width (not just the marker's narrow lane),
		// so that clicking anywhere at a marker's Y position activates it — matching how
		// Monaco's overview ruler handles clicks. When multiple markers overlap at the
		// same Y, prefer right-lane (prompt) markers, then left-lane, then full-lane.
		const containerRect = this.container.getBoundingClientRect();
		if (
			clientX < containerRect.left ||
			clientX > containerRect.right ||
			clientY < containerRect.top ||
			clientY > containerRect.bottom
		) {
			return undefined;
		}

		const candidates: Array<{ id: string; lane: string }> = [];
		for (const [id, marker] of this.markerById) {
			// Use cached positions from the last renderMarkers pass (stored as
			// pixel strings in style.top/style.height) to avoid forcing a
			// synchronous layout read per marker during hit-testing.
			const top = parseFloat(marker.style.top);
			const height = parseFloat(marker.style.height);
			if (Number.isNaN(top) || Number.isNaN(height)) {
				continue;
			}
			const markerTop = containerRect.top + top;
			const markerBottom = markerTop + height;
			if (clientY < markerTop || clientY > markerBottom) {
				continue;
			}
			const lane = marker.dataset.lane ?? 'full';
			candidates.push({ id, lane });
		}

		if (candidates.length === 0) {
			return undefined;
		}

		// Prefer right-lane (prompt) > left-lane > full-lane
		const lanePriority: Record<string, number> = { right: 0, left: 1, full: 2 };
		candidates.sort((a, b) => (lanePriority[a.lane] ?? 3) - (lanePriority[b.lane] ?? 3));

		return this.targetById.get(candidates[0].id);
	}

	private getFocusedMarkerId(): string | undefined {
		const focused = this.host.getFocus()[0];
		if (!focused || (!isRequestVM(focused) && !isResponseVM(focused))) {
			return undefined;
		}

		return getFocusedScrollbarPromptMarkerId(focused);
	}

	/**
	 * Reveals and optionally focuses the target chat row. Focus is deferred
	 * across multiple animation frames because revealing a row in a long chat
	 * triggers dynamic height re-measurement in the virtualized tree, which
	 * can steal focus during the re-render cycle. The focus is retried until
	 * the target element is available in the tree or a maximum attempt count
	 * is reached.
	 */
	private revealItem(item: IChatRequestViewModel | IChatResponseViewModel): void {
		const behavior =
			this.configurationService.getValue<ChatScrollbarPromptMarkerClickBehavior>(
				ChatConfiguration.ScrollbarPromptMarkerClickBehavior,
			);

		// For the Reveal behavior, delegate entirely to the shared helper so
		// there is a single source of truth for click behavior. For
		// RevealAndFocus, reveal here but defer focusItem below, because
		// revealing a row in a long chat triggers dynamic height re-measurement
		// in the virtualized tree, which can steal focus during the re-render
		// cycle. The focus is retried across animation frames until the target
		// element is available in the tree or a maximum attempt count is reached.
		if (behavior === ChatScrollbarPromptMarkerClickBehavior.Reveal) {
			applyScrollbarPromptMarkerClickBehavior(this.host, item, behavior);
			return;
		}

		this.host.reveal(item);
		const targetWindow = dom.getWindow(this.container);
		let attempts = 0;
		const maxAttempts = 10;
		const tryFocus = () => {
			if (this.host.hasElement(item)) {
				this.host.focusItem(item);
				return;
			}
			attempts++;
			if (attempts < maxAttempts) {
				this._focusRetryDisposable.value = this.scheduleFocusRetry(targetWindow, tryFocus);
			}
		};
		this._focusRetryDisposable.value = this.scheduleFocusRetry(targetWindow, tryFocus);
	}
}
