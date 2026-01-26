/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../base/common/hash.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { basename, joinPath } from '../../../base/common/resources.js';
import { URI, UriDto } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAnyWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { Promises } from '../../../base/common/async.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import { isString, Mutable } from '../../../base/common/types.js';
import { ResourceMap } from '../../../base/common/map.js';
import { parse } from '../../../base/common/json.js';
import { VSBuffer } from '../../../base/common/buffer.js';

export const enum ProfileResourceType {
	Settings = 'settings',
	Keybindings = 'keybindings',
	Snippets = 'snippets',
	Prompts = 'prompts',
	Tasks = 'tasks',
	Extensions = 'extensions',
	GlobalState = 'globalState',
	Mcp = 'mcp',
}

/**
 * Flags to indicate whether to use the default profile or not.
 */
export type UseDefaultProfileFlags = { [key in ProfileResourceType]?: boolean };
export type ProfileResourceTypeFlags = UseDefaultProfileFlags;
export type SettingValue = string | boolean | number | undefined | null | object;
export type ISettingsDictionary = Record<string, SettingValue>;

export interface IUserDataProfile {
	readonly id: string;
	readonly isDefault: boolean;
	readonly isSystem?: boolean;
	readonly name: string;
	readonly icon?: string;
	readonly location: URI;
	readonly globalStorageHome: URI;
	readonly settingsResource: URI;
	readonly keybindingsResource: URI;
	readonly tasksResource: URI;
	readonly snippetsHome: URI;
	readonly promptsHome: URI;
	readonly extensionsResource: URI;
	readonly mcpResource: URI;
	readonly cacheHome: URI;
	readonly useDefaultFlags?: UseDefaultProfileFlags;
	readonly isTransient?: boolean;
	readonly workspaces?: readonly URI[];
	readonly templateResource?: URI;
}

export function isUserDataProfile(thing: unknown): thing is IUserDataProfile {
	const candidate = thing as IUserDataProfile | undefined;

	return !!(candidate && typeof candidate === 'object'
		&& typeof candidate.id === 'string'
		&& typeof candidate.isDefault === 'boolean'
		&& (candidate.isSystem === undefined || typeof candidate.isSystem === 'boolean')
		&& typeof candidate.name === 'string'
		&& URI.isUri(candidate.location)
		&& URI.isUri(candidate.globalStorageHome)
		&& URI.isUri(candidate.settingsResource)
		&& URI.isUri(candidate.keybindingsResource)
		&& URI.isUri(candidate.tasksResource)
		&& URI.isUri(candidate.snippetsHome)
		&& URI.isUri(candidate.promptsHome)
		&& URI.isUri(candidate.extensionsResource)
		&& URI.isUri(candidate.mcpResource)
	);
}

export interface IParsedUserDataProfileTemplate {
	readonly name: string;
	readonly icon?: string;
	readonly settings?: ISettingsDictionary;
	readonly globalState?: IStringDictionary<string>;
}

export interface ISystemProfileTemplate extends IParsedUserDataProfileTemplate {
	readonly id: string;
}

export type DidChangeProfilesEvent = { readonly added: readonly IUserDataProfile[]; readonly removed: readonly IUserDataProfile[]; readonly updated: readonly IUserDataProfile[]; readonly all: readonly IUserDataProfile[] };

export type WillCreateProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export type WillRemoveProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export interface IUserDataProfileOptions {
	readonly icon?: string;
	readonly useDefaultFlags?: UseDefaultProfileFlags;
	readonly transient?: boolean;
	readonly workspaces?: readonly URI[];
	readonly isSystem?: boolean;
	readonly templateResource?: URI;
}

export interface IUserDataProfileUpdateOptions extends Omit<IUserDataProfileOptions, 'icon' | 'isSystem' | 'templateResource'> {
	readonly name?: string;
	readonly icon?: string | null;
}

export const IUserDataProfilesService = createDecorator<IUserDataProfilesService>('IUserDataProfilesService');
export interface IUserDataProfilesService {
	readonly _serviceBrand: undefined;

	readonly profilesHome: URI;
	readonly defaultProfile: IUserDataProfile;

	readonly onDidChangeProfiles: Event<DidChangeProfilesEvent>;
	readonly profiles: readonly IUserDataProfile[];

	readonly onDidResetWorkspaces: Event<void>;

	createSystemProfile(id: string): Promise<IUserDataProfile>;
	createNamedProfile(name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	createTransientProfile(workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	updateProfile(profile: IUserDataProfile, options?: IUserDataProfileUpdateOptions,): Promise<IUserDataProfile>;
	removeProfile(profile: IUserDataProfile): Promise<void>;

	setProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, profile: IUserDataProfile): Promise<void>;
	resetWorkspaces(): Promise<void>;

	cleanUp(): Promise<void>;
	cleanUpTransientProfiles(): Promise<void>;

	getSystemProfileTemplates(): Promise<ISystemProfileTemplate[]>;
	getSourceProfileTemplate(profile: IUserDataProfile): Promise<IParsedUserDataProfileTemplate | null>;
	getStoredProfileTemplate(profile: IUserDataProfile): Promise<IParsedUserDataProfileTemplate | null>;
	updateStoredProfileTemplate(profile: IUserDataProfile): Promise<void>;
}

export function reviveProfile(profile: UriDto<IUserDataProfile>, scheme: string): IUserDataProfile {
	return {
		id: profile.id,
		isDefault: profile.isDefault,
		isSystem: profile.isSystem,
		name: profile.name,
		icon: profile.icon,
		location: URI.revive(profile.location).with({ scheme }),
		globalStorageHome: URI.revive(profile.globalStorageHome).with({ scheme }),
		settingsResource: URI.revive(profile.settingsResource).with({ scheme }),
		keybindingsResource: URI.revive(profile.keybindingsResource).with({ scheme }),
		tasksResource: URI.revive(profile.tasksResource).with({ scheme }),
		snippetsHome: URI.revive(profile.snippetsHome).with({ scheme }),
		promptsHome: URI.revive(profile.promptsHome).with({ scheme }),
		extensionsResource: URI.revive(profile.extensionsResource).with({ scheme }),
		mcpResource: URI.revive(profile.mcpResource).with({ scheme }),
		cacheHome: URI.revive(profile.cacheHome).with({ scheme }),
		useDefaultFlags: profile.useDefaultFlags,
		isTransient: profile.isTransient,
		workspaces: profile.workspaces?.map(w => URI.revive(w)),
		templateResource: profile.templateResource ? URI.revive(profile.templateResource) : undefined,
	};
}

export function toUserDataProfile(id: string, name: string, location: URI, profilesCacheHome: URI, options?: IUserDataProfileOptions, defaultProfile?: IUserDataProfile): IUserDataProfile {
	return {
		id,
		name,
		location,
		isDefault: false,
		isSystem: options?.isSystem,
		icon: options?.icon,
		globalStorageHome: defaultProfile && options?.useDefaultFlags?.globalState ? defaultProfile.globalStorageHome : joinPath(location, 'globalStorage'),
		settingsResource: defaultProfile && options?.useDefaultFlags?.settings ? defaultProfile.settingsResource : joinPath(location, 'settings.json'),
		keybindingsResource: defaultProfile && options?.useDefaultFlags?.keybindings ? defaultProfile.keybindingsResource : joinPath(location, 'keybindings.json'),
		tasksResource: defaultProfile && options?.useDefaultFlags?.tasks ? defaultProfile.tasksResource : joinPath(location, 'tasks.json'),
		snippetsHome: defaultProfile && options?.useDefaultFlags?.snippets ? defaultProfile.snippetsHome : joinPath(location, 'snippets'),
		promptsHome: defaultProfile && options?.useDefaultFlags?.prompts ? defaultProfile.promptsHome : joinPath(location, 'prompts'),
		extensionsResource: defaultProfile && options?.useDefaultFlags?.extensions ? defaultProfile.extensionsResource : joinPath(location, 'extensions.json'),
		mcpResource: defaultProfile && options?.useDefaultFlags?.mcp ? defaultProfile.mcpResource : joinPath(location, 'mcp.json'),
		cacheHome: joinPath(profilesCacheHome, id),
		useDefaultFlags: options?.useDefaultFlags,
		isTransient: options?.transient,
		workspaces: options?.workspaces,
		templateResource: options?.templateResource,
	};
}

export type UserDataProfilesObject = {
	profiles: IUserDataProfile[];
	emptyWindows: Map<string, IUserDataProfile>;
};

export type StoredUserDataProfile = {
	name: string;
	location: URI;
	icon?: string;
	useDefaultFlags?: UseDefaultProfileFlags;
	isSystem?: boolean;
	templateResource?: URI;
};

export type StoredProfileAssociations = {
	workspaces?: IStringDictionary<string>;
	emptyWindows?: IStringDictionary<string>;
};

export const SYSTEM_PROFILES_HOME = 'builtin';

export abstract class AbstractUserDataProfilesService extends Disposable implements IUserDataProfilesService {

	readonly _serviceBrand: undefined;

	abstract readonly profilesHome: URI;
	abstract readonly defaultProfile: IUserDataProfile;
	abstract readonly profiles: readonly IUserDataProfile[];

	abstract readonly onDidChangeProfiles: Event<DidChangeProfilesEvent>;
	abstract readonly onDidResetWorkspaces: Event<void>;

	constructor(
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
		@IFileService protected readonly fileService: IFileService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILogService protected readonly logService: ILogService
	) {
		super();
	}

	abstract createSystemProfile(id: string): Promise<IUserDataProfile>;
	abstract createNamedProfile(name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	abstract createTransientProfile(workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	abstract createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile>;
	abstract updateProfile(profile: IUserDataProfile, options?: IUserDataProfileUpdateOptions): Promise<IUserDataProfile>;
	abstract removeProfile(profile: IUserDataProfile): Promise<void>;
	abstract setProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, profile: IUserDataProfile): Promise<void>;
	abstract resetWorkspaces(): Promise<void>;
	abstract cleanUp(): Promise<void>;
	abstract cleanUpTransientProfiles(): Promise<void>;
	abstract updateStoredProfileTemplate(profile: IUserDataProfile): Promise<void>;

	async getSystemProfileTemplates(): Promise<ISystemProfileTemplate[]> {
		return Array.from((await this.getSystemProfileTemplatesMap()).values());
	}

	async getSourceProfileTemplate(profile: IUserDataProfile): Promise<IParsedUserDataProfileTemplate | null> {
		if (!profile.templateResource) {
			return null;
		}

		if (!profile.isSystem) {
			return null;
		}

		return this.readStoredProfileTemplateFromTemplateFile(profile.templateResource);
	}

	async getStoredProfileTemplate(profile: IUserDataProfile): Promise<IParsedUserDataProfileTemplate | null> {
		if (!profile.templateResource) {
			return null;
		}
		const templateFile = this.getStoredProfileTemplateFile(profile);
		return this.readStoredProfileTemplateFromTemplateFile(templateFile);
	}

	protected async readStoredProfileTemplateFromTemplateFile(templateFile: URI): Promise<IParsedUserDataProfileTemplate | null> {
		try {
			const content = (await this.fileService.readFile(templateFile)).value.toString();
			return parse(content) as IParsedUserDataProfileTemplate;
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(`Error while reading system profile template from ${templateFile.toString()}`, error);
			}
			return null;
		}
	}

	protected getStoredProfileTemplateFile(profile: IUserDataProfile): URI {
		return this.uriIdentityService.extUri.joinPath(profile.location, `${profile.id}.code-profile`);
	}

	protected getSystemProfileTemplateFile(id: string): URI {
		return joinPath(this.environmentService.builtinProfilesHome, `${id}.code-profile`);
	}

	protected async getSystemProfileTemplate(id: string): Promise<ISystemProfileTemplate | undefined> {
		const templates = await this.getSystemProfileTemplatesMap();
		const resource = this.getSystemProfileTemplateFile(id);
		return templates.get(resource);
	}

	private systemProfilesTemplatesPromise: Promise<ResourceMap<ISystemProfileTemplate>> | undefined;
	protected async getSystemProfileTemplatesMap(): Promise<ResourceMap<ISystemProfileTemplate>> {
		if (!this.systemProfilesTemplatesPromise) {
			this.systemProfilesTemplatesPromise = this.doGetSystemProfileTemplates();
		}
		return this.systemProfilesTemplatesPromise;
	}

	private async doGetSystemProfileTemplates(): Promise<ResourceMap<ISystemProfileTemplate>> {
		const result = new ResourceMap<ISystemProfileTemplate>();
		const profilesFolder = this.environmentService.builtinProfilesHome;
		try {
			const stat = await this.fileService.resolve(profilesFolder);
			if (!stat.children?.length) {
				return result;
			}
			for (const child of stat.children) {
				if (child.isDirectory) {
					continue;
				}
				if (this.uriIdentityService.extUri.extname(child.resource) !== '.code-profile') {
					continue;
				}
				try {
					const content = (await this.fileService.readFile(child.resource)).value.toString();
					const profile: ISystemProfileTemplate = {
						id: child.name.substring(0, child.name.length - '.code-profile'.length),
						...parse(content)
					};
					result.set(child.resource, profile);
				} catch (error) {
					this.logService.error(`Error while reading system profile template from ${child.resource.toString()}`, error);
				}
			}
		} catch (error) {
			this.logService.error(`Error while reading system profile templates from ${profilesFolder.toString()}`, error);
		}
		return result;
	}

}

export class UserDataProfilesService extends AbstractUserDataProfilesService implements IUserDataProfilesService {

	protected static readonly PROFILES_KEY = 'userDataProfiles';
	protected static readonly PROFILE_ASSOCIATIONS_KEY = 'profileAssociations';

	override readonly profilesHome: URI;
	private readonly profilesCacheHome: URI;

	override get defaultProfile(): IUserDataProfile { return this.profiles[0]; }
	override get profiles(): IUserDataProfile[] { return [...this.profilesObject.profiles, ...this.transientProfilesObject.profiles]; }

	protected readonly _onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	override readonly onDidChangeProfiles = this._onDidChangeProfiles.event;

	protected readonly _onWillCreateProfile = this._register(new Emitter<WillCreateProfileEvent>());
	readonly onWillCreateProfile = this._onWillCreateProfile.event;

	protected readonly _onWillRemoveProfile = this._register(new Emitter<WillRemoveProfileEvent>());
	readonly onWillRemoveProfile = this._onWillRemoveProfile.event;

	private readonly _onDidResetWorkspaces = this._register(new Emitter<void>());
	override readonly onDidResetWorkspaces = this._onDidResetWorkspaces.event;

	private profileCreationPromises = new Map<string, Promise<IUserDataProfile>>();

	protected readonly transientProfilesObject: UserDataProfilesObject = {
		profiles: [],
		emptyWindows: new Map()
	};

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService
	) {
		super(environmentService, fileService, uriIdentityService, logService);
		this.profilesHome = joinPath(this.environmentService.userRoamingDataHome, 'profiles');
		this.profilesCacheHome = joinPath(this.environmentService.cacheHome, 'CachedProfilesData');
	}

	init(): void {
		this._profilesObject = undefined;
	}

	protected _profilesObject: UserDataProfilesObject | undefined;
	protected get profilesObject(): UserDataProfilesObject {
		if (!this._profilesObject) {
			const defaultProfile = this.createDefaultProfile();
			const profiles: Array<Mutable<IUserDataProfile>> = [defaultProfile];
			const profilesToRemove: IUserDataProfile[] = [];
			try {
				for (const storedProfile of this.getStoredProfiles()) {
					if (!storedProfile.name || !isString(storedProfile.name) || !storedProfile.location) {
						this.logService.warn('Skipping the invalid stored profile', storedProfile.location || storedProfile.name);
						continue;
					}
					const id = basename(storedProfile.location);
					const profile = toUserDataProfile(
						id,
						storedProfile.name,
						storedProfile.location,
						this.profilesCacheHome,
						{
							icon: storedProfile.icon,
							useDefaultFlags: storedProfile.useDefaultFlags,
							isSystem: storedProfile.isSystem,
							templateResource: storedProfile.isSystem ? this.getSystemProfileTemplateFile(id) : storedProfile.templateResource
						},
						defaultProfile);

					if (profile.isSystem && this.uriIdentityService.extUri.basename(this.uriIdentityService.extUri.dirname(profile.location)) !== SYSTEM_PROFILES_HOME) {
						profilesToRemove.push(profile);
					} else {
						profiles.push(profile);
					}
				}
			} catch (error) {
				this.logService.error(error);
			}
			const emptyWindows = new Map<string, IUserDataProfile>();
			if (profiles.length) {
				try {
					const profileAssociaitions = this.getStoredProfileAssociations();
					if (profileAssociaitions.workspaces) {
						for (const [workspacePath, profileId] of Object.entries(profileAssociaitions.workspaces)) {
							const workspace = URI.parse(workspacePath);
							const profile = profiles.find(p => p.id === profileId);
							if (profile) {
								const workspaces = profile.workspaces ? profile.workspaces.slice(0) : [];
								workspaces.push(workspace);
								profile.workspaces = workspaces;
							}
						}
					}
					if (profileAssociaitions.emptyWindows) {
						for (const [windowId, profileId] of Object.entries(profileAssociaitions.emptyWindows)) {
							const profile = profiles.find(p => p.id === profileId);
							if (profile) {
								emptyWindows.set(windowId, profile);
							}
						}
					}
				} catch (error) {
					this.logService.error(error);
				}
			}
			this._profilesObject = { profiles, emptyWindows };
			if (profilesToRemove.length) {
				this.updateProfiles([], profilesToRemove, [], true);
			}
		}
		return this._profilesObject;
	}

	private createDefaultProfile() {
		const defaultProfile = toUserDataProfile('__default__profile__', localize('defaultProfile', "Default"), this.environmentService.userRoamingDataHome, this.profilesCacheHome);
		return { ...defaultProfile, extensionsResource: this.getDefaultProfileExtensionsLocation() ?? defaultProfile.extensionsResource, isDefault: true, isSystem: true };
	}

	override async createTransientProfile(workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		const namePrefix = `Temp`;
		const nameRegEx = new RegExp(`${escapeRegExpCharacters(namePrefix)}\\s(\\d+)`);
		let nameIndex = 0;
		for (const profile of this.profiles) {
			const matches = nameRegEx.exec(profile.name);
			const index = matches ? parseInt(matches[1]) : 0;
			nameIndex = index > nameIndex ? index : nameIndex;
		}
		const name = `${namePrefix} ${nameIndex + 1}`;
		return this.createProfile(hash(generateUuid()).toString(16), name, { transient: true }, workspaceIdentifier);
	}

	override async createNamedProfile(name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		return this.createProfile(hash(generateUuid()).toString(16), name, options, workspaceIdentifier);
	}

	override async createProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		const profile = await this.doCreateProfile(id, name, options, workspaceIdentifier);

		return profile;
	}

	override async createSystemProfile(id: string): Promise<IUserDataProfile> {
		const existing = this.profiles.find(p => p.id === id);
		if (existing) {
			return existing;
		}

		const systemProfileTemplate = await this.getSystemProfileTemplate(id);
		if (!systemProfileTemplate) {
			throw new Error(`System profile template '${id}' does not exist`);
		}

		return this.doCreateProfile(id, systemProfileTemplate.name, {
			useDefaultFlags: {
				keybindings: true,
			}
		});
	}

	private async doCreateProfile(id: string, name: string, options?: IUserDataProfileOptions, workspaceIdentifier?: IAnyWorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!isString(name) || !name) {
			throw new Error('Name of the profile is mandatory and must be of type `string`');
		}

		let profileCreationPromise = this.profileCreationPromises.get(name);
		if (!profileCreationPromise) {
			profileCreationPromise = (async () => {
				try {
					const existing = this.profiles.find(p => p.id === id || (!p.isTransient && !options?.transient && p.name === name));
					if (existing) {
						throw new Error(`Profile with ${name} name already exists`);
					}

					const workspace = workspaceIdentifier ? this.getWorkspace(workspaceIdentifier) : undefined;
					if (URI.isUri(workspace)) {
						options = { ...options, workspaces: [workspace] };
					}

					const systemProfileTemplate = await this.getSystemProfileTemplate(id);
					if (systemProfileTemplate) {
						options = {
							...options,
							isSystem: true,
							icon: options?.icon ?? systemProfileTemplate.icon,
							templateResource: this.getSystemProfileTemplateFile(id),
						};
					}

					const profile = toUserDataProfile(
						id,
						name,
						this.uriIdentityService.extUri.joinPath(this.profilesHome, ...(options?.isSystem ? [SYSTEM_PROFILES_HOME, id] : [id])),
						this.profilesCacheHome,
						options,
						this.defaultProfile);
					await this.fileService.createFolder(profile.location);

					if (systemProfileTemplate) {
						await this.updateStoredProfileTemplate(profile, true);
					}

					const joiners: Promise<void>[] = [];
					this._onWillCreateProfile.fire({
						profile,
						join(promise) {
							joiners.push(promise);
						}
					});
					await Promises.settled(joiners);

					if (workspace && !URI.isUri(workspace)) {
						this.updateEmptyWindowAssociation(workspace, profile, !!profile.isTransient);
					}
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

	override async updateProfile(profile: IUserDataProfile, options: IUserDataProfileUpdateOptions): Promise<IUserDataProfile> {
		const profilesToUpdate: IUserDataProfile[] = [];
		for (const existing of this.profiles) {
			let profileToUpdate: Mutable<IUserDataProfile> | undefined;

			if (profile.id === existing.id) {
				if (!existing.isDefault) {
					profileToUpdate = toUserDataProfile(existing.id, options.name ?? existing.name, existing.location, this.profilesCacheHome, {
						icon: options.icon === null ? undefined : options.icon ?? existing.icon,
						transient: options.transient ?? existing.isTransient,
						useDefaultFlags: options.useDefaultFlags ?? existing.useDefaultFlags,
						workspaces: options.workspaces ?? existing.workspaces,
						isSystem: existing.isSystem,
						templateResource: existing.templateResource,
					}, this.defaultProfile);
				} else if (options.workspaces) {
					profileToUpdate = existing;
					profileToUpdate.workspaces = options.workspaces;
				}
			}

			else if (options.workspaces) {
				const workspaces = existing.workspaces?.filter(w1 => !options.workspaces?.some(w2 => this.uriIdentityService.extUri.isEqual(w1, w2)));
				if (existing.workspaces?.length !== workspaces?.length) {
					profileToUpdate = existing;
					profileToUpdate.workspaces = workspaces;
				}
			}

			if (profileToUpdate) {
				profilesToUpdate.push(profileToUpdate);
			}
		}

		if (!profilesToUpdate.length) {
			if (profile.isDefault) {
				throw new Error('Cannot update default profile');
			}
			throw new Error(`Profile '${profile.name}' does not exist`);
		}

		this.updateProfiles([], [], profilesToUpdate);

		const updatedProfile = this.profiles.find(p => p.id === profile.id);
		if (!updatedProfile) {
			throw new Error(`Profile '${profile.name}' was not updated`);
		}

		return updatedProfile;
	}

	override async removeProfile(profileToRemove: IUserDataProfile): Promise<void> {
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

		try {
			await Promise.allSettled(joiners);
		} catch (error) {
			this.logService.error(error);
		}

		this.updateProfiles([], [profile], []);

		try {
			await this.fileService.del(profile.cacheHome, { recursive: true });
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}

	override async setProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, profileToSet: IUserDataProfile): Promise<void> {
		const profile = this.profiles.find(p => p.id === profileToSet.id);
		if (!profile) {
			throw new Error(`Profile '${profileToSet.name}' does not exist`);
		}

		const workspace = this.getWorkspace(workspaceIdentifier);
		if (URI.isUri(workspace)) {
			const workspaces = profile.workspaces ? [...profile.workspaces] : [];
			if (!workspaces.some(w => this.uriIdentityService.extUri.isEqual(w, workspace))) {
				workspaces.push(workspace);
				await this.updateProfile(profile, { workspaces });
			}
		} else {
			this.updateEmptyWindowAssociation(workspace, profile, false);
			this.updateStoredProfiles(this.profiles);
		}
	}

	unsetWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier, transient: boolean = false): void {
		const workspace = this.getWorkspace(workspaceIdentifier);
		if (URI.isUri(workspace)) {
			const currentlyAssociatedProfile = this.getProfileForWorkspace(workspaceIdentifier);
			if (currentlyAssociatedProfile) {
				this.updateProfile(currentlyAssociatedProfile, { workspaces: currentlyAssociatedProfile.workspaces?.filter(w => !this.uriIdentityService.extUri.isEqual(w, workspace)) });
			}
		} else {
			this.updateEmptyWindowAssociation(workspace, undefined, transient);
			this.updateStoredProfiles(this.profiles);
		}
	}

	override async resetWorkspaces(): Promise<void> {
		this.transientProfilesObject.emptyWindows.clear();
		this.profilesObject.emptyWindows.clear();
		for (const profile of this.profiles) {
			(<Mutable<IUserDataProfile>>profile).workspaces = undefined;
		}
		this.updateProfiles([], [], this.profiles);
		this._onDidResetWorkspaces.fire();
	}

	override async cleanUp(): Promise<void> {
		if (await this.fileService.exists(this.profilesHome)) {
			const stat = await this.fileService.resolve(this.profilesHome);
			await Promise.all((stat.children || [])
				.filter(child => child.isDirectory && child.name !== SYSTEM_PROFILES_HOME && this.profiles.every(p => !this.uriIdentityService.extUri.isEqual(p.location, child.resource)))
				.map(child => this.fileService.del(child.resource, { recursive: true })));
		}
	}

	override async cleanUpTransientProfiles(): Promise<void> {
		const unAssociatedTransientProfiles = this.transientProfilesObject.profiles.filter(p => !this.isProfileAssociatedToWorkspace(p));
		await Promise.allSettled(unAssociatedTransientProfiles.map(p => this.removeProfile(p)));
	}

	getProfileForWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier): IUserDataProfile | undefined {
		const workspace = this.getWorkspace(workspaceIdentifier);
		return URI.isUri(workspace)
			? this.profiles.find(p => p.workspaces?.some(w => this.uriIdentityService.extUri.isEqual(w, workspace)))
			: (this.profilesObject.emptyWindows.get(workspace) ?? this.transientProfilesObject.emptyWindows.get(workspace));
	}

	override async updateStoredProfileTemplate(profile: IUserDataProfile, donotTriggerChange: boolean = false): Promise<void> {
		if (!profile.templateResource) {
			return;
		}

		const templateFile = this.getStoredProfileTemplateFile(profile);
		const templateData = await this.getSourceProfileTemplate(profile);
		try {
			if (templateData) {
				await this.fileService.writeFile(templateFile, VSBuffer.fromString(JSON.stringify(templateData, null, '\t')));
			} else {
				await this.fileService.del(templateFile);
			}
			if (!donotTriggerChange) {
				this.triggerProfilesChanges([], [], [profile]);
			}
		} catch (error) {
			this.logService.error(`Error while writing system profile template to ${templateFile.toString()}`, error);
		}
	}

	protected getWorkspace(workspaceIdentifier: IAnyWorkspaceIdentifier): URI | string {
		if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.uri;
		}
		if (isWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.configPath;
		}
		return workspaceIdentifier.id;
	}

	private isProfileAssociatedToWorkspace(profile: IUserDataProfile): boolean {
		if (profile.workspaces?.length) {
			return true;
		}
		if ([...this.profilesObject.emptyWindows.values()].some(windowProfile => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
			return true;
		}
		if ([...this.transientProfilesObject.emptyWindows.values()].some(windowProfile => this.uriIdentityService.extUri.isEqual(windowProfile.location, profile.location))) {
			return true;
		}
		return false;
	}

	private updateProfiles(added: IUserDataProfile[], removed: IUserDataProfile[], updated: IUserDataProfile[], donotTrigger: boolean = false): void {
		const allProfiles: Mutable<IUserDataProfile>[] = [...this.profiles, ...added];

		const transientProfiles = this.transientProfilesObject.profiles;
		this.transientProfilesObject.profiles = [];

		const profiles: IUserDataProfile[] = [];

		for (let profile of allProfiles) {
			// removed
			if (removed.some(p => profile.id === p.id)) {
				for (const windowId of [...this.profilesObject.emptyWindows.keys()]) {
					if (profile.id === this.profilesObject.emptyWindows.get(windowId)?.id) {
						this.profilesObject.emptyWindows.delete(windowId);
					}
				}
				continue;
			}

			if (!profile.isDefault) {
				profile = updated.find(p => profile.id === p.id) ?? profile;
				const transientProfile = transientProfiles.find(p => profile.id === p.id);
				if (profile.isTransient) {
					this.transientProfilesObject.profiles.push(profile);
				} else {
					if (transientProfile) {
						// Move the empty window associations from the transient profile to the persisted profile
						for (const [windowId, p] of this.transientProfilesObject.emptyWindows.entries()) {
							if (profile.id === p.id) {
								this.transientProfilesObject.emptyWindows.delete(windowId);
								this.profilesObject.emptyWindows.set(windowId, profile);
								break;
							}
						}
					}
				}
			}

			if (profile.workspaces?.length === 0) {
				profile.workspaces = undefined;
			}

			profiles.push(profile);
		}

		this.updateStoredProfiles(profiles);

		if (!donotTrigger) {
			this.triggerProfilesChanges(added, removed, updated);
		}
	}

	protected triggerProfilesChanges(added: IUserDataProfile[], removed: IUserDataProfile[], updated: IUserDataProfile[]) {
		this._onDidChangeProfiles.fire({ added, removed, updated, all: this.profiles });
	}

	private updateEmptyWindowAssociation(windowId: string, newProfile: IUserDataProfile | undefined, transient: boolean): void {
		// Force transient if the new profile to associate is transient
		transient = newProfile?.isTransient ? true : transient;

		if (transient) {
			if (newProfile) {
				this.transientProfilesObject.emptyWindows.set(windowId, newProfile);
			} else {
				this.transientProfilesObject.emptyWindows.delete(windowId);
			}
		}

		else {
			// Unset the transiet association if any
			this.transientProfilesObject.emptyWindows.delete(windowId);
			if (newProfile) {
				this.profilesObject.emptyWindows.set(windowId, newProfile);
			} else {
				this.profilesObject.emptyWindows.delete(windowId);
			}
		}
	}

	private updateStoredProfiles(profiles: IUserDataProfile[]): void {
		const storedProfiles: StoredUserDataProfile[] = [];
		const workspaces: IStringDictionary<string> = {};
		const emptyWindows: IStringDictionary<string> = {};

		for (const profile of profiles) {
			if (profile.isTransient) {
				continue;
			}
			if (!profile.isDefault) {
				storedProfiles.push({
					location: profile.location,
					name: profile.name,
					icon: profile.icon,
					useDefaultFlags: profile.useDefaultFlags,
					isSystem: profile.isSystem,
					templateResource: profile.isSystem ? undefined : profile.templateResource
				});
			}
			if (profile.workspaces) {
				for (const workspace of profile.workspaces) {
					workspaces[workspace.toString()] = profile.id;
				}
			}
		}

		for (const [windowId, profile] of this.profilesObject.emptyWindows.entries()) {
			emptyWindows[windowId.toString()] = profile.id;
		}

		this.saveStoredProfileAssociations({ workspaces, emptyWindows });
		this.saveStoredProfiles(storedProfiles);
		this._profilesObject = undefined;
	}

	protected getStoredProfiles(): StoredUserDataProfile[] { return []; }
	protected saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void { throw new Error('not implemented'); }

	protected getStoredProfileAssociations(): StoredProfileAssociations { return {}; }
	protected saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void { throw new Error('not implemented'); }
	protected getDefaultProfileExtensionsLocation(): URI | undefined { return undefined; }
}

export class InMemoryUserDataProfilesService extends UserDataProfilesService {
	private storedProfiles: StoredUserDataProfile[] = [];
	protected override getStoredProfiles(): StoredUserDataProfile[] { return this.storedProfiles; }
	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void { this.storedProfiles = storedProfiles; }

	private storedProfileAssociations: StoredProfileAssociations = {};
	protected override getStoredProfileAssociations(): StoredProfileAssociations { return this.storedProfileAssociations; }
	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void { this.storedProfileAssociations = storedProfileAssociations; }
}
