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
import { ExtensionGalleryAccountService, IExtensionGalleryAccountService } from '../../electron-browser/extensionGalleryAccountService.js';

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
	let entraAuthEnabled: boolean;
	let telemetryService: RecordingTelemetryService;

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
		// Built here (not in setup) so the account service resolves the effective auth provider after
		// each test sets it; registered to the store because it is injected, not owned by the manifest.
		const accountService = disposableStore.add(instantiationService.createInstance(ExtensionGalleryAccountService));
		// Play the role of the production orchestrator (ExtensionGalleryAccountAuthenticationContribution),
		// which connects authentication post-startup to avoid a service DI cycle.
		accountService.connectAuthentication(instantiationService.get(IAuthenticationService));
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
		assert.strictEqual(JSON.parse(storageData.get('marketplace.cachedAccess')!).eligible, false);
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

	test('Microsoft provider — non-HTTPS service index URL → Misconfigured (no request issued)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		configurationService.setUserConfiguration(ExtensionGalleryServiceUrlConfigKey, 'http://marketplace.example.com');
		microsoftSessions = [createMicrosoftSession()];
		let requestIssued = false;
		requestHandler = () => {
			requestIssued = true;
			return mockResponse(200, createGalleryManifest());
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

	test('Microsoft provider — no session → stays RequiresSignIn even when the index would fail', async () => {
		// Pins the invariant that makes "not signed in" a stable, actionable state: with no session
		// the index is never probed, so a failing marketplace cannot turn RequiresSignIn into
		// Unreachable ("check your network connection") and strand the user without a sign-in
		// affordance. Covers the post-startup re-validation triggered when authentication connects.
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

	test('Microsoft provider — service index rejects the client (400) → AccessDenied, not Unreachable', async () => {
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

	test('Microsoft provider — auth-gated service index, session token presented → Available', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// The index is gated: it returns 401 for anonymous reads but 200 once a bearer token
		// is presented. This asserts the token is actually threaded into the manifest fetch.
		requestHandler = (options) => {
			const hasAuth = !!(options.headers && options.headers['Authorization']);
			return hasAuth
				? mockResponse(200, createGalleryManifest())
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
		// Two accounts signed in; the remembered choice is the second, so the first (`sessions[0]`)
		// must NOT be used. The bearer token threaded into the check — and hence the cached account —
		// proves the remembered account was selected.
		storageData.set('marketplace.account', JSON.stringify({ authProvider: 'microsoft', id: 'ms-account-2' }));
		microsoftSessions = [
			createMicrosoftSession('token-1', 'ms-account-1', 'ms-session-1'),
			createMicrosoftSession('token-2', 'ms-account-2', 'ms-session-2'),
		];
		let seenAuthHeader: string | string[] | undefined;
		requestHandler = (options) => {
			seenAuthHeader = options.headers?.['Authorization'];
			return mockResponse(200, createGalleryManifest());
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.Available);
		// The bearer carries the remembered account's token ('token-2'), never the first session's.
		assert.ok(typeof seenAuthHeader === 'string' && seenAuthHeader.includes('token-2') && !seenAuthHeader.includes('token-1'));
		assert.strictEqual(JSON.parse(storageData.get('marketplace.cachedAccess')!).accountId, 'ms-account-2');
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

	test('Microsoft provider — service index returns a non-manifest 200 → Unreachable (not a crash, not cached)', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		// A 200 whose JSON body has no `resources` array must be rejected — otherwise resource-URI
		// lookup throws on a non-iterable and escapes the fetch try/catch. It is a failed fetch, so it
		// surfaces Unreachable and is not cached.
		requestHandler = () => mockResponse(200, { error: 'not a manifest' });

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
		requestHandler = () => mockResponse(200, { version: '1.0.0', resources: [{}] });

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

	test('Microsoft provider — stale validation superseded by sign-out does not restore access', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];

		// Hold the index fetch open so the first validation parks mid-flight after it has already
		// read a valid, eligible session.
		let releaseIndex!: (v: IRequestContext) => void;
		const indexGate = new Promise<IRequestContext>(resolve => { releaseIndex = resolve; });
		requestHandler = () => indexGate;

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		// Let the first validation advance to the point where it awaits the index fetch.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The user signs out — this supersedes the in-flight validation (its token is cancelled).
		microsoftSessions = [];
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });

		// The superseding validation resolves to RequiresSignIn.
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);

		// The stale index fetch finally returns a valid manifest — it must be discarded.
		releaseIndex(mockResponse(200, createGalleryManifest()));
		await inflight.catch(() => { });
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(service.extensionGalleryManifestStatus, ExtensionGalleryManifestStatus.RequiresSignIn);
	});

	test('Microsoft provider — stale validation superseded by config change does not re-cache access', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));

		// Park the index fetch so the resolution is still in flight when the configuration changes.
		let releaseIndex!: (v: IRequestContext) => void;
		const indexGate = new Promise<IRequestContext>(resolve => { releaseIndex = resolve; });
		requestHandler = () => indexGate;

		const service = createService();
		const resolving = service.getExtensionGalleryManifest();

		// Let the resolution advance to the point where it awaits the index fetch.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The marketplace/auth-provider configuration changes — this clears the cache and asks
		// the user to restart (which they may decline). It must also supersede the in-flight
		// resolution so its late result cannot re-populate the cache we just cleared.
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true } as unknown as IConfigurationChangeEvent);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.ok(!storageData.has('marketplace.cachedAccess'));

		// The stale index fetch finally returns a valid manifest — it must be discarded and must
		// NOT re-write the cache.
		releaseIndex(mockResponse(200, createGalleryManifest()));
		await resolving;
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
		requestHandler = () => mockResponse(200, createGalleryManifest());

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
		requestHandler = () => mockResponse(200, createGalleryManifest());

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
		// The cache is applied with a cancellation guard while listeners are already active. If the
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
		requestHandler = () => indexGate;

		const service = createService();
		const inflight = service.getExtensionGalleryManifest();

		// Let cache application advance to the parked index fetch.
		await new Promise(resolve => setTimeout(resolve, 0));

		// The user signs out while the cached fetch is parked — this supersedes it.
		microsoftSessions = [];
		onDidChangeSessions.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		await new Promise(resolve => setTimeout(resolve, 0));

		// Release the stale cached index fetch; its manifest must be discarded, not applied.
		releaseIndex(mockResponse(200, createGalleryManifest()));
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

	test('Microsoft — server error (500), with cache → cache preserved', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		storageData.set('marketplace.cachedAccess', JSON.stringify({
			authProvider: 'microsoft',
			accountId: 'ms-account-1',
			eligible: true,
			serviceUrl: 'https://marketplace.example.com',
		}));
		// The cached fast-path materializes the index (first fetch → succeeds, Available). The
		// background re-validation's index fetch (second) fails transiently (500); a transient
		// failure must not downgrade the Available state nor invalidate the cache.
		let indexCalls = 0;
		requestHandler = () => {
			indexCalls++;
			return indexCalls === 1 ? mockResponse(200, createGalleryManifest()) : mockResponse(500, { error: 'Internal Server Error' });
		};

		const service = createService();
		await service.getExtensionGalleryManifest();
		// Let the background re-validation run and observe the 500.
		await new Promise(resolve => setTimeout(resolve, 0));

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
		requestHandler = () => mockResponse(200, createGalleryManifest());

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

	test('Microsoft — result is cached after successful check', async () => {
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		requestHandler = () => mockResponse(200, createGalleryManifest());

		const service = createService();
		await service.getExtensionGalleryManifest();

		const cached = storageData.get('marketplace.cachedAccess');
		assert.ok(cached);
		const parsed = JSON.parse(cached);
		assert.strictEqual(parsed.authProvider, 'microsoft');
		assert.strictEqual(parsed.eligible, true);
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
		// re-send the Authorization header to the redirect target). The token-bearing index
		// fetch must set followRedirects: 0.
		configurationService.setUserConfiguration(ExtensionGalleryAuthProviderConfigKey, 'microsoft');
		microsoftSessions = [createMicrosoftSession()];
		const seen: { followRedirects: number | undefined }[] = [];
		requestHandler = (options) => {
			seen.push({ followRedirects: options.followRedirects });
			return mockResponse(200, createGalleryManifest());
		};

		const service = createService();
		await service.getExtensionGalleryManifest();

		assert.ok(seen.length >= 1);
		assert.ok(seen.every(r => r.followRedirects === 0));
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
		requestHandler = () => mockResponse(200, createGalleryManifest());

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
