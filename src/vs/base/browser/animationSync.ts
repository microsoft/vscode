/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow, onDidUnregisterWindow } from './dom.js';
import { CodeWindow } from './window.js';
import { Disposable, IDisposable, toDisposable } from '../common/lifecycle.js';

export interface ISynchronizeAnimationsOptions {
	/**
	 * Also synchronize animations running on descendant elements (e.g. the dots
	 * of a spinner whose animations live on child nodes). Defaults to `false`.
	 */
	readonly subtree?: boolean;

	/**
	 * When provided, further narrows synchronization to CSS animations whose
	 * `animation-name` is in this set. Non-keyframe animations (e.g. transitions)
	 * are always skipped regardless of this option.
	 */
	readonly animationNames?: ReadonlySet<string>;
}

/**
 * Phase-aligns looping CSS animations so that every animation of the same
 * duration displays the same frame at the same time, regardless of when each
 * one started.
 *
 * All CSS animations share the document's timeline, so anchoring each
 * animation's `startTime` to the same origin (`0`) forces their `currentTime`
 * to equal the timeline time — making identical animations run in lock-step.
 * Per-element `animation-delay` offsets are preserved (they are part of each
 * animation's own timing), so intentional cascades (e.g. spinner dots) still
 * work while the group as a whole stays globally in phase.
 *
 * Unlike adjusting `animation-delay`, this re-seeks animations that are already
 * running (Chromium does not reliably re-seek a running animation when its
 * `animation-delay` changes). Call it whenever an animation (re)starts or
 * resumes after being paused offscreen — e.g. from an `animationstart` handler
 * or when an element scrolls back into view.
 *
 * @param element The element whose (and optionally whose descendants') CSS
 * animations should be synchronized.
 * @param options See {@link ISynchronizeAnimationsOptions}.
 */
export function synchronizeCSSAnimations(element: HTMLElement, options?: ISynchronizeAnimationsOptions): void {
	if (typeof element.getAnimations !== 'function') {
		return; // Web Animations API not available; leave animations as-is.
	}
	for (const animation of element.getAnimations({ subtree: options?.subtree })) {
		// Only CSS keyframe animations carry an `animationName`; skip transitions
		// and other Web Animations so this helper strictly aligns CSS animations.
		const animationName = (animation as CSSAnimation).animationName;
		if (animationName === undefined) {
			continue;
		}
		if (options?.animationNames && !options.animationNames.has(animationName)) {
			continue;
		}
		// Anchor to a shared origin so all animations of the same duration display
		// the same frame. Guard against the rare state where startTime is not yet
		// settable (e.g. an animation still in its pending/ready phase).
		try {
			animation.startTime = 0;
		} catch {
			// ignore
		}
	}
}

export interface IPauseCSSAnimationsWhenHiddenOptions extends ISynchronizeAnimationsOptions {
	readonly pausedClass: string;
}

interface ITrackedAnimation {
	readonly options: IPauseCSSAnimationsWhenHiddenOptions;
}

interface IAnimationVisibilityObserver {
	readonly observer: IntersectionObserver;
	readonly trackedAnimations: Map<HTMLElement, ITrackedAnimation>;
	readonly intersectingElements: Set<HTMLElement>;
	readonly visibilityListener: IDisposable;
}

const animationVisibilityObservers = new Map<CodeWindow, IAnimationVisibilityObserver>();
let unregisterWindowListener: IDisposable | undefined;

/**
 * Pauses CSS animations while their element is outside the viewport or its document is hidden.
 */
export function pauseCSSAnimationsWhenHidden(element: HTMLElement, options: IPauseCSSAnimationsWhenHiddenOptions): IDisposable {
	const targetWindow = getWindow(element);
	if (typeof targetWindow.IntersectionObserver !== 'function') {
		return Disposable.None;
	}

	let state = animationVisibilityObservers.get(targetWindow);
	if (!state) {
		const trackedAnimations = new Map<HTMLElement, ITrackedAnimation>();
		const intersectingElements = new Set<HTMLElement>();
		const observer = new targetWindow.IntersectionObserver(entries => {
			const toResync: Array<[HTMLElement, IPauseCSSAnimationsWhenHiddenOptions]> = [];
			for (const entry of entries) {
				const target = entry.target as HTMLElement;
				const trackedAnimation = trackedAnimations.get(target);
				if (!trackedAnimation) {
					continue;
				}
				if (!target.isConnected) {
					observer.unobserve(target);
					trackedAnimations.delete(target);
					intersectingElements.delete(target);
					continue;
				}
				if (entry.isIntersecting) {
					intersectingElements.add(target);
				} else {
					intersectingElements.delete(target);
				}
				const paused = targetWindow.document.hidden || !entry.isIntersecting;
				target.classList.toggle(trackedAnimation.options.pausedClass, paused);
				if (!paused) {
					toResync.push([target, trackedAnimation.options]);
				}
			}

			for (const [target, trackedOptions] of toResync) {
				synchronizeCSSAnimations(target, trackedOptions);
			}
			disposeVisibilityObserverIfEmpty(targetWindow, animationVisibilityObservers.get(targetWindow));
		});
		const visibilityListener = addDisposableListener(targetWindow.document, 'visibilitychange', () => {
			const documentHidden = targetWindow.document.hidden;
			const toResync: Array<[HTMLElement, IPauseCSSAnimationsWhenHiddenOptions]> = [];
			for (const [target, trackedAnimation] of trackedAnimations) {
				if (!target.isConnected) {
					observer.unobserve(target);
					trackedAnimations.delete(target);
					intersectingElements.delete(target);
					continue;
				}
				const paused = documentHidden || !intersectingElements.has(target);
				target.classList.toggle(trackedAnimation.options.pausedClass, paused);
				if (!paused) {
					toResync.push([target, trackedAnimation.options]);
				}
			}
			for (const [target, trackedOptions] of toResync) {
				synchronizeCSSAnimations(target, trackedOptions);
			}
			disposeVisibilityObserverIfEmpty(targetWindow, animationVisibilityObservers.get(targetWindow));
		});
		state = { observer, trackedAnimations, intersectingElements, visibilityListener };
		animationVisibilityObservers.set(targetWindow, state);

		if (!unregisterWindowListener) {
			unregisterWindowListener = onDidUnregisterWindow(window => {
				const state = animationVisibilityObservers.get(window);
				if (state) {
					state.observer.disconnect();
					state.visibilityListener.dispose();
					animationVisibilityObservers.delete(window);
					disposeUnregisterWindowListenerIfUnused();
				}
			});
		}
	}

	element.classList.add(options.pausedClass);
	state.trackedAnimations.set(element, { options });
	state.observer.observe(element);

	return toDisposable(() => {
		state.observer.unobserve(element);
		state.trackedAnimations.delete(element);
		state.intersectingElements.delete(element);
		element.classList.remove(options.pausedClass);
		disposeVisibilityObserverIfEmpty(targetWindow, state);
	});
}

function disposeVisibilityObserverIfEmpty(targetWindow: CodeWindow, state: IAnimationVisibilityObserver | undefined): void {
	if (!state || state.trackedAnimations.size !== 0 || animationVisibilityObservers.get(targetWindow) !== state) {
		return;
	}
	state.observer.disconnect();
	state.visibilityListener.dispose();
	animationVisibilityObservers.delete(targetWindow);
	disposeUnregisterWindowListenerIfUnused();
}

function disposeUnregisterWindowListenerIfUnused(): void {
	if (animationVisibilityObservers.size === 0) {
		unregisterWindowListener?.dispose();
		unregisterWindowListener = undefined;
	}
}
