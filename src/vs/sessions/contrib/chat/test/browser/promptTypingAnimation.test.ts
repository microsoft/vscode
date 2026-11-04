/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { animatePromptTyping, IPromptTypingScheduler, IPromptTypingTarget } from '../../browser/promptTypingAnimation.js';

class TestPromptTypingTarget implements IPromptTypingTarget {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;
	readonly values: string[] = [];

	constructor(private _value = '') { }

	getValue(): string {
		return this._value;
	}

	setValue(value: string): void {
		this._value = value;
		this.values.push(value);
		this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

class TestPromptTypingScheduler implements IPromptTypingScheduler {
	private _now = 0;
	private _scheduled: { readonly callback: () => void; cancelled: boolean }[] = [];

	now(): number {
		return this._now;
	}

	schedule(callback: () => void): IDisposable {
		const scheduled = { callback, cancelled: false };
		this._scheduled.push(scheduled);
		return toDisposable(() => scheduled.cancelled = true);
	}

	advanceTo(now: number): void {
		this._now = now;
		const scheduled = this._scheduled;
		this._scheduled = [];
		for (const item of scheduled) {
			if (!item.cancelled) {
				item.callback();
			}
		}
	}
}

suite('PromptTypingAnimation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('types by elapsed time and completes only when requested', async () => {
		const target = disposables.add(new TestPromptTypingTarget());
		const scheduler = new TestPromptTypingScheduler();
		const animation = disposables.add(animatePromptTyping(target, 'abcdefghij', 1_000, scheduler));

		scheduler.advanceTo(250);
		scheduler.advanceTo(500);
		animation.complete();
		const result = await animation.result;

		assert.deepStrictEqual({ values: target.values, value: target.getValue(), result }, {
			values: ['abc', 'abcde', 'abcdefghij'],
			value: 'abcdefghij',
			result: { outcome: 'completed', didWrite: true },
		});
	});

	test('stops without replacing a user edit', async () => {
		const target = disposables.add(new TestPromptTypingTarget());
		const scheduler = new TestPromptTypingScheduler();
		const animation = disposables.add(animatePromptTyping(target, 'abcdefghij', 1_000, scheduler));

		scheduler.advanceTo(250);
		target.setValue('my task');
		scheduler.advanceTo(500);
		const result = await animation.result;

		assert.deepStrictEqual({ values: target.values, value: target.getValue(), result }, {
			values: ['abc', 'my task'],
			value: 'my task',
			result: { outcome: 'interrupted', didWrite: true },
		});
	});

	test('cancellation and teardown do not complete the remaining text', async () => {
		const target = disposables.add(new TestPromptTypingTarget());
		const scheduler = new TestPromptTypingScheduler();
		const animation = disposables.add(animatePromptTyping(target, 'abcdefghij', 1_000, scheduler));

		scheduler.advanceTo(250);
		animation.dispose();
		scheduler.advanceTo(1_000);
		const result = await animation.result;

		assert.deepStrictEqual({ values: target.values, value: target.getValue(), result }, {
			values: ['abc'],
			value: 'abc',
			result: { outcome: 'cancelled', didWrite: true },
		});
	});

	test('sets the whole prompt without animation and leaves existing input alone', async () => {
		const emptyTarget = disposables.add(new TestPromptTypingTarget());
		const existingTarget = disposables.add(new TestPromptTypingTarget('existing draft'));
		const scheduler = new TestPromptTypingScheduler();

		const emptyAnimation = disposables.add(animatePromptTyping(emptyTarget, 'prompt', 0, scheduler));
		const existingAnimation = disposables.add(animatePromptTyping(existingTarget, 'prompt', 0, scheduler));

		assert.deepStrictEqual({
			empty: { values: emptyTarget.values, value: emptyTarget.getValue() },
			existing: { values: existingTarget.values, value: existingTarget.getValue() },
			results: [await emptyAnimation.result, await existingAnimation.result],
		}, {
			empty: { values: ['prompt'], value: 'prompt' },
			existing: { values: [], value: 'existing draft' },
			results: [
				{ outcome: 'completed', didWrite: true },
				{ outcome: 'skipped', didWrite: false },
			],
		});
	});
});
