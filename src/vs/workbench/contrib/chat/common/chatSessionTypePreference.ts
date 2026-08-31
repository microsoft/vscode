/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const CHAT_USER_SELECTED_SESSION_TYPE_STORAGE_KEY = 'chat.userSelectedSessionType';

export function getRememberedSessionType(storageService: IStorageService): string | undefined {
	return storageService.get(CHAT_USER_SELECTED_SESSION_TYPE_STORAGE_KEY, StorageScope.PROFILE);
}

export function storeUserSelectedSessionType(storageService: IStorageService, sessionType: string): void {
	storageService.store(CHAT_USER_SELECTED_SESSION_TYPE_STORAGE_KEY, sessionType, StorageScope.PROFILE, StorageTarget.MACHINE);
}

export function clearUserSelectedSessionType(storageService: IStorageService): void {
	storageService.remove(CHAT_USER_SELECTED_SESSION_TYPE_STORAGE_KEY, StorageScope.PROFILE);
}
