/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from '../../browser/remoteAgentHostPickerVisibility.js';

suite('RemoteAgentHostPickerVisibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares changes across consumers, persists on recreation, and observes external changes', () => {
		const storage = store.add(new InMemoryStorageService());
		const first = store.add(new RemoteAgentHostPickerVisibility(storage));
		const second = store.add(new RemoteAgentHostPickerVisibility(storage));
		const key = getRemoteAgentHostPickerKey('ssh:build');
		const observed: boolean[] = [];
		store.add(autorun(reader => observed.push(second.isHidden(key, reader))));
		first.setHidden(key, true);
		const restored = store.add(new RemoteAgentHostPickerVisibility(storage)).isHidden(key);
		const keys = storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.remove(keys[0], StorageScope.PROFILE, true);
		second.setHidden(key, true);
		first.setHidden(key, false);
		assert.deepStrictEqual({
			observed, restored, profileKeys: keys.length,
			applicationKeys: storage.keys(StorageScope.APPLICATION, StorageTarget.MACHINE).length,
			remaining: storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
		}, { observed: [false, true, false, true, false], restored: true, profileKeys: 1, applicationKeys: 0, remaining: [] });
	});

	test('isolates profiles and accounts and preserves normalized host identities', () => {
		const storage = store.add(new InMemoryStorageService());
		const preference = store.add(new RemoteAgentHostPickerVisibility(storage));
		const otherProfile = store.add(new RemoteAgentHostPickerVisibility(store.add(new InMemoryStorageService())));
		const key = getRemoteAgentHostPickerKey('cloudsandbox:host', 'account-one');
		preference.setHidden(key, true);
		preference.setHidden(getRemoteAgentHostPickerKey('ws://localhost:3000'), true);
		assert.deepStrictEqual({
			accountOne: preference.isHidden(key),
			accountTwo: preference.isHidden(getRemoteAgentHostPickerKey('cloudsandbox:host', 'account-two')),
			otherProfile: otherProfile.isHidden(key),
			websocket: preference.isHidden(getRemoteAgentHostPickerKey('localhost:3000')),
			secureWebsocket: preference.isHidden(getRemoteAgentHostPickerKey('wss://localhost:3000')),
		}, { accountOne: true, accountTwo: false, otherProfile: false, websocket: true, secureWebsocket: false });
	});
});
