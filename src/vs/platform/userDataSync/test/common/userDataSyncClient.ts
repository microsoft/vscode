/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToStream, VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { Emitter } from 'vs/base/common/event';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IHeaders, IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { DidUninstallExtensionEvent, IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService, InstallExtensionResult } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { ALL_SYNC_RESOURCES, getDefaultIgnoredSettings, IUserData, IUserDataManifest, IUserDataSyncBackupStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration, ServerResource, SyncResource, IUserDataSynchroniser } from 'vs/platform/userDataSync/common/userDataSync';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { UserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSyncBackupStoreService';
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { UserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSyncEnablementService';
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService';
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { NullPolicyService } from 'vs/platform/policy/common/policy';

export class UserDataSyncClient extends Disposable {

	readonly instantiationService: TestInstantiationService;

	constructor(readonly testServer: UserDataSyncTestServer = new UserDataSyncTestServer()) {
		super();
		this.instantiationService = new TestInstantiationService();
	}

	async setUp(empty: boolean = false): Promise<void> {
		registerConfiguration();

		const logService = this.instantiationService.stub(ILogService, new NullLogService());

		const userRoamingDataHome = URI.file('userdata').with({ scheme: Schemas.inMemory });
		const userDataSyncHome = joinPath(userRoamingDataHome, '.sync');
		const environmentService = this.instantiationService.stub(IEnvironmentService, <Partial<IEnvironmentService>>{
			userDataSyncHome,
			userRoamingDataHome,
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
		fileService.registerProvider(Schemas.inMemory, new InMemoryFileSystemProvider());
		this.instantiationService.stub(IFileService, fileService);

		const uriIdentityService = this.instantiationService.createInstance(UriIdentityService);
		this.instantiationService.stub(IUriIdentityService, uriIdentityService);

		const userDataProfilesService = this.instantiationService.stub(IUserDataProfilesService, new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));

		this.instantiationService.stub(IStorageService, this._register(new InMemoryStorageService()));

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
		this.instantiationService.stub(IUserDataSyncBackupStoreService, this._register(this.instantiationService.createInstance(UserDataSyncBackupStoreService)));
		this.instantiationService.stub(IUserDataSyncUtilService, new TestUserDataSyncUtilService());
		this.instantiationService.stub(IUserDataSyncEnablementService, this._register(this.instantiationService.createInstance(UserDataSyncEnablementService)));

		this.instantiationService.stub(IExtensionManagementService, <Partial<IExtensionManagementService>>{
			async getInstalled() { return []; },
			onDidInstallExtensions: new Emitter<readonly InstallExtensionResult[]>().event,
			onDidUninstallExtension: new Emitter<DidUninstallExtensionEvent>().event,
		});
		this.instantiationService.stub(IGlobalExtensionEnablementService, this._register(this.instantiationService.createInstance(GlobalExtensionEnablementService)));
		this.instantiationService.stub(IExtensionStorageService, this._register(this.instantiationService.createInstance(ExtensionStorageService)));
		this.instantiationService.stub(IIgnoredExtensionsManagementService, this.instantiationService.createInstance(IgnoredExtensionsManagementService));
		this.instantiationService.stub(IExtensionGalleryService, <Partial<IExtensionGalleryService>>{
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

	read(resource: SyncResource): Promise<IUserData> {
		return this.instantiationService.get(IUserDataSyncStoreService).read(resource, null);
	}

	manifest(): Promise<IUserDataManifest | null> {
		return this.instantiationService.get(IUserDataSyncStoreService).manifest(null);
	}

	getSynchronizer(source: SyncResource): IUserDataSynchroniser {
		return (this.instantiationService.get(IUserDataSyncService) as UserDataSyncService).getProfileSynchronizers()[0].enabled.find(s => s.resource === source)!;
	}

}

const ALL_SERVER_RESOURCES: ServerResource[] = [...ALL_SYNC_RESOURCES, 'machines'];

export class UserDataSyncTestServer implements IRequestService {

	_serviceBrand: any;

	readonly url: string = 'http://host:3000';
	private session: string | null = null;
	private readonly data: Map<ServerResource, IUserData> = new Map<SyncResource, IUserData>();

	private _requests: { url: string; type: string; headers?: IHeaders }[] = [];
	get requests(): { url: string; type: string; headers?: IHeaders }[] { return this._requests; }

	private _requestsWithAllHeaders: { url: string; type: string; headers?: IHeaders }[] = [];
	get requestsWithAllHeaders(): { url: string; type: string; headers?: IHeaders }[] { return this._requestsWithAllHeaders; }

	private _responses: { status: number }[] = [];
	get responses(): { status: number }[] { return this._responses; }
	reset(): void { this._requests = []; this._responses = []; this._requestsWithAllHeaders = []; }

	private manifestRef = 0;

	constructor(private readonly rateLimit = Number.MAX_SAFE_INTEGER, private readonly retryAfter?: number) { }

	async resolveProxy(url: string): Promise<string | undefined> { return url; }

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
		if (options.type === 'GET' && segments.length === 3 && segments[0] === 'resource' && segments[2] === 'latest') {
			return this.getLatestData(segments[1], options.headers);
		}
		if (options.type === 'POST' && segments.length === 2 && segments[0] === 'resource') {
			return this.writeData(segments[1], options.data, options.headers);
		}
		if (options.type === 'DELETE' && segments.length === 1 && segments[0] === 'resource') {
			return this.clear(options.headers);
		}
		return this.toResponse(501);
	}

	private async getManifest(headers?: IHeaders): Promise<IRequestContext> {
		if (this.session) {
			const latest: Record<ServerResource, string> = Object.create({});
			this.data.forEach((value, key) => latest[key] = value.ref);
			const manifest = { session: this.session, latest };
			return this.toResponse(200, { 'Content-Type': 'application/json', etag: `${this.manifestRef++}` }, JSON.stringify(manifest));
		}
		return this.toResponse(204, { etag: `${this.manifestRef++}` });
	}

	private async getLatestData(resource: string, headers: IHeaders = {}): Promise<IRequestContext> {
		const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
		if (resourceKey) {
			const data = this.data.get(resourceKey);
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

	private async writeData(resource: string, content: string = '', headers: IHeaders = {}): Promise<IRequestContext> {
		if (!this.session) {
			this.session = generateUuid();
		}
		const resourceKey = ALL_SERVER_RESOURCES.find(key => key === resource);
		if (resourceKey) {
			const data = this.data.get(resourceKey);
			if (headers['If-Match'] !== undefined && headers['If-Match'] !== (data ? data.ref : '0')) {
				return this.toResponse(412);
			}
			const ref = `${parseInt(data?.ref || '0') + 1}`;
			this.data.set(resourceKey, { ref, content });
			return this.toResponse(200, { etag: ref });
		}
		return this.toResponse(204);
	}

	async clear(headers?: IHeaders): Promise<IRequestContext> {
		this.data.clear();
		this.session = null;
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

	async resolveDefaultIgnoredSettings(): Promise<string[]> {
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

