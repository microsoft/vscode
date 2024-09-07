/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IHeaders, IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { ConfigurationService } from '../../../configuration/common/configurationService.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { GlobalExtensionEnablementService } from '../../../extensionManagement/common/extensionEnablementService.js';
import { DidUninstallExtensionEvent, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService, InstallExtensionResult } from '../../../extensionManagement/common/extensionManagement.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { AuthInfo, Credentials, IRequestService } from '../../../request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../../extensionManagement/common/extensionStorage.js';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from '../../common/ignoredExtensions.js';
import { ALL_SYNC_RESOURCES, getDefaultIgnoredSettings, IUserData, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration, ServerResource, SyncResource, IUserDataSynchroniser, IUserDataResourceManifest, IUserDataCollectionManifest, USER_DATA_SYNC_SCHEME } from '../../common/userDataSync.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../../common/userDataSyncAccount.js';
import { UserDataSyncLocalStoreService } from '../../common/userDataSyncLocalStoreService.js';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from '../../common/userDataSyncMachines.js';
import { UserDataSyncEnablementService } from '../../common/userDataSyncEnablementService.js';
import { UserDataSyncService } from '../../common/userDataSyncService.js';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from '../../common/userDataSyncStoreService.js';
import { InMemoryUserDataProfilesService, IUserDataProfile, IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';
import { NullPolicyService } from '../../../policy/common/policy.js';
import { IUserDataProfileStorageService } from '../../../userDataProfile/common/userDataProfileStorageService.js';
import { TestUserDataProfileStorageService } from '../../../userDataProfile/test/common/userDataProfileStorageService.test.js';

export class UserDataSyncClient extends Disposable {

	readonly instantiationService: TestInstantiationService;

	constructor(readonly testServer: UserDataSyncTestServer = new UserDataSyncTestServer()) {
		super();
		this.instantiationService = this._register(new TestInstantiationService());
	}

	async setUp(empty: boolean = false): Promise<void> {
		this._register(registerConfiguration());

		const logService = this.instantiationService.stub(ILogService, new NullLogService());

		const userRoamingDataHome = URI.file('userdata').with({ scheme: Schemas.inMemory });
		const userDataSyncHome = joinPath(userRoamingDataHome, '.sync');
		const environmentService = this.instantiationService.stub(IEnvironmentService, {
			userDataSyncHome,
			userRoamingDataHome,
			cacheHome: joinPath(userRoamingDataHome, 'cache'),
			argvResource: joinPath(userRoamingDataHome, 'argv.json'),
			sync: 'on',
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

		this.instantiationService.stub(IRequestService, this.testServer);

		this.instantiationService.stub(IUserDataSyncLogService, logService);
		this.instantiationService.stub(ITelemetryService, NullTelemetryService);
		this.instantiationService.stub(IUserDataSyncStoreManagementService, this._register(this.instantiationService.createInstance(UserDataSyncStoreManagementService)));
		this.instantiationService.stub(IUserDataSyncStoreService, this._register(this.instantiationService.createInstance(UserDataSyncStoreService)));

		const userDataSyncAccountService: IUserDataSyncAccountService = this._register(this.instantiationService.createInstance(UserDataSyncAccountService));
		await userDataSyncAccountService.updateAccount({ authenticationProviderId: 'authenticationProviderId', token: 'token' });
		this.instantiationService.stub(IUserDataSyncAccountService, userDataSyncAccountService);

		this.instantiationService.stub(IUserDataSyncMachinesService, this._register(this.instantiationService.createInstance(UserDataSyncMachinesService)));
		this.instantiationService.stub(IUserDataSyncLocalStoreService, this._register(this.instantiationService.createInstance(UserDataSyncLocalStoreService)));
		this.instantiationService.stub(IUserDataSyncUtilService, new TestUserDataSyncUtilService());
		this.instantiationService.stub(IUserDataSyncEnablementService, this._register(this.instantiationService.createInstance(UserDataSyncEnablementService)));

		this.instantiationService.stub(IExtensionManagementService, {
			async getInstalled() { return []; },
			onDidInstallExtensions: new Emitter<readonly InstallExtensionResult[]>().event,
			onDidUninstallExtension: new Emitter<DidUninstallExtensionEvent>().event,
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
			await fileService.writeFile(userDataProfilesService.defaultProfile.tasksResource, VSBuffer.fromString(`{}`));
			await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ 'locale': 'en' })));
		}
		await configurationService.reloadConfiguration();
	}

	async sync(): Promise<void> {
		await (await this.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
	}

	read(resource: SyncResource, collection?: string): Promise<IUserData> {
		return this.instantiationService.get(IUserDataSyncStoreService).readResource(resource, null, collection);
	}

	async getResourceManifest(): Promise<IUserDataResourceManifest | null> {
		const manifest = await this.instantiationService.get(IUserDataSyncStoreService).manifest(null);
		return manifest?.latest ?? null;
	}

	getSynchronizer(source: SyncResource): IUserDataSynchroniser {
		return (this.instantiationService.get(IUserDataSyncService) as UserDataSyncService).getOrCreateActiveProfileSynchronizer(this.instantiationService.get(IUserDataProfilesService).defaultProfile, undefined).enabled.find(s => s.resource === source)!;
	}

}

const ALL_SERVER_RESOURCES: ServerResource[] = [...ALL_SYNC_RESOURCES, 'machines'];

export class UserDataSyncTestServer implements IRequestService {

	_serviceBrand: any;

	readonly url: string = 'http://host:3000';
	private session: string | null = null;
	private readonly collections = new Map<string, Map<ServerResource, IUserData>>();
	private readonly data = new Map<ServerResource, IUserData>();

	private _requests: { url: string; type: string; headers?: IHeaders }[] = [];
	get requests(): { url: string; type: string; headers?: IHeaders }[] { return this._requests; }

	private _requestsWithAllHeaders: { url: string; type: string; headers?: IHeaders }[] = [];
	get requestsWithAllHeaders(): { url: string; type: string; headers?: IHeaders }[] { return this._requestsWithAllHeaders; }

	private _responses: { status: number }[] = [];
	get responses(): { status: number }[] { return this._responses; }
	reset(): void { this._requests = []; this._responses = []; this._requestsWithAllHeaders = []; }

	private manifestRef = 0;
	private collectionCounter = 0;

	constructor(private readonly rateLimit = Number.MAX_SAFE_INTEGER, private readonly retryAfter?: number) { }

	async resolveProxy(url: string): Promise<string | undefined> { return url; }
	async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> { return undefined; }
	async lookupKerberosAuthorization(url: string): Promise<string | undefined> { return undefined; }
	async loadCertificates(): Promise<string[]> { return []; }

	async request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		if (this._requests.length === this.rateLimit) {
			return this.toResponse(429, this.retryAfter ? { 'retry-after': `${this.retryAfter}` } : undefined);
		}
		const headers: IHeaders = {};
		if (options.headers) {
			if (options.headers['If-None-Match']) {
				headers['If-None-Match'] = options.headers['If-None-Match'];
			}
			if (options.headers['If-Match']) {
				headers['If-Match'] = options.headers['If-Match'];
			}
		}
		this._requests.push({ url: options.url!, type: options.type!, headers });
		this._requestsWithAllHeaders.push({ url: options.url!, type: options.type!, headers: options.headers });
		const requestContext = await this.doRequest(options);
		this._responses.push({ status: requestContext.res.statusCode! });
		return requestContext;
	}

	private async doRequest(options: IRequestOptions): Promise<IRequestContext> {
		const versionUrl = `${this.url}/v1/`;
		const relativePath = options.url!.indexOf(versionUrl) === 0 ? options.url!.substring(versionUrl.length) : undefined;
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

	private async getManifest(headers?: IHeaders): Promise<IRequestContext> {
		if (this.session) {
			const latest: Record<ServerResource, string> = Object.create({});
			this.data.forEach((value, key) => latest[key] = value.ref);
			let collection: IUserDataCollectionManifest | undefined = undefined;
			if (this.collectionCounter) {
				collection = {};
				for (let collectionId = 1; collectionId <= this.collectionCounter; collectionId++) {
					const collectionData = this.collections.get(`${collectionId}`);
					if (collectionData) {
						const latest: Record<ServerResource, string> = Object.create({});
						collectionData.forEach((value, key) => latest[key] = value.ref);
						collection[`${collectionId}`] = { latest };
					}
				}
			}
			const manifest = { session: this.session, latest, collection };
			return this.toResponse(200, { 'Content-Type': 'application/json', etag: `${this.manifestRef++}` }, JSON.stringify(manifest));
		}
		return this.toResponse(204, { etag: `${this.manifestRef++}` });
	}

	private async getResourceData(collection: string | undefined, resource: string, ref?: string, headers: IHeaders = {}): Promise<IRequestContext> {
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

	private async writeData(collection: string | undefined, resource: string, content: string = '', headers: IHeaders = {}): Promise<IRequestContext> {
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

	private async deleteResourceData(collection: string | undefined, resource: string, headers: IHeaders = {}): Promise<IRequestContext> {
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

	private async createCollection(): Promise<IRequestContext> {
		const collectionId = `${++this.collectionCounter}`;
		this.collections.set(collectionId, new Map());
		return this.toResponse(200, {}, collectionId);
	}

	async clear(headers?: IHeaders): Promise<IRequestContext> {
		this.collections.clear();
		this.data.clear();
		this.session = null;
		this.collectionCounter = 0;
		return this.toResponse(204);
	}

	private toResponse(statusCode: number, headers?: IHeaders, data?: string): IRequestContext {
		return {
			res: {
				headers: headers || {},
				statusCode
			},
			stream: bufferToStream(VSBuffer.fromString(data || ''))
		};
	}
}

export class TestUserDataSyncUtilService implements IUserDataSyncUtilService {

	_serviceBrand: any;

	async resolveDefaultCoreIgnoredSettings(): Promise<string[]> {
		return getDefaultIgnoredSettings();
	}

	async resolveUserBindings(userbindings: string[]): Promise<IStringDictionary<string>> {
		const keys: IStringDictionary<string> = {};
		for (const keybinding of userbindings) {
			keys[keybinding] = keybinding;
		}
		return keys;
	}

	async resolveFormattingOptions(file?: URI): Promise<FormattingOptions> {
		return { eol: '\n', insertSpaces: false, tabSize: 4 };
	}

}

class TestStorageService extends InMemoryStorageService {
	constructor(private readonly profileStorageProfile: IUserDataProfile) {
		super();
	}
	override hasScope(profile: IUserDataProfile): boolean {
		return this.profileStorageProfile.id === profile.id;
	}
}
