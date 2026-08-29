/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension, getWindow } from '../../../base/browser/dom.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Severity } from '../../../platform/notification/common/notification.js';
import { NotificationsToasts } from '../../browser/parts/notifications/notificationsToasts.js';
import { NotificationsModel } from '../../common/notifications.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';
import { DEFAULT_NOTIFICATION_ROW_HEIGHT, setNotificationRowHeight } from '../../browser/parts/notifications/notificationsViewer.js';

suite('NotificationsToasts', () => {

	suiteSetup(async () => {
		const warmupDisposables = new DisposableStore();
		try {
			const { model, toasts } = await createToasts(warmupDisposables);
			const toastVisible = Event.toPromise(toasts.onDidChangeVisibility);
			model.addNotification({ severity: Severity.Error, message: 'Warmup' });
			await toastVisible;
		} finally {
			warmupDisposables.dispose();
		}
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT));

	async function createToasts(testDisposables: Pick<DisposableStore, 'add'> = disposables): Promise<{
		readonly container: HTMLElement;
		readonly model: NotificationsModel;
		readonly toasts: NotificationsToasts;
		readonly flushAnimationFrame: () => Promise<void>;
	}> {
		const container = document.createElement('div');
		container.classList.add('monaco-workbench');
		const targetWindow = getWindow(container);
		targetWindow.document.body.appendChild(container);
		testDisposables.add(toDisposable(() => container.remove()));

		const instantiationService = workbenchInstantiationService(undefined, testDisposables);
		const model = testDisposables.add(new NotificationsModel());
		testDisposables.add(toDisposable(() => {
			for (const notification of [...model.notifications]) {
				notification.close();
			}
		}));

		const toasts = testDisposables.add(instantiationService.createInstance(NotificationsToasts, container, model));
		// Avoid viewport-dependent hiding because these tests assert scheduled toast counts.
		toasts.layout(new Dimension(1024, Number.MAX_SAFE_INTEGER));
		await Promise.resolve();

		return {
			container,
			model,
			toasts,
			flushAnimationFrame: () => new Promise(resolve => targetWindow.requestAnimationFrame(() => resolve()))
		};
	}

	test('shows one toast for rapidly added duplicate notifications', async () => {
		const { container, model, toasts } = await createToasts();
		const toastVisible = Event.toPromise(toasts.onDidChangeVisibility);

		for (let i = 0; i < 15; i++) {
			model.addNotification({ severity: Severity.Error, message: 'Hello!' });
		}
		await Promise.resolve();

		const beforeAnimationFrame = {
			notifications: model.notifications.length,
			toasts: container.querySelectorAll('.notification-toast-container').length
		};

		await toastVisible;
		assert.deepStrictEqual({
			beforeAnimationFrame,
			notifications: model.notifications.length,
			toasts: container.querySelectorAll('.notification-toast-container').length,
			visible: toasts.isVisible
		}, {
			beforeAnimationFrame: {
				notifications: 1,
				toasts: 0
			},
			notifications: 1,
			toasts: 1,
			visible: true
		});
	});

	test('limits rapidly added distinct notification toasts', async () => {
		const { container, model, toasts } = await createToasts();
		const toastVisible = Event.toPromise(toasts.onDidChangeVisibility);

		for (let i = 0; i < 15; i++) {
			model.addNotification({ severity: Severity.Error, message: `Message ${i}` });
		}

		await toastVisible;

		assert.deepStrictEqual({
			notifications: model.notifications.length,
			toasts: container.querySelectorAll('.notification-toast-container').length,
			visible: toasts.isVisible
		}, {
			notifications: 15,
			toasts: 3,
			visible: true
		});
	});

	test('does not show a pending notification removed before rendering', async () => {
		const { container, model, toasts, flushAnimationFrame } = await createToasts();
		const handle = model.addNotification({ severity: Severity.Error, message: 'Hello!' });

		handle.close();
		await Promise.resolve();
		await flushAnimationFrame();

		assert.deepStrictEqual({
			notifications: model.notifications.length,
			toasts: container.querySelectorAll('.notification-toast-container').length,
			visible: toasts.isVisible
		}, {
			notifications: 0,
			toasts: 0,
			visible: false
		});
	});

	test('recalculates visible toasts when row height changes', async () => {
		setNotificationRowHeight(34);
		const { container, model, toasts, flushAnimationFrame } = await createToasts();

		model.addNotification({ severity: Severity.Error, message: 'First', sticky: true });
		model.addNotification({ severity: Severity.Error, message: 'Second', sticky: true });
		await flushAnimationFrame();

		let compactFitHeight: number | undefined;
		for (let height = 1; height <= 500; height++) {
			toasts.layout(new Dimension(1024, height));
			if (container.querySelectorAll('.notification-toast-container').length === 2) {
				compactFitHeight = height;
				break;
			}
		}

		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		const standardVisibleToasts = container.querySelectorAll('.notification-toast-container').length;
		setNotificationRowHeight(34);

		assert.deepStrictEqual({ foundCompactFitHeight: typeof compactFitHeight === 'number', standardVisibleToasts, compactVisibleToasts: container.querySelectorAll('.notification-toast-container').length }, {
			foundCompactFitHeight: true,
			standardVisibleToasts: 1,
			compactVisibleToasts: 2
		});
	});
});
