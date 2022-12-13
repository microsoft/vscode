/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriDto } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfileOptions, IUserDataProfilesService, IUserDataProfileUpdateOptions, reviveProfile, WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataProfilesNativeService extends Disposable implements IUserDataProfilesService {

	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	readonly profilesHome: URI;

	get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	private _profiles: IUserDataProfile[] = [];
	get profiles(): IUserDataProfile[] { return this._profiles; }

	private readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	readonly onDidResetWorkspaces: Event<void>;

	private enabled: boolean = true;

	constructor(
		profiles: readonly UriDto<IUserDataProfile>[],
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
			const updated = e.updated.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._profiles = e.all.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._onDidChangeProfiles.fire({ added, removed, updated, all: this.profiles });
		}));
		this.onDidResetWorkspaces = this.channel.listen<void>('onDidResetWorkspaces');
	}

	setEnablement(enabled: boolean) {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	async createNamedProfile(name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createNamedProfile', [name, options, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createProfile', [id, name, options, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async createTransientProfile(workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createTransientProfile', [workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async setProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier, profile: IUserDataProfile): Promise<void> {
		await this.channel.call<UriDto<IUserDataProfile>>('setProfileForWorkspace', [workspaceIdentifier, profile]);
	}

	removeProfile(profile: IUserDataProfile): Promise<void> {
		return this.channel.call('removeProfile', [profile]);
	}

	async updateProfile(profile: IUserDataProfile, updateOptions: IUserDataProfileUpdateOptions): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('updateProfile', [profile, updateOptions]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	resetWorkspaces(): Promise<void> {
		return this.channel.call('resetWorkspaces');
	}

	cleanUp(): Promise<void> {
		return this.channel.call('cleanUp');
	}

	cleanUpTransientProfiles(): Promise<void> {
		return this.channel.call('cleanUpTransientProfiles');
	}

}

