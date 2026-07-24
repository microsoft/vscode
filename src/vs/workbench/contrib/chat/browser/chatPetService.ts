/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

const CHAT_PET_ENABLED_STORAGE_KEY = 'chat.vscodePet.enabled';

export const IChatPetService = createDecorator<IChatPetService>('chatPetService');

export interface IChatPetService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	toggle(): boolean;
}

export class ChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled: IObservable<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._enabled = observableValue(this, this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.enabled = this._enabled;

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ENABLED_STORAGE_KEY, this._store)(() => {
			this._enabled.set(this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false), undefined);
		}));
	}

	toggle(): boolean {
		const enabled = !this._enabled.get();
		this._enabled.set(enabled, undefined);
		this.storageService.store(CHAT_PET_ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
		status(enabled
			? localize('chatPet.enabled', "VS Code pet enabled")
			: localize('chatPet.disabled', "VS Code pet disabled"));
		return enabled;
	}
}
