/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfilesService, reviveProfile, UseDefaultProfileFlags, WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class UserDataProfilesNativeService extends Disposable implements IUserDataProfilesService {

	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	readonly profilesHome: URI;

	get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	private _profiles: IUserDataProfile[] = [];
	get profiles(): IUserDataProfile[] { return this._profiles; }

	private readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	constructor(
		profiles: UriDto<IUserDataProfile>[],
		@IMainProcessService mainProcessService: IMainProcessService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super();
		this.channel = mainProcessService.getChannel('userDataProfiles');
		this.profilesHome = joinPath(environmentService.userRoamingDataHome, 'profiles');
		this._profiles = profiles.map(profile => reviveProfile(profile, this.profilesHome.scheme));
		this._register(this.channel.listen<DidChangeProfilesEvent>('onDidChangeProfiles')(e => {
			const added = e.added.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			const removed = e.removed.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._profiles = e.all.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._onDidChangeProfiles.fire({ added, removed, all: this.profiles });
		}));
	}

	async createProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createProfile', [name, useDefaultFlags, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<void> {
		await this.channel.call<UriDto<IUserDataProfile>>('setProfileForWorkspace', [profile, workspaceIdentifier]);
	}

	removeProfile(profile: IUserDataProfile): Promise<void> {
		return this.channel.call('removeProfile', [profile]);
	}

	getProfile(workspaceIdentifier: WorkspaceIdentifier): IUserDataProfile { throw new Error('Not implemented'); }
}

