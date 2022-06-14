/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';

export interface IUserDataProfile {
	readonly id: string;
	readonly name: string;
	readonly location: URI;
	readonly globalStorageHome: URI;
	readonly settingsResource: URI;
	readonly keybindingsResource: URI;
	readonly tasksResource: URI;
	readonly snippetsHome: URI;
	readonly extensionsResource: URI | undefined;
}

export type IUserDataProfileDto = UriDto<IUserDataProfile>;
export type IUserDataProfilesDto = {
	readonly current: IUserDataProfileDto;
	readonly default: IUserDataProfileDto;
};

export const IUserDataProfilesService = createDecorator<IUserDataProfilesService>('IUserDataProfilesService');
export interface IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	readonly profilesHome: URI;
	readonly defaultProfile: IUserDataProfile;

	readonly onDidChangeCurrentProfile: Event<IUserDataProfile>;
	readonly currentProfile: IUserDataProfile;

	createProfile(name: string): IUserDataProfile;
	setProfile(name: string): Promise<void>;
	getAllProfiles(): Promise<IUserDataProfile[]>;

	serialize(): IUserDataProfilesDto;
}

function reviveProfile(profile: IUserDataProfile, scheme: string): IUserDataProfile {
	return {
		id: profile.id,
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

	protected static DEFAULT_PROFILE_NAME = 'default';

	protected _currentProfile: IUserDataProfile;
	get currentProfile(): IUserDataProfile { return this._currentProfile; }

	readonly profilesHome: URI;
	protected _defaultProfile: IUserDataProfile;
	get defaultProfile(): IUserDataProfile { return this._defaultProfile; }

	private readonly _onDidChangeCurrentProfile = this._register(new Emitter<IUserDataProfile>());
	readonly onDidChangeCurrentProfile = this._onDidChangeCurrentProfile.event;

	constructor(
		defaultProfile: IUserDataProfile | undefined,
		currentProfile: IUserDataProfile | undefined,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService protected readonly fileService: IFileService,
		@ILogService protected readonly logService: ILogService
	) {
		super();
		this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, 'profiles');
		this._defaultProfile = defaultProfile ? reviveProfile(defaultProfile, this.profilesHome.scheme) : this.createProfile(undefined);
		this._currentProfile = currentProfile ? reviveProfile(currentProfile, this.profilesHome.scheme) : this._defaultProfile;
	}

	createProfile(name: string | undefined): IUserDataProfile {
		const location = name && name !== UserDataProfilesService.DEFAULT_PROFILE_NAME ? joinPath(this.profilesHome, name) : this.environmentService.userRoamingDataHome;
		return {
			id: hash(location.toString()).toString(16),
			name: name ?? UserDataProfilesService.DEFAULT_PROFILE_NAME,
			location,
			globalStorageHome: joinPath(location, 'globalStorage'),
			settingsResource: joinPath(location, 'settings.json'),
			keybindingsResource: joinPath(location, 'keybindings.json'),
			tasksResource: joinPath(location, 'tasks.json'),
			snippetsHome: joinPath(location, 'snippets'),
			extensionsResource: name ? joinPath(location, 'extensions.json') : undefined
		};
	}

	async getAllProfiles(): Promise<IUserDataProfile[]> {
		try {
			const stat = await this.fileService.resolve(this.profilesHome);
			const profiles = coalesce(stat.children?.map(stat => stat.isDirectory ? this.createProfile(stat.name) : undefined) ?? []);
			if (profiles.length) {
				profiles.unshift(this._defaultProfile);
			}
			return profiles;
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error('Error while getting all profiles', error);
			}
		}
		return [];
	}

	protected createCurrentProfile(profile: string | undefined): IUserDataProfile {
		return profile === UserDataProfilesService.DEFAULT_PROFILE_NAME ? this._defaultProfile : this.createProfile(profile);
	}

	setProfile(name: string): Promise<void> { throw new Error('Not implemented'); }

	serialize(): IUserDataProfilesDto {
		return {
			default: this.defaultProfile,
			current: this.currentProfile
		};
	}
}
