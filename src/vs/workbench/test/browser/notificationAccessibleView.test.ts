/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../platform/accessibility/browser/accessibleView.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IListService, WorkbenchList } from '../../../platform/list/browser/listService.js';
import { Severity } from '../../../platform/notification/common/notification.js';
import { NotificationAccessibleView } from '../../browser/parts/notifications/notificationAccessibleView.js';
import { INotificationViewItem, NotificationsModel } from '../../common/notifications.js';
import { workbenchInstantiationService } from './workbenchTestServices.js';

suite('NotificationAccessibleView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setupNotification() {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const model = store.add(new NotificationsModel());
		const handle = model.addNotification({ severity: Severity.Info, message: 'Synthetic notification' });
		store.add(toDisposable(() => handle.close()));
		const list = store.add(instantiationService.createInstance(
			WorkbenchList<INotificationViewItem>,
			'NotificationAccessibleView',
			container,
			{ getHeight: () => 22, getTemplateId: () => 'notification' },
			[{
				templateId: 'notification',
				renderTemplate: () => container,
				renderElement: () => { },
				disposeTemplate: () => { }
			}],
			{ accessibilityProvider: { getAriaLabel: item => item.message.raw, getWidgetAriaLabel: () => 'Notifications' } }
		));
		list.splice(0, 0, model.notifications);
		list.setFocus([0]);
		instantiationService.stub(IListService, { lastFocusedList: list });
		let nextCalls = 0;
		instantiationService.stub(IAccessibleViewService, { next: () => nextCalls++ });
		instantiationService.stub(ICommandService, {
			executeCommand: async () => {
				list.setFocus([0]);
				return undefined;
			}
		});
		const implementation = new NotificationAccessibleView();
		return {
			handle,
			getNextCalls: () => nextCalls,
			createProvider: () => {
				const provider = instantiationService.invokeFunction(accessor => implementation.getProvider(accessor));
				assert.ok(provider);
				store.add(provider);
				const onOpenDisposable = provider.onOpen?.();
				assert.ok(onOpenDisposable);
				return store.add(onOpenDisposable);
			}
		};
	}

	test('releases close listeners when show resources are disposed while the notification survives', () => {
		const notification = setupNotification();
		for (let index = 0; index < 3; index++) {
			notification.createProvider().dispose();
		}
		notification.handle.close();
		assert.strictEqual(notification.getNextCalls(), 0);
	});

	test('only the surviving provider responds when the notification closes', () => {
		const notification = setupNotification();
		notification.createProvider().dispose();
		const provider = notification.createProvider();
		notification.handle.close();
		provider.dispose();
		assert.strictEqual(notification.getNextCalls(), 1);
	});
});
