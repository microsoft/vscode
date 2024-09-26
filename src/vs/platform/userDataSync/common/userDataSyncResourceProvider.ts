/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { ISyncData, ISyncResourceHandle, IUserData, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, IUserDataSyncResourceProviderService, ISyncUserDataProfile, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM, IUserDataSyncResource } from './userDataSync.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { isSyncData } from './abstractSynchronizer.js';
import { parseSnippets } from './snippetsSync.js';
import { parseSettingsSyncContent } from './settingsSync.js';
import { getKeybindingsContentFromSyncContent } from './keybindingsSync.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { getTasksContentFromSyncContent } from './tasksSync.js';
import { LocalExtensionsProvider, parseExtensions, stringify as stringifyExtensions } from './extensionsSync.js';
import { LocalGlobalStateProvider, stringify as stringifyGlobalState } from './globalStateSync.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { parseUserDataProfilesManifest, stringifyLocalProfiles } from './userDataProfilesManifestSync.js';
import { toFormattedString } from '../../../base/common/jsonFormatter.js';
import { trim } from '../../../base/common/strings.js';
import { IMachinesData, IUserDataSyncMachine } from './userDataSyncMachines.js';

interface ISyncResourceUriInfo {
	readonly remote: boolean;
	readonly syncResource: SyncResource;
	readonly profile: string;
	readonly collection: string | undefined;
	readonly ref: string | undefined;
	readonly node: string | undefined;
	readonly location: URI | undefined;
}

export class UserDataSyncResourceProviderService implements IUserDataSyncResourceProviderService {

	_serviceBrand: any;

	private static readonly NOT_EXISTING_RESOURCE = 'not-existing-resource';
	private static readonly REMOTE_BACKUP_AUTHORITY = 'remote-backup';
	private static readonly LOCAL_BACKUP_AUTHORITY = 'local-backup';

	private readonly extUri: IExtUri;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService private readonly userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IUserDataSyncLogService protected readonly logService: IUserDataSyncLogService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileService private readonly fileService: IFileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.extUri = uriIdentityService.extUri;
	}

	async getRemoteSyncedProfiles(): Promise<ISyncUserDataProfile[]> {
		const userData = await this.userDataSyncStoreService.readResource(SyncResource.Profiles, null, undefined);
		if (userData.content) {
			const syncData = this.parseSyncData(userData.content, SyncResource.Profiles);
			return parseUserDataProfilesManifest(syncData);
		}
		return [];
	}

	async getLocalSyncedProfiles(location?: URI): Promise<ISyncUserDataProfile[]> {
		const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs(SyncResource.Profiles, undefined, location);
		if (refs.length) {
			const content = await this.userDataSyncLocalStoreService.resolveResourceContent(SyncResource.Profiles, refs[0].ref, undefined, location);
			if (content) {
				const syncData = this.parseSyncData(content, SyncResource.Profiles);
				return parseUserDataProfilesManifest(syncData);
			}
		}
		return [];
	}

	async getLocalSyncedMachines(location?: URI): Promise<IUserDataSyncMachine[]> {
		const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs('machines', undefined, location);
		if (refs.length) {
			const content = await this.userDataSyncLocalStoreService.resolveResourceContent('machines', refs[0].ref, undefined, location);
			if (content) {
				const machinesData: IMachinesData = JSON.parse(content);
				return machinesData.machines.map(m => ({ ...m, isCurrent: false }));
			}
		}
		return [];
	}

	async getRemoteSyncResourceHandles(syncResource: SyncResource, profile?: ISyncUserDataProfile): Promise<ISyncResourceHandle[]> {
		const handles = await this.userDataSyncStoreService.getAllResourceRefs(syncResource, profile?.collection);
		return handles.map(({ created, ref }) => ({
			created,
			uri: this.toUri({
				remote: true,
				syncResource,
				profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
				location: undefined,
				collection: profile?.collection,
				ref,
				node: undefined,
			})
		}));
	}

	async getLocalSyncResourceHandles(syncResource: SyncResource, profile?: ISyncUserDataProfile, location?: URI): Promise<ISyncResourceHandle[]> {
		const handles = await this.userDataSyncLocalStoreService.getAllResourceRefs(syncResource, profile?.collection, location);
		return handles.map(({ created, ref }) => ({
			created,
			uri: this.toUri({
				remote: false,
				syncResource,
				profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
				collection: profile?.collection,
				ref,
				node: undefined,
				location,
			})
		}));
	}

	resolveUserDataSyncResource({ uri }: ISyncResourceHandle): IUserDataSyncResource | undefined {
		const resolved = this.resolveUri(uri);
		const profile = resolved ? this.userDataProfilesService.profiles.find(p => p.id === resolved.profile) : undefined;
		return resolved && profile ? { profile, syncResource: resolved?.syncResource } : undefined;
	}

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]> {
		const resolved = this.resolveUri(uri);
		if (!resolved) {
			return [];
		}

		const profile = this.userDataProfilesService.profiles.find(p => p.id === resolved.profile);
		switch (resolved.syncResource) {
			case SyncResource.Settings: return this.getSettingsAssociatedResources(uri, profile);
			case SyncResource.Keybindings: return this.getKeybindingsAssociatedResources(uri, profile);
			case SyncResource.Tasks: return this.getTasksAssociatedResources(uri, profile);
			case SyncResource.Snippets: return this.getSnippetsAssociatedResources(uri, profile);
			case SyncResource.GlobalState: return this.getGlobalStateAssociatedResources(uri, profile);
			case SyncResource.Extensions: return this.getExtensionsAssociatedResources(uri, profile);
			case SyncResource.Profiles: return this.getProfilesAssociatedResources(uri, profile);
			case SyncResource.WorkspaceState: return [];
		}
	}

	async getMachineId({ uri }: ISyncResourceHandle): Promise<string | undefined> {
		const resolved = this.resolveUri(uri);
		if (!resolved) {
			return undefined;
		}
		if (resolved.remote) {
			if (resolved.ref) {
				const { content } = await this.getUserData(resolved.syncResource, resolved.ref, resolved.collection);
				if (content) {
					const syncData = this.parseSyncData(content, resolved.syncResource);
					return syncData?.machineId;
				}
			}
			return undefined;
		}

		if (resolved.location) {
			if (resolved.ref) {
				const content = await this.userDataSyncLocalStoreService.resolveResourceContent(resolved.syncResource, resolved.ref, resolved.collection, resolved.location);
				if (content) {
					const syncData = this.parseSyncData(content, resolved.syncResource);
					return syncData?.machineId;
				}
			}
			return undefined;
		}

		return getServiceMachineId(this.environmentService, this.fileService, this.storageService);
	}

	async resolveContent(uri: URI): Promise<string | null> {
		const resolved = this.resolveUri(uri);
		if (!resolved) {
			return null;
		}

		if (resolved.node === UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE) {
			return null;
		}

		if (resolved.ref) {
			const content = await this.getContentFromStore(resolved.remote, resolved.syncResource, resolved.collection, resolved.ref, resolved.location);
			if (resolved.node && content) {
				return this.resolveNodeContent(resolved.syncResource, content, resolved.node);
			}
			return content;
		}

		if (!resolved.remote && !resolved.node) {
			return this.resolveLatestContent(resolved.syncResource, resolved.profile);
		}

		return null;
	}

	private async getContentFromStore(remote: boolean, syncResource: SyncResource, collection: string | undefined, ref: string, location?: URI): Promise<string | null> {
		if (remote) {
			const { content } = await this.getUserData(syncResource, ref, collection);
			return content;
		}
		return this.userDataSyncLocalStoreService.resolveResourceContent(syncResource, ref, collection, location);
	}

	private resolveNodeContent(syncResource: SyncResource, content: string, node: string): string | null {
		const syncData = this.parseSyncData(content, syncResource);
		switch (syncResource) {
			case SyncResource.Settings: return this.resolveSettingsNodeContent(syncData, node);
			case SyncResource.Keybindings: return this.resolveKeybindingsNodeContent(syncData, node);
			case SyncResource.Tasks: return this.resolveTasksNodeContent(syncData, node);
			case SyncResource.Snippets: return this.resolveSnippetsNodeContent(syncData, node);
			case SyncResource.GlobalState: return this.resolveGlobalStateNodeContent(syncData, node);
			case SyncResource.Extensions: return this.resolveExtensionsNodeContent(syncData, node);
			case SyncResource.Profiles: return this.resolveProfileNodeContent(syncData, node);
			case SyncResource.WorkspaceState: return null;
		}
	}

	private async resolveLatestContent(syncResource: SyncResource, profileId: string): Promise<string | null> {
		const profile = this.userDataProfilesService.profiles.find(p => p.id === profileId);
		if (!profile) {
			return null;
		}
		switch (syncResource) {
			case SyncResource.GlobalState: return this.resolveLatestGlobalStateContent(profile);
			case SyncResource.Extensions: return this.resolveLatestExtensionsContent(profile);
			case SyncResource.Profiles: return this.resolveLatestProfilesContent(profile);
			case SyncResource.Settings: return null;
			case SyncResource.Keybindings: return null;
			case SyncResource.Tasks: return null;
			case SyncResource.Snippets: return null;
			case SyncResource.WorkspaceState: return null;
		}
	}

	private getSettingsAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'settings.json');
		const comparableResource = profile ? profile.settingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
		return [{ resource, comparableResource }];
	}

	private resolveSettingsNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'settings.json':
				return parseSettingsSyncContent(syncData.content).settings;
		}
		return null;
	}

	private getKeybindingsAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'keybindings.json');
		const comparableResource = profile ? profile.keybindingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
		return [{ resource, comparableResource }];
	}

	private resolveKeybindingsNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'keybindings.json':
				return getKeybindingsContentFromSyncContent(syncData.content, !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM), this.logService);
		}
		return null;
	}

	private getTasksAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'tasks.json');
		const comparableResource = profile ? profile.tasksResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
		return [{ resource, comparableResource }];
	}

	private resolveTasksNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'tasks.json':
				return getTasksContentFromSyncContent(syncData.content, this.logService);
		}
		return null;
	}

	private async getSnippetsAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): Promise<{ resource: URI; comparableResource: URI }[]> {
		const content = await this.resolveContent(uri);
		if (content) {
			const syncData = this.parseSyncData(content, SyncResource.Snippets);
			if (syncData) {
				const snippets = parseSnippets(syncData);
				const result = [];
				for (const snippet of Object.keys(snippets)) {
					const resource = this.extUri.joinPath(uri, snippet);
					const comparableResource = profile ? this.extUri.joinPath(profile.snippetsHome, snippet) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
					result.push({ resource, comparableResource });
				}
				return result;
			}
		}
		return [];
	}

	private resolveSnippetsNodeContent(syncData: ISyncData, node: string): string | null {
		return parseSnippets(syncData)[node] || null;
	}

	private getExtensionsAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'extensions.json');
		const comparableResource = profile
			? this.toUri({
				remote: false,
				syncResource: SyncResource.Extensions,
				profile: profile.id,
				location: undefined,
				collection: undefined,
				ref: undefined,
				node: undefined,
			})
			: this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
		return [{ resource, comparableResource }];
	}

	private resolveExtensionsNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'extensions.json':
				return stringifyExtensions(parseExtensions(syncData), true);
		}
		return null;
	}

	private async resolveLatestExtensionsContent(profile: IUserDataProfile): Promise<string | null> {
		const { localExtensions } = await this.instantiationService.createInstance(LocalExtensionsProvider).getLocalExtensions(profile);
		return stringifyExtensions(localExtensions, true);
	}

	private getGlobalStateAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'globalState.json');
		const comparableResource = profile
			? this.toUri({
				remote: false,
				syncResource: SyncResource.GlobalState,
				profile: profile.id,
				location: undefined,
				collection: undefined,
				ref: undefined,
				node: undefined,
			})
			: this.extUri.joinPath(uri, UserDataSyncResourceProviderService.NOT_EXISTING_RESOURCE);
		return [{ resource, comparableResource }];
	}

	private resolveGlobalStateNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'globalState.json':
				return stringifyGlobalState(JSON.parse(syncData.content), true);
		}
		return null;
	}

	private async resolveLatestGlobalStateContent(profile: IUserDataProfile): Promise<string | null> {
		const localGlobalState = await this.instantiationService.createInstance(LocalGlobalStateProvider).getLocalGlobalState(profile);
		return stringifyGlobalState(localGlobalState, true);
	}

	private getProfilesAssociatedResources(uri: URI, profile: IUserDataProfile | undefined): { resource: URI; comparableResource: URI }[] {
		const resource = this.extUri.joinPath(uri, 'profiles.json');
		const comparableResource = this.toUri({
			remote: false,
			syncResource: SyncResource.Profiles,
			profile: this.userDataProfilesService.defaultProfile.id,
			location: undefined,
			collection: undefined,
			ref: undefined,
			node: undefined,
		});
		return [{ resource, comparableResource }];
	}

	private resolveProfileNodeContent(syncData: ISyncData, node: string): string | null {
		switch (node) {
			case 'profiles.json':
				return toFormattedString(JSON.parse(syncData.content), {});
		}
		return null;
	}

	private async resolveLatestProfilesContent(profile: IUserDataProfile): Promise<string | null> {
		return stringifyLocalProfiles(this.userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient), true);
	}

	private toUri(syncResourceUriInfo: ISyncResourceUriInfo): URI {
		const authority = syncResourceUriInfo.remote ? UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY : UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY;
		const paths = [];
		if (syncResourceUriInfo.location) {
			paths.push(`scheme:${syncResourceUriInfo.location.scheme}`);
			paths.push(`authority:${syncResourceUriInfo.location.authority}`);
			paths.push(trim(syncResourceUriInfo.location.path, '/'));
		}
		paths.push(`syncResource:${syncResourceUriInfo.syncResource}`);
		paths.push(`profile:${syncResourceUriInfo.profile}`);
		if (syncResourceUriInfo.collection) {
			paths.push(`collection:${syncResourceUriInfo.collection}`);
		}
		if (syncResourceUriInfo.ref) {
			paths.push(`ref:${syncResourceUriInfo.ref}`);
		}
		if (syncResourceUriInfo.node) {
			paths.push(syncResourceUriInfo.node);
		}
		return this.extUri.joinPath(URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority, path: `/`, query: syncResourceUriInfo.location?.query, fragment: syncResourceUriInfo.location?.fragment }), ...paths);
	}

	private resolveUri(uri: URI): ISyncResourceUriInfo | undefined {
		if (uri.scheme !== USER_DATA_SYNC_SCHEME) {
			return undefined;
		}
		const paths: string[] = [];
		while (uri.path !== '/') {
			paths.unshift(this.extUri.basename(uri));
			uri = this.extUri.dirname(uri);
		}
		if (paths.length < 2) {
			return undefined;
		}
		const remote = uri.authority === UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY;
		let scheme: string | undefined;
		let authority: string | undefined;
		const locationPaths: string[] = [];
		let syncResource: SyncResource | undefined;
		let profile: string | undefined;
		let collection: string | undefined;
		let ref: string | undefined;
		let node: string | undefined;
		while (paths.length) {
			const path = paths.shift()!;
			if (path.startsWith('scheme:')) {
				scheme = path.substring('scheme:'.length);
			} else if (path.startsWith('authority:')) {
				authority = path.substring('authority:'.length);
			} else if (path.startsWith('syncResource:')) {
				syncResource = path.substring('syncResource:'.length) as SyncResource;
			} else if (path.startsWith('profile:')) {
				profile = path.substring('profile:'.length);
			} else if (path.startsWith('collection:')) {
				collection = path.substring('collection:'.length);
			} else if (path.startsWith('ref:')) {
				ref = path.substring('ref:'.length);
			} else if (!syncResource) {
				locationPaths.push(path);
			} else {
				node = path;
			}
		}
		return {
			remote,
			syncResource: syncResource!,
			profile: profile!,
			collection,
			ref,
			node,
			location: scheme && authority !== undefined ? this.extUri.joinPath(URI.from({ scheme, authority, query: uri.query, fragment: uri.fragment, path: '/' }), ...locationPaths) : undefined
		};
	}

	private parseSyncData(content: string, syncResource: SyncResource): ISyncData {
		try {
			const syncData: ISyncData = JSON.parse(content);
			if (isSyncData(syncData)) {
				return syncData;
			}
		} catch (error) {
			this.logService.error(error);
		}
		throw new UserDataSyncError(localize('incompatible sync data', "Cannot parse sync data as it is not compatible with the current version."), UserDataSyncErrorCode.IncompatibleRemoteContent, syncResource);
	}

	private async getUserData(syncResource: SyncResource, ref: string, collection?: string): Promise<IUserData> {
		const content = await this.userDataSyncStoreService.resolveResourceContent(syncResource, ref, collection);
		return { ref, content };
	}

}
