/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event';
import { IStorageDatabase } from '../../../../base/parts/storage/common/storage';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { ILogService } from '../../../../platform/log/common/log';
import { AbstractUserDataProfileStorageService, IProfileStorageChanges, IUserDataProfileStorageService } from '../../../../platform/userDataProfile/common/userDataProfileStorageService';
import { IProfileStorageValueChangeEvent, isProfileUsingDefaultStorage, IStorageService, StorageScope } from '../../../../platform/storage/common/storage';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile';
import { IndexedDBStorageDatabase } from '../../storage/browser/storageService';
import { IUserDataProfileService } from '../common/userDataProfile';
import { DisposableStore } from '../../../../base/common/lifecycle';

export class UserDataProfileStorageService extends AbstractUserDataProfileStorageService implements IUserDataProfileStorageService {

	private readonly _onDidChange = this._register(new Emitter<IProfileStorageChanges>());
	readonly onDidChange: Event<IProfileStorageChanges> = this._onDidChange.event;

	constructor(
		@IStorageService storageService: IStorageService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@ILogService private readonly logService: ILogService,
	) {
		super(true, storageService);
		const disposables = this._register(new DisposableStore());
		this._register(Event.filter(storageService.onDidChangeTarget, e => e.scope === StorageScope.PROFILE, disposables)(() => this.onDidChangeStorageTargetInCurrentProfile()));
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, disposables)(e => this.onDidChangeStorageValueInCurrentProfile(e)));
	}

	private onDidChangeStorageTargetInCurrentProfile(): void {
		// Not broadcasting changes to other windows/tabs as it is not required in web.
		// Revisit if needed in future.
		this._onDidChange.fire({ targetChanges: [this.userDataProfileService.currentProfile], valueChanges: [] });
	}

	private onDidChangeStorageValueInCurrentProfile(e: IProfileStorageValueChangeEvent): void {
		// Not broadcasting changes to other windows/tabs as it is not required in web
		// Revisit if needed in future.
		this._onDidChange.fire({ targetChanges: [], valueChanges: [{ profile: this.userDataProfileService.currentProfile, changes: [e] }] });
	}

	protected createStorageDatabase(profile: IUserDataProfile): Promise<IStorageDatabase> {
		return isProfileUsingDefaultStorage(profile) ? IndexedDBStorageDatabase.createApplicationStorage(this.logService) : IndexedDBStorageDatabase.createProfileStorage(profile, this.logService);
	}
}

registerSingleton(IUserDataProfileStorageService, UserDataProfileStorageService, InstantiationType.Delayed);
