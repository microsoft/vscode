/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var UserDataSyncResourceProviderService_1;
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { getServiceMachineId } from '../../externalServices/common/serviceMachineId.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncStoreService, UserDataSyncError, USER_DATA_SYNC_SCHEME, CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM } from './userDataSync.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { isSyncData } from './abstractSynchronizer.js';
import { parseSnippets } from './snippetsSync.js';
import { parseSettingsSyncContent } from './settingsSync.js';
import { getKeybindingsContentFromSyncContent } from './keybindingsSync.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { getTasksContentFromSyncContent } from './tasksSync.js';
import { getMcpContentFromSyncContent } from './mcpSync.js';
import { LocalExtensionsProvider, parseExtensions, stringify as stringifyExtensions } from './extensionsSync.js';
import { LocalGlobalStateProvider, stringify as stringifyGlobalState } from './globalStateSync.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { parseUserDataProfilesManifest, stringifyLocalProfiles } from './userDataProfilesManifestSync.js';
import { toFormattedString } from '../../../base/common/jsonFormatter.js';
import { trim } from '../../../base/common/strings.js';
import { parsePrompts } from './promptsSync/promptsSync.js';
let UserDataSyncResourceProviderService = class UserDataSyncResourceProviderService {
    static { UserDataSyncResourceProviderService_1 = this; }
    static { this.NOT_EXISTING_RESOURCE = 'not-existing-resource'; }
    static { this.REMOTE_BACKUP_AUTHORITY = 'remote-backup'; }
    static { this.LOCAL_BACKUP_AUTHORITY = 'local-backup'; }
    constructor(userDataSyncStoreService, userDataSyncLocalStoreService, logService, uriIdentityService, environmentService, storageService, fileService, userDataProfilesService, configurationService, instantiationService) {
        this.userDataSyncStoreService = userDataSyncStoreService;
        this.userDataSyncLocalStoreService = userDataSyncLocalStoreService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.storageService = storageService;
        this.fileService = fileService;
        this.userDataProfilesService = userDataProfilesService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.extUri = uriIdentityService.extUri;
    }
    async getRemoteSyncedProfiles() {
        const userData = await this.userDataSyncStoreService.readResource("profiles" /* SyncResource.Profiles */, null, undefined);
        if (userData.content) {
            const syncData = this.parseSyncData(userData.content, "profiles" /* SyncResource.Profiles */);
            return parseUserDataProfilesManifest(syncData);
        }
        return [];
    }
    async getLocalSyncedProfiles(location) {
        const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs("profiles" /* SyncResource.Profiles */, undefined, location);
        if (refs.length) {
            const content = await this.userDataSyncLocalStoreService.resolveResourceContent("profiles" /* SyncResource.Profiles */, refs[0].ref, undefined, location);
            if (content) {
                const syncData = this.parseSyncData(content, "profiles" /* SyncResource.Profiles */);
                return parseUserDataProfilesManifest(syncData);
            }
        }
        return [];
    }
    async getLocalSyncedMachines(location) {
        const refs = await this.userDataSyncLocalStoreService.getAllResourceRefs('machines', undefined, location);
        if (refs.length) {
            const content = await this.userDataSyncLocalStoreService.resolveResourceContent('machines', refs[0].ref, undefined, location);
            if (content) {
                const machinesData = JSON.parse(content);
                return machinesData.machines.map(m => ({ ...m, isCurrent: false }));
            }
        }
        return [];
    }
    async getRemoteSyncResourceHandles(syncResource, profile) {
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
    async getLocalSyncResourceHandles(syncResource, profile, location) {
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
    resolveUserDataSyncResource({ uri }) {
        const resolved = this.resolveUri(uri);
        const profile = resolved ? this.userDataProfilesService.profiles.find(p => p.id === resolved.profile) : undefined;
        return resolved && profile ? { profile, syncResource: resolved?.syncResource } : undefined;
    }
    async getAssociatedResources({ uri }) {
        const resolved = this.resolveUri(uri);
        if (!resolved) {
            return [];
        }
        const profile = this.userDataProfilesService.profiles.find(p => p.id === resolved.profile);
        switch (resolved.syncResource) {
            case "settings" /* SyncResource.Settings */: return this.getSettingsAssociatedResources(uri, profile);
            case "keybindings" /* SyncResource.Keybindings */: return this.getKeybindingsAssociatedResources(uri, profile);
            case "tasks" /* SyncResource.Tasks */: return this.getTasksAssociatedResources(uri, profile);
            case "mcp" /* SyncResource.Mcp */: return this.getMcpAssociatedResources(uri, profile);
            case "snippets" /* SyncResource.Snippets */: return this.getSnippetsAssociatedResources(uri, profile);
            case "prompts" /* SyncResource.Prompts */: return this.getPromptsAssociatedResources(uri, profile);
            case "globalState" /* SyncResource.GlobalState */: return this.getGlobalStateAssociatedResources(uri, profile);
            case "extensions" /* SyncResource.Extensions */: return this.getExtensionsAssociatedResources(uri, profile);
            case "profiles" /* SyncResource.Profiles */: return this.getProfilesAssociatedResources(uri, profile);
            case "workspaceState" /* SyncResource.WorkspaceState */: return [];
        }
    }
    async getMachineId({ uri }) {
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
    async resolveContent(uri) {
        const resolved = this.resolveUri(uri);
        if (!resolved) {
            return null;
        }
        if (resolved.node === UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE) {
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
    async getContentFromStore(remote, syncResource, collection, ref, location) {
        if (remote) {
            const { content } = await this.getUserData(syncResource, ref, collection);
            return content;
        }
        return this.userDataSyncLocalStoreService.resolveResourceContent(syncResource, ref, collection, location);
    }
    resolveNodeContent(syncResource, content, node) {
        const syncData = this.parseSyncData(content, syncResource);
        switch (syncResource) {
            case "settings" /* SyncResource.Settings */: return this.resolveSettingsNodeContent(syncData, node);
            case "keybindings" /* SyncResource.Keybindings */: return this.resolveKeybindingsNodeContent(syncData, node);
            case "tasks" /* SyncResource.Tasks */: return this.resolveTasksNodeContent(syncData, node);
            case "mcp" /* SyncResource.Mcp */: return this.resolveMcpNodeContent(syncData, node);
            case "snippets" /* SyncResource.Snippets */: return this.resolveSnippetsNodeContent(syncData, node);
            case "prompts" /* SyncResource.Prompts */: return this.resolvePromptsNodeContent(syncData, node);
            case "globalState" /* SyncResource.GlobalState */: return this.resolveGlobalStateNodeContent(syncData, node);
            case "extensions" /* SyncResource.Extensions */: return this.resolveExtensionsNodeContent(syncData, node);
            case "profiles" /* SyncResource.Profiles */: return this.resolveProfileNodeContent(syncData, node);
            case "workspaceState" /* SyncResource.WorkspaceState */: return null;
        }
    }
    async resolveLatestContent(syncResource, profileId) {
        const profile = this.userDataProfilesService.profiles.find(p => p.id === profileId);
        if (!profile) {
            return null;
        }
        switch (syncResource) {
            case "globalState" /* SyncResource.GlobalState */: return this.resolveLatestGlobalStateContent(profile);
            case "extensions" /* SyncResource.Extensions */: return this.resolveLatestExtensionsContent(profile);
            case "profiles" /* SyncResource.Profiles */: return this.resolveLatestProfilesContent(profile);
            case "settings" /* SyncResource.Settings */: return null;
            case "keybindings" /* SyncResource.Keybindings */: return null;
            case "tasks" /* SyncResource.Tasks */: return null;
            case "mcp" /* SyncResource.Mcp */: return null;
            case "snippets" /* SyncResource.Snippets */: return null;
            case "prompts" /* SyncResource.Prompts */: return null;
            case "workspaceState" /* SyncResource.WorkspaceState */: return null;
        }
    }
    getSettingsAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'settings.json');
        const comparableResource = profile ? profile.settingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveSettingsNodeContent(syncData, node) {
        switch (node) {
            case 'settings.json':
                return parseSettingsSyncContent(syncData.content).settings;
        }
        return null;
    }
    getKeybindingsAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'keybindings.json');
        const comparableResource = profile ? profile.keybindingsResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveKeybindingsNodeContent(syncData, node) {
        switch (node) {
            case 'keybindings.json':
                return getKeybindingsContentFromSyncContent(syncData.content, !!this.configurationService.getValue(CONFIG_SYNC_KEYBINDINGS_PER_PLATFORM), this.logService);
        }
        return null;
    }
    getTasksAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'tasks.json');
        const comparableResource = profile ? profile.tasksResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveTasksNodeContent(syncData, node) {
        switch (node) {
            case 'tasks.json':
                return getTasksContentFromSyncContent(syncData.content, this.logService);
        }
        return null;
    }
    async getSnippetsAssociatedResources(uri, profile) {
        const content = await this.resolveContent(uri);
        if (content) {
            const syncData = this.parseSyncData(content, "snippets" /* SyncResource.Snippets */);
            if (syncData) {
                const snippets = parseSnippets(syncData);
                const result = [];
                for (const snippet of Object.keys(snippets)) {
                    const resource = this.extUri.joinPath(uri, snippet);
                    const comparableResource = profile ? this.extUri.joinPath(profile.snippetsHome, snippet) : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
                    result.push({ resource, comparableResource });
                }
                return result;
            }
        }
        return [];
    }
    resolveSnippetsNodeContent(syncData, node) {
        return parseSnippets(syncData)[node] || null;
    }
    async getPromptsAssociatedResources(uri, profile) {
        const content = await this.resolveContent(uri);
        if (content) {
            const syncData = this.parseSyncData(content, "prompts" /* SyncResource.Prompts */);
            if (syncData) {
                const prompts = parsePrompts(syncData);
                const result = [];
                for (const prompt of Object.keys(prompts)) {
                    const resource = this.extUri.joinPath(uri, prompt);
                    const comparableResource = (profile)
                        ? this.extUri.joinPath(profile.promptsHome, prompt)
                        : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
                    result.push({ resource, comparableResource });
                }
                return result;
            }
        }
        return [];
    }
    resolvePromptsNodeContent(syncData, node) {
        return parsePrompts(syncData)[node] || null;
    }
    getExtensionsAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'extensions.json');
        const comparableResource = profile
            ? this.toUri({
                remote: false,
                syncResource: "extensions" /* SyncResource.Extensions */,
                profile: profile.id,
                location: undefined,
                collection: undefined,
                ref: undefined,
                node: undefined,
            })
            : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveExtensionsNodeContent(syncData, node) {
        switch (node) {
            case 'extensions.json':
                return stringifyExtensions(parseExtensions(syncData), true);
        }
        return null;
    }
    async resolveLatestExtensionsContent(profile) {
        const { localExtensions } = await this.instantiationService.createInstance(LocalExtensionsProvider).getLocalExtensions(profile);
        return stringifyExtensions(localExtensions, true);
    }
    getGlobalStateAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'globalState.json');
        const comparableResource = profile
            ? this.toUri({
                remote: false,
                syncResource: "globalState" /* SyncResource.GlobalState */,
                profile: profile.id,
                location: undefined,
                collection: undefined,
                ref: undefined,
                node: undefined,
            })
            : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveGlobalStateNodeContent(syncData, node) {
        switch (node) {
            case 'globalState.json':
                return stringifyGlobalState(JSON.parse(syncData.content), true);
        }
        return null;
    }
    async resolveLatestGlobalStateContent(profile) {
        const localGlobalState = await this.instantiationService.createInstance(LocalGlobalStateProvider).getLocalGlobalState(profile);
        return stringifyGlobalState(localGlobalState, true);
    }
    getProfilesAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'profiles.json');
        const comparableResource = this.toUri({
            remote: false,
            syncResource: "profiles" /* SyncResource.Profiles */,
            profile: this.userDataProfilesService.defaultProfile.id,
            location: undefined,
            collection: undefined,
            ref: undefined,
            node: undefined,
        });
        return [{ resource, comparableResource }];
    }
    resolveProfileNodeContent(syncData, node) {
        switch (node) {
            case 'profiles.json':
                return toFormattedString(JSON.parse(syncData.content), {});
        }
        return null;
    }
    async resolveLatestProfilesContent(profile) {
        return stringifyLocalProfiles(this.userDataProfilesService.profiles.filter(p => !p.isDefault && !p.isTransient), true);
    }
    toUri(syncResourceUriInfo) {
        const authority = syncResourceUriInfo.remote ? UserDataSyncResourceProviderService_1.REMOTE_BACKUP_AUTHORITY : UserDataSyncResourceProviderService_1.LOCAL_BACKUP_AUTHORITY;
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
    resolveUri(uri) {
        if (uri.scheme !== USER_DATA_SYNC_SCHEME) {
            return undefined;
        }
        const paths = [];
        while (uri.path !== '/') {
            paths.unshift(this.extUri.basename(uri));
            uri = this.extUri.dirname(uri);
        }
        if (paths.length < 2) {
            return undefined;
        }
        const remote = uri.authority === UserDataSyncResourceProviderService_1.REMOTE_BACKUP_AUTHORITY;
        let scheme;
        let authority;
        const locationPaths = [];
        let syncResource;
        let profile;
        let collection;
        let ref;
        let node;
        while (paths.length) {
            const path = paths.shift();
            if (path.startsWith('scheme:')) {
                scheme = path.substring('scheme:'.length);
            }
            else if (path.startsWith('authority:')) {
                authority = path.substring('authority:'.length);
            }
            else if (path.startsWith('syncResource:')) {
                syncResource = path.substring('syncResource:'.length);
            }
            else if (path.startsWith('profile:')) {
                profile = path.substring('profile:'.length);
            }
            else if (path.startsWith('collection:')) {
                collection = path.substring('collection:'.length);
            }
            else if (path.startsWith('ref:')) {
                ref = path.substring('ref:'.length);
            }
            else if (!syncResource) {
                locationPaths.push(path);
            }
            else {
                node = path;
            }
        }
        return {
            remote,
            syncResource: syncResource,
            profile: profile,
            collection,
            ref,
            node,
            location: scheme && authority !== undefined ? this.extUri.joinPath(URI.from({ scheme, authority, query: uri.query, fragment: uri.fragment, path: '/' }), ...locationPaths) : undefined
        };
    }
    parseSyncData(content, syncResource) {
        try {
            const syncData = JSON.parse(content);
            if (isSyncData(syncData)) {
                return syncData;
            }
        }
        catch (error) {
            this.logService.error(error);
        }
        throw new UserDataSyncError(localize('incompatible sync data', "Cannot parse sync data as it is not compatible with the current version."), "IncompatibleRemoteContent" /* UserDataSyncErrorCode.IncompatibleRemoteContent */, syncResource);
    }
    async getUserData(syncResource, ref, collection) {
        const content = await this.userDataSyncStoreService.resolveResourceContent(syncResource, ref, collection);
        return { ref, content };
    }
    getMcpAssociatedResources(uri, profile) {
        const resource = this.extUri.joinPath(uri, 'mcp.json');
        const comparableResource = profile ? profile.mcpResource : this.extUri.joinPath(uri, UserDataSyncResourceProviderService_1.NOT_EXISTING_RESOURCE);
        return [{ resource, comparableResource }];
    }
    resolveMcpNodeContent(syncData, node) {
        switch (node) {
            case 'mcp.json':
                return getMcpContentFromSyncContent(syncData.content, this.logService);
        }
        return null;
    }
};
UserDataSyncResourceProviderService = UserDataSyncResourceProviderService_1 = __decorate([
    __param(0, IUserDataSyncStoreService),
    __param(1, IUserDataSyncLocalStoreService),
    __param(2, IUserDataSyncLogService),
    __param(3, IUriIdentityService),
    __param(4, IEnvironmentService),
    __param(5, IStorageService),
    __param(6, IFileService),
    __param(7, IUserDataProfilesService),
    __param(8, IConfigurationService),
    __param(9, IInstantiationService)
], UserDataSyncResourceProviderService);
export { UserDataSyncResourceProviderService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlFLE9BQU8sRUFBNkMsOEJBQThCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQWdCLGlCQUFpQixFQUF5QixxQkFBcUIsRUFBOEQsb0NBQW9DLEVBQXlCLE1BQU0sbUJBQW1CLENBQUM7QUFDMVcsT0FBTyxFQUFvQix3QkFBd0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbEQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDNUUsT0FBTyxFQUFFLHFCQUFxQixFQUFF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