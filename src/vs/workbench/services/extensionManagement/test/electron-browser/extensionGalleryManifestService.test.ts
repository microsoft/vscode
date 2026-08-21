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
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../authentication/common/authentication.js';
import { IHostService } from '../../../host/browser/host.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { WorkbenchExtensionGalleryManifestService } from '../../electron-browser/extensionGalleryManifestService.js';
import { ExtensionGalleryAccountService, GitHubGalleryAccountProvider, MicrosoftGalleryAccountProvider } from '../../electron-browser/extensionGalleryAccountService.js';
import { IExtensionGalleryAccountService } from '../../common/extensionGalleryAccount.js';

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
		// Built here (not in setup) so the provider is chosen after each test sets the config;
		// registered to the store because it is injected, not owned by the manifest service.
		const accountService = disposableStore.add(instantiationService.createInstance(ExtensionGalleryAccountService));
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

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
	});

	test('Microsoft provider — manifest fetch fails → AccessDenied', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// Manifest discovery fails transiently (network error)
		requestHandler = () => { throw new Error('network down'); };

		const service = createService();
		await service.getExtensionGalleryManifest();

		// A configured marketplace whose manifest can't be fetched is reported as denied, as on main.
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.AccessDenied);
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

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
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
});
