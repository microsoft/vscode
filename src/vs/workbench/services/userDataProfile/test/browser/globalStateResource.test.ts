/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GlobalStateResourceInitializer } from '../../browser/globalStateResource.js';

// A key the product records for itself and reads as machine-local state. Its
// presence grants workspace trust, so profile content must not be able to
// supply one.
const MACHINE_KEY = 'chat.transferedWorkspaces';
const PROFILE_KEY = 'workbench.someView.state';

suite('GlobalStateResourceInitializer', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createStorage(): InMemoryStorageService {
		return disposables.add(new InMemoryStorageService());
	}

	test('does not take a key this machine holds at MACHINE target', async () => {
		const storage = createStorage();
		storage.store(MACHINE_KEY, JSON.stringify(['file:///recorded']), StorageScope.PROFILE, StorageTarget.MACHINE);

		await new GlobalStateResourceInitializer(storage).initialize(JSON.stringify({
			storage: { [MACHINE_KEY]: JSON.stringify(['file:///attacker']) },
		}));

		assert.deepStrictEqual(
			storage.getObject(MACHINE_KEY, StorageScope.PROFILE, []),
			['file:///recorded'],
			'the machine-local value must be left alone'
		);
		assert.ok(
			storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE).includes(MACHINE_KEY),
			'the key must still be MACHINE target'
		);
	});

	test('still takes ordinary profile keys', async () => {
		const storage = createStorage();

		await new GlobalStateResourceInitializer(storage).initialize(JSON.stringify({
			storage: { [PROFILE_KEY]: 'expanded' },
		}));

		assert.strictEqual(storage.get(PROFILE_KEY, StorageScope.PROFILE), 'expanded');
		assert.ok(storage.keys(StorageScope.PROFILE, StorageTarget.USER).includes(PROFILE_KEY));
	});

	test('takes the ordinary keys of content that also carries a machine key', async () => {
		const storage = createStorage();
		storage.store(MACHINE_KEY, JSON.stringify(['file:///recorded']), StorageScope.PROFILE, StorageTarget.MACHINE);

		await new GlobalStateResourceInitializer(storage).initialize(JSON.stringify({
			storage: {
				[MACHINE_KEY]: JSON.stringify(['file:///attacker']),
				[PROFILE_KEY]: 'expanded',
			},
		}));

		assert.strictEqual(storage.get(PROFILE_KEY, StorageScope.PROFILE), 'expanded', 'one rejected key must not drop the rest');
		assert.deepStrictEqual(storage.getObject(MACHINE_KEY, StorageScope.PROFILE, []), ['file:///recorded']);
	});

	test('does not take a key held at MACHINE target in application scope', async () => {
		const storage = createStorage();
		storage.store('some.machine.key', 'recorded', StorageScope.APPLICATION, StorageTarget.MACHINE);

		await new GlobalStateResourceInitializer(storage).initialize(JSON.stringify({
			storage: { 'some.machine.key': 'attacker' },
		}));

		assert.strictEqual(storage.get('some.machine.key', StorageScope.PROFILE), undefined);
	});
});
