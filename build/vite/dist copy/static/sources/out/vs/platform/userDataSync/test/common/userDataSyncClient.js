/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { ConfigurationService } from '../../../configuration/common/configurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { GlobalExtensionEnablementService } from '../../../extensionManagement/common/extensionEnablementService.js';
import { IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from '../../../extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { IRequestService } from '../../../request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../../extensionManagement/common/extensionStorage.js';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from '../../common/ignoredExtensions.js';
import { ALL_SYNC_RESOURCES, getDefaultIgnoredSettings, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration, USER_DATA_SYNC_SCHEME } from '../../common/userDataSync.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../../common/userDataSyncAccount.js';
import { UserDataSyncLocalStoreService } from '../../common/userDataSyncLocalStoreService.js';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from '../../common/userDataSyncMachines.js';
import { UserDataSyncEnablementService } from '../../common/userDataSyncEnablementService.js';
import { UserDataSyncService } from '../../common/userDataSyncService.js';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from '../../common/userDataSyncStoreService.js';
import { InMemoryUserDataProfilesService, IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { NullPolicyService } from '../../../policy/common/policy.js';
import { IUserDataProfileStorageService } from '../../../userDataProfile/common/userDataProfileStorageService.js';
import { TestUserDataProfileStorageService } from '../../../userDataProfile/test/common/userDataProfileStorageService.test.js';
import { IMeteredConnectionService } from '../../../meteredConnection/common/meteredConnection.js';
export class UserDataSyncClient extends Disposable {
    constructor(testServer = new UserDataSyncTestServer()) {
        super();
        this.testServer = testServer;
        this.instantiationService = this._register(new TestInstantiationService());
    }
    async setUp(empty = false) {
        this._register(registerConfiguration());
        const logService = this.instantiationService.stub(ILogService, new NullLogService());
        const userRoamingDataHome = URI.file('userdata').with({ scheme: Schemas.inMemory });
        const userDataSyncHome = joinPath(userRoamingDataHome, '.sync');
        const environmentService = this.instantiationService.stub(IEnvironmentService, {
            userDataSyncHome,
            userRoamingDataHome,
            cacheHome: joinPath(userRoamingDataHome, 'cache'),
            argvResource: joinPath(userRoamingDataHome, 'argv.json'),
            sync: 'on'
        });
        this.instantiationService.stub(IProductService, {
            _serviceBrand: undefined, ...product, ...{
                'configurationSync.store': {
                    url: this.testServer.url,
                    stableUrl: this.testServer.url,
                    insidersUrl: this.testServer.url,
                    canSwitch: false,
                    authenticationProviders: { 'test': { scopes: [] } }
                }
            }
        });
        const fileService = this._register(new FileService(logService));
        this._register(fileService.registerProvider(Schemas.inMemory, this._register(new InMemoryFileSystemProvider())));
        this._register(fileService.registerProvider(USER_DATA_SYNC_SCHEME, this._register(new InMemoryFileSystemProvider())));
        this.instantiationService.stub(IFileService, fileService);
        const uriIdentityService = this._register(this.instantiationService.createInstance(UriIdentityService));
        this.instantiationService.stub(IUriIdentityService, uriIdentityService);
        const userDataProfilesService = this._register(new InMemoryUserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
        this.instantiationService.stub(IUserDataProfilesService, userDataProfilesService);
        const storageService = this._register(new TestStorageService(userDataProfilesService.defaultProfile));
        this.instantiationService.stub(IStorageService, this._register(storageService));
        this.instantiationService.stub(IUserDataProfileStorageService, this._register(new TestUserDataProfileStorageService(false, storageService)));
        const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, new NullPolicyService(), logService));
        await configurationService.initialize();
        this.instantiationService.stub(IConfigurationService, configurationService);
        this.instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: new Emitter().event });
        this.instantiationService.stub(IRequestService, this.testServer);
        this.instantiationService.stub(IUserDataSyncLogService, logService);
        this.instantiationService.stub(ITelemetryService, NullTelemetryService);
        this.instantiationService.stub(IUserDataSyncStoreManagementService, this._register(this.instantiationService.createInstance(UserDataSyncStoreManagementService)));
        this.instantiationService.stub(IUserDataSyncStoreService, this._register(this.instantiationService.createInstance(UserDataSyncStoreService)));
        const userDataSyncAccountService = this._register(this.instantiationService.createInstance(UserDataSyncAccountService));
        await userDataSyncAccountService.updateAccount({ authenticationProviderId: 'authenticationProviderId', token: 'token' });
        this.instantiationService.stub(IUserDataSyncAccountService, userDataSyncAccountService);
        this.instantiationService.stub(IUserDataSyncMachinesService, this._register(this.instantiationService.createInstance(UserDataSyncMachinesService)));
        this.instantiationService.stub(IUserDataSyncLocalStoreService, this._register(this.instantiationService.createInstance(UserDataSyncLocalStoreService)));
        this.instantiationService.stub(IUserDataSyncUtilService, new TestUserDataSyncUtilService());
        this.instantiationService.stub(IUserDataSyncEnablementService, this._register(this.instantiationService.createInstance(UserDataSyncEnablementService)));
        this.instantiationService.stub(IExtensionManagementService, {
            async getInstalled() { return []; },
            onDidInstallExtensions: new Emitter().event,
            onDidUninstallExtension: new Emitter().event,
        });
        this.instantiationService.stub(IGlobalExtensionEnablementService, this._register(this.instantiationService.createInstance(GlobalExtensionEnablementService)));
        this.instantiationService.stub(IExtensionStorageService, this._register(this.instantiationService.createInstance(ExtensionStorageService)));
        this.instantiationService.stub(IIgnoredExtensionsManagementService, this.instantiationService.createInstance(IgnoredExtensionsManagementService));
        this.instantiationService.stub(IExtensionGalleryService, {
            isEnabled() { return true; },
            async getCompatibleExtension() { return null; }
        });
        this.instantiationService.stub(IUserDataSyncService, this._register(this.instantiationService.createInstance(UserDataSyncService)));
        if (!empty) {
            await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({})));
            await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([])));
            await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, 'c.json'), VSBuffer.fromString(`{}`));
            await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, 'c.prompt.md'), VSBuffer.fromString(' '));
            await fileService.writeFile(userDataProfilesService.defaultProfile.tasksResource, VSBuffer.fromString(`{}`));
            await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'en' })));
        }
        await configurationService.reloadConfiguration();
        // `prompts` resource is disabled by default, so enable it for tests
        this.instantiationService
            .get(IUserDataSyncEnablementService)
            .setResourceEnablement("prompts" /* SyncResource.Prompts */, true);
    }
    async sync() {
        await (await this.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
    }
    read(resource, collection) {
        return this.instantiationService.get(IUserDataSyncStoreService).readResource(resource, null, collection);
    }
    async getLatestRef(resource) {
        const manifest = await this._getResourceManifest();
        return manifest?.[resource] ?? null;
    }
    async _getResourceManifest() {
        const manifest = await this.instantiationService.get(IUserDataSyncStoreService).manifest(null);
        return manifest?.latest ?? null;
    }
    getSynchronizer(source) {
        return this.instantiationService.get(IUserDataSyncService).getOrCreateActiveProfileSynchronizer(this.instantiationService.get(IUserDataProfilesService).defaultProfile, undefined).enabled.find(s => s.resource === source);
    }
}
const ALL_SERVER_RESOURCES = [...ALL_SYNC_RESOURCES, 'machines'];
export class UserDataSyncTestServer {
    get requests() { return this._requests; }
    get requestsWithAllHeaders() { return this._requestsWithAllHeaders; }
    get responses() { return this._responses; }
    reset() { this._requests = []; this._responses = []; this._requestsWithAllHeaders = []; }
    constructor(rateLimit = Number.MAX_SAFE_INTEGER, retryAfter) {
        this.rateLimit = rateLimit;
        this.retryAfter = retryAfter;
        this.onDidCompleteRequest = Event.None;
        this.url = 'http://host:3000';
        this.session = null;
        this.collections = new Map();
        this.data = new Map();
        this._requests = [];
        this._requestsWithAllHeaders = [];
        this._responses = [];
        this.manifestRef = 0;
        this.collectionCounter = 0;
    }
    async resolveProxy(url) { return url; }
    async lookupAuthorization(authInfo) { return undefined; }
    async lookupKerberosAuthorization(url) { return undefined; }
    async loadCertificates() { return []; }
    async request(options, token) {
        if (this._requests.length === this.rateLimit) {
            return this.toResponse(429, this.retryAfter ? { 'retry-after': `${this.retryAfter}` } : undefined);
        }
        const headers = {};
        if (options.headers) {
            if (options.headers['If-None-Match']) {
                headers['If-None-Match'] = options.headers['If-None-Match'];
            }
            if (options.headers['If-Match']) {
                headers['If-Match'] = options.headers['If-Match'];
            }
        }
        this._requests.push({ url: options.url, type: options.type, headers });
        this._requestsWithAllHeaders.push({ url: options.url, type: options.type, headers: options.headers });
        const requestContext = await this.doRequest(options);
        this._responses.push({ status: requestContext.res.statusCode });
        return requestContext;
    }
    async doRequest(options) {
        const versionUrl = `${this.url}/v1/`;
        const relativePath = options.url.indexOf(versionUrl) === 0 ? options.url.substring(versionUrl.length) : undefined;
        const segments = relativePath ? relativePath.split('/') : [];
        if (options.type === 'GET' && segments.length === 1 && segments[0] === 'manifest') {
            return this.getManifest(options.headers);
        }
        if (options.type === 'GET' && segments.length === 3 && segments[0] === 'resource') {
            return this.getResourceData(undefined, segments[1], segments[2] === 'latest' ? undefined : segments[2], options.headers);
        }
        if (options.type === 'POST' && segments.length === 2 && segments[0] === 'resource') {
            return this.writeData(undefined, segments[1], options.data, options.headers);
        }
        // resources in collection
        if (options.type === 'GET' && segments.length === 5 && segments[0] === 'collection' && segments[2] === 'resource') {
            return this.getResourceData(segments[1], segments[3], segments[4] === 'latest' ? undefined : segments[4], options.headers);
        }
        if (options.type === 'POST' && segments.length === 4 && segments[0] === 'collection' && segments[2] === 'resource') {
            return this.writeData(segments[1], segments[3], options.data, options.headers);
        }
        if (options.type === 'DELETE' && segments.length === 2 && segments[0] === 'resource') {
            return this.deleteResourceData(undefined, segments[1]);
        }
        if (options.type === 'DELETE' && segments.length === 1 && segments[0] === 'resource') {
            return this.clear(options.headers);
        }
        if (options.type === 'DELETE' && segments[0] === 'collection') {
            return this.toResponse(204);
        }
        if (options.type === 'POST' && segments.length === 1 && segments[0] === 'collection') {
            return this.createCollection();
        }
        return this.toResponse(501);
    }
    async getManifest(headers) {
        if (this.session) {
            const latest = Object.create({});
            this.data.forEach((value, key) => latest[key] = value.ref);
            let collections = undefined;
            if (this.collectionCounter) {
                collections = {};
                for (let collectionId = 1; collectionId <= this.collectionCounter; collectionId++) {
                    const collectionData = this.collections.get(`${collectionId}`);
                    if (collectionData) {
                        const latest = Object.create({});
                        collectionData.forEach((value, key) => latest[key] = value.ref);
                        collections[`${collectionId}`] = { latest };
                    }
                }
            }
            const manifest = { session: this.session, latest, collections, ref: '1' };
            return this.toResponse(200, { 'Content-Type': 'application/json', etag: `${this.manifestRef++}` }, JSON.stringify(manifest));
        }
        return this.toResponse(204, { etag: `${this.manifestRef++}` });
    }
    async getResourceData(collection, resource, ref, headers = {}) {
        const collectionData = collection ? this.collections.get(collection) : this.data;
        if (!collectionData) {
            return this.toResponse(501);
        }
        const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
        if (resourceKey) {
            const data = collectionData.get(resourceKey);
            if (ref && data?.ref !== ref) {
                return this.toResponse(404);
            }
            if (!data) {
                return this.toResponse(204, { etag: '0' });
            }
            if (headers['If-None-Match'] === data.ref) {
                return this.toResponse(304);
            }
            return this.toResponse(200, { etag: data.ref }, data.content || '');
        }
        return this.toResponse(204);
    }
    async writeData(collection, resource, content = '', headers = {}) {
        if (!this.session) {
            this.session = generateUuid();
        }
        const collectionData = collection ? this.collections.get(collection) : this.data;
        if (!collectionData) {
            return this.toResponse(501);
        }
        const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
        if (resourceKey) {
            const data = collectionData.get(resourceKey);
            if (headers['If-Match'] !== undefined && headers['If-Match'] !== (data ? data.ref : '0')) {
                return this.toResponse(412);
            }
            const ref = `${parseInt(data?.ref || '0') + 1}`;
            collectionData.set(resourceKey, { ref, content });
            return this.toResponse(200, { etag: ref });
        }
        return this.toResponse(204);
    }
    async deleteResourceData(collection, resource, headers = {}) {
        const collectionData = collection ? this.collections.get(collection) : this.data;
        if (!collectionData) {
            return this.toResponse(501);
        }
        const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
        if (resourceKey) {
            collectionData.delete(resourceKey);
            return this.toResponse(200);
        }
        return this.toResponse(404);
    }
    async createCollection() {
        const collectionId = `${++this.collectionCounter}`;
        this.collections.set(collectionId, new Map());
        return this.toResponse(200, {}, collectionId);
    }
    async clear(headers) {
        this.collections.clear();
        this.data.clear();
        this.session = null;
        this.collectionCounter = 0;
        return this.toResponse(204);
    }
    toResponse(statusCode, headers, data) {
        return {
            res: {
                headers: headers || {},
                statusCode
            },
            stream: bufferToStream(VSBuffer.fromString(data || ''))
        };
    }
}
export class TestUserDataSyncUtilService {
    async resolveDefaultCoreIgnoredSettings() {
        return getDefaultIgnoredSettings();
    }
    async resolveUserBindings(userbindings) {
        const keys = {};
        for (const keybinding of userbindings) {
            keys[keybinding] = keybinding;
        }
        return keys;
    }
    async resolveFormattingOptions(file) {
        return { eol: '\n', insertSpaces: false, tabSize: 4 };
    }
}
class TestStorageService extends InMemoryStorageService {
    constructor(profileStorageProfile) {
        super();
        this.profileStorageProfile = profileStorageProfile;
    }
    hasScope(profile) {
        return this.profileStorageProfile.id === profile.id;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFTeW5jQ2xpZW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFTeW5jL3Rlc3QvY29tbW9uL3VzZXJEYXRhU3luY0NsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNySCxPQUFPLEVBQThCLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLGlDQUFpQyxFQUEwQixNQUFNLDREQUE0RCxDQUFDO0FBQzFOLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0s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QyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3BILE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzdELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ25GLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUNELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxLQUFLLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ25GLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMxSCxDQUFDO1FBQ0QsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDcEYsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsT0FBTyxD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