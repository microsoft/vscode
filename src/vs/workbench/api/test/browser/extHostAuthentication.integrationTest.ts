/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { MainThreadAuthentication } from '../../browser/mainThreadAuthentication.js';
import { ExtHostContext, MainContext, MainThreadAuthenticationShape } from '../../common/extHost.protocol.js';
import { DynamicAuthProvider, ExtHostAuthentication } from '../../common/extHostAuthentication.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { AuthenticationService } from '../../../services/authentication/browser/authenticationService.js';
import { IAuthenticationExtensionsService, IAuthenticationProviderSessionOptions, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionService, nullExtensionDescription as extensionDescription } from '../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { TestEnvironmentService, TestHostService, TestQuickInputService, TestRemoteAgentService } from '../../../test/browser/workbenchTestServices.js';
import { TestActivityService, TestExtensionService, TestLoggerService, TestProductService, TestStorageService } from '../../../test/common/workbenchTestServices.js';
import type { AuthenticationConstraint, AuthenticationGetSessionOptions, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession } from 'vscode';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AuthenticationAccessService, IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { IAccountUsage, IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { AuthenticationExtensionsService } from '../../../services/authentication/browser/authenticationExtensionsService.js';
import { AuthenticationMcpService } from '../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpAccessService } from '../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpUsageService } from '../../../services/authentication/browser/authenticationMcpUsageService.js';
import { ILogger, ILoggerService, ILogService, NullLogger, NullLogService } from '../../../../platform/log/common/log.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { ExtHostWindow, IExtHostWindow } from '../../common/extHostWindow.js';
import { MainThreadWindow } from '../../browser/mainThreadWindow.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IUserActivityService, UserActivityService } from '../../../services/userActivity/common/userActivityService.js';
import { ExtHostUrls, IExtHostUrlsService } from '../../common/extHostUrls.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { TestSecretStorageService } from '../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { DynamicAuthenticationProviderStorageService } from '../../../services/authentication/browser/dynamicAuthenticationProviderStorageService.js';
import { ExtHostProgress, IExtHostProgress } from '../../common/extHostProgress.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Proxied } from '../../../services/extensions/common/proxyIdentifier.js';

class AuthQuickPick {
	private accept: ((e: IQuickPickDidAcceptEvent) => any) | undefined;
	private hide: ((e: IQuickInputHideEvent) => any) | undefined;
	public items: IQuickPickItem[] = [];

	constructor(private readonly selectedItemIndex = 0) { }

	public get selectedItems(): IQuickPickItem[] {
		const selected = this.items.at(this.selectedItemIndex);
		return selected ? [selected] : [];
	}

	onDidAccept(listener: (e: IQuickPickDidAcceptEvent) => any) {
		this.accept = listener;
	}
	onDidHide(listener: (e: IQuickInputHideEvent) => any) {
		this.hide = listener;
	}

	dispose() {

	}
	show() {
		this.accept?.({ inBackground: false });
		this.hide?.({ reason: QuickInputHideReason.Other });
	}
}
class AuthTestQuickInputService extends TestQuickInputService {
	selectedItemIndex = 0;

	override createQuickPick() {
		// eslint-disable-next-line local/code-no-any-casts
		return <any>new AuthQuickPick(this.selectedItemIndex);
	}
}

class TestAuthUsageService implements IAuthenticationUsageService {
	_serviceBrand: undefined;
	initializeExtensionUsageCache(): Promise<void> { return Promise.resolve(); }
	extensionUsesAuth(extensionId: string): Promise<boolean> { return Promise.resolve(false); }
	readAccountUsages(providerId: string, accountName: string): IAccountUsage[] { return []; }
	removeAccountUsage(providerId: string, accountName: string): void { }
	addAccountUsage(providerId: string, accountName: string, scopes: ReadonlyArray<string>, extensionId: string, extensionName: string): void { }
}

class TestAuthProvider implements AuthenticationProvider {
	private id = 1;
	private sessions = new Map<string, AuthenticationSession>();
	onDidChangeSessions = () => { return { dispose() { } }; };
	constructor(private readonly authProviderName: string) { }
	async getSessions(scopes?: readonly string[]): Promise<AuthenticationSession[]> {
		if (!scopes) {
			return [...this.sessions.values()];
		}

		if (scopes[0] === 'return multiple') {
			return [...this.sessions.values()];
		}
		const sessions = this.sessions.get(scopes.join(' '));
		return sessions ? [sessions] : [];
	}
	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		const scopesStr = scopes.join(' ');
		const session = {
			scopes,
			id: `${this.id}`,
			account: {
				label: this.authProviderName,
				id: `${this.id}`,
			},
			accessToken: Math.random() + '',
		};
		this.sessions.set(scopesStr, session);
		this.id++;
		return session;
	}
	async removeSession(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
	}

}

class ContextAuthProvider extends Disposable implements AuthenticationProvider {
	private readonly sessionChanges = this._register(new Emitter<AuthenticationProviderAuthenticationSessionsChangeEvent>());
	readonly onDidChangeSessions = this.sessionChanges.event;
	readonly requests: { operation: 'get' | 'create'; options: IAuthenticationProviderSessionOptions }[] = [];
	private readonly sessions: { session: AuthenticationSession; context: string }[] = [];
	private nextSessionId = 1;

	private contextKey(options: IAuthenticationProviderSessionOptions): string {
		return JSON.stringify([options.authorizationServer?.toString(true), options.clientId, options.resource, options.audience]);
	}

	async getSessions(scopes: readonly string[] | undefined, options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession[]> {
		this.requests.push({ operation: 'get', options });
		return this.sessions
			.filter(entry => (!options.account || entry.session.account.id === options.account.id)
				&& (!scopes || (entry.context === this.contextKey(options) && scopes.every(scope => entry.session.scopes.includes(scope)))))
			.map(entry => entry.session);
	}

	async createSession(scopes: readonly string[], options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession> {
		this.requests.push({ operation: 'create', options });
		const id = `session-${this.nextSessionId++}`;
		const session: AuthenticationSession = {
			id,
			accessToken: `token-${id}`,
			account: options.account ?? { id: 'context-account', label: 'Context Account' },
			scopes: [...scopes]
		};
		this.sessions.push({ session, context: this.contextKey(options) });
		this.sessionChanges.fire({ added: [session], removed: [], changed: [] });
		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		const index = this.sessions.findIndex(entry => entry.session.id === sessionId);
		assert.notStrictEqual(index, -1);
		const [removed] = this.sessions.splice(index, 1);
		this.sessionChanges.fire({ added: [], removed: [removed.session], changed: [] });
	}
}

suite('ExtHostAuthentication', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let extHostAuthentication: ExtHostAuthentication;
	let mainInstantiationService: TestInstantiationService;

	setup(async () => {
		// services
		const services = new ServiceCollection();
		services.set(ILogService, new SyncDescriptor(NullLogService));
		services.set(IDialogService, new SyncDescriptor(TestDialogService, [{ confirmed: true }]));
		services.set(IStorageService, new SyncDescriptor(TestStorageService));
		services.set(ISecretStorageService, new SyncDescriptor(TestSecretStorageService));
		services.set(IDynamicAuthenticationProviderStorageService, new SyncDescriptor(DynamicAuthenticationProviderStorageService));
		services.set(IQuickInputService, new SyncDescriptor(AuthTestQuickInputService));
		services.set(IExtensionService, new SyncDescriptor(TestExtensionService));
		services.set(IActivityService, new SyncDescriptor(TestActivityService));
		services.set(IRemoteAgentService, new SyncDescriptor(TestRemoteAgentService));
		services.set(INotificationService, new SyncDescriptor(TestNotificationService));
		services.set(IHostService, new SyncDescriptor(TestHostService));
		services.set(IUserActivityService, new SyncDescriptor(UserActivityService));
		services.set(IAuthenticationAccessService, new SyncDescriptor(AuthenticationAccessService));
		services.set(IAuthenticationService, new SyncDescriptor(AuthenticationService));
		services.set(IAuthenticationUsageService, new SyncDescriptor(TestAuthUsageService));
		services.set(IAuthenticationExtensionsService, new SyncDescriptor(AuthenticationExtensionsService));
		mainInstantiationService = disposables.add(new TestInstantiationService(services, undefined, undefined, true));

		// stubs
		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		mainInstantiationService.stub(IOpenerService, {} as Partial<IOpenerService>);
		mainInstantiationService.stub(ITelemetryService, NullTelemetryService);
		mainInstantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
		mainInstantiationService.stub(IProductService, TestProductService);

		const rpcProtocol = disposables.add(new TestRPCProtocol());

		rpcProtocol.set(MainContext.MainThreadAuthentication, disposables.add(mainInstantiationService.createInstance(MainThreadAuthentication, rpcProtocol)));
		rpcProtocol.set(MainContext.MainThreadWindow, disposables.add(mainInstantiationService.createInstance(MainThreadWindow, rpcProtocol)));
		// eslint-disable-next-line local/code-no-any-casts
		const initData: IExtHostInitDataService = {
			environment: {
				appUriScheme: 'test',
				appName: 'Test'
			}
		} as any;
		extHostAuthentication = new ExtHostAuthentication(
			rpcProtocol,
			// eslint-disable-next-line local/code-no-any-casts
			{
				environment: {
					appUriScheme: 'test',
					appName: 'Test'
				}
			} as any,
			new ExtHostWindow(initData, rpcProtocol),
			new ExtHostUrls(rpcProtocol),
			new ExtHostProgress(rpcProtocol),
			disposables.add(new TestLoggerService()),
			new NullLogService()
		);
		rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
		disposables.add(extHostAuthentication.registerAuthenticationProvider('test', 'test provider', new TestAuthProvider('test')));
		disposables.add(extHostAuthentication.registerAuthenticationProvider(
			'test-multiple',
			'test multiple provider',
			new TestAuthProvider('test-multiple'),
			{ supportsMultipleAccounts: true }));
	});

	suite('request context', () => {
		const registrations: { id: string; disposable: IDisposable }[] = [];
		const authorizationServer = URI.parse('https://issuer.example/tenant-a');
		const otherAuthorizationServer = URI.parse('https://issuer.example/tenant-b');
		const context = {
			authorizationServer,
			clientId: 'client-a',
			resource: 'https://resource.example/a',
			audience: 'audience-a'
		};

		function registerProvider(id: string, provider: AuthenticationProvider, supportsMultipleAccounts = false, supportsChallenges = false): void {
			const disposable = disposables.add(extHostAuthentication.registerAuthenticationProvider(id, id, provider, {
				supportsMultipleAccounts,
				supportsChallenges,
				supportedAuthorizationServers: [authorizationServer, otherAuthorizationServer]
			}));
			registrations.push({ id, disposable });
		}

		teardown(async () => {
			for (const { id, disposable } of registrations.splice(0)) {
				disposable.dispose();
				await extHostAuthentication.$onDidUnregisterAuthenticationProvider(id);
			}
		});

		function getRequests(providerId: string, group: string): string[] {
			return MenuRegistry.getMenuItems(MenuId.AccountsContext)
				.filter(isIMenuItem)
				.filter(item => item.group === group && item.command.id.startsWith(providerId))
				.map(item => item.command.id);
		}

		async function runRequest(commandId: string): Promise<void> {
			const command = CommandsRegistry.getCommand(commandId);
			assert.ok(command);
			await mainInstantiationService.invokeFunction(command.handler);
		}

		const distinctContexts: { name: string; first: AuthenticationGetSessionOptions; second: AuthenticationGetSessionOptions }[] = [
			{ name: 'resource', first: { resource: 'https://resource.example/a' }, second: { resource: 'https://resource.example/b' } },
			{ name: 'client ID', first: { clientId: 'client-a' }, second: { clientId: 'client-b' } },
			{ name: 'audience', first: { audience: 'audience-a' }, second: { audience: 'audience-b' } },
			{ name: 'authorization server', first: { authorizationServer }, second: { authorizationServer: otherAuthorizationServer } },
			{ name: 'account', first: { account: { id: 'account-a', label: 'Account' } }, second: { account: { id: 'account-b', label: 'Account' } } }
		];

		for (const { name, first, second } of distinctContexts) {
			test(`does not coalesce requests for different ${name} values`, async () => {
				const provider = disposables.add(new ContextAuthProvider());
				registerProvider('context-provider', provider);

				await Promise.all([
					extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...first, silent: true }),
					extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...second, silent: true })
				]);

				assert.strictEqual(provider.requests.length, 2);
			});
		}

		test('coalesces equivalent requests regardless of scope and option property order', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);

			await Promise.all([
				extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read', 'write'], { ...context, silent: true }),
				extHostAuthentication.getSession(extensionDescription, 'context-provider', ['write', 'read'], {
					silent: true, audience: context.audience, resource: context.resource, clientId: context.clientId, authorizationServer
				})
			]);

			assert.strictEqual(provider.requests.length, 1);
		});

		test('does not conflate opaque scope strings with separate scopes', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);

			await Promise.all([
				extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read write'], { silent: true }),
				extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read', 'write'], { silent: true })
			]);

			assert.strictEqual(provider.requests.length, 2);
		});

		for (const mode of ['createIfNone', 'forceNewSession'] as const) {
			test(`forwards context through lookup and ${mode}`, async () => {
				const provider = disposables.add(new ContextAuthProvider());
				registerProvider('context-provider', provider);
				const account = { id: 'selected-account', label: 'Selected Account' };

				await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], {
					...context, account, [mode]: true
				});

				assert.deepStrictEqual(provider.requests.map(({ operation, options }) => ({
					operation,
					authorizationServer: options.authorizationServer?.toString(true),
					clientId: options.clientId,
					resource: options.resource,
					audience: options.audience,
					accountId: options.account?.id,
					silent: options.silent,
					createIfNone: options.createIfNone,
					forceNewSession: options.forceNewSession
				})), ['get', 'create'].map(operation => ({
					operation,
					authorizationServer: authorizationServer.toString(true),
					clientId: context.clientId,
					resource: context.resource,
					audience: context.audience,
					accountId: account.id,
					silent: operation === 'get' ? false : undefined,
					createIfNone: undefined,
					forceNewSession: undefined
				})));
			});
		}

		test('retains context when selecting a new account', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			await provider.createSession(['read'], context);
			provider.requests.length = 0;
			registerProvider('context-provider', provider, true);
			const quickInput = mainInstantiationService.get(IQuickInputService);
			assert.ok(quickInput instanceof AuthTestQuickInputService);
			quickInput.selectedItemIndex = -1;

			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, createIfNone: true });

			const creates = provider.requests.filter(request => request.operation === 'create');
			assert.deepStrictEqual(creates.map(({ options }) => [options.authorizationServer?.toString(true), options.clientId, options.resource, options.audience]), [
				[authorizationServer.toString(true), context.clientId, context.resource, context.audience]
			]);
		});

		test('forwards context through challenge lookup and creation', async () => {
			const constraints: AuthenticationConstraint[] = [];
			const provider = disposables.add(new class extends ContextAuthProvider {
				async getSessionsFromChallenges(constraint: AuthenticationConstraint, options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession[]> {
					constraints.push(constraint);
					return this.getSessions(constraint.fallbackScopes, options);
				}

				async createSessionFromChallenges(constraint: AuthenticationConstraint, options: IAuthenticationProviderSessionOptions): Promise<AuthenticationSession> {
					constraints.push(constraint);
					return this.createSession([...(constraint.fallbackScopes ?? [])], options);
				}
			}());
			registerProvider('context-provider', provider, false, true);

			await extHostAuthentication.getSession(extensionDescription, 'context-provider', {
				wwwAuthenticate: 'Bearer realm="resource"',
				fallbackScopes: ['read']
			}, { ...context, createIfNone: true });

			assert.deepStrictEqual({
				constraints,
				contexts: provider.requests.map(({ operation, options }) => [operation, options.authorizationServer?.toString(true), options.clientId, options.resource, options.audience])
			}, {
				constraints: [
					{ challenges: [{ scheme: 'Bearer', params: { realm: 'resource' } }], fallbackScopes: ['read'] },
					{ challenges: [{ scheme: 'Bearer', params: { realm: 'resource' } }], fallbackScopes: ['read'] }
				],
				contexts: ['get', 'create'].map(operation => [operation, authorizationServer.toString(true), context.clientId, context.resource, context.audience])
			});
		});

		test('rejects incompatible interaction options before calling the provider', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);

			await assert.rejects(
				() => extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, silent: true, createIfNone: true }),
				/Invalid combination of options/
			);

			assert.deepStrictEqual(provider.requests, []);
		});

		test('keeps deferred sign-in requests for different resources separate', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, resource: 'https://resource.example/b' });

			const requests = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(requests.length, 2);
			await runRequest(requests[0]);
			assert.deepStrictEqual(getRequests('context-provider', '2_signInRequests'), [requests[1]]);
			await runRequest(requests[1]);

			assert.deepStrictEqual({
				createdResources: provider.requests.filter(request => request.operation === 'create').map(request => request.options.resource),
				pending: getRequests('context-provider', '2_signInRequests')
			}, {
				createdResources: [context.resource, 'https://resource.example/b'],
				pending: []
			});
		});

		test('keeps a default-context request when only a resource-bound session exists', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			const boundSession = await provider.createSession(['read'], context);
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], {});
			const pending = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(pending.length, 1);

			await mainInstantiationService.get(IAuthenticationExtensionsService).updateNewSessionRequests('context-provider', [boundSession]);

			assert.deepStrictEqual(getRequests('context-provider', '2_signInRequests'), pending);
		});

		test('queued revalidation cannot acquire a replacement provider request', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			const extensionsService = mainInstantiationService.get(IAuthenticationExtensionsService);
			const authenticationService = mainInstantiationService.get(IAuthenticationService);
			const lookupStarted = new DeferredPromise<void>();
			const lookupResult = new DeferredPromise<readonly AuthenticationSession[]>();
			disposables.add(toDisposable(() => lookupResult.complete([])));
			let lookups = 0;
			authenticationService.getSessions = async () => {
				lookups++;
				lookupStarted.complete();
				return lookupResult.p;
			};
			const session: AuthenticationSession = {
				id: 'session', accessToken: 'token', account: { id: 'account', label: 'Account' }, scopes: ['read']
			};
			const firstUpdate = extensionsService.updateNewSessionRequests('context-provider', [session]);
			await lookupStarted.p;
			const queuedUpdate = extensionsService.updateNewSessionRequests('context-provider', [session]);

			authenticationService.unregisterAuthenticationProvider('context-provider');
			await extHostAuthentication.$onDidUnregisterAuthenticationProvider('context-provider');
			registerProvider('context-provider', disposables.add(new ContextAuthProvider()));
			await extHostAuthentication.$getSessions('context-provider', undefined, {});
			await extensionsService.requestNewSession('context-provider', ['read'], 'replacement-extension', 'Replacement Extension', context);
			const pending = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(pending.length, 1);
			lookupResult.complete([session]);
			await Promise.all([firstUpdate, queuedUpdate]);

			assert.deepStrictEqual({
				lookups,
				pending: getRequests('context-provider', '2_signInRequests')
			}, { lookups: 1, pending });
		});

		for (const invalidate of ['unregister', 'dispose'] as const) {
			test(`stops revalidating contexts after ${invalidate}`, async () => {
				const provider = disposables.add(new ContextAuthProvider());
				registerProvider('context-provider', provider);
				await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
				await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, resource: 'https://resource.example/b' });
				const extensionsService = mainInstantiationService.get(IAuthenticationExtensionsService);
				const authenticationService = mainInstantiationService.get(IAuthenticationService);
				const lookupStarted = new DeferredPromise<void>();
				const lookupResult = new DeferredPromise<readonly AuthenticationSession[]>();
				disposables.add(toDisposable(() => lookupResult.complete([])));
				let lookups = 0;
				authenticationService.getSessions = async () => {
					lookups++;
					lookupStarted.complete();
					return lookupResult.p;
				};
				const session: AuthenticationSession = {
					id: 'session', accessToken: 'token', account: { id: 'account', label: 'Account' }, scopes: ['read']
				};
				const update = extensionsService.updateNewSessionRequests('context-provider', [session]);
				await lookupStarted.p;

				if (invalidate === 'unregister') {
					authenticationService.unregisterAuthenticationProvider('context-provider');
				} else {
					assert.ok(extensionsService instanceof AuthenticationExtensionsService);
					extensionsService.dispose();
				}
				lookupResult.complete([session]);
				await update;

				assert.deepStrictEqual({ lookups, pending: getRequests('context-provider', '2_signInRequests') }, { lookups: 1, pending: [] });
			});
		}

		test('completes requests for extensions joining an in-flight revalidation', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);
			await extHostAuthentication.$getSessions('context-provider', undefined, {});
			const extensionsService = mainInstantiationService.get(IAuthenticationExtensionsService);
			await extensionsService.requestNewSession('context-provider', ['read'], 'first-extension', 'First Extension', context);
			const lookupStarted = new DeferredPromise<void>();
			const lookupResult = new DeferredPromise<readonly AuthenticationSession[]>();
			disposables.add(toDisposable(() => lookupResult.complete([])));
			mainInstantiationService.get(IAuthenticationService).getSessions = async () => {
				lookupStarted.complete();
				return lookupResult.p;
			};
			const session: AuthenticationSession = {
				id: 'session', accessToken: 'token', account: { id: 'account', label: 'Account' }, scopes: ['read']
			};
			const update = extensionsService.updateNewSessionRequests('context-provider', [session]);
			await lookupStarted.p;
			await extensionsService.requestNewSession('context-provider', ['read'], 'second-extension', 'Second Extension', context);
			assert.strictEqual(getRequests('context-provider', '2_signInRequests').length, 2);

			lookupResult.complete([session]);
			await update;

			assert.deepStrictEqual(getRequests('context-provider', '2_signInRequests'), []);
		});

		test('completes an Accounts-menu sign-in while another context lookup is pending', async () => {
			const lookupStarted = new DeferredPromise<void>();
			const lookupResult = new DeferredPromise<void>();
			disposables.add(toDisposable(() => lookupResult.complete()));
			const otherResource = 'https://resource.example/b';
			const provider = disposables.add(new class extends ContextAuthProvider {
				holdLookups = false;

				override async getSessions(scopes: readonly string[] | undefined, options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession[]> {
					if (this.holdLookups && options.resource === otherResource) {
						lookupStarted.complete();
						await lookupResult.p;
					}
					return super.getSessions(scopes, options);
				}
			}());
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, resource: otherResource });
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			const requests = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(requests.length, 2);
			provider.holdLookups = true;

			const command = runRequest(requests[1]);
			await lookupStarted.p;
			await command;

			assert.deepStrictEqual(getRequests('context-provider', '2_signInRequests'), [requests[0]]);
			lookupResult.complete();
		});

		test('retains context when granting deferred access with a new account', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			await provider.createSession(['read'], context);
			provider.requests.length = 0;
			registerProvider('context-provider', provider, true);
			const quickInput = mainInstantiationService.get(IQuickInputService);
			assert.ok(quickInput instanceof AuthTestQuickInputService);
			quickInput.selectedItemIndex = -1;

			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			const requests = getRequests('context-provider', '3_accessRequests');
			assert.strictEqual(requests.length, 1);
			await runRequest(requests[0]);

			assert.deepStrictEqual({
				createdContexts: provider.requests.filter(request => request.operation === 'create').map(({ options }) => [
					options.authorizationServer?.toString(true), options.clientId, options.resource, options.audience
				]),
				pending: getRequests('context-provider', '3_accessRequests')
			}, {
				createdContexts: [[authorizationServer.toString(true), context.clientId, context.resource, context.audience]],
				pending: []
			});
		});

		test('retains context when selecting a new MCP account', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			const existing = await provider.createSession(['read'], context);
			registerProvider('context-provider', provider, true);
			await extHostAuthentication.$getSessions('context-provider', undefined, {});
			mainInstantiationService.stub(IAuthenticationMcpAccessService, new class extends mock<IAuthenticationMcpAccessService>() {
				override updateAllowedMcpServers(): void { }
			}());
			mainInstantiationService.stub(IAuthenticationMcpUsageService, new class extends mock<IAuthenticationMcpUsageService>() { }());
			const mcpAuthentication = disposables.add(mainInstantiationService.createInstance(AuthenticationMcpService));
			const quickInput = mainInstantiationService.get(IQuickInputService);
			assert.ok(quickInput instanceof AuthTestQuickInputService);
			quickInput.selectedItemIndex = -1;
			provider.requests.length = 0;

			await mcpAuthentication.selectSession('context-provider', 'mcp-server', 'MCP Server', ['read'], [existing], context);

			assert.deepStrictEqual(provider.requests.filter(request => request.operation === 'create').map(({ options }) => [
				options.authorizationServer?.toString(true), options.clientId, options.resource, options.audience
			]), [
				[authorizationServer.toString(true), context.clientId, context.resource, context.audience]
			]);
		});

		test('account-wide consent clears access requests but preserves another resource sign-in', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			const otherContext = { ...context, resource: 'https://resource.example/b' };
			await provider.createSession(['read'], context);
			await provider.createSession(['read'], otherContext);
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], otherContext);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, resource: 'https://resource.example/c' });

			const accessRequests = getRequests('context-provider', '3_accessRequests');
			const signInRequests = getRequests('context-provider', '2_signInRequests');
			assert.deepStrictEqual([accessRequests.length, signInRequests.length], [2, 1]);
			await runRequest(accessRequests[0]);

			assert.deepStrictEqual({
				access: getRequests('context-provider', '3_accessRequests'),
				signIn: getRequests('context-provider', '2_signInRequests')
			}, {
				access: [],
				signIn: signInRequests
			});
		});

		test('surfaces provider failures from deferred account selection', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			await provider.createSession(['read'], context);
			registerProvider('context-provider', provider, true);
			const quickInput = mainInstantiationService.get(IQuickInputService);
			assert.ok(quickInput instanceof AuthTestQuickInputService);
			quickInput.selectedItemIndex = -1;
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);
			const requests = getRequests('context-provider', '3_accessRequests');
			assert.strictEqual(requests.length, 1);
			provider.createSession = async () => {
				throw new Error('Account creation failed');
			};

			await assert.rejects(() => runRequest(requests[0]), /Account creation failed/);
			assert.deepStrictEqual(getRequests('context-provider', '3_accessRequests'), requests);
		});

		test('removes deferred requests when their provider is unregistered', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], context);

			const requests = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(requests.length, 1);
			mainInstantiationService.get(IAuthenticationService).unregisterAuthenticationProvider('context-provider');

			assert.deepStrictEqual({
				pending: getRequests('context-provider', '2_signInRequests'),
				command: CommandsRegistry.getCommand(requests[0])
			}, {
				pending: [],
				command: undefined
			});
		});

		test('an unrelated deferred lookup failure does not fail a completed sign-in', async () => {
			const otherResource = 'https://resource.example/b';
			const provider = disposables.add(new class extends ContextAuthProvider {
				failLookup = false;

				override async getSessions(scopes: readonly string[] | undefined, options: IAuthenticationProviderSessionOptions = {}): Promise<AuthenticationSession[]> {
					if (this.failLookup && options.resource === otherResource) {
						throw new Error('Resource B is temporarily unavailable');
					}
					return super.getSessions(scopes, options);
				}
			}());
			registerProvider('context-provider', provider);
			await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, resource: otherResource });
			const pending = getRequests('context-provider', '2_signInRequests');
			assert.strictEqual(pending.length, 1);
			provider.failLookup = true;

			const session = await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, createIfNone: true });

			assert.deepStrictEqual({
				accessToken: session.accessToken,
				pending: getRequests('context-provider', '2_signInRequests')
			}, {
				accessToken: 'token-session-1',
				pending
			});
		});

		test('does not wait for pending request revalidation before returning a session', async () => {
			const provider = disposables.add(new ContextAuthProvider());
			registerProvider('context-provider', provider);
			const revalidation = new DeferredPromise<void>();
			disposables.add(toDisposable(() => revalidation.complete()));
			mainInstantiationService.get(IAuthenticationExtensionsService).updateNewSessionRequests = () => revalidation.p;

			const session = await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { ...context, createIfNone: true });

			assert.strictEqual(session.accessToken, 'token-session-1');
		});

		for (const silent of [true, undefined]) {
			test(`does not request interactive client recovery during a ${silent ? 'silent' : 'passive'} lookup`, async () => {
				let registrationPrompts = 0;
				let refreshRequests = 0;
				const loggerService = new class extends mock<ILoggerService>() {
					override createLogger(): ILogger { return new NullLogger(); }
				}();
				const proxy = new class extends mock<Proxied<MainThreadAuthenticationShape>>() {
					override $setSessionsForDynamicAuthProvider = async (): Promise<void> => { };
					override $promptForClientRegistration = async (): Promise<{ clientId: string }> => {
						registrationPrompts++;
						return { clientId: 'replacement-client' };
					};
				}();
				const provider = disposables.add(new DynamicAuthProvider(
					new class extends mock<IExtHostWindow>() { }(),
					new class extends mock<IExtHostUrlsService>() { }(),
					new class extends mock<IExtHostInitDataService>() {
						override readonly environment = new class extends mock<IExtHostInitDataService['environment']>() {
							override readonly appName = 'Test';
						}();
					}(),
					new class extends mock<IExtHostProgress>() { }(),
					loggerService, proxy, authorizationServer,
					{ issuer: authorizationServer.toString(true), response_types_supported: ['code'], token_endpoint: 'https://issuer.example/token' },
					undefined, 'original-client', undefined, disposables.add(new Emitter()),
					[{ access_token: 'expired-token', token_type: 'Bearer', scope: 'read', refresh_token: 'refresh-token', expires_in: 1, created_at: 0 }],
					async () => {
						refreshRequests++;
						return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 });
					}
				));
				registerProvider('context-provider', provider);

				const session = await extHostAuthentication.getSession(extensionDescription, 'context-provider', ['read'], { silent });

				assert.deepStrictEqual({ session, registrationPrompts, refreshRequests, clientId: provider.clientId }, {
					session: undefined, registrationPrompts: 0, refreshRequests: 1, clientId: 'original-client'
				});
			});
		}
	});

	test('createIfNone - true', async () => {
		const scopes = ['foo'];
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('createIfNone - false', async () => {
		const scopes = ['foo'];
		const nosession = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{});

		assert.strictEqual(session2?.id, session.id);
		assert.strictEqual(session2?.scopes[0], session.scopes[0]);
		assert.strictEqual(session2?.accessToken, session.accessToken);
	});

	// should behave the same as createIfNone: false
	test('silent - true', async () => {
		const scopes = ['foo'];
		const nosession = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				silent: true
			});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				silent: true
			});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
	});

	test('forceNewSession - true - existing session', async () => {
		const scopes = ['foo'];
		const session1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				forceNewSession: true
			});

		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.notStrictEqual(session1.accessToken, session2?.accessToken);
	});

	// Should behave like createIfNone: true
	test('forceNewSession - true - no existing session', async () => {
		const scopes = ['foo'];
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				forceNewSession: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('forceNewSession - detail', async () => {
		const scopes = ['foo'];
		const session1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			scopes,
			{
				forceNewSession: { detail: 'bar' }
			});

		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.notStrictEqual(session1.accessToken, session2?.accessToken);
	});

	//#region Multi-Account AuthProvider

	test('clearSessionPreference - true', async () => {
		const scopes = ['foo'];
		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], scopes[0]);

		const scopes2 = ['bar'];
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{
				createIfNone: true
			});
		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], scopes2[0]);

		const session3 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['return multiple'],
			{
				clearSessionPreference: true,
				createIfNone: true
			});

		// clearing session preference causes us to get the first session
		// because it would normally show a quick pick for the user to choose
		assert.strictEqual(session3?.id, session.id);
		assert.strictEqual(session3?.scopes[0], session.scopes[0]);
		assert.strictEqual(session3?.accessToken, session.accessToken);
	});

	test('silently getting session should return a session (if any) regardless of preference - fixes #137819', async () => {
		const scopes = ['foo'];
		// Now create the session
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], scopes[0]);

		const scopes2 = ['bar'];
		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{
				createIfNone: true
			});
		assert.strictEqual(session2?.id, '2');
		assert.strictEqual(session2?.scopes[0], scopes2[0]);

		const shouldBeSession1 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes,
			{});
		assert.strictEqual(shouldBeSession1?.id, session.id);
		assert.strictEqual(shouldBeSession1?.scopes[0], session.scopes[0]);
		assert.strictEqual(shouldBeSession1?.accessToken, session.accessToken);

		const shouldBeSession2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			scopes2,
			{});
		assert.strictEqual(shouldBeSession2?.id, session2.id);
		assert.strictEqual(shouldBeSession2?.scopes[0], session2.scopes[0]);
		assert.strictEqual(shouldBeSession2?.accessToken, session2.accessToken);
	});

	//#endregion

	//#region error cases

	test('createIfNone and forceNewSession', async () => {
		await assert.rejects(
			() => extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					forceNewSession: true
				}),
			/Invalid combination of options/
		);
	});

	test('forceNewSession and silent', async () => {
		await assert.rejects(
			() => extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					forceNewSession: true,
					silent: true
				}),
			/Invalid combination of options/
		);
	});

	test('createIfNone and silent', async () => {
		await assert.rejects(
			() => extHostAuthentication.getSession(
				extensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					silent: true
				}),
			/Invalid combination of options/
		);
	});

	test('Can get multiple sessions (with different scopes) in one extension', async () => {
		let session: AuthenticationSession | undefined = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});
		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['bar'],
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '2');
		assert.strictEqual(session?.scopes[0], 'bar');

		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: false
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('Can get multiple sessions (from different providers) in one extension', async () => {
		let session: AuthenticationSession | undefined = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});
		session = await extHostAuthentication.getSession(
			extensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
		assert.strictEqual(session?.account.label, 'test');

		const session2 = await extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: false
			});
		assert.strictEqual(session2?.id, '1');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.strictEqual(session2?.account.label, 'test-multiple');
	});

	test('Can get multiple sessions (from different providers) in one extension at the same time', async () => {
		const sessionP: Promise<AuthenticationSession | undefined> = extHostAuthentication.getSession(
			extensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});
		const session2P: Promise<AuthenticationSession | undefined> = extHostAuthentication.getSession(
			extensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});
		const session = await sessionP;
		assert.strictEqual(session?.id, '1');
		assert.strictEqual(session?.scopes[0], 'foo');
		assert.strictEqual(session?.account.label, 'test');

		const session2 = await session2P;
		assert.strictEqual(session2?.id, '1');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.strictEqual(session2?.account.label, 'test-multiple');
	});


	//#endregion

	//#region Race Condition and Sequencing Tests

	test('concurrent operations on same provider are serialized', async () => {
		const provider = new TestAuthProvider('concurrent-test');
		const operationOrder: string[] = [];

		// Mock the provider methods to track operation order
		const originalCreateSession = provider.createSession.bind(provider);
		const originalGetSessions = provider.getSessions.bind(provider);

		provider.createSession = async (scopes) => {
			operationOrder.push(`create-start-${scopes[0]}`);
			await new Promise(resolve => setTimeout(resolve, 20)); // Simulate async work
			const result = await originalCreateSession(scopes);
			operationOrder.push(`create-end-${scopes[0]}`);
			return result;
		};

		provider.getSessions = async (scopes) => {
			const scopeKey = scopes ? scopes[0] : 'all';
			operationOrder.push(`get-start-${scopeKey}`);
			await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
			const result = await originalGetSessions(scopes);
			operationOrder.push(`get-end-${scopeKey}`);
			return result;
		};

		const disposable = extHostAuthentication.registerAuthenticationProvider('concurrent-test', 'Concurrent Test', provider);
		disposables.add(disposable);

		// Start multiple operations simultaneously on the same provider
		const promises = [
			extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope1'], { createIfNone: true }),
			extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope2'], { createIfNone: true }),
			extHostAuthentication.getSession(extensionDescription, 'concurrent-test', ['scope1'], {}) // This should get the existing session
		];

		await Promise.all(promises);

		// Verify that operations were serialized - no overlapping operations
		// Build a map of operation starts to their corresponding ends
		const operationPairs: Array<{ start: number; end: number; operation: string }> = [];

		for (let i = 0; i < operationOrder.length; i++) {
			const current = operationOrder[i];
			if (current.includes('-start-')) {
				const scope = current.split('-start-')[1];
				const operationType = current.split('-start-')[0];
				const endOperation = `${operationType}-end-${scope}`;
				const endIndex = operationOrder.indexOf(endOperation, i + 1);

				if (endIndex !== -1) {
					operationPairs.push({
						start: i,
						end: endIndex,
						operation: `${operationType}-${scope}`
					});
				}
			}
		}

		// Verify no operations overlap (serialization)
		for (let i = 0; i < operationPairs.length; i++) {
			for (let j = i + 1; j < operationPairs.length; j++) {
				const op1 = operationPairs[i];
				const op2 = operationPairs[j];

				// Operations should not overlap - one should completely finish before the other starts
				const op1EndsBeforeOp2Starts = op1.end < op2.start;
				const op2EndsBeforeOp1Starts = op2.end < op1.start;

				assert.ok(op1EndsBeforeOp2Starts || op2EndsBeforeOp1Starts,
					`Operations ${op1.operation} and ${op2.operation} should not overlap. ` +
					`Op1: ${op1.start}-${op1.end}, Op2: ${op2.start}-${op2.end}. ` +
					`Order: [${operationOrder.join(', ')}]`);
			}
		}

		// Verify we have the expected operations
		assert.ok(operationOrder.includes('create-start-scope1'), 'Should have created session for scope1');
		assert.ok(operationOrder.includes('create-end-scope1'), 'Should have completed creating session for scope1');
		assert.ok(operationOrder.includes('create-start-scope2'), 'Should have created session for scope2');
		assert.ok(operationOrder.includes('create-end-scope2'), 'Should have completed creating session for scope2');

		// The third call should use getSessions to find the existing scope1 session
		assert.ok(operationOrder.includes('get-start-scope1'), 'Should have called getSessions for existing scope1 session');
		assert.ok(operationOrder.includes('get-end-scope1'), 'Should have completed getSessions for existing scope1 session');
	});

	test('session lookup can be retried after a provider failure', async () => {
		const provider = new TestAuthProvider('retry-test');
		const expectedSession = await provider.createSession(['scope']);
		const expectedError = new Error('Session lookup failed');
		let lookupAttempts = 0;

		provider.getSessions = async () => {
			lookupAttempts++;
			if (lookupAttempts === 1) {
				throw expectedError;
			}
			return [expectedSession];
		};

		disposables.add(extHostAuthentication.registerAuthenticationProvider('retry-test', 'Retry Test', provider));
		const getSession = () => extHostAuthentication.getSession(extensionDescription, 'retry-test', ['scope'], { createIfNone: true });

		await assert.rejects(getSession, expectedError);

		const session = await getSession();
		assert.deepStrictEqual(
			{ lookupAttempts, accessToken: session.accessToken },
			{ lookupAttempts: 2, accessToken: expectedSession.accessToken }
		);
	});

	test('provider registration and immediate disposal race condition', async () => {
		const provider = new TestAuthProvider('race-test');

		// Register and immediately dispose
		const disposable = extHostAuthentication.registerAuthenticationProvider('race-test', 'Race Test', provider);
		disposable.dispose();

		// Try to use the provider after disposal - should fail gracefully
		await assert.rejects(
			() => extHostAuthentication.getSession(extensionDescription, 'race-test', ['scope'], { createIfNone: true }),
			/authentication provider.*race-test/
		);
	});

	test('provider re-registration after proper disposal', async () => {
		const provider1 = new TestAuthProvider('reregister-test-1');
		const provider2 = new TestAuthProvider('reregister-test-2');

		// First registration
		const disposable1 = extHostAuthentication.registerAuthenticationProvider('reregister-test', 'Provider 1', provider1);

		// Create a session with first provider
		const session1 = await extHostAuthentication.getSession(extensionDescription, 'reregister-test', ['scope'], { createIfNone: true });
		assert.strictEqual(session1?.account.label, 'reregister-test-1');

		// Dispose first provider
		disposable1.dispose();

		// Re-register with different provider
		const disposable2 = extHostAuthentication.registerAuthenticationProvider('reregister-test', 'Provider 2', provider2);
		disposables.add(disposable2);

		// Create session with second provider
		const session2 = await extHostAuthentication.getSession(extensionDescription, 'reregister-test', ['scope'], { createIfNone: true });
		assert.strictEqual(session2?.account.label, 'reregister-test-2');
		assert.notStrictEqual(session1?.accessToken, session2?.accessToken);
	});

	test('operations on different providers run concurrently', async () => {
		const provider1 = new TestAuthProvider('concurrent-1');
		const provider2 = new TestAuthProvider('concurrent-2');

		let provider1Started = false;
		let provider2Started = false;
		let provider1Finished = false;
		let provider2Finished = false;
		let concurrencyVerified = false;

		// Override createSession to track timing
		const originalCreate1 = provider1.createSession.bind(provider1);
		const originalCreate2 = provider2.createSession.bind(provider2);

		provider1.createSession = async (scopes) => {
			provider1Started = true;
			await new Promise(resolve => setTimeout(resolve, 20));
			const result = await originalCreate1(scopes);
			provider1Finished = true;
			return result;
		};

		provider2.createSession = async (scopes) => {
			provider2Started = true;
			// Provider 2 should start before provider 1 finishes (concurrent execution)
			if (provider1Started && !provider1Finished) {
				concurrencyVerified = true;
			}
			await new Promise(resolve => setTimeout(resolve, 10));
			const result = await originalCreate2(scopes);
			provider2Finished = true;
			return result;
		};

		const disposable1 = extHostAuthentication.registerAuthenticationProvider('concurrent-1', 'Concurrent 1', provider1);
		const disposable2 = extHostAuthentication.registerAuthenticationProvider('concurrent-2', 'Concurrent 2', provider2);
		disposables.add(disposable1);
		disposables.add(disposable2);

		// Start operations on both providers simultaneously
		const [session1, session2] = await Promise.all([
			extHostAuthentication.getSession(extensionDescription, 'concurrent-1', ['scope'], { createIfNone: true }),
			extHostAuthentication.getSession(extensionDescription, 'concurrent-2', ['scope'], { createIfNone: true })
		]);

		// Verify both operations completed successfully
		assert.ok(session1);
		assert.ok(session2);
		assert.ok(provider1Started, 'Provider 1 should have started');
		assert.ok(provider2Started, 'Provider 2 should have started');
		assert.ok(provider1Finished, 'Provider 1 should have finished');
		assert.ok(provider2Finished, 'Provider 2 should have finished');
		assert.strictEqual(session1.account.label, 'concurrent-1');
		assert.strictEqual(session2.account.label, 'concurrent-2');

		// Verify that operations ran concurrently (provider 2 started while provider 1 was still running)
		assert.ok(concurrencyVerified, 'Operations should have run concurrently - provider 2 should start while provider 1 is still running');
	});

	//#endregion
});
