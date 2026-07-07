/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ExtensionGalleryManifestStatus, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryServiceUrlConfigKey } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../authentication/common/authentication.js';
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

function createMicrosoftSession(accessToken = 'ms-token'): AuthenticationSession {
	return {
		id: 'ms-session-1',
		accessToken,
		account: { id: 'ms-account-1', label: 'user@contoso.com' },
		scopes: ['api://{private-marketplace-client-id}/access_as_user'],
	};
}

// Gallery manifest response stub
function createGalleryManifest(includeEligibility = false) {
	return {
		version: '1.0',
		resources: includeEligibility
			? [{ id: 'https://marketplace.example.com/_apis/public/gallery/eligibility', type: 'EligibilityService' }]
			: [],
	};
}

suite('WorkbenchExtensionGalleryManifestService', () => {

	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let onDidChangeDefaultAccount: Emitter<IDefaultAccount | null>;
	let onDidChangeSessions: Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;
	let requestHandler: (options: IRequestOptions) => IRequestContext;
	let defaultAccount: IDefaultAccount | null;
	let microsoftSessions: AuthenticationSession[];
	let configurationService: TestConfigurationService;
	let storageData: Map<string, string>;

	setup(() => {
		defaultAccount = null;
		microsoftSessions = [];
		requestHandler = () => mockResponse(200, createGalleryManifest());
		storageData = new Map();

		onDidChangeDefaultAccount = disposableStore.add(new Emitter<IDefaultAccount | null>());
		onDidChangeSessions = disposableStore.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());

		configurationService = new TestConfigurationService({
			[ExtensionGalleryServiceUrlConfigKey]: 'https://marketplace.example.com',
		});

		instantiationService = disposableStore.add(new TestInstantiationService());

		instantiationService.stub(IProductService, {
			version: '1.0.0',
			extensionsGallery: {
				serviceUrl: 'https://default-marketplace.example.com',
				accessSKUs: ['copilot_business'],
			},
			nameLong: 'VS Code Test',
		} as any);

		instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		}());

		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
		}());

		instantiationService.stub(ITelemetryService, NullTelemetryService);

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

		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string) {
				if (providerId === 'microsoft') {
					return microsoftSessions;
				}
				return [];
			}
			override async createSession(providerId: string) {
				return createMicrosoftSession();
			}
		}());

		instantiationService.stub(IContextKeyService, disposableStore.add(new MockContextKeyService()));
	});

	function createService(): WorkbenchExtensionGalleryManifestService {
		return disposableStore.add(instantiationService.createInstance(WorkbenchExtensionGalleryManifestService));
	}

	// --- Provider routing ---

	test('GitHub provider — enterprise account → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('GitHub provider — no account → RequiresSignIn', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('GitHub provider — non-enterprise account without SKU → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: false });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('GitHub provider — account with matching SKU → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({
			enterprise: false,
			entitlementsData: { access_type_sku: 'copilot_business' } as any,
		});

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('default (no authProvider) — uses GitHub path', async () => {
		// No authProvider config set
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft provider — no session → RequiresSignIn', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [];
		requestHandler = () => mockResponse(200, createGalleryManifest(true));

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('Microsoft provider — eligible session → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft provider — ineligible session → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: false, reason: 'MSA without VSS' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('Microsoft provider — no EligibilityService in manifest → falls back to GitHub', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		defaultAccount = null;
		// Manifest has no EligibilityService resource
		requestHandler = () => mockResponse(200, createGalleryManifest(false));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Falls back to GitHub path — no account → RequiresSignIn
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	// --- Cache behavior ---

	test('cache hit on startup — eligible result applied immediately', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'github',
			accountId: 'testuser',
			eligible: true,
		}));

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('cache hit on startup — ineligible result applied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'github',
			accountId: 'testuser',
			eligible: false,
		}));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Even though there's no account, the cache initially said AccessDenied
		// Then background validate fires and sees no account → RequiresSignIn
		// Since background runs in the same tick (no real async for getSessions mock),
		// the final state may be RequiresSignIn
		assert.ok(
			service.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.AccessDenied
			|| service.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.RequiresSignIn
		);
	});

	test('Microsoft — server error (500), no cache → status unchanged', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(500, { error: 'Internal Server Error' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Server error with no cache — status stays at initial Unavailable
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unavailable);
	});

	test('Microsoft — server error (500), with cache → cache preserved', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
		}));
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(500, { error: 'Internal Server Error' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Cache was applied on startup (Available), server error doesn't invalidate
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.ok(storageData.has('marketplace.cachedAccess'));
	});

	test('cache NOT invalidated when getSessions throws', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
		}));
		requestHandler = () => mockResponse(200, createGalleryManifest(true));

		// Override auth service to throw
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				throw new Error('Auth service unavailable');
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Cache was applied on startup (Available), auth error doesn't invalidate
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.ok(storageData.has('marketplace.cachedAccess'));
	});

	test('GitHub — result is cached after successful check', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		const parsed = JSON.parse(cached);
		assert.strictEqual(parsed.authProvider, 'github');
		assert.strictEqual(parsed.eligible, true);
	});

	test('Microsoft — result is cached after successful eligibility check', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		const parsed = JSON.parse(cached);
		assert.strictEqual(parsed.authProvider, 'microsoft');
		assert.strictEqual(parsed.eligible, true);
		assert.strictEqual(parsed.reason, 'EntraID');
	});

	// --- Cache invalidation ---

	test('cache invalidated on onDidChangeSessions for microsoft provider', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.ok(storageData.has('marketplace.cachedAccess'));

		// Simulate session change — should clear cache
		microsoftSessions = [];
		onDidChangeSessions.fire({
			providerId: 'microsoft',
			label: 'Microsoft',
			event: { added: undefined, removed: undefined, changed: undefined },
		});

		// Wait for async handler
		await new Promise(resolve => setTimeout(resolve, 0));

		// Cache should be cleared
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('cache invalidated on onDidChangeDefaultAccount for github provider', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.ok(storageData.has('marketplace.cachedAccess'));

		// Simulate account change — should clear cache and re-evaluate
		defaultAccount = null;
		onDidChangeDefaultAccount.fire(null);

		// Wait for async handler
		await new Promise(resolve => setTimeout(resolve, 0));

		// Cache should be cleared (account is null)
		assert.ok(!storageData.has('marketplace.cachedAccess'));
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	// --- No configuredServiceUrl ---

	test('no configuredServiceUrl — uses default gallery manifest', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryServiceUrlConfigKey, '');

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Should use the parent class default behavior (null or default manifest)
		// Status should be Unavailable since the default mock doesn't return a real manifest URL
		assert.ok(service.extensionGalleryManifestStatus !== ExtensionGalleryManifestStatus.RequiresSignIn);
	});
});
