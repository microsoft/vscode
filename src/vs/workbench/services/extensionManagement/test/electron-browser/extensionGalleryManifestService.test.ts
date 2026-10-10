/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
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
import { IExtensionGalleryAuthorizationService } from '../../../../../platform/extensionManagement/common/extensionGalleryAuthorization.js';
import { ExtensionGalleryManifestStatus, ExtensionGalleryAuthProviderConfigKey, ExtensionGalleryServiceUrlConfigKey } from '../../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationCreateSessionOptions, IAuthenticationGetSessionsOptions, IAuthenticationService, IAuthenticationWwwAuthenticateRequest } from '../../../authentication/common/authentication.js';
import { IHostService } from '../../../host/browser/host.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { WorkbenchExtensionGalleryManifestService } from '../../electron-browser/extensionGalleryManifestService.js';
import { ExtensionGalleryAccountService, GitHubGalleryAccountProvider, MicrosoftGalleryAccountProvider } from '../../electron-browser/extensionGalleryAccountService.js';
import { IExtensionGalleryAccountService } from '../../common/extensionGalleryAccount.js';

function mockResponse(statusCode: number, body: object, headers: Record<string, string> = {}): IRequestContext {
	return {
		res: { headers, statusCode },
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

// Well-known tenant ids used to classify a Microsoft account as work/school (Entra, eligible) vs.
// personal Microsoft Account (MSA, ineligible). Mirrors the production classification in
// `extensionGalleryAccountService.ts`.
const ENTRA_TENANT_ID = '72f988bf-86f1-41af-91ab-2d7cd011db47'; // A work/school (Entra) tenant — eligible.
const MSA_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad'; // Personal Microsoft Account — ineligible.
const MSA_PASSTHROUGH_TENANT_ID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a'; // MSA pass-through tenant — ineligible.

/** Builds a structurally valid (unsigned) JWT whose payload carries `claims`, matching `getClaimsFromJWT`. */
function makeJwt(claims: Record<string, unknown>): string {
	const encode = (obj: object) => encodeBase64(VSBuffer.fromString(JSON.stringify(obj)));
	return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.sig`;
}

// Eligibility is decided locally from the account's ID-token `tid` (tenant) claim, so a session must
// carry an ID token to be classified. The tenant defaults to a work/school (Entra) tenant → eligible.
function createMicrosoftSession(accessToken = 'ms-token', accountId = 'ms-account-1', sessionId = 'ms-session-1', tid = ENTRA_TENANT_ID): AuthenticationSession {
	return {
		id: sessionId,
		accessToken,
		account: { id: accountId, label: `${accountId}@contoso.com` },
		scopes: ['openid', 'profile', 'email', 'offline_access'],
		idToken: makeJwt({ tid, oid: accountId }),
	};
}

// Gallery manifest response stub. A well-formed manifest with an (empty) `resources` array is a
// valid service index; eligibility is no longer discovered from a manifest resource.
function createGalleryManifest() {
	return {
		version: '1.0',
		resources: [],
	};
}

/** Captures emitted telemetry events so tests can assert on event names and dimensions. */
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
	let onDidChangeSessions: Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;
	let requestHandler: (options: IRequestOptions) => IRequestContext | Promise<IRequestContext>;
	let defaultAccount: IDefaultAccount | null;
	let microsoftSessions: AuthenticationSession[];
	let configurationService: TestConfigurationService;
	let storageData: Map<string, string>;
	let telemetryService: RecordingTelemetryService;
	let restartPrompts: string[];
	let sharedAuthorizationError: Error | undefined;
	let authorizationService: IExtensionGalleryAuthorizationService;
	let accountService: ExtensionGalleryAccountService;

	setup(() => {
		defaultAccount = null;
		microsoftSessions = [];
		requestHandler = () => mockResponse(200, createGalleryManifest());
		storageData = new Map();
		restartPrompts = [];
		sharedAuthorizationError = undefined;

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
				accessScopes: ['openid', 'profile', 'email', 'offline_access'],
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
					call: () => {
						if (sharedAuthorizationError) {
							throw sharedAuthorizationError;
						}
						return Promise.resolve();
					},
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
			override async confirm(confirmation: IConfirmation) { restartPrompts.push(confirmation.message); return { confirmed: false }; }
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
		// Built here (not in setup) so the provider is chosen after each test sets the config;
		// registered to the store because it is injected, not owned by the manifest service.
		accountService = disposableStore.add(instantiationService.createInstance(ExtensionGalleryAccountService));
		authorizationService = accountService;
		// Play the role of the production contribution, which builds the auth-dependent provider
		// outside the service graph and hands it over.
		const useMicrosoft = configurationService.getValue<string>(ExtensionGalleryAuthProviderConfigKey) === 'microsoft';
		const provider = disposableStore.add(useMicrosoft
			? instantiationService.createInstance(MicrosoftGalleryAccountProvider)
			: instantiationService.createInstance(GitHubGalleryAccountProvider));
		accountService.setAccountProvider(provider);
		instantiationService.stub(IExtensionGalleryAccountService, accountService);
		return disposableStore.add(instantiationService.createInstance(WorkbenchExtensionGalleryManifestService));
	}

	// --- Provider routing ---

	test('account and authorization consumers share the Desktop instance', async () => {
		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(instantiationService.get(IExtensionGalleryAuthorizationService), accountService);
	});

	test('Desktop registration replaces the default authorization implementation', () => {
		const registration = getSingletonServiceDescriptors().filter(([id]) => id === IExtensionGalleryAuthorizationService).at(-1);

		assert.strictEqual(registration?.[1].ctor, ExtensionGalleryAccountService);
	});

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

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			authorization: await authorizationService.getAccessToken('https://marketplace.example.com'),
		}, {
			status: ExtensionGalleryManifestStatus.AccessDenied,
			authorization: undefined,
		});
	});

	test('GitHub provider — a denied account that is later granted entitlement becomes Available', async () => {
		// A denial is a verdict about the account as it is now, not a durable one: nothing may
		// outlive the condition that produced it and keep the user locked out after it changes.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: false });
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);

		// The same account gains entitlement, with no sign-out in between.
		defaultAccount = createDefaultAccount({ enterprise: true });
		onDidChangeDefaultAccount.fire(defaultAccount);
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
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

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('Microsoft provider — eligible (work/school) session → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// A work/school (Entra) tenant is eligible; the index is then fetched with the session token.
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft provider — personal (MSA) account → AccessDenied without touching the index', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// A personal Microsoft Account (MSA) is ineligible. The verdict is decided locally from the
		// token's tenant claim BEFORE any index fetch, so an ineligible account never probes the index.
		microsoftSessions = [createMicrosoftSession('ms-token', 'ms-account-1', 'ms-session-1', MSA_TENANT_ID)];
		let indexRequests = 0;
		requestHandler = () => { indexRequests++; return mockResponse(200, createGalleryManifest()); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — MSA pass-through tenant → AccessDenied without touching the index', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// The MSA pass-through tenant is also classified as a personal account → ineligible.
		microsoftSessions = [createMicrosoftSession('ms-token', 'ms-account-1', 'ms-session-1', MSA_PASSTHROUGH_TENANT_ID)];
		let indexRequests = 0;
		requestHandler = () => { indexRequests++; return mockResponse(200, createGalleryManifest()); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — no ID token, access token carries tenant → eligible (fallback)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// The ID token is preferred, but when it is absent the access token is decoded as a fallback.
		// Here the access token is a JWT carrying a work/school tenant → eligible.
		microsoftSessions = [{ ...createMicrosoftSession(makeJwt({ tid: ENTRA_TENANT_ID, oid: 'ms-account-1' })), idToken: undefined }];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft provider — undecodable token → AccessDenied without touching the index', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// An opaque/undecodable token cannot confirm a work/school account, so it is treated as
		// ineligible rather than wrongly granting access — and the index is never probed.
		microsoftSessions = [{ ...createMicrosoftSession(), idToken: 'not-a-jwt' }];
		let indexRequests = 0;
		requestHandler = () => { indexRequests++; return mockResponse(200, createGalleryManifest()); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — token without a tenant claim → AccessDenied without touching the index', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// A decodable token that carries no `tid` cannot be confirmed as a work/school account, so it
		// is treated as ineligible.
		microsoftSessions = [{ ...createMicrosoftSession(), idToken: makeJwt({ oid: 'ms-account-1' }) }];
		let indexRequests = 0;
		requestHandler = () => { indexRequests++; return mockResponse(200, createGalleryManifest()); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — service index returns 500 with JSON body → AccessDenied (not parsed as manifest)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A 5xx error body is valid JSON and truthy; it must be rejected outright rather than
		// mistaken for a manifest.
		requestHandler = () => mockResponse(500, { error: 'internal' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			authorization: await authorizationService.getAccessToken('https://marketplace.example.com'),
		}, {
			status: ExtensionGalleryManifestStatus.AccessDenied,
			authorization: undefined,
		});
	});

	test('Microsoft provider — manifest fetch fails → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// Manifest discovery fails transiently (network error)
		requestHandler = () => { throw new Error('network down'); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			authorization: await authorizationService.getAccessToken('https://marketplace.example.com'),
		}, {
			status: ExtensionGalleryManifestStatus.AccessDenied,
			authorization: undefined,
		});
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

	test('Microsoft provider — no session → stays RequiresSignIn even when the index would fail', async () => {
		// Pins the invariant that makes "not signed in" a stable, actionable state: with no session
		// the index is never probed, so a failing marketplace cannot mask the sign-in affordance.
		// Covers the post-startup re-validation triggered when authentication connects.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [];
		let indexRequests = 0;
		requestHandler = () => {
			indexRequests++;
			return mockResponse(400, { message: 'client rejected' });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);

		// A session change arrives (as it does when the Microsoft provider registers post-startup)
		// and triggers a re-validation.
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise<void>(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(indexRequests, 0);
	});

	test('Microsoft provider — service index rejects the client (400) → AccessDenied', async () => {
		// A marketplace that refuses this client outright — e.g. below its minimum supported
		// version — is a durable rejection, so retrying cannot help. `main` reports any failed
		// fetch of a configured marketplace as AccessDenied ("contact your administrator"); keep
		// that for this case rather than the transient "check your network connection".
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = () => mockResponse(400, { message: 'Only VS Code clients version 1.104.2 or later are allowed.' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('Microsoft — single signed-in account, no stored preference → adopted and persisted', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// Exactly one signed-in account and no remembered choice: the selection is unambiguous, so
		// it is adopted for the check AND persisted so later windows reuse the same account instead
		// of re-deriving it.
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.deepStrictEqual(JSON.parse(storageData.get('marketplace.account')!), { authProvider: 'microsoft', id: 'ms-account-1' });
	});

	test('Microsoft — multiple signed-in accounts, no stored preference → RequiresSignIn (never guesses)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// Several accounts are signed in and none was ever chosen. Picking one arbitrarily could grant
		// access under the wrong identity, so selection is refused: no index request is made, no
		// account is persisted, and the user is sent to an explicit sign-in.
		microsoftSessions = [
			createMicrosoftSession('token-1', 'ms-account-1', 'ms-session-1'),
			createMicrosoftSession('token-2', 'ms-account-2', 'ms-session-2'),
		];
		let indexRequests = 0;
		requestHandler = () => {
			indexRequests++;
			return mockResponse(200, createGalleryManifest());
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(indexRequests, 0);
		assert.ok(!storageData.has('marketplace.account'));
	});

	test('Microsoft — multiple accounts, stored preference selects that account (not sessions[0])', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// Two accounts signed in. The first is a personal account (ineligible), the remembered choice
		// is the second (eligible). Landing on Available therefore proves the remembered account was
		// used; picking `sessions[0]` would have produced AccessDenied.
		storageData.set('marketplace.account', JSON.stringify({ authProvider: 'microsoft', id: 'ms-account-2' }));
		microsoftSessions = [
			createMicrosoftSession('token-1', 'ms-account-1', 'ms-session-1', MSA_TENANT_ID),
			createMicrosoftSession('token-2', 'ms-account-2', 'ms-session-2', ENTRA_TENANT_ID),
		];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});

	test('Microsoft — stored preference no longer signed in, several remain → RequiresSignIn (no silent switch)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// The remembered account is gone, but two others remain. Rather than silently switching to a
		// different identity, selection is refused and the user must choose again.
		storageData.set('marketplace.account', JSON.stringify({ authProvider: 'microsoft', id: 'ms-account-gone' }));
		microsoftSessions = [
			createMicrosoftSession('token-1', 'ms-account-1', 'ms-session-1'),
			createMicrosoftSession('token-2', 'ms-account-2', 'ms-session-2'),
		];
		let indexRequests = 0;
		requestHandler = () => {
			indexRequests++;
			return mockResponse(200, createGalleryManifest());
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(indexRequests, 0);
	});

	test('GitHub provider — eligible account, manifest fetch fails → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });
		requestHandler = () => { throw new Error('network down'); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('authProvider is matched case-sensitively — a differently-cased value uses the GitHub path', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'Microsoft');
		microsoftSessions = [createMicrosoftSession()];
		defaultAccount = createDefaultAccount({ enterprise: true });
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Not the 'microsoft' literal → GitHub path with enterprise account → Available
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
	});


	test('Microsoft — product.json accessScopes are the scopes requested', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		instantiationService.stub(IProductService, {
			version: '1.0.0',
			extensionsGallery: {
				serviceUrl: 'https://default-marketplace.example.com',
				controlUrl: '',
				extensionUrlTemplate: '',
				resourceUrlTemplate: '',
				nlsBaseUrl: '',
				accessSKUs: ['copilot_business'],
				accessScopes: ['api://marketplace.example.com/.default', 'offline_access'],
			},
			nameLong: 'VS Code Test',
		});
		let requestedScopes: readonly string[] | undefined;
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string, scopes?: readonly string[]): Promise<readonly AuthenticationSession[]> {
				requestedScopes = scopes;
				return [createMicrosoftSession()];
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual(requestedScopes, ['api://marketplace.example.com/.default', 'offline_access']);
	});

	test('Microsoft — no accessScopes configured → no session is requested and access is not granted', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
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
		let sessionsRequested = false;
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				sessionsRequested = true;
				return [createMicrosoftSession()];
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// An unconfigured deployment must not fall back to scopes it did not ask for, and an
		// eligible session must not be adopted on the strength of a guess.
		assert.strictEqual(sessionsRequested, false);
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('Microsoft — getSessions throws → RequiresSignIn (not silent Unavailable)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				throw new Error('Auth service unavailable');
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// The account couldn't be resolved — the configured marketplace must report a definite
		// state rather than a blank (Unavailable) view.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('GitHub — getDefaultAccount throws → RequiresSignIn (not silent Unavailable)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		instantiationService.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = onDidChangeDefaultAccount.event;
			override async getDefaultAccount(): Promise<IDefaultAccount> {
				throw new Error('Account service unavailable');
			}
		}());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	// --- Already-available marketplace ---

	test('Microsoft — switching to a different eligible account publishes that account catalog', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('token-a', 'ms-account-1', 'ms-session-1')];
		requestHandler = () => mockResponse(200, { version: '1.0', resources: [{ id: 'tenantA', type: 'ExtensionQueryService' }] });

		const service = createService();
		const first = await service.getExtensionGalleryManifest();
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.strictEqual(first?.resources[0].id, 'tenantA');

		// A private marketplace is account-scoped, so a different eligible account can be served a
		// different catalog. The already-available status must not suppress the new one.
		microsoftSessions = [createMicrosoftSession('token-b', 'ms-account-2', 'ms-session-2')];
		requestHandler = () => mockResponse(200, { version: '1.0', resources: [{ id: 'tenantB', type: 'ExtensionQueryService' }] });
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise(resolve => setTimeout(resolve, 0));

		const second = await service.getExtensionGalleryManifest();
		assert.strictEqual(second?.resources[0].id, 'tenantB');
	});

	test('Microsoft — a transient auth failure does not downgrade an available marketplace', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		let authFails = false;
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(): Promise<readonly AuthenticationSession[]> {
				if (authFails) {
					throw new Error('Auth service unavailable');
				}
				return [createMicrosoftSession()];
			}
		}());
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);

		// The account can no longer be resolved. That is not a sign-out, and it must not retract a
		// marketplace the user already has.
		authFails = true;
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			hasAuthorization: !!(await authorizationService.getAccessToken('https://marketplace.example.com')),
		}, {
			status: ExtensionGalleryManifestStatus.Available,
			hasAuthorization: true,
		});
	});

	test('Microsoft — authorization projection failure does not require sign in', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		sharedAuthorizationError = new Error('Shared process unavailable');
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			hasAuthorization: !!(await authorizationService.getAccessToken('https://marketplace.example.com')),
		}, {
			status: ExtensionGalleryManifestStatus.Available,
			hasAuthorization: true,
		});
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

	// --- Configuration changes ---

	function fireConfigChange(...keys: string[]) {
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => keys.includes(key),
		} as IConfigurationChangeEvent);
	}

	test('changing authProvider mid-session prompts for restart', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];

		const service = createService();
		await service.getExtensionGalleryManifest();
		assert.deepStrictEqual(restartPrompts, []);

		// The provider is chosen once at startup, so a later change cannot take effect in this
		// window. It must not be silently ignored.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		fireConfigChange(ExtensionGalleryAuthProviderConfigKey);

		assert.deepStrictEqual(restartPrompts, ['The Extensions Marketplace configuration has changed. Please restart to apply the changes.']);
	});

	test('changing serviceUrl mid-session keeps its own restart message', async () => {
		const service = createService();
		await service.getExtensionGalleryManifest();

		fireConfigChange(ExtensionGalleryServiceUrlConfigKey);

		// A different marketplace, not a different sign-in — the existing wording still applies.
		assert.deepStrictEqual(restartPrompts, ['VS Code Test is now configured to a different Marketplace. Please restart to apply the changes.']);
	});

	test('an unrelated configuration change does not prompt for restart', async () => {
		const service = createService();
		await service.getExtensionGalleryManifest();

		fireConfigChange('editor.fontSize');

		assert.deepStrictEqual(restartPrompts, []);
	});

	// --- Telemetry ---

	function authCheckedEvents() {
		return telemetryService.events.filter(e => e.eventName === 'marketplace:auth:checked').map(e => e.data);
	}

	function customMarketplaceCount() {
		return telemetryService.events.filter(e => e.eventName === 'galleryservice:custom:marketplace').length;
	}

	test('telemetry — GitHub eligible access reports custom marketplace and auth check', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: true });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(customMarketplaceCount(), 1);
		assert.deepStrictEqual(authCheckedEvents(), [{ authProvider: 'github', eligible: true }]);
	});

	test('telemetry — GitHub ineligible access reports auth check but not custom marketplace', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = createDefaultAccount({ enterprise: false });

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Denied access never publishes the manifest, so the custom-marketplace event does not fire.
		assert.strictEqual(customMarketplaceCount(), 0);
		assert.deepStrictEqual(authCheckedEvents(), [{ authProvider: 'github', eligible: false }]);
	});

	test('telemetry — Microsoft eligible access reports custom marketplace and auth check', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Regression guard: the custom-marketplace event must fire for the Microsoft path too, not
		// just for GitHub. The github/microsoft distinction lives on 'marketplace:auth:checked'.
		assert.strictEqual(customMarketplaceCount(), 1);
		assert.deepStrictEqual(authCheckedEvents(), [{ authProvider: 'microsoft', eligible: true }]);
	});

	test('telemetry — Microsoft ineligible access reports auth check but not custom marketplace', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		// A personal Microsoft Account (MSA) is ineligible under the local tenant check.
		microsoftSessions = [createMicrosoftSession('ms-token', 'ms-account-1', 'ms-session-1', MSA_TENANT_ID)];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(customMarketplaceCount(), 0);
		assert.deepStrictEqual(authCheckedEvents(), [{ authProvider: 'microsoft', eligible: false }]);
	});

	test('telemetry — RequiresSignIn does not report any access verdict', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'github');
		defaultAccount = null;

		const service = createService();
		await service.getExtensionGalleryManifest();

		// No definitive verdict was reached, so nothing is cached and no verdict is reported.
		assert.strictEqual(customMarketplaceCount(), 0);
		assert.deepStrictEqual(authCheckedEvents(), []);
	});

	// --- Gated service index (RFC 9728 / RFC 8707) ---

	/**
	 * Answers the marketplace's protected resource metadata, and gates the index on the
	 * resource-scoped bearer so a test fails if the sign-in token is presented instead.
	 */
	function gatedMarketplace(resourceToken: string, metadata?: object): (options: IRequestOptions) => IRequestContext {
		return options => {
			if (options.url?.includes('/.well-known/oauth-protected-resource')) {
				return metadata
					? mockResponse(200, metadata)
					: mockResponse(404, { error: 'not_found' });
			}
			return options.headers?.Authorization === `Bearer ${resourceToken}`
				? mockResponse(200, createGalleryManifest())
				: mockResponse(401, { message: 'authentication required' });
		};
	}

	const MARKETPLACE_URL = 'https://marketplace.example.com';

	const PROTECTED_RESOURCE_METADATA = {
		resource: 'https://marketplace.example.com',
		authorization_servers: ['https://login.example.com/common'],
		scopes_supported: ['api://marketplace.example.com/.default'],
	};
	/** Mints `resource-token` only for a request that names the advertised authorization server. */
	function stubResourceScopedAuthentication(): void {
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string, _scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions) {
				if (providerId !== 'microsoft') {
					return [];
				}
				return options?.authorizationServer ? [createMicrosoftSession('resource-token')] : microsoftSessions;
			}
			override async createSession() { return createMicrosoftSession(); }
		}());
	}

	test('Microsoft — gated index negotiates a resource-scoped token and becomes Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		// The sign-in token identifies the user but is not minted for the marketplace, so the index
		// rejects it; only the token acquired against the advertised authorization server is accepted.
		requestHandler = gatedMarketplace('resource-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), 'resource-token');
	});

	// --- Gated service index, GitHub (RFC 8693 token exchange) ---

	const GITHUB_AUTHORIZATION_SERVER = 'https://marketplace.example.com/oauth';
	const GITHUB_PROTECTED_RESOURCE_METADATA = {
		resource: 'https://marketplace.example.com',
		authorization_servers: [GITHUB_AUTHORIZATION_SERVER],
		scopes_supported: ['marketplace.read'],
	};

	function stubGitHubSession(): void {
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string) {
				return providerId === 'github'
					? [{ id: 'session-1', accessToken: 'github-token', account: { id: 'gh-1', label: 'testuser' }, scopes: [] }]
					: [];
			}
		}());
	}

	/** A gated index whose authorization server exchanges `github-token` for `exchanged-token`. */
	function gatedGitHubMarketplace(exchangeRequests: IRequestOptions[], options: { tokenEndpoint?: string; exchangeStatus?: number } = {}): (request: IRequestOptions) => IRequestContext {
		const tokenEndpoint = options.tokenEndpoint ?? `${GITHUB_AUTHORIZATION_SERVER}/token`;
		return request => {
			if (request.url?.includes('/.well-known/oauth-protected-resource')) {
				return mockResponse(200, GITHUB_PROTECTED_RESOURCE_METADATA);
			}
			if (request.url?.includes('/.well-known/oauth-authorization-server') || request.url?.includes('/.well-known/openid-configuration')) {
				return mockResponse(200, { issuer: GITHUB_AUTHORIZATION_SERVER, token_endpoint: tokenEndpoint, response_types_supported: ['code'] });
			}
			if (request.url === tokenEndpoint) {
				exchangeRequests.push(request);
				return options.exchangeStatus && options.exchangeStatus !== 200
					? mockResponse(options.exchangeStatus, { error: 'invalid_grant' })
					: mockResponse(200, { access_token: 'exchanged-token', token_type: 'Bearer', expires_in: 3600 });
			}
			return request.headers?.Authorization === 'Bearer exchanged-token'
				? mockResponse(200, createGalleryManifest())
				: mockResponse(401, { message: 'authentication required' });
		};
	}

	test('GitHub — gated index exchanges the session token (RFC 8693) and becomes Available', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });
		stubGitHubSession();
		const exchangeRequests: IRequestOptions[] = [];
		requestHandler = gatedGitHubMarketplace(exchangeRequests);

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			token: await authorizationService.getAccessToken(MARKETPLACE_URL),
			exchanges: exchangeRequests.map(request => ({ type: request.type, followRedirects: request.followRedirects, body: Object.fromEntries(new URLSearchParams(request.data as string)) })),
		}, {
			status: ExtensionGalleryManifestStatus.Available,
			token: 'exchanged-token',
			exchanges: [{
				type: 'POST',
				followRedirects: 0,
				body: {
					grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
					subject_token: 'github-token',
					subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
					resource: 'https://marketplace.example.com',
					scope: 'marketplace.read',
				}
			}],
		});
	});

	test('GitHub — an index that is not gated needs no exchange', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });
		stubGitHubSession();
		const exchangeRequests: IRequestOptions[] = [];
		requestHandler = request => request.url?.includes('/oauth/') ? (exchangeRequests.push(request), mockResponse(500, {})) : mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.strictEqual(exchangeRequests.length, 0);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('GitHub — the session token is never sent to a token endpoint on another origin', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });
		stubGitHubSession();
		const exchangeRequests: IRequestOptions[] = [];
		requestHandler = gatedGitHubMarketplace(exchangeRequests, { tokenEndpoint: 'https://attacker.example.com/token' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(exchangeRequests.length, 0);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('GitHub — a rejected exchange asks to sign in without publishing a token', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });
		stubGitHubSession();
		requestHandler = gatedGitHubMarketplace([], { exchangeStatus: 400 });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('GitHub — no session token for the account → RequiresSignIn without an exchange', async () => {
		defaultAccount = createDefaultAccount({ enterprise: true });
		const exchangeRequests: IRequestOptions[] = [];
		requestHandler = gatedGitHubMarketplace(exchangeRequests);

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(exchangeRequests.length, 0);
	});
	test('Microsoft — follows an explicit resource metadata challenge', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		const resourceMetadataUrl = 'https://marketplace.example.com/auth/resource-metadata';
		let requestedMetadataUrl: string | undefined;
		requestHandler = options => {
			if (options.url === resourceMetadataUrl) {
				requestedMetadataUrl = options.url;
				return mockResponse(200, PROTECTED_RESOURCE_METADATA);
			}
			return options.headers?.Authorization === 'Bearer resource-token'
				? mockResponse(200, createGalleryManifest())
				: mockResponse(401, { message: 'authentication required' }, { 'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"` });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			requestedMetadataUrl,
		}, {
			status: ExtensionGalleryManifestStatus.Available,
			requestedMetadataUrl: resourceMetadataUrl,
		});
	});

	test('Microsoft — an index that accepts the sign-in token needs no negotiation', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		let wellKnownRequests = 0;
		requestHandler = options => {
			if (options.url?.includes('/.well-known/oauth-protected-resource')) {
				wellKnownRequests++;
			}
			return mockResponse(200, createGalleryManifest());
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		// Nothing gated the read, so the marketplace is never asked what a token for it looks like.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		assert.strictEqual(wellKnownRequests, 0);
		// The bearer the index accepted is the one carried forward.
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), 'signin-token');
	});

	test('Microsoft — gated index advertising no protected resource → RequiresSignIn without a token', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		// The index gates every read but publishes no metadata, so no token can be minted for it.
		requestHandler = gatedMarketplace('resource-token');

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('Microsoft — a marketplace that still refuses the negotiated identity asks to sign in, not an administrator', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		// The marketplace advertises its resource, but no resource-scoped session can be acquired
		// silently — the tenant has not consented yet, and the access check cannot prompt. That is
		// resolvable by signing in again, so it must not be reported as a denied account: the
		// access-denied view only says "contact your administrator" and offers no way to act.
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string, _scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions) {
				if (providerId !== 'microsoft' || options?.authorizationServer) {
					return [];
				}
				return microsoftSessions;
			}
			override async createSession() { return createMicrosoftSession(); }
		}());
		requestHandler = gatedMarketplace('resource-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('Microsoft — a rejected bearer is not retried or retained', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('rejected-token')];
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string, _scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions) {
				if (providerId !== 'microsoft') {
					return [];
				}
				return options?.authorizationServer ? [createMicrosoftSession('rejected-token')] : microsoftSessions;
			}
		}());
		requestHandler = gatedMarketplace('accepted-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			authorization: await authorizationService.getAccessToken(MARKETPLACE_URL),
		}, {
			status: ExtensionGalleryManifestStatus.RequiresSignIn,
			authorization: undefined,
		});
	});

	test('Microsoft — a negotiated bearer rejected on retry is retracted', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		requestHandler = options => options.url?.includes('/.well-known/oauth-protected-resource')
			? mockResponse(200, PROTECTED_RESOURCE_METADATA)
			: mockResponse(401, { message: 'authentication required' });

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.deepStrictEqual({
			status: service.extensionGalleryManifestStatus,
			authorization: await authorizationService.getAccessToken(MARKETPLACE_URL),
		}, {
			status: ExtensionGalleryManifestStatus.RequiresSignIn,
			authorization: undefined,
		});
	});

	test('Microsoft — stale authorization cleanup preserves the newer snapshot', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		const service = createService();
		await service.getExtensionGalleryManifest();

		const { authorizationRevision: previousRevision } = await accountService.resolveMarketplaceAccess(MARKETPLACE_URL);
		const { authorizationRevision: currentRevision } = await accountService.resolveMarketplaceAccess(MARKETPLACE_URL);
		assert.ok(previousRevision !== undefined && currentRevision !== undefined);

		await accountService.clearMarketplaceAuthorization(MARKETPLACE_URL, previousRevision);
		const afterStaleCleanup = await authorizationService.getAccessToken(MARKETPLACE_URL);
		await accountService.clearMarketplaceAuthorization(MARKETPLACE_URL, currentRevision);

		assert.deepStrictEqual({
			previousRevisionIsOlder: previousRevision < currentRevision,
			staleCleanupPreservesAuthorization: afterStaleCleanup === 'signin-token',
			currentCleanup: await authorizationService.getAccessToken(MARKETPLACE_URL),
		}, {
			previousRevisionIsOlder: true,
			staleCleanupPreservesAuthorization: true,
			currentCleanup: undefined,
		});
	});

	test('Microsoft — interactive sign-in consents to the discovered marketplace resource', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		const createdSessions: { readonly scopes: readonly string[]; readonly authorizationServer: string | undefined }[] = [];
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override async getSessions(providerId: string, _scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions) {
				if (providerId !== 'microsoft' || options?.authorizationServer) {
					return [];
				}
				return microsoftSessions;
			}
			override async getAccounts() {
				return microsoftSessions.map(session => session.account);
			}
			override async createSession(_providerId: string, scopeListOrRequest: readonly string[] | IAuthenticationWwwAuthenticateRequest, options?: IAuthenticationCreateSessionOptions) {
				createdSessions.push({
					scopes: Array.isArray(scopeListOrRequest) ? scopeListOrRequest : [],
					authorizationServer: options?.authorizationServer?.toString(true)
				});
				return createMicrosoftSession(options?.authorizationServer ? 'resource-token' : 'signin-token');
			}
		}());
		requestHandler = gatedMarketplace('resource-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();
		await accountService.signIn();

		assert.deepStrictEqual(createdSessions, [
			{ scopes: ['openid', 'profile', 'email', 'offline_access'], authorizationServer: undefined },
			{ scopes: ['api://marketplace.example.com/.default'], authorizationServer: 'https://login.example.com/common' },
		]);
	});

	test('Microsoft — sign-out retracts the published marketplace token', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		requestHandler = gatedMarketplace('resource-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), 'resource-token');

		// The account goes away; the marketplace is retracted and the bearer must not outlive it.
		microsoftSessions = [];
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
		assert.strictEqual(await authorizationService.getAccessToken(MARKETPLACE_URL), undefined);
	});

	test('Microsoft — the token is withheld from every origin but the marketplace', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession('signin-token')];
		stubResourceScopedAuthentication();
		requestHandler = gatedMarketplace('resource-token', PROTECTED_RESOURCE_METADATA);

		const service = createService();
		await service.getExtensionGalleryManifest();

		// An upstreamed extension's assets are served by the public marketplace, and a private
		// marketplace's bearer must never reach it.
		assert.strictEqual(await authorizationService.getAccessToken('https://marketplace.visualstudio.com/_apis/public/gallery/x.vsix'), undefined);
		// A neighbour sharing the parent domain is still a different origin.
		assert.strictEqual(await authorizationService.getAccessToken('https://assets.example.com/icon.png'), undefined);
		// Same host over cleartext must not carry it either.
		assert.strictEqual(await authorizationService.getAccessToken('http://marketplace.example.com/icon.png'), undefined);
		// Anything unparseable fails closed.
		assert.strictEqual(await authorizationService.getAccessToken('not a url'), undefined);
		// The marketplace's own origin still gets it, on any path.
		assert.strictEqual(await authorizationService.getAccessToken(`${MARKETPLACE_URL}/vscode/publisher/name/latest`), 'resource-token');
	});
});
