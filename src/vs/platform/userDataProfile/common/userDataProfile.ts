/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export interface IUserDataProfile {
	readonly name: string | undefined;
	readonly location: URI;
	readonly globalStorageHome: URI;
	readonly settingsResource: URI;
	readonly keybindingsResource: URI;
	readonly tasksResource: URI;
	readonly snippetsHome: URI;
	readonly extensionsResource: URI | undefined;
}

export const IUserDataProfilesService = createDecorator<IUserDataProfilesService>('IUserDataProfilesService');
export interface IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	readonly defaultProfile: IUserDataProfile;

	readonly onDidChangeCurrentProfile: Event<IUserDataProfile>;
	readonly currentProfile: IUserDataProfile;
}

export class UserDataProfilesService extends Disposable implements IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	private _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	readonly defaultProfile: IUserDataProfile;

	private readonly _onDidChangeCurrentProfile = this._register(new Emitter<IUserDataProfile>());
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;

	constructor(
		profile: string | undefined,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService logService: ILogService
	) {
		super();
		this.defaultProfile = this.createProfile(undefined);
		this._currentProfile = profile ? this.createProfile(profile) : this.defaultProfile;
	}

	private createProfile(name: string | undefined): IUserDataProfile {
		const location = name ? joinPath(this.environmentService.userRoamingDataHome, 'profiles', name) : this.environmentService.userRoamingDataHome;
		return {
			name,
			location: location,
			globalStorageHome: joinPath(location, 'globalStorage'),
			settingsResource: joinPath(location, 'settings.json'),
			keybindingsResource: joinPath(location, 'keybindings.json'),
			tasksResource: joinPath(location, 'tasks.json'),
			snippetsHome: joinPath(location, 'snippets'),
			extensionsResource: name ? joinPath(location, 'extensions') : undefined
		};
	}

}
