/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from 'vs/base/common/hash';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { basename, joinPath } from 'vs/base/common/resources';
import { isUndefined } from 'vs/base/common/types';
import { URI, UriDto } from 'vs/base/common/uri';
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
import { generateUuid } from 'vs/base/common/uuid';
import { escapeRegExpCharacters } from 'vs/base/common/strings';

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
	readonly isTransient?: boolean;
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

export type DidChangeProfilesEvent = { readonly added: readonly IUserDataProfile[]; readonly removed: readonly IUserDataProfile[]; readonly updated: readonly IUserDataProfile[]; readonly all: readonly IUserDataProfile[] };

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
	readonly profiles: readonly IUserDataProfile[];

	readonly onDidResetWorkspaces: Event<void>;

	createNamedProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile>;
	createTransientProfile(workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile>;
	createProfile(id: string, name: string, useDefaultFlags?: UseDefaultProfileFlags, transient?: boolean, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile>;
	updateProfile(profile: IUserDataProfile, name: string, useDefaultFlags?: UseDefaultProfileFlags, transient?: boolean): Promise<IUserDataProfile>;
	removeProfile(profile: IUserDataProfile): Promise<void>;

	setProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier, profile: IUserDataProfile): Promise<void>;
	resetWorkspaces(): Promise<void>;

	cleanUp(): Promise<void>;
	cleanUpTransientProfiles(): Promise<void>;
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
		extensionsResource: URI.revive(profile.extensionsResource)?.with({ scheme }),
		useDefaultFlags: profile.useDefaultFlags,
		isTransient: profile.isTransient,
	};
}

export const EXTENSIONS_RESOURCE_NAME = 'extensions.json';

export function toUserDataProfile(id: string, name: string, location: URI, useDefaultFlags?: UseDefaultProfileFlags, transient?: boolean): IUserDataProfile {
	return {
		id,
		name,
		location: location,
		isDefault: false,
		globalStorageHome: joinPath(location, 'globalStorage'),
		settingsResource: joinPath(location, 'settings.json'),
		keybindingsResource: joinPath(location, 'keybindings.json'),
		tasksResource: joinPath(location, 'tasks.json'),
		snippetsHome: joinPath(location, 'snippets'),
		extensionsResource: joinPath(location, EXTENSIONS_RESOURCE_NAME),
		useDefaultFlags,
		isTransient: transient
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

	protected enabled: boolean = false;
	protected readonly defaultProfileShouldIncludeExtensionsResourceAlways: boolean = false;
	readonly profilesHome: URI;

	get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	get profiles(): IUserDataProfile[] { return [...this.profilesObject.profiles, ...this.transientProfilesObject.profiles]; }

	protected readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	protected readonly _onWillCreateProfile = this._register(new Emitter<WillCreateProfileEvent>());
	readonly onWillCreateProfile = this._onWillCreateProfile.event;

	protected readonly _onWillRemoveProfile = this._register(new Emitter<WillRemoveProfileEvent>());
	readonly onWillRemoveProfile = this._onWillRemoveProfile.event;

	private readonly _onDidResetWorkspaces = this._register(new Emitter<void>());
	readonly onDidResetWorkspaces = this._onDidResetWorkspaces.event;

	private profileCreationPromises = new Map<string, Promise<IUserDataProfile>>();

	protected readonly transientProfilesObject: UserDataProfilesObject = {
		profiles: [],
		workspaces: new ResourceMap()
	};

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
			const profiles = this.enabled ? this.getStoredProfiles().map<IUserDataProfile>(storedProfile => toUserDataProfile(basename(storedProfile.location), storedProfile.name, storedProfile.location, storedProfile.useDefaultFlags)) : [];
			let emptyWindow: IUserDataProfile | undefined;
			const workspaces = new ResourceMap<IUserDataProfile>();
			const defaultProfile = toUserDataProfile(hash(this.environmentService.userRoamingDataHome.path).toString(16), localize('defaultProfile', "Default"), this.environmentService.userRoamingDataHome);
			profiles.unshift({ ...defaultProfile, isDefault: true, extensionsResource: this.defaultProfileShouldIncludeExtensionsResourceAlways || profiles.length > 0 || this.transientProfilesObject.profiles.length > 0 ? defaultProfile.extensionsResource : undefined });
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
			this._profilesObject = { profiles, workspaces, emptyWindow };
		}
		return this._profilesObject;
	}

	async createTransientProfile(workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		const namePrefix = `Temp`;
		const nameRegEx = new RegExp(`${escapeRegExpCharacters(namePrefix)}\\s(\\d+)`);
		let nameIndex = 0;
		for (const profile of this.profiles) {
			const matches = nameRegEx.exec(profile.name);
			const index = matches ? parseInt(matches[1]) : 0;
			nameIndex = index > nameIndex ? index : nameIndex;
		}
		const name = `${namePrefix} ${nameIndex + 1}`;
		return this.createProfile(hash(generateUuid()).toString(16), name, undefined, true, workspaceIdentifier);
	}

	async createNamedProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		return this.createProfile(hash(generateUuid()).toString(16), name, useDefaultFlags, false, workspaceIdentifier);
	}

	async createProfile(id: string, name: string, useDefaultFlags?: UseDefaultProfileFlags, transient?: boolean, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		const profile = await this.doCreateProfile(id, name, useDefaultFlags, !!transient);

		if (workspaceIdentifier) {
			await this.setProfileForWorkspace(workspaceIdentifier, profile);
		}

		return profile;
	}

	private async doCreateProfile(id: string, name: string, useDefaultFlags: UseDefaultProfileFlags | undefined, transient: boolean): Promise<IUserDataProfile> {
		let profileCreationPromise = this.profileCreationPromises.get(name);
		if (!profileCreationPromise) {
			profileCreationPromise = (async () => {
				try {
					const existing = this.profiles.find(p => p.name === name || p.id === id);
					if (existing) {
						return existing;
					}

					const profile = toUserDataProfile(id, name, joinPath(this.profilesHome, id), useDefaultFlags, transient);
					await this.fileService.createFolder(profile.location);

					const joiners: Promise<void>[] = [];
					this._onWillCreateProfile.fire({
						profile,
						join(promise) {
							joiners.push(promise);
						}
					});
					await Promises.settled(joiners);

					this.updateProfiles([profile], [], []);
					return profile;
				} finally {
					this.profileCreationPromises.delete(name);
				}
			})();
			this.profileCreationPromises.set(name, profileCreationPromise);
		}
		return profileCreationPromise;
	}

	async updateProfile(profileToUpdate: IUserDataProfile, name: string, useDefaultFlags?: UseDefaultProfileFlags, transient?: boolean): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		let profile = this.profiles.find(p => p.id === profileToUpdate.id);
		if (!profile) {
			throw new Error(`Profile '${profileToUpdate.name}' does not exist`);
		}

		profile = toUserDataProfile(profile.id, name, profile.location, useDefaultFlags, transient ?? profile.isTransient);
		this.updateProfiles([], [], [profile]);

		return profile;
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

		this.updateProfiles([], [profile], []);

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

	getOrSetProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier, profileToSet: IUserDataProfile = this.defaultProfile): IUserDataProfile {
		if (!this.enabled) {
			return this.defaultProfile;
		}

		let profile = this.getProfileForWorkspace(workspaceIdentifier);
		if (!profile) {
			profile = profileToSet;
			// Associate the profile to workspace only if there are user profiles
			// If there are no profiles, workspaces are associated to default profile by default
			if (this.profiles.length > 1) {
				this.setProfileForWorkspaceSync(workspaceIdentifier, profile);
			}
		}
		return profile;
	}

	async setProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier, profileToSet: IUserDataProfile): Promise<void> {
		this.setProfileForWorkspaceSync(workspaceIdentifier, profileToSet);
	}

	setProfileForWorkspaceSync(workspaceIdentifier: WorkspaceIdentifier, profileToSet: IUserDataProfile): void {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		const profile = this.profiles.find(p => p.id === profileToSet.id);
		if (!profile) {
			throw new Error(`Profile '${profileToSet.name}' does not exist`);
		}

		this.updateWorkspaceAssociation(workspaceIdentifier, profile);
	}

	unsetWorkspace(workspaceIdentifier: WorkspaceIdentifier, transient?: boolean): void {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		this.updateWorkspaceAssociation(workspaceIdentifier, undefined, transient);
	}

	async resetWorkspaces(): Promise<void> {
		this.transientProfilesObject.workspaces.clear();
		this.transientProfilesObject.emptyWindow = undefined;
		this.profilesObject.workspaces.clear();
		this.profilesObject.emptyWindow = undefined;
		this.updateStoredProfileAssociations();
		this._onDidResetWorkspaces.fire();
	}

	async cleanUp(): Promise<void> {
		if (!this.enabled) {
			return;
		}
		if (await this.fileService.exists(this.profilesHome)) {
			const stat = await this.fileService.resolve(this.profilesHome);
			await Promise.all((stat.children || [])
				.filter(child => child.isDirectory && this.profiles.every(p => !this.uriIdentityService.extUri.isEqual(p.location, child.resource)))
				.map(child => this.fileService.del(child.resource, { recursive: true })));
		}
	}

	async cleanUpTransientProfiles(): Promise<void> {
		if (!this.enabled) {
			return;
		}
		const unAssociatedTransientProfiles = this.transientProfilesObject.profiles.filter(p => !this.isProfileAssociatedToWorkspace(p));
		await Promise.allSettled(unAssociatedTransientProfiles.map(p => this.removeProfile(p)));
	}

	private getProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier): IUserDataProfile | undefined {
		const workspace = this.getWorkspace(workspaceIdentifier);
		return URI.isUri(workspace) ? this.transientProfilesObject.workspaces.get(workspace) ?? this.profilesObject.workspaces.get(workspace) : this.transientProfilesObject.emptyWindow ?? this.profilesObject.emptyWindow;
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

	private isProfileAssociatedToWorkspace(profile: IUserDataProfile): boolean {
		if (this.uriIdentityService.extUri.isEqual(this.transientProfilesObject.emptyWindow?.location, profile.location)) {
			return true;
		}
		if ([...this.transientProfilesObject.workspaces.values()].some(workspaceProfile => this.uriIdentityService.extUri.isEqual(workspaceProfile.location, profile.location))) {
			return true;
		}
		if (this.uriIdentityService.extUri.isEqual(this.profilesObject.emptyWindow?.location, profile.location)) {
			return true;
		}
		if ([...this.profilesObject.workspaces.values()].some(workspaceProfile => this.uriIdentityService.extUri.isEqual(workspaceProfile.location, profile.location))) {
			return true;
		}
		return false;
	}

	private updateProfiles(added: IUserDataProfile[], removed: IUserDataProfile[], updated: IUserDataProfile[]): void {
		const allProfiles = [...this.profiles, ...added];
		const storedProfiles: StoredUserDataProfile[] = [];
		this.transientProfilesObject.profiles = [];
		for (let profile of allProfiles) {
			if (profile.isDefault) {
				continue;
			}
			if (removed.some(p => profile.id === p.id)) {
				continue;
			}
			profile = updated.find(p => profile.id === p.id) ?? profile;
			if (profile.isTransient) {
				this.transientProfilesObject.profiles.push(profile);
			} else {
				storedProfiles.push({ location: profile.location, name: profile.name, useDefaultFlags: profile.useDefaultFlags });
			}
		}
		this.saveStoredProfiles(storedProfiles);
		this._profilesObject = undefined;
		this.triggerProfilesChanges(added, removed, updated);
	}

	protected triggerProfilesChanges(added: IUserDataProfile[], removed: IUserDataProfile[], updated: IUserDataProfile[]) {
		this._onDidChangeProfiles.fire({ added, removed, updated, all: this.profiles });
	}

	private updateWorkspaceAssociation(workspaceIdentifier: WorkspaceIdentifier, newProfile?: IUserDataProfile, transient?: boolean): void {
		// Force transient if the new profile to associate is transient
		transient = newProfile?.isTransient ? true : transient;

		if (!transient) {
			// Unset the transiet workspace association if any
			this.updateWorkspaceAssociation(workspaceIdentifier, undefined, true);
		}

		const workspace = this.getWorkspace(workspaceIdentifier);
		const profilesObject = transient ? this.transientProfilesObject : this.profilesObject;

		// Folder or Multiroot workspace
		if (URI.isUri(workspace)) {
			profilesObject.workspaces.delete(workspace);
			if (newProfile) {
				profilesObject.workspaces.set(workspace, newProfile);
			}
		}
		// Empty Window
		else {
			profilesObject.emptyWindow = newProfile;
		}

		if (!transient) {
			this.updateStoredProfileAssociations();
		}
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
