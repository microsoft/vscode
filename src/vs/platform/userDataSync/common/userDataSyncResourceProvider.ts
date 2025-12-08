/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtUri } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { getServiceMachineId } from 'vs/platform/externalServices/common/serviceMachineId';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ISyncData, ISyncResourceHandle, IUserData, IUserDataSyncBackupStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, SyncResource, UserDataSyncError, UserDataSyncErrorCode, USER_DATA_SYNC_SCHEME, IUserDataSyncResourceProviderService, ISyncUserDataProfile, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM, IUserDataSyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { isSyncData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { parseSnippets } from 'vs/platform/userDataSync/common/snippetsSync';
import { parseSettingsSyncContent } from 'vs/platform/userDataSync/common/settingsSync';
import { getKeybindingsContentFromSyncContent } from 'vs/platform/userDataSync/common/keybindingsSync';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getTasksContentFromSyncContent } from 'vs/platform/userDataSync/common/tasksSync';
import { LocalExtensionsProvider, parseExtensions, stringify as stringifyExtensions } from 'vs/platform/userDataSync/common/extensionsSync';
import { LocalGlobalStateProvider, stringify as stringifyGlobalState } from 'vs/platform/userDataSync/common/globalStateSync';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { parseUserDataProfilesManifest, stringifyLocalProfiles } from 'vs/platform/userDataSync/common/userDataProfilesManifestSync';
import { toFormattedString } from 'vs/base/common/jsonFormatter';

interface ISyncResourceUriInfo {
	readonly remote: boolean;
	readonly syncResource: SyncResource;
	readonly profile: string;
	readonly collection: string | undefined;
	readonly ref: string | undefined;
	readonly node: string | undefined;
}

export class UserDataSyncResourceProviderService implements IUserDataSyncResourceProviderService {

	_serviceBrand: any;

	private static readonly NOT_EXISTING_RESOURCE = 'not-existing-resource';
	private static readonly REMOTE_BACKUP_AUTHORITY = 'remote-backup';
	private static readonly LOCAL_BACKUP_AUTHORITY = 'local-backup';

	private readonly extUri: IExtUri;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService private readonly userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
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

	async getRemoteSyncResourceHandles(syncResource: SyncResource, profile: ISyncUserDataProfile | undefined): Promise<ISyncResourceHandle[]> {
		const handles = await this.userDataSyncStoreService.getAllResourceRefs(syncResource, profile?.collection);
		return handles.map(({ created, ref }) => ({
			created,
			uri: this.toUri({
				remote: true,
				syncResource,
				profile: profile?.id ?? this.userDataProfilesService.defaultProfile.id,
				collection: profile?.collection,
				ref,
				node: undefined,
			})
		}));
	}

	async getLocalSyncResourceHandles(syncResource: SyncResource, profile: IUserDataProfile): Promise<ISyncResourceHandle[]> {
		const handles = await this.userDataSyncBackupStoreService.getAllRefs(profile, syncResource);
		return handles.map(({ created, ref }) => ({
			created,
			uri: this.toUri({
				remote: false,
				syncResource,
				profile: profile.id,
				collection: undefined,
				ref,
				node: undefined,
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
			const content = await this.getContentFromStore(resolved.remote, resolved.syncResource, resolved.profile, resolved.collection, resolved.ref);
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

	private async getContentFromStore(remote: boolean, syncResource: SyncResource, profileId: string, collection: string | undefined, ref: string): Promise<string | null> {
		if (remote) {
			const { content } = await this.getUserData(syncResource, ref, collection);
			return content;
		}
		const profile = this.userDataProfilesService.profiles.find(p => p.id === profileId);
		if (profile) {
			return this.userDataSyncBackupStoreService.resolveContent(profile, syncResource, ref);
		}
		return null;
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
		const paths = [
			syncResourceUriInfo.syncResource,
			syncResourceUriInfo.profile,
		];
		if (syncResourceUriInfo.collection) {
			paths.push(`collection:${syncResourceUriInfo.collection}`);
		}
		if (syncResourceUriInfo.ref) {
			paths.push(`ref:${syncResourceUriInfo.ref}`);
		}
		if (syncResourceUriInfo.node) {
			paths.push(syncResourceUriInfo.node);
		}
		return this.extUri.joinPath(URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority, path: `/` }), ...paths);
	}

	private resolveUri(uri: URI): ISyncResourceUriInfo | undefined {
		if (uri.scheme !== USER_DATA_SYNC_SCHEME) {
			return undefined;
		}
		if (uri.authority !== UserDataSyncResourceProviderService.LOCAL_BACKUP_AUTHORITY && uri.authority !== UserDataSyncResourceProviderService.REMOTE_BACKUP_AUTHORITY) {
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
		const syncResource = paths.shift()! as SyncResource;
		const profile = paths.shift()!;
		let collection: string | undefined;
		let ref: string | undefined;
		let node: string | undefined;
		while (paths.length) {
			const path = paths.shift()!;
			if (path.startsWith('collection:')) {
				collection = path.substring('collection:'.length);
			} else if (path.startsWith('ref:')) {
				ref = path.substring('ref:'.length);
			} else {
				node = path;
			}
		}
		return {
			remote,
			syncResource,
			profile,
			collection,
			ref,
			node,
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
