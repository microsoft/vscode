/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { AuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationService } from '../../../services/authentication/browser/authenticationService.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { RPCProtocol } from '../../../services/extensions/common/rpcProtocol.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { TestEnvironmentService } from '../../../test/browser/workbenchTestServices.js';
import { TestExtensionService, TestProductService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ExtHostAuthenticationShape, ExtHostContext, MainContext, MainThreadAuthenticationShape } from '../../common/extHost.protocol.js';
import { ExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AuthenticationSession, IAuthenticationExtensionsService } from '../../../services/authentication/common/authentication.js';
import { Dto, Proxied } from '../../../services/extensions/common/proxyIdentifier.js';
import { MainThreadAuthentication, reviveAuthenticationSession } from '../../browser/mainThreadAuthentication.js';

suite('MainThreadAuthentication', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const iconComponents: UriComponents = { scheme: 'https', authority: 'example.com', path: '/avatar.png', query: '', fragment: '' };

	test('revives session URIs and preserves optional session fields', () => {
		const authorizationServer = URI.parse('https://enterprise.example.com/login/oauth');
		const withIcon: Dto<AuthenticationSession> = {
			id: 'session-with-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-with-icon', label: 'Has Icon', icon: iconComponents },
			authorizationServer: authorizationServer.toJSON(),
			idToken: 'id-token',
			expiresAfter: 3600
		};
		const withoutIcon: Dto<AuthenticationSession> = {
			id: 'session-without-icon',
			accessToken: 'token',
			scopes: ['scope'],
			account: { id: 'account-without-icon', label: 'No Icon' }
		};

		assert.deepStrictEqual(
			[reviveAuthenticationSession(withIcon), reviveAuthenticationSession(withoutIcon)],
			[
				{ ...withIcon, account: { ...withIcon.account, icon: URI.from(iconComponents) }, authorizationServer },
				{ ...withoutIcon, account: { ...withoutIcon.account, icon: undefined }, authorizationServer: undefined }
			]
		);
	});

	suite('provider lifecycle', () => {
		const authorizationServer = URI.parse('https://auth.example.com');
		const resourceServer = URI.parse('https://mcp.example.com');
		let authenticationService: AuthenticationService;

		setup(() => {
			const storageService = disposables.add(new TestStorageService());
			const accessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
			authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), accessService, TestEnvironmentService, new NullLogService()));
		});

		function createHost(sessionId: string, proxyOverrides: Partial<Proxied<ExtHostAuthenticationShape>> = {}, rpc?: RPCProtocol) {
			const unregistered: string[] = [];
			let clientRegistrationWrites = 0;
			let stopped = false;
			const proxy = upcastPartial<Proxied<ExtHostAuthenticationShape>>({
				$onDidChangeAuthenticationSessions: async () => { },
				$onDidUnregisterAuthenticationProvider: async id => { unregistered.push(id); },
				$getSessions: async () => {
					assert.strictEqual(stopped, false, 'must not use the stopped extension host');
					return [{ id: sessionId, accessToken: 'test-token', scopes: [], account: { id: 'account', label: 'Account' } }];
				},
				...proxyOverrides
			});
			const context = upcastPartial<IExtHostContext>({
				getProxy: rpc ? identifier => rpc.getProxy(identifier) : <T>() => proxy as unknown as Proxied<T>,
				extensionHostKind: ExtensionHostKind.LocalProcess
			});
			const dynamicStorage = upcastPartial<IDynamicAuthenticationProviderStorageService>({
				onDidChangeTokens: Event.None,
				storeClientRegistration: async () => { clientRegistrationWrites++; }
			});
			const mainThread = disposables.add(new MainThreadAuthentication(
				context, TestProductService, authenticationService,
				upcastPartial<IAuthenticationExtensionsService>({ onDidChangeAccountPreference: Event.None }),
				undefined!, undefined!, undefined!, undefined!, undefined!,
				upcastPartial<ITelemetryService>({ publicLog2: () => { } }), undefined!, new NullLogService(), undefined!,
				dynamicStorage, undefined!, undefined!, undefined!, undefined!
			));
			return {
				mainThread, proxy, unregistered,
				get clientRegistrationWrites() { return clientRegistrationWrites; },
				stop: () => { stopped = true; mainThread.dispose(); }
			};
		}

		function registerDynamicProvider(host: { mainThread: Pick<MainThreadAuthenticationShape, '$registerDynamicAuthenticationProvider'> }, id = 'dynamic-provider') {
			return host.mainThread.$registerDynamicAuthenticationProvider({
				id, label: id, supportsMultipleAccounts: true, clientId: 'test-client',
				authorizationServer: authorizationServer.toJSON(), resourceServer: resourceServer.toJSON()
			});
		}

		test('removes host-owned dynamic providers without changing persisted registration', async () => {
			const host = createHost('first-host');
			await registerDynamicProvider(host);
			assert.strictEqual(await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer), 'dynamic-provider');
			host.stop();
			assert.strictEqual(authenticationService.isAuthenticationProviderRegistered('dynamic-provider'), false);
			assert.strictEqual(await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer), undefined);
			assert.strictEqual(host.clientRegistrationWrites, 1);
			assert.deepStrictEqual(host.unregistered, []);
		});

		test('rediscovers the provider on a replacement host instead of reusing the stopped RPC', async () => {
			const first = createHost('first-host');
			await registerDynamicProvider(first);
			first.stop();
			const second = createHost('second-host');
			if (!await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer)) {
				await registerDynamicProvider(second);
			}
			assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'second-host');
		});

		test('rediscovers dynamic providers after RPC and customer disposal', async () => {
			function createRpcHost(sessionId: string) {
				const mainMessages = disposables.add(new Emitter<VSBuffer>());
				const extHostMessages = disposables.add(new Emitter<VSBuffer>());
				const mainRpc = disposables.add(new RPCProtocol({
					onMessage: mainMessages.event,
					send: message => { queueMicrotask(() => extHostMessages.fire(message)); }
				}));
				const extHostRpc = disposables.add(new RPCProtocol({
					onMessage: extHostMessages.event,
					send: message => { queueMicrotask(() => mainMessages.fire(message)); }
				}));
				const host = createHost(sessionId, {}, mainRpc);
				mainRpc.set(MainContext.MainThreadAuthentication, host.mainThread);
				extHostRpc.set(ExtHostContext.ExtHostAuthentication, host.proxy);
				return {
					mainThread: extHostRpc.getProxy(MainContext.MainThreadAuthentication),
					stop: () => {
						// Model ExtensionHostManager.dispose(): close RPC before disposing customers.
						mainRpc.dispose();
						host.stop();
						extHostRpc.dispose();
					}
				};
			}

			const first = createRpcHost('first-host');
			await registerDynamicProvider(first);
			const oldProvider = authenticationService.getProvider('dynamic-provider');
			assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'first-host');

			first.stop();
			// This is RPCProtocol's real cancellation, not a stopped-host test stub.
			await assert.rejects(oldProvider.getSessions(undefined, {}), isCancellationError);
			assert.strictEqual(await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer), undefined);

			const second = createRpcHost('second-host');
			await registerDynamicProvider(second);
			assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'second-host');
			second.stop();
		});

		test('keeps another host provider when one host is disposed', async () => {
			const first = createHost('first-host');
			const second = createHost('second-host');
			await registerDynamicProvider(first, 'first-provider');
			await registerDynamicProvider(second, 'second-provider');
			first.stop();
			assert.strictEqual(authenticationService.isAuthenticationProviderRegistered('first-provider'), false);
			assert.strictEqual((await authenticationService.getSessions('second-provider'))[0].id, 'second-host');
			assert.deepStrictEqual(second.unregistered, []);
		});

		for (const hadRegistration of [false, true]) {
			test(`does not remove another host provider with a pending registration RPC (${hadRegistration ? 'previous registration' : 'first registration'})`, async () => {
				const first = createHost('first-host');
				const registrationSent = new DeferredPromise<void>();
				const acceptRegistration = new DeferredPromise<void>();
				const registrationAccepted = new DeferredPromise<void>();
				const second = createHost('second-host', {
					$getSessions: (id, scopes) => extHost.$getSessions(id, scopes, {}),
					$onDidUnregisterAuthenticationProvider: id => extHost.$onDidUnregisterAuthenticationProvider(id)
				});
				if (hadRegistration) {
					await registerDynamicProvider(second);
				}
				await registerDynamicProvider(first);
				const mainThreadProxy = upcastPartial<Proxied<MainThreadAuthenticationShape>>({
					$registerAuthenticationProvider: async details => {
						await registrationSent.complete();
						await acceptRegistration.p;
						await second.mainThread.$registerAuthenticationProvider(details);
						await registrationAccepted.complete();
					},
					$unregisterAuthenticationProvider: id => second.mainThread.$unregisterAuthenticationProvider(id)
				});
				const extHost: ExtHostAuthentication = new ExtHostAuthentication(
					upcastPartial<IExtHostRpcService>({ getProxy: <T>() => mainThreadProxy as unknown as Proxied<T> }),
					undefined!, undefined!, undefined!, undefined!, undefined!, new NullLogService()
				);
				const registration = extHost.registerAuthenticationProvider('dynamic-provider', 'Dynamic provider', {
					onDidChangeSessions: Event.None,
					getSessions: async () => [{ id: 'second-host', accessToken: 'test-token', scopes: [], account: { id: 'account', label: 'Account' } }],
					createSession: async () => { throw new Error('Not needed in this test'); },
					removeSession: async () => { }
				});
				try {
					await registrationSent.p;
					first.stop();
					await acceptRegistration.complete();
					await registrationAccepted.p;
					assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'second-host');
					authenticationService.unregisterAuthenticationProvider('dynamic-provider');
					await assert.rejects(extHost.$getSessions('dynamic-provider', undefined, {}), /Unable to find authentication provider/);
				} finally {
					await acceptRegistration.complete();
					registration.dispose();
					await assert.rejects(extHost.$getSessions('dynamic-provider', undefined, {}), /Unable to find authentication provider/);
				}
			});
		}

		test('old-host disposal preserves a replacement with the same id', async () => {
			const first = createHost('first-host');
			const second = createHost('second-host');
			await registerDynamicProvider(first);
			authenticationService.unregisterAuthenticationProvider('dynamic-provider');
			await registerDynamicProvider(second);
			first.stop();
			assert.strictEqual(authenticationService.isAuthenticationProviderRegistered('dynamic-provider'), true);
			assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'second-host');
			assert.deepStrictEqual(second.unregistered, []);
		});

		test('old-host late unregister preserves a replacement with the same id', async () => {
			const first = createHost('first-host');
			const second = createHost('second-host');
			await registerDynamicProvider(first);
			authenticationService.unregisterAuthenticationProvider('dynamic-provider');
			await registerDynamicProvider(second);
			await first.mainThread.$unregisterAuthenticationProvider('dynamic-provider');
			first.stop();
			assert.strictEqual(authenticationService.isAuthenticationProviderRegistered('dynamic-provider'), true);
			assert.strictEqual((await authenticationService.getSessions('dynamic-provider'))[0].id, 'second-host');
			assert.deepStrictEqual(second.unregistered, []);
		});

		test('explicit unregister and re-register produce exactly one removal each', async () => {
			const owner = createHost('owner');
			const observer = createHost('observer');
			const events: string[] = [];
			disposables.add(authenticationService.onDidRegisterAuthenticationProvider(() => events.push('register')));
			disposables.add(authenticationService.onDidUnregisterAuthenticationProvider(() => events.push('unregister')));
			await registerDynamicProvider(owner);
			await owner.mainThread.$unregisterAuthenticationProvider('dynamic-provider');
			assert.deepStrictEqual(owner.unregistered, []);
			await registerDynamicProvider(owner);
			owner.stop();
			assert.deepStrictEqual(events, ['register', 'unregister', 'register', 'unregister']);
			assert.deepStrictEqual(observer.unregistered, []);
		});

		test('external unregister notifies the owning host but not other hosts', async () => {
			const owner = createHost('owner');
			const observer = createHost('observer');
			await registerDynamicProvider(owner);
			authenticationService.unregisterAuthenticationProvider('dynamic-provider');
			assert.deepStrictEqual(owner.unregistered, ['dynamic-provider']);
			assert.deepStrictEqual(observer.unregistered, []);
			await owner.mainThread.$unregisterAuthenticationProvider('dynamic-provider');
			assert.deepStrictEqual(owner.unregistered, ['dynamic-provider']);
		});

		test('same-host replacement continues forwarding session events', async () => {
			const owner = createHost('owner');
			await registerDynamicProvider(owner);
			const previous = authenticationService.getProvider('dynamic-provider');
			await registerDynamicProvider(owner);
			assert.notStrictEqual(authenticationService.getProvider('dynamic-provider'), previous);
			let changes = 0;
			disposables.add(authenticationService.onDidChangeSessions(() => changes++));
			await owner.mainThread.$sendDidChangeSessions('dynamic-provider', { added: [], changed: [], removed: [] });
			assert.strictEqual(changes, 1);
		});
	});

});
