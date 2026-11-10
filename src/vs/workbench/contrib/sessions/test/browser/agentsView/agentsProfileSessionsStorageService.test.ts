/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AGENTS_WINDOW_PROFILE_ID, IUserDataProfile, IUserDataProfilesService, toUserDataProfile } from '../../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IProfileStorageChanges, IStorageValue, IUserDataProfileStorageService } from '../../../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { TestLifecycleService } from '../../../../../test/common/workbenchTestServices.js';
import { AgentsProfileSessionsStorageService } from '../../../browser/agentsView/agentsProfileSessionsStorageService.js';

suite('AgentsProfileSessionsStorageService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const agentsProfile = toUserDataProfile(AGENTS_WINDOW_PROFILE_ID, 'Agents', URI.file('/profiles/agents'), URI.file('/cache'));

	/** The storage of the Agents window's profile, as another window sees it. */
	class TestProfileStorage {
		readonly data = new Map<string, IStorageValue>();
		readonly writes: { readonly items: Record<string, string | undefined>; readonly target: StorageTarget }[] = [];
		readonly onDidChangeEmitter = disposables.add(new Emitter<IProfileStorageChanges>());

		readonly service = upcastPartial<IUserDataProfileStorageService>({
			onDidChange: this.onDidChangeEmitter.event,
			readStorageData: async () => new Map(this.data),
			updateStorageData: async (_profile: IUserDataProfile, items: Map<string, string | undefined | null>, target: StorageTarget) => {
				this.writes.push({ items: Object.fromEntries([...items].map(([key, value]) => [key, value ?? undefined])), target });
				for (const [key, value] of items) {
					if (value === undefined || value === null) {
						this.data.delete(key);
					} else {
						this.data.set(key, { value, target, scope: StorageScope.PROFILE });
					}
				}
			},
		});

		/** Another window, such as the Agents window, changes `key`. */
		change(key: string, value: string): void {
			this.data.set(key, { value, target: StorageTarget.USER, scope: StorageScope.PROFILE });
			this.onDidChangeEmitter.fire({ targetChanges: [], valueChanges: [{ profile: agentsProfile, changes: [{ key, scope: StorageScope.PROFILE, target: StorageTarget.USER }] }] });
		}
	}

	function createService(profileStorage: TestProfileStorage, profiles: readonly IUserDataProfile[] = [agentsProfile]) {
		const windowStorage = disposables.add(new InMemoryStorageService());
		const service = disposables.add(new AgentsProfileSessionsStorageService(
			windowStorage,
			upcastPartial<IUserDataProfilesService>({ profiles, createProfile: () => Promise.reject(new Error('cannot create')) }),
			profileStorage.service,
			disposables.add(new TestLifecycleService()),
			new NullLogService(),
			new MockContextKeyService(),
		));
		return { service, windowStorage };
	}

	test('reads the state of the Agents window once it has loaded, and drops writes before', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const profileStorage = new TestProfileStorage();
		profileStorage.data.set('sessionsViewPane.grouping', { value: 'repository', target: StorageTarget.USER, scope: StorageScope.PROFILE });
		const { service, windowStorage } = createService(profileStorage);

		service.store('sessionsViewPane.sorting', 'updated', StorageScope.PROFILE, StorageTarget.USER);
		const beforeLoad = service.get('sessionsViewPane.grouping', StorageScope.PROFILE);
		await service.whenReady();
		await timeout(500);

		assert.deepStrictEqual({
			beforeLoad,
			grouping: service.get('sessionsViewPane.grouping', StorageScope.PROFILE),
			sorting: service.get('sessionsViewPane.sorting', StorageScope.PROFILE),
			windowGrouping: windowStorage.get('sessionsViewPane.grouping', StorageScope.PROFILE),
			writes: profileStorage.writes,
		}, {
			beforeLoad: undefined,
			grouping: 'repository',
			sorting: undefined,
			windowGrouping: undefined,
			writes: [],
		});
	}));

	test('writes the list state to the Agents window profile, and keeps other scopes in the window', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const profileStorage = new TestProfileStorage();
		const { service, windowStorage } = createService(profileStorage);
		await service.whenReady();

		service.store('sessionsViewPane.grouping', 'time', StorageScope.PROFILE, StorageTarget.USER);
		service.store('sessionsViewPane.compact', true, StorageScope.PROFILE, StorageTarget.USER);
		service.store('workspace.key', 'value', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		await timeout(500);

		assert.deepStrictEqual({
			writes: profileStorage.writes,
			windowGrouping: windowStorage.get('sessionsViewPane.grouping', StorageScope.PROFILE),
			windowWorkspaceKey: windowStorage.get('workspace.key', StorageScope.WORKSPACE),
		}, {
			writes: [{ items: { 'sessionsViewPane.grouping': 'time', 'sessionsViewPane.compact': 'true' }, target: StorageTarget.USER }],
			windowGrouping: undefined,
			windowWorkspaceKey: 'value',
		});
	}));

	test('applies changes of the Agents window as external changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const profileStorage = new TestProfileStorage();
		const { service } = createService(profileStorage);
		await service.whenReady();
		const events: { key: string; external: boolean | undefined }[] = [];
		const store = disposables.add(new DisposableStore());
		store.add(service.onDidChangeValue(StorageScope.PROFILE, undefined, store)(e => events.push({ key: e.key, external: e.external })));

		profileStorage.change('sessionsViewPane.grouping', 'inbox');
		await timeout(500);

		assert.deepStrictEqual({ grouping: service.get('sessionsViewPane.grouping', StorageScope.PROFILE), events }, {
			grouping: 'inbox',
			events: [{ key: 'sessionsViewPane.grouping', external: true }],
		});
	}));

	test('keeps the state in the window without the profile of the Agents window', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const profileStorage = new TestProfileStorage();
		const { service, windowStorage } = createService(profileStorage, []);
		await service.whenReady();

		service.store('sessionsViewPane.grouping', 'time', StorageScope.PROFILE, StorageTarget.USER);
		await timeout(500);

		assert.deepStrictEqual({ window: windowStorage.get('sessionsViewPane.grouping', StorageScope.PROFILE), writes: profileStorage.writes }, { window: 'time', writes: [] });
	}));
});
