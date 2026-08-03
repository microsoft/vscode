/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';

const SESSION_ARCHIVE_ANIMATION_CLASS = 'session-archive-animation';
const SESSION_ARCHIVE_PULSE_CLASS = 'session-archive-catch-pulse';
const SESSION_ARCHIVE_ROW_ANIMATION_DURATION = 240;
const SESSION_ARCHIVE_PULSE_ANIMATION_DELAY = 110;
const SESSION_ARCHIVE_PULSE_ANIMATION_DURATION = 150;

/** An animation handle that reports lifecycle events and can be cancelled. */
export interface ISessionArchiveAnimationHandle extends EventTarget {
	cancel(): void;
}

/** A disposable archive transition and its completion signal. */
export interface ISessionArchiveAnimation extends IDisposable {
	readonly finished: Promise<void>;
}

/** Viewport-relative bounds of the archive action. */
export interface ISessionArchiveAnimationTargetBounds {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

class SessionArchiveAnimation implements ISessionArchiveAnimation {

	private readonly _finished = new DeferredPromise<void>();
	readonly finished = this._finished.p;
	private readonly _animationListeners = new Map<ISessionArchiveAnimationHandle, () => void>();
	private _disposed = false;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _previousTransformOrigin: string,
		private readonly _pulseElement: HTMLElement,
		private readonly _animations: readonly ISessionArchiveAnimationHandle[],
	) {
		this._element.classList.add(SESSION_ARCHIVE_ANIMATION_CLASS);
		for (const animation of this._animations) {
			const listener = () => this._completeAnimation(animation);
			this._animationListeners.set(animation, listener);
			animation.addEventListener('finish', listener);
			animation.addEventListener('cancel', listener);
		}
	}

	private _completeAnimation(animation: ISessionArchiveAnimationHandle): void {
		const listener = this._animationListeners.get(animation);
		if (!listener) {
			return;
		}
		animation.removeEventListener('finish', listener);
		animation.removeEventListener('cancel', listener);
		this._animationListeners.delete(animation);
		if (this._animationListeners.size === 0) {
			this._pulseElement.remove();
			void this._finished.complete(undefined);
		}
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		void this._finished.complete(undefined);
		for (const animation of this._animations) {
			const listener = this._animationListeners.get(animation);
			if (listener) {
				animation.removeEventListener('finish', listener);
				animation.removeEventListener('cancel', listener);
			}
			animation.cancel();
		}
		this._animationListeners.clear();
		this._pulseElement.remove();
		this._element.classList.remove(SESSION_ARCHIVE_ANIMATION_CLASS);
		this._element.style.transformOrigin = this._previousTransformOrigin;
	}
}

/** Gently lifts and folds a rendered session row into its archive action with a landing ripple. */
export function createSessionArchiveAnimation(
	element: HTMLElement,
	targetBounds: ISessionArchiveAnimationTargetBounds,
	overlayHost: HTMLElement,
	animationFactory?: (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => ISessionArchiveAnimationHandle,
): ISessionArchiveAnimation | undefined {
	const elementBounds = element.getBoundingClientRect();
	if (elementBounds.width <= 0 || elementBounds.height <= 0 || targetBounds.width <= 0 || targetBounds.height <= 0) {
		return undefined;
	}
	if (!animationFactory && typeof element.animate !== 'function') {
		return undefined;
	}

	const originX = Math.min(elementBounds.width, Math.max(0, targetBounds.left + targetBounds.width / 2 - elementBounds.left));
	const originY = Math.min(elementBounds.height, Math.max(0, targetBounds.top + targetBounds.height / 2 - elementBounds.top));
	const transformOrigin = `${originX}px ${originY}px`;
	const previousTransformOrigin = element.style.transformOrigin;
	element.style.transformOrigin = transformOrigin;

	const rowKeyframes: Keyframe[] = [
		{ opacity: 1, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)' },
		{ opacity: 1, transform: 'translate3d(0, -1px, 0) scale(1.008) rotate(-0.25deg)', offset: 0.18 },
		{ opacity: 0.88, transform: 'translate3d(0, 0, 0) scale(0.98, 0.28) rotate(0.5deg)', offset: 0.62 },
		{ opacity: 0, transform: 'translate3d(0, 0, 0) scale(0.04) rotate(1deg)' },
	];
	const rowOptions: KeyframeAnimationOptions = {
		duration: SESSION_ARCHIVE_ROW_ANIMATION_DURATION,
		easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
		fill: 'forwards',
	};

	const pulseElement = element.ownerDocument.createElement('div');
	pulseElement.className = SESSION_ARCHIVE_PULSE_CLASS;
	pulseElement.setAttribute('aria-hidden', 'true');
	pulseElement.style.left = `${targetBounds.left + targetBounds.width / 2}px`;
	pulseElement.style.top = `${targetBounds.top + targetBounds.height / 2}px`;
	overlayHost.appendChild(pulseElement);

	const pulseKeyframes: Keyframe[] = [
		{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.55)' },
		{ opacity: 0.38, transform: 'translate(-50%, -50%) scale(0.82)', offset: 0.35 },
		{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.35)' },
	];
	const pulseOptions: KeyframeAnimationOptions = {
		delay: SESSION_ARCHIVE_PULSE_ANIMATION_DELAY,
		duration: SESSION_ARCHIVE_PULSE_ANIMATION_DURATION,
		easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
		fill: 'both',
	};

	const animate = animationFactory ?? ((target: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => target.animate(keyframes, options));
	let rowAnimation: ISessionArchiveAnimationHandle | undefined;
	try {
		rowAnimation = animate(element, rowKeyframes, rowOptions);
		const pulseAnimation = animate(pulseElement, pulseKeyframes, pulseOptions);
		return new SessionArchiveAnimation(element, previousTransformOrigin, pulseElement, [rowAnimation, pulseAnimation]);
	} catch (error) {
		rowAnimation?.cancel();
		pulseElement.remove();
		element.style.transformOrigin = previousTransformOrigin;
		throw error;
	}
}
