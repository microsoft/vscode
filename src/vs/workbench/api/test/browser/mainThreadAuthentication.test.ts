/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

		function createHost(sessionId: string, rpc?: RPCProtocol) {
			const unregistered: string[] = [];
			let clientRegistrationWrites = 0;
			let stopped = false;
			const proxy = upcastPartial<Proxied<ExtHostAuthenticationShape>>({
				$onDidChangeAuthenticationSessions: async () => { },
				$onDidUnregisterAuthenticationProvider: async id => { unregistered.push(id); },
				$getSessions: async () => {
					assert.strictEqual(stopped, false, 'must not use the stopped extension host');
					return [{ id: sessionId, accessToken: 'test-token', scopes: [], account: { id: 'account', label: 'Account' } }];
				}
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
				mainThread, unregistered,
				get clientRegistrationWrites() { return clientRegistrationWrites; },
				stop: () => { stopped = true; mainThread.dispose(); }
			};
		}

		function registerDynamicProvider(host: { mainThread: Pick<MainThreadAuthenticationShape, '$registerDynamicAuthenticationProvider'> }) {
			return host.mainThread.$registerDynamicAuthenticationProvider({
				id: 'dynamic-provider', label: 'dynamic-provider', supportsMultipleAccounts: true, clientId: 'test-client',
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

		test('does not echo explicit provider unregistration to its owning host', async () => {
			const host = createHost('first-host');
			await registerDynamicProvider(host);
			await host.mainThread.$unregisterAuthenticationProvider('dynamic-provider');
			assert.strictEqual(authenticationService.isAuthenticationProviderRegistered('dynamic-provider'), false);
			assert.strictEqual(host.clientRegistrationWrites, 1);
			assert.deepStrictEqual(host.unregistered, []);
			host.stop();
			assert.deepStrictEqual(host.unregistered, []);
		});

		test('releases a registration when the provider is unregistered externally', async () => {
			const firstHost = createHost('first-host');
			await registerDynamicProvider(firstHost);
			authenticationService.unregisterAuthenticationProvider('dynamic-provider');
			assert.deepStrictEqual(firstHost.unregistered, ['dynamic-provider']);

			const secondHost = createHost('second-host');
			await registerDynamicProvider(secondHost);
			firstHost.stop();
			assert.deepStrictEqual(firstHost.unregistered, ['dynamic-provider']);
			assert.deepStrictEqual(secondHost.unregistered, []);
			const sessions = await authenticationService.getSessions('dynamic-provider');
			assert.strictEqual(sessions[0].id, 'second-host');
		});

		test('notifies other hosts when the owning host stops', async () => {
			const firstHost = createHost('first-host');
			const secondHost = createHost('second-host');
			await registerDynamicProvider(firstHost);
			firstHost.stop();
			assert.deepStrictEqual(firstHost.unregistered, []);
			assert.deepStrictEqual(secondHost.unregistered, ['dynamic-provider']);
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
				const host = createHost(sessionId, mainRpc);
				mainRpc.set(MainContext.MainThreadAuthentication, host.mainThread);
				extHostRpc.set(ExtHostContext.ExtHostAuthentication, upcastPartial<ExtHostAuthenticationShape>({
					$getSessions: async () => [{ id: sessionId, accessToken: 'test-token', scopes: [], account: { id: 'account', label: 'Account' } }]
				}));
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
	});

});
