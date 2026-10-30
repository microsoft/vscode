/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { bufferToStream, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AuthenticationSession, IAuthenticationCreateSessionOptions, IAuthenticationGetSessionsOptions, IAuthenticationService, IAuthenticationWwwAuthenticateRequest } from '../../../authentication/common/authentication.js';
import { ExtensionGalleryAccountService, MicrosoftGalleryAccountProvider } from '../../electron-browser/extensionGalleryAccountService.js';

suite('MicrosoftGalleryAccountProvider - protected resource metadata', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const marketplaceUrl = 'https://marketplace.example.com';
	const metadataUrl = `${marketplaceUrl}/.well-known/oauth-protected-resource`;
	const otherMarketplaceUrl = `${marketplaceUrl}/other`;
	const authorizationServer = 'https://login.example.com/tenant';
	const signInScopes = ['openid', 'profile'];
	const resourceScopes = ['marketplace.read'];
	const cacheLifetime = 5 * 60 * 1000;
	const absenceLifetime = 30 * 1000;
	const session: AuthenticationSession = {
		id: 'session',
		accessToken: 'signin-token',
		account: { id: 'account', label: 'Account' },
		scopes: signInScopes,
		idToken: `e30.${encodeBase64(VSBuffer.fromString('{"tid":"work-tenant"}'))}.sig`,
	};

	let instantiationService: TestInstantiationService;
	let sessions: readonly AuthenticationSession[];
	let resourceToken: string;
	let resourceSessions: () => Promise<readonly AuthenticationSession[]>;
	let requestHandler: (options: IRequestOptions) => IRequestContext | Promise<IRequestContext>;
	let requests: IRequestOptions[];
	let createdSessions: { scopes: readonly string[]; authorizationServer: string | undefined }[];

	function response(body: object, statusCode = 200): IRequestContext {
		return { res: { headers: {}, statusCode }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))) };
	}

	function metadataResponse(resource = marketplaceUrl, server = authorizationServer): IRequestContext {
		return response({ resource, authorization_servers: [server], scopes_supported: resourceScopes });
	}

	function createProvider(): MicrosoftGalleryAccountProvider {
		return store.add(instantiationService.createInstance(MicrosoftGalleryAccountProvider));
	}

	setup(() => {
		sessions = [session];
		resourceToken = 'resource-token';
		resourceSessions = async () => [{ ...session, accessToken: resourceToken }];
		requestHandler = () => metadataResponse();
		requests = [];
		createdSessions = [];
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override async getSessions(_providerId: string, _scopes?: readonly string[], options?: IAuthenticationGetSessionsOptions) {
				return options?.authorizationServer ? resourceSessions() : sessions;
			}
			override async getAccounts() {
				return [session.account];
			}
			override async createSession(_providerId: string, scopes: readonly string[] | IAuthenticationWwwAuthenticateRequest, options?: IAuthenticationCreateSessionOptions) {
				createdSessions.push({ scopes: Array.isArray(scopes) ? scopes : [], authorizationServer: options?.authorizationServer?.toString(true) });
				return session;
			}
		}());
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { }());
		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				requests.push(options);
				return requestHandler(options);
			}
		}());
		instantiationService.stub(IProductService, {
			extensionsGallery: {
				serviceUrl: marketplaceUrl,
				controlUrl: '',
				extensionUrlTemplate: '',
				resourceUrlTemplate: '',
				nlsBaseUrl: '',
				accessScopes: signInScopes,
			},
		});
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(ITelemetryService, new NullTelemetryServiceShape());
		instantiationService.stub(ILogService, store.add(new NullLogService()));
	});

	test('reuses successful metadata without caching credentials', async () => {
		const provider = createProvider();
		const first = await provider.getAccount(marketplaceUrl);
		resourceToken = 'updated-resource-token';
		const second = await provider.getAccount(marketplaceUrl);

		assert.deepStrictEqual({ first: first?.accessToken, second: second?.accessToken, requests: requests.map(request => ({ url: request.url, authorization: request.headers?.Authorization })) }, {
			first: 'resource-token',
			second: 'updated-resource-token',
			requests: [{ url: metadataUrl, authorization: undefined }],
		});
	});

	test('coalesces concurrent metadata lookups', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const started = new DeferredPromise<void>();
		requestHandler = () => {
			started.complete();
			return pending.p;
		};
		const provider = createProvider();
		const accounts = Promise.all([provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl)]);
		await started.p;
		await pending.complete(metadataResponse());

		assert.deepStrictEqual({ accounts: (await accounts).map(account => account?.accessToken), requests: requests.length }, {
			accounts: Array.from({ length: 3 }, () => 'resource-token'),
			requests: 1,
		});
	});

	test('expires metadata five minutes after successful discovery, without extending on reads', () => runWithFakedTimers({}, async () => {
		requestHandler = async () => {
			await timeout(1000);
			return metadataResponse();
		};
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await timeout(cacheLifetime - 1);
		await provider.getAccount(marketplaceUrl);
		const beforeExpiration = requests.length;
		await timeout(1);
		await Promise.all([provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl)]);

		assert.deepStrictEqual({ beforeExpiration, afterExpiration: requests.length }, { beforeExpiration: 1, afterExpiration: 2 });
	}));

	for (const statuses of [[404, 404], [410, 410], [404, 410], [410, 404]]) {
		test(`caches confirmed absence after ${statuses.join(' and ')} from every endpoint`, async () => {
			requestHandler = options => response({}, statuses[options.url === `${metadataUrl}/other` ? 0 : 1]);
			const provider = createProvider();
			await Promise.all([provider.getAccount(otherMarketplaceUrl), provider.getAccount(otherMarketplaceUrl)]);
			requestHandler = () => metadataResponse(otherMarketplaceUrl);
			await provider.getAccount(otherMarketplaceUrl);

			assert.deepStrictEqual(requests.map(request => request.url), [`${metadataUrl}/other`, metadataUrl]);
		});
	}

	test('expires confirmed absence thirty seconds after completion without extending on reads', () => runWithFakedTimers({}, async () => {
		requestHandler = async () => {
			await timeout(1000);
			return response({}, 404);
		};
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		requestHandler = () => metadataResponse();
		await timeout(absenceLifetime - 1);
		await provider.getAccount(marketplaceUrl);
		const beforeExpiration = requests.length;
		await timeout(1);
		await Promise.all([provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl)]);
		await timeout(absenceLifetime);
		await provider.getAccount(marketplaceUrl);

		assert.deepStrictEqual({ beforeExpiration, afterExpiration: requests.length }, { beforeExpiration: 1, afterExpiration: 2 });
	}));

	test('coalesces pending absence discovery without caching an unfinished attempt', () => runWithFakedTimers({}, async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const started = new DeferredPromise<void>();
		requestHandler = options => {
			if (options.url === `${metadataUrl}/other`) {
				return response({}, 404);
			}
			started.complete();
			return pending.p;
		};
		const provider = createProvider();
		let settled = false;
		const accounts = Promise.all([provider.getAccount(otherMarketplaceUrl), provider.getAccount(otherMarketplaceUrl)]);
		accounts.then(() => settled = true);
		await started.p;
		await timeout(absenceLifetime + 1);
		const joinedAccount = provider.getAccount(otherMarketplaceUrl);
		const settledBeforeCompletion = settled;
		await pending.complete(response({}, 410));
		await Promise.all([accounts, joinedAccount]);
		requestHandler = () => metadataResponse(otherMarketplaceUrl);
		await provider.getAccount(otherMarketplaceUrl);

		assert.deepStrictEqual({ settledBeforeCompletion, requests: requests.map(request => request.url) }, {
			settledBeforeCompletion: false,
			requests: [`${metadataUrl}/other`, metadataUrl],
		});
	}));

	test('retries failures after an absence entry expires', () => runWithFakedTimers({}, async () => {
		requestHandler = () => response({}, 410);
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await timeout(absenceLifetime);
		requestHandler = () => response({}, 503);
		await provider.getAccount(marketplaceUrl);
		await provider.getAccount(marketplaceUrl);
		requestHandler = () => metadataResponse();
		await provider.getAccount(marketplaceUrl);
		await provider.getAccount(marketplaceUrl);

		assert.strictEqual(requests.length, 4);
	}));

	test('bypasses only confirmed absence during explicit sign-in', async () => {
		requestHandler = () => response({}, 404);
		resourceSessions = async () => [];
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		requestHandler = () => metadataResponse();
		await provider.getAccount(marketplaceUrl);
		const beforeSignIn = requests.length;
		await provider.signIn();
		await provider.signIn();

		assert.deepStrictEqual({ beforeSignIn, afterSignIn: requests.length, createdSessions }, {
			beforeSignIn: 1,
			afterSignIn: 2,
			createdSessions: [
				{ scopes: signInScopes, authorizationServer: undefined },
				{ scopes: resourceScopes, authorizationServer },
				{ scopes: signInScopes, authorizationServer: undefined },
				{ scopes: resourceScopes, authorizationServer },
			],
		});
	});

	test('coalesces concurrent explicit retries of confirmed absence', async () => {
		requestHandler = () => response({}, 410);
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		const pending = new DeferredPromise<IRequestContext>();
		const started = new DeferredPromise<void>();
		requestHandler = () => {
			started.complete();
			return pending.p;
		};
		const signIns = Promise.all([provider.signIn(), provider.signIn()]);
		await started.p;
		await pending.complete(metadataResponse());
		await signIns;

		assert.strictEqual(requests.length, 2);
	});

	test('invalidates confirmed absence when the full service URL changes', async () => {
		requestHandler = () => response({}, 404);
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		requestHandler = options => metadataResponse(options.url === metadataUrl ? marketplaceUrl : otherMarketplaceUrl);
		await provider.getAccount(otherMarketplaceUrl);
		await provider.getAccount(marketplaceUrl);

		assert.deepStrictEqual(requests.map(request => request.url), [metadataUrl, `${metadataUrl}/other`, metadataUrl]);
	});

	test('caches successful fallback metadata despite an earlier absent endpoint', () => runWithFakedTimers({}, async () => {
		requestHandler = options => options.url === metadataUrl ? metadataResponse() : response({}, 404);
		const provider = createProvider();
		await provider.getAccount(otherMarketplaceUrl);
		await timeout(absenceLifetime);
		await provider.getAccount(otherMarketplaceUrl);

		assert.deepStrictEqual(requests.map(request => request.url), [`${metadataUrl}/other`, metadataUrl]);
	}));

	test('does not classify a zero-attempt discovery failure as absence', async () => {
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Check the private result without exposing a test-only API.
		const result = await createProvider()['discoverProtectedResource']('not a URL');

		assert.deepStrictEqual({ result, requests: requests.length }, { result: undefined, requests: 0 });
	});

	for (const failure of [
		{ name: 'a network error', response: (): IRequestContext => { throw new Error('Network failed'); } },
		{ name: 'cancellation', response: (): IRequestContext => { throw new CancellationError(); } },
		{ name: 'a timeout', response: (): IRequestContext => { throw new Error('Request timed out'); } },
		{ name: 'malformed metadata', response: () => response({}) },
		{ name: 'metadata without an authorization server', response: () => response({ resource: marketplaceUrl }) },
		{ name: 'an invalid server list', response: () => response({ resource: marketplaceUrl, authorization_servers: authorizationServer }) },
		{ name: 'invalid scopes', response: () => response({ resource: marketplaceUrl, authorization_servers: [authorizationServer], scopes_supported: [42] }) },
		...[401, 403, 429, 500, 503].map(status => ({ name: `HTTP ${status}`, response: () => response({}, status) })),
	]) {
		for (const missingFirst of [true, false]) {
			test(`retries ${missingFirst ? 'absence followed by' : 'absence preceded by'} ${failure.name}`, async () => {
				requestHandler = options => (options.url === `${metadataUrl}/other`) === missingFirst
					? response({}, 404)
					: failure.response();
				const provider = createProvider();
				await Promise.all([provider.getAccount(otherMarketplaceUrl), provider.getAccount(otherMarketplaceUrl)]);
				requestHandler = () => metadataResponse(otherMarketplaceUrl);
				await provider.getAccount(otherMarketplaceUrl);
				await provider.getAccount(otherMarketplaceUrl);

				assert.deepStrictEqual(requests.map(request => request.url), [`${metadataUrl}/other`, metadataUrl, `${metadataUrl}/other`]);
			});
		}
	}

	for (const failure of [
		{ name: 'network failures', response: () => { throw new Error('Discovery failed'); } },
		{ name: 'cancelled discovery', response: () => { throw new CancellationError(); } },
		...[0, 401, 403, 429, 500, 503].map(status => ({ name: `HTTP ${status}`, response: () => response({}, status) })),
		{ name: 'invalid metadata', response: () => response({ resource: marketplaceUrl, scopes_supported: 'invalid' }) },
		{ name: 'metadata without an authorization server', response: () => response({ resource: marketplaceUrl }) },
		...[
			{ name: 'a string server list', metadata: { authorization_servers: authorizationServer } },
			{ name: 'an array-like server list', metadata: { authorization_servers: { 0: authorizationServer, length: 1 } } },
			{ name: 'a null server list', metadata: { authorization_servers: null } },
			{ name: 'an empty server list', metadata: { authorization_servers: [] } },
			{ name: 'a numeric server', metadata: { authorization_servers: [42] } },
			{ name: 'an object server', metadata: { authorization_servers: [{}] } },
			{ name: 'a null server after a valid server', metadata: { authorization_servers: [authorizationServer, null] } },
			{ name: 'an empty server', metadata: { authorization_servers: [''] } },
			{ name: 'a relative server', metadata: { authorization_servers: ['/tenant'] } },
			{ name: 'a scheme-relative server', metadata: { authorization_servers: ['//login.example.com/tenant'] } },
			{ name: 'an invalid server URL', metadata: { authorization_servers: ['https://[invalid]/tenant'] } },
			{ name: 'a server URL without authority delimiters', metadata: { authorization_servers: ['https:login.example.com/tenant'] } },
			{ name: 'a server URL with an empty authority', metadata: { authorization_servers: ['https:///login.example.com/tenant'] } },
			{ name: 'a server URL containing whitespace', metadata: { authorization_servers: [`${authorizationServer}\n`] } },
			{ name: 'a server URL containing a backslash', metadata: { authorization_servers: ['https://login.example.com\\tenant'] } },
			{ name: 'an insecure server', metadata: { authorization_servers: ['http://login.example.com/tenant'] } },
			{ name: 'a non-HTTPS server', metadata: { authorization_servers: ['mailto:login@example.com'] } },
			{ name: 'a server containing credentials', metadata: { authorization_servers: ['https://user:password@login.example.com/tenant'] } },
			{ name: 'a server containing a query', metadata: { authorization_servers: [`${authorizationServer}?tenant=other`] } },
			{ name: 'a server containing a fragment', metadata: { authorization_servers: [`${authorizationServer}#other`] } },
			{ name: 'null scopes', metadata: { scopes_supported: null } },
			{ name: 'a numeric scope', metadata: { scopes_supported: [42] } },
			{ name: 'an object scope', metadata: { scopes_supported: [{}] } },
			{ name: 'a null scope after a valid scope', metadata: { scopes_supported: [...resourceScopes, null] } },
			{ name: 'an empty scope', metadata: { scopes_supported: [''] } },
			{ name: 'a space-separated scope element', metadata: { scopes_supported: ['marketplace.read marketplace.write'] } },
			{ name: 'a scope ending in a newline', metadata: { scopes_supported: ['marketplace.read\n'] } },
			{ name: 'a scope containing a quote', metadata: { scopes_supported: ['marketplace."read'] } },
			{ name: 'a scope containing a backslash', metadata: { scopes_supported: ['marketplace.\\read'] } },
		].map(({ name, metadata }) => ({
			name: `metadata with ${name}`,
			response: () => response({ resource: marketplaceUrl, authorization_servers: [authorizationServer], scopes_supported: resourceScopes, ...metadata }),
		})),
	]) {
		test(`retries ${failure.name} instead of caching them`, async () => {
			let resourceLookups = 0;
			resourceSessions = async () => {
				resourceLookups++;
				return [{ ...session, accessToken: resourceToken }];
			};
			requestHandler = failure.response;
			const provider = createProvider();
			await Promise.all([provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl)]);
			const resourceLookupsBeforeCorrection = resourceLookups;
			requestHandler = () => metadataResponse();
			const account = await provider.getAccount(marketplaceUrl);
			await provider.getAccount(marketplaceUrl);

			assert.deepStrictEqual({ account: account?.accessToken, requests: requests.length, resourceLookupsBeforeCorrection }, {
				account: 'resource-token', requests: 2, resourceLookupsBeforeCorrection: 0,
			});
		});
	}

	test('retries malformed metadata before interactive consent once corrected', async () => {
		requestHandler = () => response({ resource: marketplaceUrl, authorization_servers: authorizationServer, scopes_supported: resourceScopes });
		resourceSessions = async () => [];
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await provider.signIn();
		const consentBeforeCorrection = [...createdSessions];
		requestHandler = () => metadataResponse();
		await provider.signIn();

		assert.deepStrictEqual({ requests: requests.length, consentBeforeCorrection, createdSessions }, {
			requests: 3,
			consentBeforeCorrection: [{ scopes: signInScopes, authorizationServer: undefined }],
			createdSessions: [
				{ scopes: signInScopes, authorizationServer: undefined },
				{ scopes: signInScopes, authorizationServer: undefined },
				{ scopes: resourceScopes, authorizationServer },
			],
		});
	});

	for (const { name, scopes } of [
		{ name: 'numeric', scopes: [42] },
		{ name: 'null', scopes: [null] },
		{ name: 'empty', scopes: [''] },
		{ name: 'whitespace', scopes: [' '] },
		{ name: 'space-separated', scopes: ['marketplace.read marketplace.write'] },
		{ name: 'control-character', scopes: ['marketplace.read\n'] },
		{ name: 'quoted', scopes: ['marketplace."read'] },
		{ name: 'backslash', scopes: ['marketplace.\\read'] },
	]) {
		test(`preserves the ${name} scope discovery reason without caching or resource acquisition`, async () => {
			requestHandler = () => response({ resource: marketplaceUrl, authorization_servers: [authorizationServer], scopes_supported: scopes });
			let resourceLookups = 0;
			resourceSessions = async () => {
				resourceLookups++;
				return [];
			};
			const provider = createProvider();
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Verify the private diagnostic without adding a public result field.
			const discovery = await provider['discoverProtectedResource'](marketplaceUrl);
			await Promise.all([provider.getAccount(marketplaceUrl), provider.getAccount(marketplaceUrl)]);
			await provider.signIn();
			const beforeCorrection = { requests: requests.length, resourceLookups, createdSessions: [...createdSessions] };
			requestHandler = () => metadataResponse();
			await provider.getAccount(marketplaceUrl);
			await provider.signIn();

			assert.deepStrictEqual({ discovery, beforeCorrection, requests: requests.length, resourceLookups, createdSessions }, {
				discovery: { authorizationServer, scopes: [], invalidScopes: true },
				beforeCorrection: {
					requests: 3,
					resourceLookups: 0,
					createdSessions: [{ scopes: signInScopes, authorizationServer: undefined }],
				},
				requests: 4,
				resourceLookups: 2,
				createdSessions: [
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes: resourceScopes, authorizationServer },
				],
			});
		});
	}

	test('validates the authority before preserving an invalid-scope reason', async () => {
		requestHandler = () => response({ resource: marketplaceUrl, authorization_servers: ['/tenant'], scopes_supported: [42] });
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Verify the private diagnostic never carries an unvalidated authority.
		const discovery = await createProvider()['discoverProtectedResource'](marketplaceUrl);

		assert.strictEqual(discovery, undefined);
	});

	for (const scopes of [['openid', 'profile', 'email', 'offline_access'], ['VSCODE_TENANT:tenant']]) {
		test(`preserves syntactically valid ${scopes[0]} scope metadata without an invalid-scope flag`, async () => {
			requestHandler = () => response({ resource: marketplaceUrl, authorization_servers: [authorizationServer], scopes_supported: scopes });
			// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Scope usability is separate from the private discovery syntax diagnostic.
			const discovery = await createProvider()['discoverProtectedResource'](marketplaceUrl);

			assert.deepStrictEqual(discovery, { authorizationServer, scopes });
		});
	}

	test('preserves Entra authority paths and hosts when caching metadata', async () => {
		const authorities = [
			'https://login.microsoftonline.com',
			'https://login.microsoftonline.com/common',
			'https://login.microsoftonline.com/organizations',
			'https://login.microsoftonline.com/72f988bf-86f1-41af-91ab-2d7cd011db47',
			'https://login.microsoftonline.com/tenant.onmicrosoft.com/oauth2/v2.0',
			'https://login.microsoftonline.us/tenant/v2.0',
			'https://login.chinacloudapi.cn/tenant/v2.0',
		];
		resourceSessions = async () => [];
		for (const authority of authorities) {
			requestHandler = () => metadataResponse(marketplaceUrl, authority);
			const provider = createProvider();
			await provider.getAccount(marketplaceUrl);
			await provider.signIn();
		}

		assert.deepStrictEqual({ requests: requests.length, authorities: createdSessions.filter(session => session.authorizationServer).map(session => session.authorizationServer) }, {
			requests: authorities.length,
			authorities: authorities.map(authority => new URL(authority).toString()),
		});
	});

	for (const scopes of [undefined, [], ['api://marketplace.example.com/.default', 'openid']]) {
		test(`preserves ${scopes === undefined ? 'omitted' : scopes.length ? 'resource' : 'empty'} scopes when caching metadata`, async () => {
			requestHandler = () => response({ resource: marketplaceUrl, authorization_servers: [authorizationServer], scopes_supported: scopes });
			resourceSessions = async () => [];
			const provider = createProvider();
			await provider.getAccount(marketplaceUrl);
			if (scopes?.length) {
				await provider.signIn();
			} else {
				await provider.getAccount(marketplaceUrl);
			}

			assert.deepStrictEqual({ requests: requests.length, createdSessions }, {
				requests: 1,
				createdSessions: scopes?.length ? [
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes, authorizationServer },
				] : [],
			});
		});
	}

	test('refreshes expired metadata before interactive consent', () => runWithFakedTimers({}, async () => {
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await timeout(cacheLifetime);
		requestHandler = () => metadataResponse(marketplaceUrl, 'https://login.example.com/updated');
		resourceSessions = async () => [];
		await provider.signIn();

		assert.deepStrictEqual({ requests: requests.length, createdSessions }, {
			requests: 2,
			createdSessions: [
				{ scopes: signInScopes, authorizationServer: undefined },
				{ scopes: resourceScopes, authorizationServer: 'https://login.example.com/updated' },
			],
		});
	}));

	test('does not consent using expired metadata after discovery fails', () => runWithFakedTimers({}, async () => {
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await timeout(cacheLifetime);
		requestHandler = () => response({}, 404);
		resourceSessions = async () => [];
		await provider.getAccount(marketplaceUrl);
		await provider.signIn();

		assert.deepStrictEqual({ requests: requests.length, createdSessions }, {
			requests: 3,
			createdSessions: [{ scopes: signInScopes, authorizationServer: undefined }],
		});
	}));

	test('invalidates metadata when the service URL changes, including its path', async () => {
		requestHandler = options => metadataResponse(options.url === metadataUrl ? marketplaceUrl : otherMarketplaceUrl);
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		await provider.getAccount(otherMarketplaceUrl);
		await provider.getAccount(marketplaceUrl);

		assert.deepStrictEqual(requests.map(request => request.url), [metadataUrl, `${metadataUrl}/other`, metadataUrl]);
	});

	for (const signedIn of [false, true]) {
		test(`ignores an old in-flight result after switching to a ${signedIn ? 'signed-in' : 'signed-out'} marketplace`, async () => {
			const pending = new DeferredPromise<IRequestContext>();
			const started = new DeferredPromise<void>();
			requestHandler = options => {
				if (options.url === metadataUrl) {
					started.complete();
					return pending.p;
				}
				return metadataResponse(otherMarketplaceUrl, 'https://login.example.com/other');
			};
			const provider = createProvider();
			const oldAccount = provider.getAccount(marketplaceUrl);
			await started.p;
			sessions = signedIn ? [session] : [];
			await provider.getAccount(otherMarketplaceUrl);
			await pending.complete(metadataResponse());
			await oldAccount;
			resourceSessions = async () => [];
			await provider.signIn();
			sessions = [session];
			await provider.getAccount(otherMarketplaceUrl);

			assert.deepStrictEqual({ requests: requests.map(request => request.url), createdSessions }, {
				requests: [metadataUrl, `${metadataUrl}/other`],
				createdSessions: [
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes: resourceScopes, authorizationServer: 'https://login.example.com/other' },
				],
			});
		});
	}

	for (const status of [200, 404, 410]) {
		test(`does not restore an old ${status} result after switching away and back to the same URL`, async () => {
			const pending = new DeferredPromise<IRequestContext>();
			const started = new DeferredPromise<void>();
			requestHandler = () => {
				started.complete();
				return pending.p;
			};
			const provider = createProvider();
			const oldAccount = provider.getAccount(marketplaceUrl);
			await started.p;
			sessions = [];
			await provider.getAccount(otherMarketplaceUrl);
			requestHandler = () => metadataResponse(marketplaceUrl, 'https://login.example.com/updated');
			sessions = [session];
			await provider.getAccount(marketplaceUrl);
			await pending.complete(status === 200 ? metadataResponse() : response({}, status));
			await oldAccount;
			resourceSessions = async () => [];
			await provider.signIn();

			assert.deepStrictEqual({ requests: requests.length, createdSessions }, {
				requests: 2,
				createdSessions: [
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes: resourceScopes, authorizationServer: 'https://login.example.com/updated' },
				],
			});
		});
	}

	for (const invalidate of ['URL change', 'expiration', 'metadata refresh', 'provider disposal']) {
		test(`does not prompt for stale consent after ${invalidate} during silent session lookup`, () => runWithFakedTimers({}, async () => {
			const provider = createProvider();
			await provider.getAccount(marketplaceUrl);
			const pending = new DeferredPromise<readonly AuthenticationSession[]>();
			const started = new DeferredPromise<void>();
			resourceSessions = () => {
				started.complete();
				return pending.p;
			};
			const signIn = provider.signIn();
			await started.p;
			if (invalidate === 'URL change') {
				sessions = [];
				await provider.getAccount(otherMarketplaceUrl);
			} else if (invalidate === 'expiration') {
				await timeout(cacheLifetime);
			} else if (invalidate === 'metadata refresh') {
				await timeout(cacheLifetime);
				requestHandler = () => metadataResponse(marketplaceUrl, 'https://login.example.com/updated');
				resourceSessions = async () => [];
				await provider.getAccount(marketplaceUrl);
			} else {
				provider.dispose();
			}
			await pending.complete([]);
			await signIn;

			assert.deepStrictEqual(createdSessions, [{ scopes: signInScopes, authorizationServer: undefined }]);
		}));
	}

	test('ignores discovery completed after the provider is disposed', async () => {
		const pending = new DeferredPromise<IRequestContext>();
		const started = new DeferredPromise<void>();
		requestHandler = () => {
			started.complete();
			return pending.p;
		};
		sessions = [];
		resourceSessions = async () => [];
		const provider = createProvider();
		await provider.getAccount(marketplaceUrl);
		const signIn = provider.signIn();
		await started.p;
		provider.dispose();
		await pending.complete(metadataResponse());
		await signIn;

		assert.deepStrictEqual(createdSessions, [{ scopes: signInScopes, authorizationServer: undefined }]);
	});

	for (const initiallyAbsent of [false, true]) {
		test(`does not share ${initiallyAbsent ? 'confirmed absence' : 'metadata'} with a replacement provider`, async () => {
			if (initiallyAbsent) {
				requestHandler = () => response({}, 404);
			}
			const accountService = store.add(instantiationService.createInstance(ExtensionGalleryAccountService));
			accountService.setAccountProvider(createProvider());
			await accountService.getAccount(marketplaceUrl);
			requestHandler = () => metadataResponse(marketplaceUrl, 'https://login.example.com/replacement');
			accountService.setAccountProvider(createProvider());
			await accountService.getAccount(marketplaceUrl);
			resourceSessions = async () => [];
			await accountService.signIn();

			assert.deepStrictEqual({ requests: requests.length, createdSessions }, {
				requests: 2,
				createdSessions: [
					{ scopes: signInScopes, authorizationServer: undefined },
					{ scopes: resourceScopes, authorizationServer: 'https://login.example.com/replacement' },
				],
			});
		});
	}
});
