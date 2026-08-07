/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';

export interface IPromptTypingTarget {
	readonly onDidChange: Event<void>;
	getValue(): string;
	setValue(value: string): void;
}

export interface IPromptTypingScheduler {
	now(): number;
	schedule(callback: () => void): IDisposable;
}

export type PromptTypingOutcome = 'completed' | 'interrupted' | 'cancelled' | 'skipped';

export interface IPromptTypingResult {
	readonly outcome: PromptTypingOutcome;
	readonly didWrite: boolean;
}

export interface IPromptTypingAnimation extends IDisposable {
	readonly result: Promise<IPromptTypingResult>;
	complete(): void;
}

/** Animates an empty text target while preserving user edits and distinguishing completion from cancellation. */
export function animatePromptTyping(target: IPromptTypingTarget, text: string, durationMs: number, scheduler: IPromptTypingScheduler): IPromptTypingAnimation {
	if (!text || target.getValue()) {
		return {
			result: Promise.resolve({ outcome: 'skipped', didWrite: false }),
			complete: () => undefined,
			dispose: () => undefined,
		};
	}

	const store = new DisposableStore();
	const pendingFrame = store.add(new MutableDisposable<IDisposable>());
	const result = new DeferredPromise<IPromptTypingResult>();
	let expectedValue = '';
	let stopped = false;
	let didWrite = false;

	const write = (value: string) => {
		expectedValue = value;
		didWrite = true;
		target.setValue(value);
	};
	const stop = (outcome: PromptTypingOutcome, completeText: boolean) => {
		if (stopped) {
			return;
		}
		if (completeText && target.getValue() === expectedValue && expectedValue !== text) {
			write(text);
		}
		stopped = true;
		store.dispose();
		result.complete({ outcome, didWrite });
	};
	store.add(target.onDidChange(() => {
		if (target.getValue() !== expectedValue) {
			stop('interrupted', false);
		}
	}));
	const animation: IPromptTypingAnimation = {
		result: result.p,
		complete: () => stop('completed', true),
		dispose: () => stop('cancelled', false),
	};

	if (durationMs <= 0) {
		write(text);
		stop('completed', false);
		return animation;
	}

	const startTime = scheduler.now();
	const step = () => {
		if (stopped) {
			return;
		}
		const progress = Math.min(1, Math.max(0, (scheduler.now() - startTime) / durationMs));
		const characterCount = Math.min(text.length, Math.max(1, Math.ceil(text.length * progress)));
		if (characterCount > expectedValue.length) {
			write(text.slice(0, characterCount));
		}
		if (characterCount < text.length) {
			pendingFrame.value = scheduler.schedule(step);
		} else {
			stop('completed', false);
		}
	};
	pendingFrame.value = scheduler.schedule(step);

	return animation;
}
