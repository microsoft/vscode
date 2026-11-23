/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ISharedLayoutStateService, SharedLayoutStateService } from '../../common/sharedLayoutState.js';

suite('SharedLayoutStateService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a local copy is used instead of the shared state and restored in a new window of the workspace', () => {
		const storageService = disposables.add(new TestStorageService());
		const testObject = disposables.add(new SharedLayoutStateService(storageService, new NullLogService()));
		storageService.store('key', 'shared', StorageScope.PROFILE, StorageTarget.USER);
		const changes: string[] = [];
		const store = disposables.add(new DisposableStore());
		store.add(testObject.getValueChangeEvent('key', store)(key => changes.push(key)));
		testObject.get('empty', 'fallback');

		testObject.setLocalState(testObject.getState());
		testObject.store('key', 'local');
		storageService.store('key', 'changed in another window', StorageScope.PROFILE, StorageTarget.USER);
		storageService.store('empty', 'stored in another window', StorageScope.PROFILE, StorageTarget.USER);
		storageService.store('other', 'not in the local copy', StorageScope.PROFILE, StorageTarget.USER);
		const local = { key: testObject.get('key', ''), empty: testObject.get('empty', 'fallback'), other: testObject.get('other', ''), shared: storageService.get('key', StorageScope.PROFILE) };

		const restored = disposables.add(new SharedLayoutStateService(storageService, new NullLogService())).get('key', '');
		const sharedState = testObject.getSharedState();

		testObject.setLocalState(undefined);

		assert.deepStrictEqual({ local, restored, sharedState, key: testObject.get('key', ''), changes }, {
			local: { key: 'local', empty: 'fallback', other: 'not in the local copy', shared: 'changed in another window' },
			restored: 'local',
			sharedState: { key: 'changed in another window', empty: 'stored in another window', other: 'not in the local copy' },
			key: 'changed in another window',
			changes: ['key', 'key']
		});
	});

	test('the event for changes of a value can be used before a delayed instance of the service is created', () => {
		const storageService = disposables.add(new TestStorageService());
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[IStorageService, storageService],
			[ILogService, new NullLogService()],
			[ISharedLayoutStateService, new SyncDescriptor(SharedLayoutStateService, undefined, true)]
		), true));
		const changes: string[] = [];
		const store = disposables.add(new DisposableStore());

		instantiationService.invokeFunction(accessor => {
			const sharedLayoutStateService = accessor.get(ISharedLayoutStateService);
			store.add(sharedLayoutStateService.getValueChangeEvent('key', store)(key => changes.push(key)));
		});
		storageService.store('key', 'value', StorageScope.PROFILE, StorageTarget.USER);

		assert.deepStrictEqual(changes, ['key']);
	});
});
