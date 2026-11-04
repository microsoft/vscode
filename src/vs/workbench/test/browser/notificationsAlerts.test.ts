/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setARIAContainer } from '../../../base/browser/ui/aria/aria.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NotificationPriority, Severity } from '../../../platform/notification/common/notification.js';
import { NotificationsAlerts } from '../../browser/parts/notifications/notificationsAlerts.js';
import { NotificationsModel } from '../../common/notifications.js';

suite('NotificationsAlerts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let model: NotificationsModel;

	setup(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		setARIAContainer(container);
		model = disposables.add(new NotificationsModel());
		disposables.add(toDisposable(() => {
			for (const notification of [...model.notifications]) {
				notification.close();
			}
		}));
		disposables.add(new NotificationsAlerts(model));
	});

	function announcements() {
		return {
			assertive: Array.from(container.querySelectorAll('[role="alert"]'), element => element.textContent).filter(Boolean),
			polite: Array.from(container.querySelectorAll('[aria-live="polite"]'), element => element.textContent).filter(Boolean)
		};
	}

	for (const progress of [{ infinite: true }, { total: 100, worked: 1 }]) {
		test(`announces recurring ${progress.infinite ? 'infinite' : 'discrete'} progress politely`, () => {
			const handle = model.addNotification({ severity: Severity.Info, message: 'Uploading', progress });
			const initial = announcements();
			handle.updateMessage('Uploading: 1 MB');
			handle.updateMessage('Uploading: 2 MB');
			assert.deepStrictEqual({ initial, updated: announcements(), message: model.notifications[0].message.raw }, {
				initial: { assertive: ['Info: Uploading'], polite: [] },
				updated: { assertive: ['Info: Uploading'], polite: ['Info: Uploading: 2 MB'] },
				message: 'Uploading: 2 MB'
			});
		});
	}

	test('keeps ordinary message updates assertive', () => {
		const handle = model.addNotification({ severity: Severity.Info, message: 'Initial' });
		handle.updateMessage('Updated');
		assert.deepStrictEqual(announcements(), { assertive: ['Info: Updated'], polite: [] });
	});

	for (const [severity, prefix] of [[Severity.Warning, 'Warning'], [Severity.Error, 'Error']] as const) {
		test(`keeps ${prefix.toLowerCase()} updates assertive during progress`, () => {
			const handle = model.addNotification({ severity: Severity.Info, message: 'Uploading', progress: { infinite: true } });
			handle.updateSeverity(severity);
			handle.updateMessage('Transfer needs attention');
			assert.deepStrictEqual(announcements(), { assertive: [`${prefix}: Transfer needs attention`], polite: [] });
		});
	}

	test('does not announce silent progress', () => {
		const handle = model.addNotification({ severity: Severity.Info, message: 'Uploading', progress: { infinite: true }, priority: NotificationPriority.SILENT });
		handle.updateMessage('Uploading: 1 MB');
		assert.deepStrictEqual(announcements(), { assertive: [], polite: [] });
	});

	test('keeps completion messages assertive once progress finishes', () => {
		const handle = model.addNotification({ severity: Severity.Info, message: 'Uploading', progress: { infinite: true } });
		handle.progress.done();
		handle.updateMessage('Upload complete');
		assert.deepStrictEqual(announcements(), { assertive: ['Info: Upload complete'], polite: [] });
	});

	test('stops announcing updates after closing a notification', () => {
		const handle = model.addNotification({ severity: Severity.Info, message: 'Uploading', progress: { infinite: true } });
		handle.close();
		handle.updateMessage('Uploading: 1 MB');
		assert.deepStrictEqual(announcements(), { assertive: ['Info: Uploading'], polite: [] });
	});
});