/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSelectedModelStorageKey, getStoredSelectedModel, SELECTED_MODEL_STORAGE_SCOPE, SELECTED_MODEL_STORAGE_TARGET, storeSelectedModel } from '../../common/chatSelectedModel.js';
import { ChatAgentLocation } from '../../common/constants.js';

suite('ChatSelectedModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('stores shared and targeted selections in profile user storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, undefined, 'copilot/shared');
		storeSelectedModel(storage, ChatAgentLocation.Chat, 'agent-host-copilotcli', 'copilot/targeted');

		assert.deepStrictEqual({
			sharedKey: getSelectedModelStorageKey(ChatAgentLocation.Chat),
			targetedKey: getSelectedModelStorageKey(ChatAgentLocation.Chat, 'agent-host-copilotcli'),
			shared: getStoredSelectedModel(storage, ChatAgentLocation.Chat),
			targeted: getStoredSelectedModel(storage, ChatAgentLocation.Chat, 'agent-host-copilotcli'),
			profileUserKeys: storage.keys(SELECTED_MODEL_STORAGE_SCOPE, SELECTED_MODEL_STORAGE_TARGET).sort(),
			profileMachineKeys: storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
		}, {
			sharedKey: 'chat.currentLanguageModel.panel',
			targetedKey: 'chat.currentLanguageModel.panel.agent-host-copilotcli',
			shared: 'copilot/shared',
			targeted: 'copilot/targeted',
			profileUserKeys: [
				'chat.currentLanguageModel.panel',
				'chat.currentLanguageModel.panel.agent-host-copilotcli',
			],
			profileMachineKeys: [],
		});
	});

	test('migrates the application-scoped selection to profile user storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const key = getSelectedModelStorageKey(ChatAgentLocation.Chat, 'copilotcli');
		const isDefaultKey = `${key}.isDefault`;
		storage.store(key, 'copilot/legacy', StorageScope.APPLICATION, StorageTarget.USER);
		storage.store(isDefaultKey, false, StorageScope.APPLICATION, StorageTarget.USER);

		assert.deepStrictEqual({
			selection: getStoredSelectedModel(storage, ChatAgentLocation.Chat, 'copilotcli'),
			identifier: storage.get(key, StorageScope.PROFILE),
			legacyIdentifier: storage.get(key, StorageScope.APPLICATION),
			legacyIsDefault: storage.getBoolean(isDefaultKey, StorageScope.APPLICATION),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
		}, {
			selection: 'copilot/legacy',
			identifier: 'copilot/legacy',
			legacyIdentifier: undefined,
			legacyIsDefault: undefined,
			profileUserKeys: [key],
		});
	});

	test('drops a retired automatic profile selection', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const key = getSelectedModelStorageKey(ChatAgentLocation.Chat);
		const isDefaultKey = `${key}.isDefault`;
		storage.store(key, 'copilot/selected', StorageScope.PROFILE, StorageTarget.USER);
		storage.store(isDefaultKey, true, StorageScope.PROFILE, StorageTarget.USER);

		assert.deepStrictEqual({
			selection: getStoredSelectedModel(storage, ChatAgentLocation.Chat),
			isDefault: storage.getBoolean(isDefaultKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER),
		}, {
			selection: undefined,
			isDefault: undefined,
			profileUserKeys: [],
		});
	});

	test('preserves a retired explicit profile selection', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const key = getSelectedModelStorageKey(ChatAgentLocation.Chat);
		const isDefaultKey = `${key}.isDefault`;
		storage.store(key, 'copilot/selected', StorageScope.PROFILE, StorageTarget.USER);
		storage.store(isDefaultKey, false, StorageScope.PROFILE, StorageTarget.USER);

		assert.deepStrictEqual({
			selection: getStoredSelectedModel(storage, ChatAgentLocation.Chat),
			isDefault: storage.getBoolean(isDefaultKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER),
		}, {
			selection: 'copilot/selected',
			isDefault: undefined,
			profileUserKeys: [key],
		});
	});
});
