/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

const showSharedByOthersStorageKey = 'sessions.automations.showSharedByOthers';

export function getShowSharedAutomationsByOthers(storageService: IStorageService): boolean {
	return storageService.getBoolean(showSharedByOthersStorageKey, StorageScope.PROFILE, false);
}

export function setShowSharedAutomationsByOthers(storageService: IStorageService, value: boolean): void {
	storageService.store(showSharedByOthersStorageKey, value, StorageScope.PROFILE, StorageTarget.MACHINE);
}

export function observableShowSharedAutomationsByOthers(owner: object, storageService: IStorageService, store: DisposableStore): IObservable<boolean> {
	return observableFromEvent(owner, storageService.onDidChangeValue(StorageScope.PROFILE, showSharedByOthersStorageKey, store),
		() => getShowSharedAutomationsByOthers(storageService));
}
