/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { URI, UriDto } from 'vs/base/common/uri';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfileOptions, IUserDataProfilesService, IUserDataProfileUpdateOptions, reviveProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IURITransformer, transformIncomingURIs, transformOutgoingURIs } from 'vs/base/common/uriIpc';

export class RemoteUserDataProfilesServiceChannel implements IServerChannel {

	constructor(
		private readonly service: IUserDataProfilesService,
		private readonly getUriTransformer: (requestContext: any) => IURITransformer
	) { }

	listen(context: any, event: string): Event<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (event) {
			case 'onDidChangeProfiles': return Event.map<DidChangeProfilesEvent, DidChangeProfilesEvent>(this.service.onDidChangeProfiles, e => {
				return {
					all: e.all.map(p => transformOutgoingURIs({ ...p }, uriTransformer)),
					added: e.added.map(p => transformOutgoingURIs({ ...p }, uriTransformer)),
					removed: e.removed.map(p => transformOutgoingURIs({ ...p }, uriTransformer)),
					updated: e.updated.map(p => transformOutgoingURIs({ ...p }, uriTransformer))
				};
			});
		}
		throw new Error(`Invalid listen ${event}`);
	}

	async call(context: any, command: string, args?: any): Promise<any> {
		const uriTransformer = this.getUriTransformer(context);
		switch (command) {
			case 'createProfile': {
				const profile = await this.service.createProfile(args[0], args[1], args[2]);
				return transformOutgoingURIs({ ...profile }, uriTransformer);
			}
			case 'updateProfile': {
				let profile = reviveProfile(transformIncomingURIs(args[0], uriTransformer), this.service.profilesHome.scheme);
				profile = await this.service.updateProfile(profile, args[1]);
				return transformOutgoingURIs({ ...profile }, uriTransformer);
			}
			case 'removeProfile': {
				const profile = reviveProfile(transformIncomingURIs(args[0], uriTransformer), this.service.profilesHome.scheme);
				return this.service.removeProfile(profile);
			}
		}
		throw new Error(`Invalid call ${command}`);
	}
}

export class UserDataProfilesService extends Disposable implements IUserDataProfilesService {

	readonly _serviceBrand: undefined;

	get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	private _profiles: IUserDataProfile[] = [];
	get profiles(): IUserDataProfile[] { return this._profiles; }

	private readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	readonly onDidResetWorkspaces: Event<void>;

	private enabled: boolean = true;

	constructor(
		profiles: readonly UriDto<IUserDataProfile>[],
		readonly profilesHome: URI,
		private readonly channel: IChannel,
	) {
		super();
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

	async createNamedProfile(name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createNamedProfile', [name, options, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createProfile', [id, name, options, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async createTransientProfile(workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createTransientProfile', [workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	async setProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, profile: IUserDataProfile): Promise<void> {
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
