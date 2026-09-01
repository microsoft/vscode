/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { IDefaultAccount, IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ExtensionGalleryManifestStatus, ExtensionGalleryServiceUrlConfigKey } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../host/browser/host.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { WorkbenchExtensionGalleryManifestService } from '../../electron-browser/extensionGalleryManifestService.js';

function mockResponse(statusCode: number, body: object): IRequestContext {
	return {
		res: { headers: {}, statusCode },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

function createDefaultAccount(overrides: Partial<IDefaultAccount> = {}): IDefaultAccount {
	return {
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		accountName: 'testuser',
		sessionId: 'session-1',
		enterprise: false,
		entitlementsData: undefined,
		...overrides,
	};
}

function createGalleryManifest() {
	return {
		version: '1.0',
		resources: [],
	};
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly eventName: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ eventName, data });
		}
	}
}

suite('WorkbenchExtensionGalleryManifestService', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let onDidChangeDefaultAccount: Emitter<IDefaultAccount | null>;
	let requestHandler: (options: IRequestOptions) => IRequestContext | Promise<IRequestContext>;
	let defaultAccount: IDefaultAccount | null;
	let configurationService: TestConfigurationService;
	let storageData: Map<string, string>;
	let telemetryService: RecordingTelemetryService;

	setup(() => {
		defaultAccount = null;
		requestHandler = () => mockResponse(200, createGalleryManifest());
		storageData = new Map();

		onDidChangeDefaultAccount = disposableStore.add(new Emitter<IDefaultAccount | null>());

		configurationService = new TestConfigurationService({
			[ExtensionGalleryServiceUrlConfigKey]: 'https://marketplace.example.com',
		});

		instantiationService = disposableStore.add(new TestInstantiationService());

		instantiationService.stub(IProductService, {
			version: '1.0.0',
			extensionsGallery: {
				serviceUrl: 'https://default-marketplace.example.com',
				controlUrl: '',
				extensionUrlTemplate: '',
				resourceUrlTemplate: '',
				nlsBaseUrl: '',
				accessSKUs: ['copilot_business'],
			},
			nameLong: 'VS Code Test',
		});

		instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		}());

		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
		}());

		telemetryService = new RecordingTelemetryService();
		instantiationService.stub(ITelemetryService, telemetryService);

		instantiationService.stub(IStorageService, new class extends mock<IStorageService>() {
			override get(key: string, _scope: StorageScope, fallbackValue: string): string;
			override get(key: string, _scope: StorageScope, fallbackValue?: string): string | undefined;
			override get(key: string, _scope: StorageScope, fallbackValue?: string): string | undefined {
				return storageData.get(key) ?? fallbackValue;
			}
			override store(key: string, value: string, _scope: StorageScope, _target: StorageTarget): void {
				storageData.set(key, value);
			}
			override remove(key: string, _scope: StorageScope): void {
				storageData.delete(key);
			}
		}());

		instantiationService.stub(IRemoteAgentService, new class extends mock<IRemoteAgentService>() {
			override getConnection() { return null; }
		}());

		instantiationService.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel(_channelName: string): any {
				return {
					call: () => Promise.resolve(),
					listen: () => Event.None,
				};
			}
		}());

		instantiationService.stub(IConfigurationService, configurationService);

		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				return requestHandler(options);
			}
		}());

		instantiationService.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount() { return defaultAccount; }
		}());

		instantiationService.stub(ILogService, new NullLogService());

		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() { return { confirmed: false }; }
		}());

		instantiationService.stub(IHostService, new class extends mock<IHostService>() {
			override async restart() { }
		}());
	});

	function createService(): WorkbenchExtensionGalleryManifestService {
		return disposableStore.add(instantiationService.createInstance(WorkbenchExtensionGalleryManifestService));
	}

	test('enterprise account → Available', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('no account → RequiresSignIn', async () => {
		defaultAccount = null;

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('non-enterprise account without SKU → AccessDenied', async () => {
		defaultAccount = createDefaultAccount({ enterprise: false });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('account with matching SKU → Available', async () => {
		defaultAccount = createDefaultAccount({
			enterprise: false,
			entitlementsData: { access_type_sku: 'copilot_business' } as IEntitlementsData,
		});

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('sign-out during the in-flight startup fetch does not restore access', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });

		// Hold the manifest fetch open so the startup resolution parks mid-flight.
		let releaseIndex!: (v: IRequestContext) => void;
		const indexGate = new Promise<IRequestContext>(resolve => { releaseIndex = resolve; });
		requestHandler = () => indexGate;

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		await new Promise(resolve => setTimeout(resolve, 0));

		defaultAccount = null;
		onDidChangeDefaultAccount.fire(null);
		await new Promise(resolve => setTimeout(resolve, 0));

		// The stale fetch must be discarded rather than restore an Available marketplace. Cancellation
		// resolves the startup promise cleanly, so await it directly to also catch an unexpected reject.
		releaseIndex(mockResponse(200, createGalleryManifest()));
		const manifest = await inflight;
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(manifest, null);
	});

	test('account change to another authorized account mid-startup fetch resolves to the new manifest', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });

		// Park each fetch on its own gate so the first (startup) fetch can settle while the second is
		// still pending — the window in which a superseded startup could publish a stale null.
		let releaseFirst!: (v: IRequestContext) => void;
		let releaseSecond!: (v: IRequestContext) => void;
		const firstGate = new Promise<IRequestContext>(resolve => { releaseFirst = resolve; });
		const secondGate = new Promise<IRequestContext>(resolve => { releaseSecond = resolve; });
		let fetchCount = 0;
		requestHandler = () => (++fetchCount === 1 ? firstGate : secondGate);

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		await new Promise(resolve => setTimeout(resolve, 0));

		// Switch to another authorized account; its fetch parks on the second gate.
		defaultAccount = createDefaultAccount({ enterprise: true, sessionId: 'session-2' });
		onDidChangeDefaultAccount.fire(defaultAccount);
		await new Promise(resolve => setTimeout(resolve, 0));

		// The stale first fetch settles while the winning fetch is still pending. The startup promise
		// (which the constructor publishes to the shared/remote channels) must stay pending for the
		// winner rather than resolving early with the superseded null.
		releaseFirst(mockResponse(200, createGalleryManifest()));
		await new Promise(resolve => setTimeout(resolve, 0));
		releaseSecond(mockResponse(200, createGalleryManifest()));

		const manifest = await inflight;

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.notStrictEqual(manifest, null);
	});
});
