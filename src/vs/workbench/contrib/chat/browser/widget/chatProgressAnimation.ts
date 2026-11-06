/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pauseCSSAnimationsWhenHidden } from '../../../../../base/browser/animationSync.js';
import { addDisposableListener, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';

export const chatProgressAnimationFrameRate = 30;

interface IFrameEntry {
	readonly runner: () => void;
	pending: boolean;
}

interface IFrameQueue {
	readonly entries: Set<IFrameEntry>;
	timeout: number | undefined;
	frame: number | undefined;
	lastFrameTime: number;
	running: boolean;
}

const frameQueues = new WeakMap<Window, IFrameQueue>();

function releaseFrameQueue(targetWindow: Window, queue: IFrameQueue): void {
	if (queue.running || queue.entries.size || frameQueues.get(targetWindow) !== queue) {
		return;
	}
	if (queue.timeout !== undefined) {
		targetWindow.clearTimeout(queue.timeout);
	}
	if (queue.frame !== undefined) {
		targetWindow.cancelAnimationFrame(queue.frame);
	}
	frameQueues.delete(targetWindow);
}

/** Coalesces progress animation work into one bounded-rate frame per window. */
export function scheduleChatAnimationFrame(targetWindow: Window, runner: () => void): IDisposable {
	let queue = frameQueues.get(targetWindow);
	if (!queue) {
		queue = { entries: new Set(), timeout: undefined, frame: undefined, lastFrameTime: -Infinity, running: false };
		frameQueues.set(targetWindow, queue);
	}
	const currentQueue = queue;
	const entry: IFrameEntry = { runner, pending: true };
	currentQueue.entries.add(entry);
	if (currentQueue.timeout === undefined && currentQueue.frame === undefined) {
		// Anchor to a common time grid so non-multiple refresh rates do not accumulate drift.
		const nextFrameTime = (Math.floor(currentQueue.lastFrameTime * chatProgressAnimationFrameRate / 1000) + 1) * 1000 / chatProgressAnimationFrameRate;
		const delay = Math.max(0, Math.ceil(nextFrameTime - targetWindow.performance.now()));
		currentQueue.timeout = targetWindow.setTimeout(() => {
			currentQueue.timeout = undefined;
			currentQueue.frame = targetWindow.requestAnimationFrame(time => {
				currentQueue.frame = undefined;
				currentQueue.lastFrameTime = time;
				const entries = [...currentQueue.entries];
				currentQueue.entries.clear();
				currentQueue.running = true;
				try {
					for (const pending of entries) {
						if (pending.pending) {
							pending.pending = false;
							try {
								pending.runner();
							} catch (error) {
								onUnexpectedError(error);
							}
						}
					}
				} finally {
					currentQueue.running = false;
					releaseFrameQueue(targetWindow, currentQueue);
				}
			});
		}, delay);
	}
	return toDisposable(() => {
		if (entry.pending) {
			entry.pending = false;
			currentQueue.entries.delete(entry);
			releaseFrameQueue(targetWindow, currentQueue);
		}
	});
}

const shimmerAnimationNames = new Set(['chat-thinking-shimmer']);

/** Samples paused shimmer animations on the same clock as Draw, only while visible. */
export function animateChatProgress(element: HTMLElement, animationNames: ReadonlySet<string> = shimmerAnimationNames): IDisposable {
	const store = new DisposableStore();
	const frame = store.add(new MutableDisposable());
	const animations = new Set<Animation>();
	element.classList.add('chat-progress-animation');
	store.add(toDisposable(() => animations.clear()));
	queueMicrotask(() => {
		if (store.isDisposed) {
			return;
		}
		const targetWindow = getWindow(element);
		let visible = false;
		const update = () => {
			frame.clear();
			if (!visible) {
				return;
			}
			const time = targetWindow.document.timeline.currentTime;
			if (typeof time !== 'number') {
				return;
			}
			let paused = false;
			for (const animation of animations) {
				if (animation.playState === 'idle') {
					animations.delete(animation);
				} else if (animation.playState === 'paused') {
					animation.currentTime = time;
					paused = true;
				}
			}
			if (paused) {
				frame.value = scheduleChatAnimationFrame(targetWindow, update);
			}
		};
		const collect = () => {
			animations.clear();
			for (const animation of element.getAnimations({ subtree: true })) {
				const animationName = (animation as CSSAnimation).animationName;
				if (animationNames.has(animationName)) {
					animations.add(animation);
				}
			}
			update();
		};
		store.add(addDisposableListener(element, EventType.ANIMATION_START, (event: AnimationEvent) => {
			if (animationNames.has(event.animationName)) {
				collect();
			}
		}));
		store.add(pauseCSSAnimationsWhenHidden(element, {
			pausedClass: 'chat-progress-shimmer-paused',
			subtree: true,
			animationNames,
			onDidChangeVisibility: value => {
				if (store.isDisposed) {
					return;
				}
				visible = value;
				if (visible) {
					collect();
				} else {
					frame.clear();
				}
			},
		}));
	});
	return store;
}
