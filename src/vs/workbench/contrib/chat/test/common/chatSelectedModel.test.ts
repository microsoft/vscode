/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSelectedModelIsDefaultStorageKey, getSelectedModelStorageKey, getStoredSelectedModel, SELECTED_MODEL_STORAGE_SCOPE, SELECTED_MODEL_STORAGE_TARGET, storeSelectedModel } from '../../common/chatSelectedModel.js';
import { ChatAgentLocation } from '../../common/constants.js';

suite('ChatSelectedModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('stores shared and targeted selections in profile user storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		storeSelectedModel(storage, ChatAgentLocation.Chat, undefined, { identifier: 'copilot/shared', isDefault: true });
		storeSelectedModel(storage, ChatAgentLocation.Chat, 'agent-host-copilotcli', { identifier: 'copilot/targeted', isDefault: false });

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
			shared: { identifier: 'copilot/shared', isDefault: true },
			targeted: { identifier: 'copilot/targeted', isDefault: false },
			profileUserKeys: [
				'chat.currentLanguageModel.panel',
				'chat.currentLanguageModel.panel.agent-host-copilotcli',
				'chat.currentLanguageModel.panel.agent-host-copilotcli.isDefault',
				'chat.currentLanguageModel.panel.isDefault',
			],
			profileMachineKeys: [],
		});
	});

	test('migrates the application-scoped selection to profile user storage', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const key = getSelectedModelStorageKey(ChatAgentLocation.Chat, 'copilotcli');
		const isDefaultKey = getSelectedModelIsDefaultStorageKey(ChatAgentLocation.Chat, 'copilotcli');
		storage.store(key, 'copilot/legacy', StorageScope.APPLICATION, StorageTarget.USER);
		storage.store(isDefaultKey, false, StorageScope.APPLICATION, StorageTarget.USER);

		assert.deepStrictEqual({
			selection: getStoredSelectedModel(storage, ChatAgentLocation.Chat, 'copilotcli'),
			identifier: storage.get(key, StorageScope.PROFILE),
			isDefault: storage.getBoolean(isDefaultKey, StorageScope.PROFILE),
			profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
		}, {
			selection: { identifier: 'copilot/legacy', isDefault: false },
			identifier: 'copilot/legacy',
			isDefault: false,
			profileUserKeys: [key, isDefaultKey].sort(),
		});
	});
});
