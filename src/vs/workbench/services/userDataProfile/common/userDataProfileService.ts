/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfileService extends Disposable implements IUserDataProfileService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeCurrentProfile = this._register(new Emitter<DidChangeUserDataProfileEvent>());
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;

	private _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	constructor(
		currentProfile: IUserDataProfile,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService
	) {
		super();
		this._currentProfile = currentProfile;
		this._register(userDataProfilesService.onDidChangeProfiles(() => {
			/**
			 * If the current profile is default profile, then reset it because,
			 * In Desktop the extensions resource will be set/unset in the default profile when profiles are changed.
			 */
			if (this._currentProfile.isDefault) {
				this._currentProfile = userDataProfilesService.defaultProfile;
			}
		}));
	}

	async updateCurrentProfile(userDataProfile: IUserDataProfile, preserveData: boolean): Promise<void> {
		if (this._currentProfile.id === userDataProfile.id) {
			return;
		}
		const previous = this._currentProfile;
		this._currentProfile = userDataProfile;
		const joiners: Promise<void>[] = [];
		this._onDidChangeCurrentProfile.fire({
			preserveData,
			previous,
			profile: userDataProfile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);
	}
}
