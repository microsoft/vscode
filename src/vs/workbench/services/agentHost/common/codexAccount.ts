/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const CODEX_CHATGPT_DEFAULT_PROVIDER_STORAGE_KEY = 'chat.agentHost.codex.defaultToChatGPT';
export const CODEX_CHAT_SESSION_TYPE = 'agent-host-codex';

const CODEX_SELECTED_MODEL_STORAGE_KEY = `chat.currentLanguageModel.chat.${CODEX_CHAT_SESSION_TYPE}`;

export function isChatGPTDefaultForCodex(storageService: IStorageService): boolean {
	return storageService.getBoolean(CODEX_CHATGPT_DEFAULT_PROVIDER_STORAGE_KEY, StorageScope.PROFILE, false);
}

export function setChatGPTDefaultForCodex(storageService: IStorageService, enabled: boolean): void {
	storageService.store(CODEX_CHATGPT_DEFAULT_PROVIDER_STORAGE_KEY, enabled, StorageScope.PROFILE, StorageTarget.USER);
	storageService.remove(CODEX_SELECTED_MODEL_STORAGE_KEY, StorageScope.PROFILE);
}
