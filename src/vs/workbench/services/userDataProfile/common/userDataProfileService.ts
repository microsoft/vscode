/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfileService extends Disposable implements IUserDataProfileService {

	readonly _serviceBrand: undefined;

	readonly defaultProfile: IUserDataProfile;

	private readonly _onDidChangeCurrentProfile = this._register(new Emitter<IUserDataProfile>());
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;

	private _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	constructor(
		defaultProfile: IUserDataProfile,
		currentProfile: IUserDataProfile,
	) {
		super();
		this.defaultProfile = defaultProfile;
		this._currentProfile = currentProfile;
	}

	updateCurrentProfile(userDataProfile: IUserDataProfile): void {
		this._currentProfile = userDataProfile;
		this._onDidChangeCurrentProfile.fire(userDataProfile);
	}
}
