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
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
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
		scopes: ['openid', 'profile', 'email', 'offline_access'],
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
	let requestHandler: (options: IRequestOptions) => IRequestContext | Promise<IRequestContext>;
	let defaultAccount: IDefaultAccount | null;
	let microsoftSessions: AuthenticationSession[];
	let configurationService: TestConfigurationService;
	let storageData: Map<string, string>;
	let entraAuthEnabled: boolean;

	setup(() => {
		defaultAccount = null;
		microsoftSessions = [];
		requestHandler = () => mockResponse(200, createGalleryManifest());
		storageData = new Map();
		entraAuthEnabled = true;

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
				controlUrl: '',
				extensionUrlTemplate: '',
				resourceUrlTemplate: '',
				nlsBaseUrl: '',
				accessSKUs: ['copilot_business'],
			},
			nameLong: 'VS Code Test',
			get enableExtensionGalleryEntraAuth() { return entraAuthEnabled; },
		});

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
			entitlementsData: { access_type_sku: 'copilot_business' } as IEntitlementsData,
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

	test('Microsoft provider — no EligibilityService in manifest → Misconfigured (no GitHub fallback)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		defaultAccount = createDefaultAccount({ enterprise: true });
		// Manifest has no EligibilityService resource
		requestHandler = () => mockResponse(200, createGalleryManifest(false));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// The admin explicitly configured microsoft — refuse access, do NOT fall back to GitHub
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Misconfigured);
	});

	test('Microsoft provider — cross-origin EligibilityService URL → Misconfigured (token not sent)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		let eligibilityCalled = false;
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				eligibilityCalled = true;
				return mockResponse(200, { eligible: true });
			}
			// Manifest points the eligibility endpoint at a foreign origin.
			return mockResponse(200, { version: '1.0', resources: [{ id: 'https://evil.example.com/eligibility', type: 'EligibilityService' }] });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Misconfigured);
		assert.strictEqual(eligibilityCalled, false);
	});

	test('Microsoft provider — cleartext (http) EligibilityService URL → Misconfigured (token not sent)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		let eligibilityCalled = false;
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				eligibilityCalled = true;
				return mockResponse(200, { eligible: true });
			}
			// Manifest points the eligibility endpoint at a cleartext (http) endpoint.
			return mockResponse(200, { version: '1.0', resources: [{ id: 'http://marketplace.example.com/eligibility', type: 'EligibilityService' }] });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Misconfigured);
		assert.strictEqual(eligibilityCalled, false);
	});

	test('Microsoft provider — non-HTTPS service index URL → Misconfigured (no request issued)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		configurationService.setUserConfiguration(ExtensionGalleryServiceUrlConfigKey, 'http://marketplace.example.com');
		microsoftSessions = [createMicrosoftSession()];
		let requestIssued = false;
		requestHandler = () => {
			requestIssued = true;
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Misconfigured);
		assert.strictEqual(requestIssued, false);
	});

	test('Microsoft provider — service index returns 500 with JSON body → Unreachable (not parsed as manifest)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A 5xx error body is valid JSON and truthy; it must be rejected outright rather than
		// mistaken for a manifest (which would otherwise land in Misconfigured).
		requestHandler = () => mockResponse(500, { error: 'internal' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
	});

	test('Microsoft provider — manifest fetch fails, no cache → Unreachable', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// Manifest discovery fails transiently (network error)
		requestHandler = () => { throw new Error('network down'); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		// A configured marketplace whose manifest can't be fetched is Unreachable so the
		// UI can surface a message (distinct from the initial no-gallery Unavailable).
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
	});

	test('Microsoft provider — no session → RequiresSignIn without probing the service index', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [];
		// When 'microsoft' is configured and there is no session, we must NOT issue an
		// anonymous request to the (possibly auth-gated) service index — that request is a
		// guaranteed 401. We go straight to sign-in and only touch the index once a token
		// exists. Assert no request was made.
		let indexRequests = 0;
		requestHandler = () => {
			indexRequests++;
			return mockResponse(401, { message: 'auth required' });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — auth-gated service index, session token presented → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// The index is gated: it returns 401 for anonymous reads but 200 once a bearer token
		// is presented. This asserts the token is actually threaded into the manifest fetch.
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			const hasAuth = !!(options.headers && options.headers['Authorization']);
			return hasAuth
				? mockResponse(200, createGalleryManifest(true))
				: mockResponse(401, { message: 'auth required' });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft provider — auth-gated service index, token forbidden (403) → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A token is presented but the server returns 403 — the identity is accepted but
		// forbidden from reading the index. This is a durable denial and is cached.
		requestHandler = () => mockResponse(403, { message: 'forbidden' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		const parsed = JSON.parse(cached);
		assert.strictEqual(parsed.authProvider, 'microsoft');
		assert.strictEqual(parsed.accountId, 'ms-account-1');
		assert.strictEqual(parsed.eligible, false);
		assert.strictEqual(parsed.serviceUrl, 'https://marketplace.example.com');
	});

	test('Microsoft provider — service index returns a non-manifest 200 → Unreachable (not a crash, not cached)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A 200 whose JSON body has no `resources` array must be rejected before eligibility
		// discovery — otherwise resource-URI lookup throws on a non-iterable and escapes the
		// fetch try/catch. It is a failed fetch, so it surfaces Unreachable and is not cached.
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true });
			}
			return mockResponse(200, { error: 'not a manifest' });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft provider — service index 200 with malformed resources → Unreachable (not a crash, not cached)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// `resources` is an array but an entry is missing `id`/`type`. Endpoint discovery calls
		// `resource.type.split()` outside the fetch try/catch, so an undefined `type` would throw
		// there and reject initialization. The response must instead be rejected as a failed
		// fetch → Unreachable, and never cached.
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true });
			}
			return mockResponse(200, { version: '1.0.0', resources: [{}] });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft provider — auth-gated service index, token rejected (401) → AccessDenied (not cached)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A token is presented but the server returns 401 — the user is already signed in, so
		// re-prompting for sign-in would loop on the same rejected token without ever explaining
		// the condition. Surface AccessDenied instead. Unlike a 403, a 401 is not a durable
		// per-identity denial, so we must NOT cache a negative result.
		requestHandler = () => mockResponse(401, { message: 'auth required' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft provider — eligibility endpoint forbids (403) → AccessDenied (cached ineligible)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// The service index is readable with the token, but the eligibility endpoint returns
		// 403 — the identity is accepted yet not entitled. This is a durable denial and is
		// cached so we don't re-probe on every startup.
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(403, { message: 'forbidden' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.strictEqual(JSON.parse(storageData.get('marketplace.cachedAccess')!).eligible, false);
	});

	test('Microsoft provider — eligibility endpoint rejects token (401) → AccessDenied (not cached)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// The index is readable, but the eligibility endpoint returns 401 — the user is already
		// signed in, so re-prompting for sign-in would loop on the same rejected token. Surface
		// AccessDenied so the condition is communicated. Unlike a 403, a 401 is not a durable
		// per-identity denial, so we must NOT cache it.
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(401, { message: 'auth required' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft provider — stale validation superseded by sign-out does not restore access', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];

		// Hold the eligibility POST open so the first (epoch 1) validation parks mid-flight
		// after it has already read a valid session and a well-formed index.
		let releaseEligibility!: (v: IRequestContext) => void;
		const eligibilityGate = new Promise<IRequestContext>(resolve => { releaseEligibility = resolve; });
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return eligibilityGate;
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		// Let the first validation advance to the point where it awaits the eligibility POST.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The user signs out — this supersedes the in-flight validation (epoch bumps).
		microsoftSessions = [];
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });

		// The superseding validation resolves to RequiresSignIn.
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);

		// The stale eligibility POST finally returns "eligible" — it must be discarded.
		releaseEligibility(mockResponse(200, { eligible: true, reason: 'EntraID' }));
		await inflight.catch(() => { });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('Microsoft provider — stale validation superseded by config change does not re-cache access', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// Seed an eligible cache so startup applies it (Available) and kicks off a background
		// re-validation that we can park mid-flight.
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));

		// Hold the eligibility POST open so the background (epoch 1) validation parks after it
		// has already read a session and a well-formed index.
		let releaseEligibility!: (v: IRequestContext) => void;
		const eligibilityGate = new Promise<IRequestContext>(resolve => { releaseEligibility = resolve; });
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return eligibilityGate;
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Let the background validation advance to the point where it awaits the eligibility POST.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The marketplace/auth-provider configuration changes — this clears the cache and asks
		// the user to restart (which they may decline). It must also supersede the in-flight
		// validation so its late result cannot re-populate the cache we just cleared.
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.ok(!storageData.has('marketplace.cachedAccess'));

		// The stale eligibility POST finally returns "eligible" — it must be discarded and must
		// NOT re-write the cache.
		releaseEligibility(mockResponse(200, { eligible: true, reason: 'EntraID' }));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('GitHub provider — eligible account, manifest fetch fails → Unreachable', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });
		requestHandler = () => { throw new Error('network down'); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
	});

	test('Microsoft provider — Entra auth product-gated off → uses GitHub path', async () => {
		entraAuthEnabled = false;
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		defaultAccount = createDefaultAccount({ enterprise: true });
		// Manifest advertises EligibilityService, but the Entra path is gated off.
		requestHandler = () => mockResponse(200, createGalleryManifest(true));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Entra path is skipped → GitHub path with enterprise account → Available
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	// --- Cache behavior ---

	test('cache hit on startup — eligible result applied immediately', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'github',
			accountId: 'testuser',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
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
			serviceUrl: 'https://marketplace.example.com',
		}));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// The cache was written for account 'testuser' but there is no current account, so the
		// cache is not trusted (dropped). Background github validation then sees no account and
		// lands on RequiresSignIn.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('cache for a different account of the same provider is dropped, not applied', async () => {
		// The cache says the CURRENT provider's user is eligible, but it was written for a
		// different account id than the one now signed in. A cached verdict is an authorization
		// input scoped to an account, so it must not grant (or deny) access to a different
		// account — it is dropped and fresh validation runs for the current identity.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()]; // account id 'ms-account-1'
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-2', // different account
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();
		// Background validation for the current account runs fire-and-forget; give it a tick.
		await new Promise(resolve => setTimeout(resolve, 0));

		// Background validation re-establishes access for the CURRENT account (ms-account-1),
		// writing a fresh cache for it — proving the stale ms-account-2 entry was not applied.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		assert.strictEqual(JSON.parse(cached).accountId, 'ms-account-1');
	});

	test('cache written for a different serviceUrl is dropped, not applied', async () => {
		// A verdict is scoped to the marketplace it was computed against. Only the serviceUrl
		// differs here (same provider + account), isolating service-URL scoping from account
		// matching. The current account is NOT eligible, so if the stale eligible cache were
		// wrongly trusted we'd see Available instead of AccessDenied.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount(); // testuser, not enterprise → ineligible
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'github',
			accountId: 'testuser',
			eligible: true,
			serviceUrl: 'https://old-marketplace.example.com', // differs from the configured URL
		}));

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Stale-URL cache dropped; fresh validation for the current marketplace denies access.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		const parsed = JSON.parse(cached);
		assert.strictEqual(parsed.eligible, false);
		assert.strictEqual(parsed.serviceUrl, 'https://marketplace.example.com');
	});

	test('session change during cached manifest fetch does not apply a stale manifest', async () => {
		// The cache is applied with an epoch guard while listeners are already active. If the
		// signed-in session changes while the cached manifest fetch is in flight, the stale
		// fetch result must be discarded rather than applied for the previous account.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));

		// Park the cached-path index fetch so applyCachedAccess suspends mid-fetch.
		let releaseIndex!: (v: IRequestContext) => void;
		const indexGate = new Promise<IRequestContext>(resolve => { releaseIndex = resolve; });
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true });
			}
			return indexGate;
		};

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		// Let cache application advance to the parked index fetch.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The user signs out while the cached fetch is parked — this supersedes it (epoch bumps).
		microsoftSessions = [];
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise(resolve => setTimeout(resolve, 0));

		// Release the stale cached index fetch; its manifest must be discarded, not applied.
		releaseIndex(mockResponse(200, createGalleryManifest(true)));
		await inflight.catch(() => { });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('cache from a different provider is dropped, not trusted', async () => {
		// The cache says the user is microsoft-eligible, but the effective provider is now
		// github with no account. The stale microsoft cache is an authorization input for a
		// different provider and must not grant access — it is dropped and github validation
		// runs, ending at RequiresSignIn.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('malformed cache entry is dropped without throwing', async () => {
		// A cache entry with an unexpected shape (e.g. written by an incompatible build) must
		// be discarded rather than trusted or allowed to crash startup.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;
		storageData.set('marketplace.cachedAccess', JSON.stringify({ unexpected: 'shape' }));

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft — eligibility server error (500), no cache → Unreachable', async () => {
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

		// The service index was reachable but the eligibility verdict could not be obtained and
		// there is no cache to fall back on — surface an "unreachable" message instead of leaving
		// a blank (Unavailable) marketplace.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
	});

	test('Microsoft — server error (500), with cache → cache preserved', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
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
			serviceUrl: 'https://marketplace.example.com',
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

		// The current account can't be resolved (transient auth failure), so the eligible cache
		// can't be verified for the current identity and must not be applied — but it is also NOT
		// invalidated. The user sees "unreachable" while the cache is retained for a later retry.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
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
		// The server-provided `reason` must NOT be persisted (avoids unnecessary PII at rest).
		assert.strictEqual(parsed.reason, undefined);
	});

	test('Microsoft — malformed eligibility 200 (no boolean) is treated as transient, not cached', async () => {
		// A 200 whose body lacks a boolean `eligible` field is a server contract drift, not a
		// definitive allow/deny. It must not be coerced into a durable verdict or cached.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = (options) => {
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { notEligibleField: true });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		// No definitive verdict + no cache → Unreachable, and nothing is cached.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('corrupt (non-JSON) cache entry is dropped without throwing', async () => {
		// A cache value that isn't valid JSON (e.g. truncated/corrupt storage) must be discarded
		// rather than crash startup with a parse error.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;
		storageData.set('marketplace.cachedAccess', '{not valid json');

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.ok(!storageData.has('marketplace.cachedAccess'));
	});

	test('Microsoft — token-bearing requests disable redirect following (no header leak)', async () => {
		// A bearer token must never be forwarded across a redirect (the request service would
		// re-send the Authorization header to the redirect target). Both the token-bearing index
		// fetch and the eligibility POST must set followRedirects: 0.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		const seen: { url: string; followRedirects: number | undefined }[] = [];
		requestHandler = (options) => {
			seen.push({ url: options.url ?? '', followRedirects: options.followRedirects });
			if (options.url?.includes('eligibility')) {
				return mockResponse(200, { eligible: true, reason: 'EntraID' });
			}
			return mockResponse(200, createGalleryManifest(true));
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		const indexReq = seen.find(r => !r.url.includes('eligibility'));
		const eligReq = seen.find(r => r.url.includes('eligibility'));
		assert.strictEqual(indexReq?.followRedirects, 0);
		assert.strictEqual(eligReq?.followRedirects, 0);
	});

	test('Microsoft — getSessions throws with no cache → Unreachable (not silent Unavailable)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				throw new Error('Auth service unavailable');
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// No cache to fall back on and the account couldn't be resolved — the configured
		// marketplace must show "unreachable" rather than a blank (Unavailable) view.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
	});

	test('GitHub — getDefaultAccount throws with no cache → Unreachable (not silent Unavailable)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		instantiationService.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount(): Promise<IDefaultAccount> {
				throw new Error('Account service unavailable');
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Unreachable);
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

		// With no configured marketplace serviceUrl the Entra/private-marketplace path is never
		// engaged; the base class falls back to the product's default gallery → Available.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});
});
