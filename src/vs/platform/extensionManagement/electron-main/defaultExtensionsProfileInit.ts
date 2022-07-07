/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IDefaultExtensionsProfileInitService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';

export class DefaultExtensionsProfileInitHandler extends Disposable {
	constructor(
		@IDefaultExtensionsProfileInitService private readonly defaultExtensionsProfileInitService: IDefaultExtensionsProfileInitService,
		@IUserDataProfilesMainService userDataProfilesService: IUserDataProfilesMainService,
	) {
		super();
		this._register(userDataProfilesService.onWillCreateProfile(e => {
			if (userDataProfilesService.profiles.length === 1) {
				e.join(this.defaultExtensionsProfileInitService.initialize());
			}
		}));
		this._register(userDataProfilesService.onDidChangeProfiles(e => {
			if (userDataProfilesService.profiles.length === 1) {
				this.defaultExtensionsProfileInitService.uninitialize();
			}
		}));
	}
}
