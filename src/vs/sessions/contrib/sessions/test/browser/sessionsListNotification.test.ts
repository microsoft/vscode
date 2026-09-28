/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionsListNotification } from '../../browser/views/sessionsListNotification.js';

suite('Sessions - List notification', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const container = DOM.append(mainWindow.document.body, DOM.$('div'));
		store.add(toDisposable(() => container.remove()));
		const focusTarget = DOM.append(container, DOM.$('button'));
		const errors: Error[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(error: Error) { errors.push(error); }
		});
		const notification = store.add(instantiationService.createInstance(SessionsListNotification, container, () => focusTarget.focus()));
		const element = () => container.querySelector<HTMLElement>('.sessions-list-notification');
		const undoButton = () => container.querySelector<HTMLElement>('.monaco-button')!;
		return { container, focusTarget, notification, errors, element, undoButton };
	}

	test('shows a single-line message with secondary Undo, close, and a ten-second countdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show('3 marked done', async () => { });
		assert.deepStrictEqual({
			message: test.container.querySelector('.sessions-list-notification-label')?.textContent,
			secondary: test.undoButton().classList.contains('secondary'),
			close: !!test.container.querySelector('.codicon-close'),
			duration: test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')?.style.animationDuration,
		}, { message: '3 marked done', secondary: true, close: true, duration: '10000ms' });
		await timeout(9999);
		assert.ok(test.element());
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('pauses the countdown on hover and resumes with the remaining time', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show('3 marked done', async () => { });
		await timeout(4000);
		test.element()!.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(15000);
		assert.strictEqual(test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')?.style.animationPlayState, 'paused');
		test.element()!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(5999);
		assert.ok(test.element());
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('countdown stays clear of the banner corners and shrinks without scaling its rounded ends', () => {
		const test = setup();
		test.container.style.width = '320px';
		test.container.style.position = 'relative';
		test.container.style.setProperty('--vscode-strokeThickness', '1px');
		test.container.style.setProperty('--vscode-cornerRadius-large', '8px');
		test.container.style.setProperty('--vscode-cornerRadius-circle', '9999px');
		test.container.style.setProperty('--vscode-spacing-size100', '10px');
		test.container.style.setProperty('--vscode-spacing-size120', '12px');
		test.notification.show('3 marked done', async () => { });
		const clip = test.container.querySelector<HTMLElement>('.sessions-list-notification-progress-clip')!;
		const progress = test.container.querySelector<HTMLElement>('.sessions-list-notification-progress')!;
		const clipStyle = mainWindow.getComputedStyle(clip);
		const animation = progress.getAnimations()[0];
		animation.pause();
		const widths = [0, 5000, 10000].map(time => {
			animation.currentTime = time;
			return Math.round(progress.getBoundingClientRect().width / clip.clientWidth * 100);
		});
		assert.deepStrictEqual({
			inset: [clipStyle.left, clipStyle.right, clipStyle.bottom],
			height: clipStyle.height,
			radius: clipStyle.borderBottomLeftRadius,
			overflow: clipStyle.overflow,
			pointerEvents: clipStyle.pointerEvents,
			ariaHidden: clip.getAttribute('aria-hidden'),
			progressRadius: mainWindow.getComputedStyle(progress).borderRadius,
			widths,
		}, {
			inset: ['10px', '10px', '1px'],
			height: '2px',
			radius: '9999px',
			overflow: 'hidden',
			pointerEvents: 'none',
			ariaHidden: 'true',
			progressRadius: '9999px',
			widths: [100, 50, 0],
		});
	});

	test('keyboard focus pauses expiry and Escape dismisses and returns focus to the list', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show('3 marked done', async () => { });
		test.undoButton().focus();
		await timeout(15000);
		assert.ok(test.element());
		test.undoButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.deepStrictEqual({ dismissed: !test.element(), focusRestored: DOM.getActiveElement() === test.focusTarget }, { dismissed: true, focusRestored: true });
	}));

	test('close dismisses without undoing', async () => {
		const test = setup();
		let undoCalls = 0;
		test.notification.show('3 marked done', async () => { undoCalls++; });
		test.container.querySelector<HTMLElement>('.action-label')!.click();
		assert.deepStrictEqual({ dismissed: !test.element(), undoCalls }, { dismissed: true, undoCalls: 0 });
	});

	test('Undo runs once and dismisses on success', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const undo = new DeferredPromise<void>();
		let undoCalls = 0;
		test.notification.show('3 marked done', () => { undoCalls++; return undo.p; });
		test.undoButton().click();
		test.undoButton().click();
		await timeout(15000);
		assert.ok(test.element());
		await undo.complete();
		await timeout(0);
		assert.deepStrictEqual({ dismissed: !test.element(), undoCalls }, { dismissed: true, undoCalls: 1 });
	}));

	test('an undo failure is reported and allows retry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const error = new Error('restore failed');
		let calls = 0;
		test.notification.show('3 marked done', async () => {
			if (++calls === 1) {
				throw error;
			}
		});
		test.undoButton().click();
		await timeout(0);
		assert.deepStrictEqual({ errors: test.errors, disabled: test.undoButton().getAttribute('aria-disabled') }, { errors: [error], disabled: 'false' });
		test.undoButton().click();
		await timeout(0);
		assert.strictEqual(test.element(), null);
	}));

	test('a new notice replaces the old countdown and is not dismissed by an old undo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		const undo = new DeferredPromise<void>();
		test.notification.show('3 marked done', () => undo.p);
		test.undoButton().click();
		await timeout(5000);
		test.notification.show('2 marked done', async () => { });
		await undo.complete();
		await timeout(9999);
		assert.strictEqual(test.container.querySelector('.sessions-list-notification-label')?.textContent, '2 marked done');
		await timeout(1);
		assert.strictEqual(test.element(), null);
	}));

	test('accessibility help pauses expiry until closed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show('3 marked done', async () => { });
		const help = store.add(test.notification.getAccessibilityHelp()!);
		await timeout(15000);
		assert.ok(test.element());
		help.onClose();
		assert.strictEqual(DOM.getActiveElement(), test.undoButton());
	}));

	test('disposal removes the notice and cancels expiry', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const test = setup();
		test.notification.show('3 marked done', async () => { });
		test.notification.dispose();
		await timeout(10000);
		assert.strictEqual(test.element(), null);
	}));
});
