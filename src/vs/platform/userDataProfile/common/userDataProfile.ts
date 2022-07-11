/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from 'vs/base/common/hash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { joinPath } from 'vs/base/common/resources';
import { isUndefined, UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { ResourceMap } from 'vs/base/common/map';
import { IStringDictionary } from 'vs/base/common/collections';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { Promises } from 'vs/base/common/async';

/**
 * Flags to indicate whether to use the default profile or not.
 */
export type UseDefaultProfileFlags = {
	settings?: boolean;
	keybindings?: boolean;
	tasks?: boolean;
	snippets?: boolean;
	extensions?: boolean;
	uiState?: boolean;
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
	readonly useDefaultFlags?: UseDefaultProfileFlags;
}

export function isUserDataProfile(thing: unknown): thing is IUserDataProfile {
	const candidate = thing as IUserDataProfile | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& typeof candidate.id === 'string'
		&& typeof candidate.isDefault === 'boolean'
		&& typeof candidate.name === 'string'
		&& URI.isUri(candidate.location)
		&& URI.isUri(candidate.globalStorageHome)
		&& URI.isUri(candidate.settingsResource)
		&& URI.isUri(candidate.keybindingsResource)
		&& URI.isUri(candidate.tasksResource)
		&& URI.isUri(candidate.snippetsHome)
		&& (isUndefined(candidate.extensionsResource) || URI.isUri(candidate.extensionsResource))
	);
}

export const PROFILES_ENABLEMENT_CONFIG = 'workbench.experimental.settingsProfiles.enabled';

export type EmptyWindowWorkspaceIdentifier = 'empty-window';
export type WorkspaceIdentifier = ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier | EmptyWindowWorkspaceIdentifier;

export type DidChangeProfilesEvent = { readonly added: IUserDataProfile[]; readonly removed: IUserDataProfile[]; readonly all: IUserDataProfile[] };

export type WillCreateProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export type WillRemoveProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export const IUserDataProfilesService = createDecorator<IUserDataProfilesService>('IUserDataProfilesService');
export interface IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	readonly profilesHome: URI;
	readonly defaultProfile: IUserDataProfile;

	readonly onDidChangeProfiles: Event<DidChangeProfilesEvent>;
	readonly profiles: IUserDataProfile[];

	createProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile>;
	setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: WorkspaceIdentifier): Promise<void>;
	getProfile(workspaceIdentifier: WorkspaceIdentifier): IUserDataProfile;
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

export const EXTENSIONS_RESOURCE_NAME = 'extensions.json';

export function toUserDataProfile(name: string, location: URI, useDefaultFlags?: UseDefaultProfileFlags): IUserDataProfile {
	return {
		id: hash(location.path).toString(16),
		name: name,
		location: location,
		isDefault: false,
		globalStorageHome: joinPath(location, 'globalStorage'),
		settingsResource: joinPath(location, 'settings.json'),
		keybindingsResource: joinPath(location, 'keybindings.json'),
		tasksResource: joinPath(location, 'tasks.json'),
		snippetsHome: joinPath(location, 'snippets'),
		extensionsResource: joinPath(location, EXTENSIONS_RESOURCE_NAME),
		useDefaultFlags
	};
}

export type UserDataProfilesObject = {
	profiles: IUserDataProfile[];
	workspaces: ResourceMap<IUserDataProfile>;
	emptyWindow?: IUserDataProfile;
};

export type StoredUserDataProfile = {
	name: string;
	location: URI;
	useDefaultFlags?: UseDefaultProfileFlags;
};

export type StoredProfileAssociations = {
	workspaces?: IStringDictionary<string>;
	emptyWindow?: string;
};

export class UserDataProfilesService extends Disposable implements IUserDataProfilesService {

	protected static readonly PROFILES_KEY = 'userDataProfiles';
	protected static readonly PROFILE_ASSOCIATIONS_KEY = 'profileAssociations';

	readonly _serviceBrand: undefined;

	private enabled: boolean = false;
	protected readonly defaultProfileShouldIncludeExtensionsResourceAlways: boolean = false;
	readonly profilesHome: URI;

	get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	get profiles(): IUserDataProfile[] { return this.profilesObject.profiles; }

	protected readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	protected readonly _onWillCreateProfile = this._register(new Emitter<WillCreateProfileEvent>());
	readonly onWillCreateProfile = this._onWillCreateProfile.event;

	protected readonly _onWillRemoveProfile = this._register(new Emitter<WillRemoveProfileEvent>());
	readonly onWillRemoveProfile = this._onWillRemoveProfile.event;

	constructor(
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IFileService protected readonly fileService: IFileService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILogService protected readonly logService: ILogService
	) {
		super();
		this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, 'profiles');
	}

	setEnablement(enabled: boolean): void {
		if (this.enabled !== enabled) {
			this._profilesObject = undefined;
			this.enabled = enabled;
		}
	}

	protected _profilesObject: UserDataProfilesObject | undefined;
	protected get profilesObject(): UserDataProfilesObject {
		if (!this._profilesObject) {
			const profiles = this.enabled ? this.getStoredProfiles().map<IUserDataProfile>(storedProfile => toUserDataProfile(storedProfile.name, storedProfile.location, storedProfile.useDefaultFlags)) : [];
			let emptyWindow: IUserDataProfile | undefined;
			const workspaces = new ResourceMap<IUserDataProfile>();
			if (profiles.length) {
				const profileAssicaitions = this.getStoredProfileAssociations();
				if (profileAssicaitions.workspaces) {
					for (const [workspacePath, profilePath] of Object.entries(profileAssicaitions.workspaces)) {
						const workspace = URI.parse(workspacePath);
						const profileLocation = URI.parse(profilePath);
						const profile = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profileLocation));
						if (profile) {
							workspaces.set(workspace, profile);
						}
					}
				}
				if (profileAssicaitions.emptyWindow) {
					const emptyWindowProfileLocation = URI.parse(profileAssicaitions.emptyWindow);
					emptyWindow = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, emptyWindowProfileLocation));
				}
			}
			const profile = toUserDataProfile(localize('defaultProfile', "Default"), this.environmentService.userRoamingDataHome);
			profiles.unshift({ ...profile, isDefault: true, extensionsResource: this.defaultProfileShouldIncludeExtensionsResourceAlways || profiles.length > 0 ? profile.extensionsResource : undefined });
			this._profilesObject = { profiles, workspaces, emptyWindow };
		}
		return this._profilesObject;
	}

	getProfile(workspaceIdentifier: WorkspaceIdentifier): IUserDataProfile {
		const workspace = this.getWorkspace(workspaceIdentifier);
		const profile = URI.isUri(workspace) ? this.profilesObject.workspaces.get(workspace) : this.profilesObject.emptyWindow;
		return profile ?? this.defaultProfile;
	}

	protected getWorkspace(workspaceIdentifier: WorkspaceIdentifier): URI | EmptyWindowWorkspaceIdentifier {
		if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.uri;
		}
		if (isWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.configPath;
		}
		return 'empty-window';
	}

	async createProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		if (this.getStoredProfiles().some(p => p.name === name)) {
			throw new Error(`Profile with name ${name} already exists`);
		}

		const profile = toUserDataProfile(name, joinPath(this.profilesHome, hash(name).toString(16)), useDefaultFlags);
		await this.fileService.createFolder(profile.location);

		const joiners: Promise<void>[] = [];
		this._onWillCreateProfile.fire({
			profile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);

		this.updateProfiles([profile], []);

		if (workspaceIdentifier) {
			await this.setProfileForWorkspace(profile, workspaceIdentifier);
		}

		return profile;
	}

	async setProfileForWorkspace(profileToSet: IUserDataProfile, workspaceIdentifier: WorkspaceIdentifier): Promise<void> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		const profile = this.profiles.find(p => p.id === profileToSet.id);
		if (!profile) {
			throw new Error(`Profile '${profileToSet.name}' does not exist`);
		}

		this.updateWorkspaceAssociation(workspaceIdentifier, profile);
	}

	async unsetWorkspace(workspaceIdentifier: WorkspaceIdentifier): Promise<void> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		this.updateWorkspaceAssociation(workspaceIdentifier);
	}

	async removeProfile(profileToRemove: IUserDataProfile): Promise<void> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		if (profileToRemove.isDefault) {
			throw new Error('Cannot remove default profile');
		}
		const profile = this.profiles.find(p => p.id === profileToRemove.id);
		if (!profile) {
			throw new Error(`Profile '${profileToRemove.name}' does not exist`);
		}

		const joiners: Promise<void>[] = [];
		this._onWillRemoveProfile.fire({
			profile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);

		if (profile.id === this.profilesObject.emptyWindow?.id) {
			this.profilesObject.emptyWindow = undefined;
		}
		for (const workspace of [...this.profilesObject.workspaces.keys()]) {
			if (profile.id === this.profilesObject.workspaces.get(workspace)?.id) {
				this.profilesObject.workspaces.delete(workspace);
			}
		}
		this.updateStoredProfileAssociations();

		this.updateProfiles([], [profile]);

		try {
			if (this.profiles.length === 1) {
				await this.fileService.del(this.profilesHome, { recursive: true });
			} else {
				await this.fileService.del(profile.location, { recursive: true });
			}
		} catch (error) {
			this.logService.error(error);
		}
	}

	private updateProfiles(added: IUserDataProfile[], removed: IUserDataProfile[]) {
		const storedProfiles: StoredUserDataProfile[] = [];
		for (const profile of [...this.profilesObject.profiles, ...added]) {
			if (profile.isDefault) {
				continue;
			}
			if (removed.some(p => profile.id === p.id)) {
				continue;
			}
			storedProfiles.push({ location: profile.location, name: profile.name, useDefaultFlags: profile.useDefaultFlags });
		}
		this.saveStoredProfiles(storedProfiles);
		this._profilesObject = undefined;
		this._onDidChangeProfiles.fire({ added, removed, all: this.profiles });
	}

	private updateWorkspaceAssociation(workspaceIdentifier: WorkspaceIdentifier, newProfile?: IUserDataProfile) {
		const workspace = this.getWorkspace(workspaceIdentifier);

		// Folder or Multiroot workspace
		if (URI.isUri(workspace)) {
			this.profilesObject.workspaces.delete(workspace);
			if (newProfile && !newProfile.isDefault) {
				this.profilesObject.workspaces.set(workspace, newProfile);
			}
		}
		// Empty Window
		else {
			this.profilesObject.emptyWindow = !newProfile?.isDefault ? newProfile : undefined;
		}

		this.updateStoredProfileAssociations();
	}

	private updateStoredProfileAssociations() {
		const workspaces: IStringDictionary<string> = {};
		for (const [workspace, profile] of this.profilesObject.workspaces.entries()) {
			workspaces[workspace.toString()] = profile.location.toString();
		}
		const emptyWindow = this.profilesObject.emptyWindow?.location.toString();
		this.saveStoredProfileAssociations({ workspaces, emptyWindow });
		this._profilesObject = undefined;
	}

	protected getStoredProfiles(): StoredUserDataProfile[] { return []; }
	protected saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void { throw new Error('not implemented'); }

	protected getStoredProfileAssociations(): StoredProfileAssociations { return {}; }
	protected saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void { throw new Error('not implemented'); }
}
