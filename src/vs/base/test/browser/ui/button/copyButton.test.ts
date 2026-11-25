/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, addDisposableListener, append, EventType } from '../../../../browser/dom.js';
import { CopyButton } from '../../../../browser/ui/button/copyButton.js';
import { CopyFeedback } from '../../../../browser/ui/button/copyFeedback.js';
import { DeferredPromise } from '../../../../common/async.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('CopyButton', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		container = append(document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		clock = sinon.useFakeTimers();
	});

	teardown(() => sinon.restore());

	test('waits for success, preserves focus and restores the original label and hover', async () => {
		const pending = new DeferredPromise<void>();
		const button = store.add(new CopyButton(container, {
			title: 'Copy Details',
			ariaLabel: 'Copy Event Details',
			copy: () => pending.p,
		}));
		const setTitle = sinon.spy(button, 'setTitle');
		const states: object[] = [];
		const record = () => states.push({
			copy: button.element.classList.contains('codicon-copy'),
			check: button.element.classList.contains('codicon-check'),
			label: button.element.getAttribute('aria-label'),
			focused: button.hasFocus(),
		});
		button.focus();
		const copying = button.copy();
		record();
		await pending.complete();
		await copying;
		record();
		clock.tick(1199);
		record();
		clock.tick(1);
		record();

		assert.deepStrictEqual({
			states,
			titles: setTitle.args,
			role: button.element.getAttribute('role'),
		}, {
			states: [
				{ copy: true, check: false, label: 'Copy Event Details', focused: true },
				{ copy: false, check: true, label: 'Copied', focused: true },
				{ copy: false, check: true, label: 'Copied', focused: true },
				{ copy: true, check: false, label: 'Copy Event Details', focused: true },
			],
			titles: [['Copied'], ['Copy Details']],
			role: 'button',
		});
	});

	test('propagates copy failures without showing success', async () => {
		const button = store.add(new CopyButton(container, {
			copy: async () => { throw new Error('Clipboard unavailable'); },
		}));
		const setTitle = sinon.spy(button, 'setTitle');

		await assert.rejects(button.copy(), /Clipboard unavailable/);
		clock.tick(1200);

		assert.deepStrictEqual({
			copy: button.element.classList.contains('codicon-copy'),
			label: button.element.getAttribute('aria-label'),
			feedbackUpdates: setTitle.callCount,
		}, { copy: true, label: 'Copy', feedbackUpdates: 0 });
	});

	test('supports pointer and keyboard activation without activating the parent', async () => {
		let copies = 0;
		const button = store.add(new CopyButton(container, { copy: async () => { copies++; } }));
		const parentClick = sinon.spy();
		store.add(addDisposableListener(container, EventType.CLICK, parentClick));

		button.element.click();
		button.element.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		button.element.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32, bubbles: true }));
		await Promise.resolve();

		assert.deepStrictEqual({
			copies,
			parentClicks: parentClick.callCount,
			check: button.element.classList.contains('codicon-check'),
		}, { copies: 3, parentClicks: 0, check: true });
	});

	test('disabled controls do not copy', () => {
		const copy = sinon.stub().resolves();
		const button = store.add(new CopyButton(container, { copy, disabled: true }));
		button.element.click();
		button.element.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		button.element.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 32, bubbles: true }));

		assert.strictEqual(copy.callCount, 0);
	});

	test('ignores a clipboard write that finishes after disposal', async () => {
		const pending = new DeferredPromise<void>();
		const button = store.add(new CopyButton(container, { copy: () => pending.p }));
		const setTitle = sinon.spy(button, 'setTitle');
		const copying = button.copy();
		button.dispose();
		await pending.complete();
		await copying;
		clock.tick(1200);

		assert.deepStrictEqual({
			children: container.childElementCount,
			feedbackUpdates: setTitle.callCount,
		}, { children: 0, feedbackUpdates: 0 });
	});
});

suite('CopyFeedback', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('repeated successes restart the feedback interval independently for each control', () => {
		const clock = sinon.useFakeTimers();
		const firstStates: boolean[] = [];
		const secondStates: boolean[] = [];
		const first = store.add(new CopyFeedback(copied => firstStates.push(copied)));
		const second = store.add(new CopyFeedback(copied => secondStates.push(copied)));
		first.show();
		second.show();
		clock.tick(1000);
		first.show();
		clock.tick(200);
		const active = [first.copied, second.copied];
		clock.tick(999);
		const stillActive = first.copied;
		clock.tick(1);

		assert.deepStrictEqual({ active, stillActive, firstStates, secondStates }, {
			active: [true, false],
			stillActive: true,
			firstStates: [true, true, false],
			secondStates: [true, false],
		});
	});

	test('disposal cancels pending feedback and ignores subsequent successes', () => {
		const clock = sinon.useFakeTimers();
		const states: boolean[] = [];
		const feedback = store.add(new CopyFeedback(copied => states.push(copied)));
		feedback.show();
		feedback.dispose();
		clock.tick(1200);
		feedback.show();

		assert.deepStrictEqual(states, [true]);
	});

	test('clearing feedback cancels its reset and permits subsequent success', () => {
		const clock = sinon.useFakeTimers();
		const states: boolean[] = [];
		const feedback = store.add(new CopyFeedback(copied => states.push(copied)));
		feedback.show();
		feedback.clear();
		clock.tick(1200);
		feedback.show();
		clock.tick(1200);

		assert.deepStrictEqual(states, [true, false, true, false]);
	});
});
