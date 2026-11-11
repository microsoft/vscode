/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { scheduleChatAnimationFrame } from '../../../browser/widget/chatProgressAnimation.js';

class AnimationWindow extends mock<Window>() {
	private time = 0;
	private nextId = 0;
	readonly timeouts = new Map<number, { run: () => void; delay: number }>();
	readonly pendingFrames = new Map<number, FrameRequestCallback>();
	override readonly performance = Object.assign(new class extends mock<Performance>() { }(), { now: () => this.time });

	override setTimeout(handler: TimerHandler, delay = 0): number {
		if (typeof handler !== 'function') {
			throw new Error('Expected a timer callback');
		}
		const id = ++this.nextId;
		this.timeouts.set(id, { run: () => handler(), delay });
		return id;
	}

	override clearTimeout(id: number): void {
		this.timeouts.delete(id);
	}

	override requestAnimationFrame(callback: FrameRequestCallback): number {
		const id = ++this.nextId;
		this.pendingFrames.set(id, callback);
		return id;
	}

	override cancelAnimationFrame(id: number): void {
		this.pendingFrames.delete(id);
	}

	runTimeouts(): void {
		const callbacks = [...this.timeouts.values()];
		this.timeouts.clear();
		for (const callback of callbacks) {
			callback.run();
		}
	}

	runFrames(time: number): void {
		this.time = time;
		const callbacks = [...this.pendingFrames.values()];
		this.pendingFrames.clear();
		for (const callback of callbacks) {
			callback(time);
		}
	}
}

suite('Chat progress animation clock', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares one timer and frame and preserves callbacks scheduled during a tick', () => {
		const targetWindow = new AnimationWindow();
		const first = store.add(new MutableDisposable());
		const second = store.add(new MutableDisposable());
		const calls: string[] = [];
		const run = () => {
			first.clear();
			calls.push('first');
			if (calls.length === 1) {
				first.value = scheduleChatAnimationFrame(targetWindow, run);
			}
		};
		first.value = scheduleChatAnimationFrame(targetWindow, run);
		second.value = scheduleChatAnimationFrame(targetWindow, () => {
			second.clear();
			calls.push('second');
		});
		const timers = targetWindow.timeouts.size;
		targetWindow.runTimeouts();
		const frames = targetWindow.pendingFrames.size;
		targetWindow.runFrames(0);
		const nextDelay = [...targetWindow.timeouts.values()][0]?.delay;
		targetWindow.runTimeouts();
		targetWindow.runFrames(34);
		assert.deepStrictEqual({
			timers, frames, calls,
			nextDelay,
			remainingTimers: targetWindow.timeouts.size,
			remainingFrames: targetWindow.pendingFrames.size,
		}, {
			timers: 1, frames: 1, calls: ['first', 'second', 'first'], nextDelay: 34,
			remainingTimers: 0, remainingFrames: 0,
		});
	});

	test('keeps the shared cadence after a late frame', () => {
		const targetWindow = new AnimationWindow();
		const frame = store.add(new MutableDisposable());
		frame.value = scheduleChatAnimationFrame(targetWindow, () => {
			frame.clear();
			frame.value = scheduleChatAnimationFrame(targetWindow, () => frame.clear());
		});
		targetWindow.runTimeouts();
		targetWindow.runFrames(40);
		assert.strictEqual([...targetWindow.timeouts.values()][0]?.delay, 27);
	});

	test('cancels timers and frames independently for each window', () => {
		const firstWindow = new AnimationWindow();
		const secondWindow = new AnimationWindow();
		let calls = 0;
		const first = store.add(scheduleChatAnimationFrame(firstWindow, () => calls++));
		const second = store.add(scheduleChatAnimationFrame(secondWindow, () => calls++));
		first.dispose();
		secondWindow.runTimeouts();
		const pendingFrame = secondWindow.pendingFrames.size;
		second.dispose();
		firstWindow.runTimeouts();
		secondWindow.runFrames(34);
		assert.deepStrictEqual({
			calls, pendingFrame, timers: firstWindow.timeouts.size, frames: secondWindow.pendingFrames.size,
		}, { calls: 0, pendingFrame: 1, timers: 0, frames: 0 });
	});

	test('does not invoke a callback cancelled during the current tick', () => {
		const targetWindow = new AnimationWindow();
		const second = store.add(new MutableDisposable());
		let calls = 0;
		store.add(scheduleChatAnimationFrame(targetWindow, () => second.clear()));
		second.value = scheduleChatAnimationFrame(targetWindow, () => calls++);
		targetWindow.runTimeouts();
		targetWindow.runFrames(0);
		assert.deepStrictEqual({
			calls, timers: targetWindow.timeouts.size, frames: targetWindow.pendingFrames.size,
		}, { calls: 0, timers: 0, frames: 0 });
	});
});
