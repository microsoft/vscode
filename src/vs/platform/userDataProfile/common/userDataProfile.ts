/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from 'vs/base/common/hash';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export type ProfileOptions = {
	settings?: boolean;
	keybindings?: boolean;
	tasks?: boolean;
	snippets?: boolean;
	extensions?: boolean;
	uiState?: boolean;
};

export const DefaultOptions: ProfileOptions = {
	settings: true,
	keybindings: true,
	tasks: true,
	snippets: true,
	extensions: true,
	uiState: true
};

export interface IUserDataProfile {
	readonly id: string;
	readonly isDefault: boolean;
	readonly name: string;
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

	readonly profilesHome: URI;
	readonly defaultProfile: IUserDataProfile;
	readonly currentProfile: IUserDataProfile;

	newProfile(name: string, options?: ProfileOptions): IUserDataProfile;
	createProfile(profile: IUserDataProfile, options: ProfileOptions, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile>;
	setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile>;
	getProfile(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): IUserDataProfile;
	getAllProfiles(): Promise<IUserDataProfile[]>;
	removeProfile(profile: IUserDataProfile): Promise<void>;
}

export function reviveProfile(profile: UriDto<IUserDataProfile>, scheme: string): IUserDataProfile {
	return {
		id: profile.id,
		isDefault: profile.isDefault,
		name: profile.name,
		location: URI.revive(profile.location).with({ scheme }),
		globalStorageHome: URI.revive(profile.globalStorageHome).with({ scheme }),
		settingsResource: URI.revive(profile.settingsResource).with({ scheme }),
		keybindingsResource: URI.revive(profile.keybindingsResource).with({ scheme }),
		tasksResource: URI.revive(profile.tasksResource).with({ scheme }),
		snippetsHome: URI.revive(profile.snippetsHome).with({ scheme }),
		extensionsResource: URI.revive(profile.extensionsResource)?.with({ scheme })
	};
}

export class UserDataProfilesService extends Disposable implements IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	readonly profilesHome: URI;

	protected _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	protected _defaultProfile: IUserDataProfile;
	get defaultProfile(): IUserDataProfile { return this._defaultProfile; }

	constructor(
		defaultProfile: UriDto<IUserDataProfile> | undefined,
		currentProfile: UriDto<IUserDataProfile> | undefined,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IFileService protected readonly fileService: IFileService,
		@ILogService protected readonly logService: ILogService
	) {
		super();
		this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, 'profiles');
		this._defaultProfile = defaultProfile ? reviveProfile(defaultProfile, this.profilesHome.scheme) : this.toUserDataProfile(localize('defaultProfile', "Default"), environmentService.userRoamingDataHome, { ...DefaultOptions, extensions: false }, true);
		this._currentProfile = currentProfile ? reviveProfile(currentProfile, this.profilesHome.scheme) : this._defaultProfile;
	}

	newProfile(name: string, options: ProfileOptions = DefaultOptions): IUserDataProfile {
		return this.toUserDataProfile(name, joinPath(this.profilesHome, hash(name).toString(16)), options, this.defaultProfile);
	}

	protected toUserDataProfile(name: string, location: URI, options: ProfileOptions, defaultProfile: true | IUserDataProfile): IUserDataProfile {
		return {
			id: hash(location.toString()).toString(16),
			name: name,
			location: location,
			isDefault: defaultProfile === true,
			globalStorageHome: defaultProfile === true || options.uiState ? joinPath(location, 'globalStorage') : defaultProfile.globalStorageHome,
			settingsResource: defaultProfile === true || options.settings ? joinPath(location, 'settings.json') : defaultProfile.settingsResource,
			keybindingsResource: defaultProfile === true || options.keybindings ? joinPath(location, 'keybindings.json') : defaultProfile.keybindingsResource,
			tasksResource: defaultProfile === true || options.tasks ? joinPath(location, 'tasks.json') : defaultProfile.tasksResource,
			snippetsHome: defaultProfile === true || options.snippets ? joinPath(location, 'snippets') : defaultProfile.snippetsHome,
			extensionsResource: defaultProfile === true && !options.extensions ? undefined : joinPath(location, 'extensions.json'),
		};
	}

	getAllProfiles(): Promise<IUserDataProfile[]> { throw new Error('Not implemented'); }
	createProfile(profile: IUserDataProfile, options: ProfileOptions, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> { throw new Error('Not implemented'); }
	setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> { throw new Error('Not implemented'); }
	getProfile(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): IUserDataProfile { throw new Error('Not implemented'); }
	removeProfile(profile: IUserDataProfile): Promise<void> { throw new Error('Not implemented'); }
}
