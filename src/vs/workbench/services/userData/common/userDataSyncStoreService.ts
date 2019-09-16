/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';
import { IUserDataSyncStoreService, IUserDataSyncStore, IUserData, UserDataSyncStoreError, toUserDataSyncStoreErrorCode } from 'vs/workbench/services/userData/common/userData';
import { ILogService } from 'vs/platform/log/common/log';

export class UserDataSyncStoreService extends Disposable implements IUserDataSyncStoreService {

	_serviceBrand: any;

	private userDataSyncStore: IUserDataSyncStore | null = null;
	private name: string | null = null;

	private readonly _onDidChangeEnablement: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	constructor(
		@ILogService private logService: ILogService
	) {
		super();
	}

	registerUserDataSyncStore(name: string, userDataSyncStore: IUserDataSyncStore): void {
		if (this.userDataSyncStore) {
			this.logService.warn(`A user data sync store '${this.name}' already registered. Hence ignoring the newly registered '${name}' store.`);
			return;
		}
		this.userDataSyncStore = userDataSyncStore;
		this.name = name;
		this._onDidChangeEnablement.fire(true);
	}

	deregisterUserDataSyncStore(): void {
		this.userDataSyncStore = null;
		this.name = null;
		this._onDidChangeEnablement.fire(false);
	}

	getName(): string | null {
		return this.name;
	}

	isEnabled(): boolean {
		return !!this.userDataSyncStore;
	}

	read(key: string): Promise<IUserData | null> {
		if (!this.userDataSyncStore) {
			throw new Error('No user sync store exists.');
		}
		return this.userDataSyncStore.read(key)
			.then(null, error => Promise.reject(new UserDataSyncStoreError(error.message, toUserDataSyncStoreErrorCode(error))));
	}

	write(key: string, content: string, ref: string | null): Promise<string> {
		if (!this.userDataSyncStore) {
			throw new Error('No user sync store exists.');
		}
		return this.userDataSyncStore.write(key, content, ref)
			.then(null, error => Promise.reject(new UserDataSyncStoreError(error.message, toUserDataSyncStoreErrorCode(error))));
	}

}

registerSingleton(IUserDataSyncStoreService, UserDataSyncStoreService);
