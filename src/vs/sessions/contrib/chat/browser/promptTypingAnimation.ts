/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';

export interface IPromptTypingTarget {
	readonly onDidChange: Event<void>;
	getValue(): string;
	setValue(value: string): void;
}

export interface IPromptTypingScheduler {
	now(): number;
	schedule(callback: () => void): IDisposable;
}

/** Animates an empty text target while preserving any user edits made during the animation. */
export function animatePromptTyping(target: IPromptTypingTarget, text: string, durationMs: number, scheduler: IPromptTypingScheduler): IDisposable {
	if (!text || target.getValue()) {
		return Disposable.None;
	}

	const store = new DisposableStore();
	const pendingFrame = store.add(new MutableDisposable<IDisposable>());
	let expectedValue = '';
	let stopped = false;

	const write = (value: string) => {
		expectedValue = value;
		target.setValue(value);
	};
	const stop = (complete: boolean) => {
		if (stopped) {
			return;
		}
		if (complete && target.getValue() === expectedValue && expectedValue !== text) {
			write(text);
		}
		stopped = true;
		store.dispose();
	};
	store.add(target.onDidChange(() => {
		if (target.getValue() !== expectedValue) {
			stop(false);
		}
	}));
	const result = toDisposable(() => stop(true));

	if (durationMs <= 0) {
		write(text);
		stop(false);
		return result;
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
			stop(false);
		}
	};
	pendingFrame.value = scheduler.schedule(step);

	return result;
}
