/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NotificationsFilter } from '../../../../../platform/notification/common/notification.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { NotificationService } from '../../common/notificationService.js';

suite('NotificationService - filters', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): NotificationService {
		const storageService = disposables.add(new TestStorageService());
		return disposables.add(new NotificationService(storageService));
	}

	test('getFilters returns sources registered via setFilter', () => {
		const service = createService();

		service.setFilter({ id: 'ext.a', label: 'Extension A', filter: NotificationsFilter.OFF });
		service.setFilter({ id: 'ext.b', label: 'Extension B', filter: NotificationsFilter.ERROR });

		const filters = service.getFilters().sort((a, b) => a.id.localeCompare(b.id));
		assert.strictEqual(filters.length, 2);
		assert.strictEqual(filters[0].id, 'ext.a');
		assert.strictEqual(filters[0].filter, NotificationsFilter.OFF);
		assert.strictEqual(filters[1].id, 'ext.b');
		assert.strictEqual(filters[1].filter, NotificationsFilter.ERROR);
	});

	test('removeFilter drops a previously tracked source', () => {
		const service = createService();

		service.setFilter({ id: 'ext.a', label: 'Extension A', filter: NotificationsFilter.OFF });
		service.setFilter({ id: 'ext.b', label: 'Extension B', filter: NotificationsFilter.ERROR });
		assert.strictEqual(service.getFilters().length, 2);

		service.removeFilter('ext.a');

		const filters = service.getFilters();
		assert.strictEqual(filters.length, 1);
		assert.strictEqual(filters[0].id, 'ext.b');

		// After removal, the per-source filter falls back to the default (OFF).
		assert.strictEqual(service.getFilter({ id: 'ext.a', label: 'Extension A' }), NotificationsFilter.OFF);
	});

	test('removeFilter is a no-op for unknown source ids', () => {
		const service = createService();

		service.setFilter({ id: 'ext.a', label: 'Extension A', filter: NotificationsFilter.ERROR });

		service.removeFilter('ext.unknown');

		const filters = service.getFilters();
		assert.strictEqual(filters.length, 1);
		assert.strictEqual(filters[0].id, 'ext.a');
		assert.strictEqual(filters[0].filter, NotificationsFilter.ERROR);
	});

	test('removeFilter persists across service instances using the same storage', () => {
		const storageService = disposables.add(new TestStorageService());

		const first = disposables.add(new NotificationService(storageService));
		first.setFilter({ id: 'ext.a', label: 'Extension A', filter: NotificationsFilter.ERROR });
		first.setFilter({ id: 'ext.b', label: 'Extension B', filter: NotificationsFilter.OFF });
		first.removeFilter('ext.a');

		// A fresh service backed by the same storage should not see the removed source.
		const second = disposables.add(new NotificationService(storageService));
		const filters = second.getFilters();
		assert.strictEqual(filters.length, 1);
		assert.strictEqual(filters[0].id, 'ext.b');
	});

	test('removing the last filter leaves the picker source list empty', () => {
		const service = createService();

		service.setFilter({ id: 'ext.only', label: 'Only Extension', filter: NotificationsFilter.OFF });
		assert.strictEqual(service.getFilters().length, 1);

		service.removeFilter('ext.only');

		assert.strictEqual(service.getFilters().length, 0);
	});
});
