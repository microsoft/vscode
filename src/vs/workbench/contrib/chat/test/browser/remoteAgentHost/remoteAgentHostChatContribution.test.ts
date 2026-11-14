/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { EditorWindowRemoteAgentHostService } from '../../../../../../platform/agentHost/browser/remoteAgentHostServiceImpl.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IAgentConnection, type AuthenticateParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostAdvertisedAuthenticationResolver } from '../../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import { IAgentHostMcpAuthenticationRequest } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { ICloudSandboxAgentHostService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { authenticationAccountMeta } from '../../../../../../platform/agentHost/common/meta/agentAuthenticationAccount.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId, WorkspaceRemoteAgentHostsSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { AuthenticateTargetKind } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { McpAuthRequiredReason } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { AuthRequiredReason, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProgressService, type IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../platform/dialogs/test/common/testDialogService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { NotificationService } from '../../../../../services/notification/common/notificationService.js';
import { NotificationsCenter } from '../../../../../browser/parts/notifications/notificationsCenter.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { createCloudSandboxConnectionCustomization } from '../../../browser/remoteAgentHost/cloudSandboxConnectionCustomization.js';
import { RemoteAgentHostAuthenticationService, IRemoteAgentHostAuthenticationService } from '../../../browser/remoteAgentHost/remoteAgentHostAuthentication.js';
import { RemoteAgentHostContribution } from '../../../browser/remoteAgentHost/remoteAgentHostChatContribution.js';
import { IRemoteAgentHostConnectionCustomization, IRemoteAgentHostConnectionCustomizationService } from '../../../browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { RemoteAgentHostLogForwarder } from '../../../browser/remoteAgentHost/remoteAgentHostLogForwarder.js';
import { ChatSessionsExtensions, IAsyncChatSessionActivationRegistry, IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

suite('Remote Agent Host consent integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const address = 'restore-consent.example:8080';

	function fixture(addresses = [address], confirmed = true) {
		const instantiation = store.add(workbenchInstantiationService(undefined, store));
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[WorkspaceRemoteAgentHostsSettingId]: addresses.map(address => ({ address, name: 'Same name' })),
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		const storage = store.add(new InMemoryStorageService());
		instantiation.stub(IStorageService, storage);
		const notifications = store.add(new NotificationService(storage));
		instantiation.stub(INotificationService, notifications);
		instantiation.stub(IDialogService, new TestDialogService({ confirmed }));
		instantiation.stub(IAgentHostAdvertisedAuthenticationResolver, {
			createResolver: () => ({ resolve: async () => [], dispose: () => { } }),
			takePendingSessionRemovals: () => [],
		});
		const root = new class extends mock<RootState>() {
			override readonly agents = [{ provider: 'copilot', displayName: 'Test', description: 'Test', models: [] }];
		}();
		instantiation.stubInstance(AgentHostProtocolClient, {
			clientId: 'consent-test-client',
			initializeResult: constObservable<InitializeResult | undefined>(undefined),
			rootState: { value: root, verifiedValue: root, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None },
			onDidClose: Event.None,
			onDidConnectionDiagnostic: Event.None,
			onDidScheduleReconnect: Event.None,
			onDidChangeConnectionState: Event.None,
			connect: async () => { },
			dispose: () => { },
		});
		const service = store.add(instantiation.createInstance(EditorWindowRemoteAgentHostService));
		instantiation.stub(IRemoteAgentHostService, service);
		const setConfiguration = async (key: string, value: boolean | { address: string; name: string }[]) => {
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
				affectsConfiguration: candidate => candidate === key,
			});
		};
		return { instantiation, service, notifications, setConfiguration };
	}

	for (const outcome of ['approved', 'cancelled', 'removed', 'disabled', 'abandoned', 'dismissed', 'cleared'] as const) {
		test(`restored chat waits for consent and settles when ${outcome}`, async () => {
			const context = fixture([address], outcome !== 'cancelled');
			await timeout(0);
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(address), 'copilot');
			const activator = Registry.as<IAsyncChatSessionActivationRegistry>(ChatSessionsExtensions.AsyncActivation).getActivators(sessionType)[0];
			assert.ok(activator);
			const cancellation = store.add(new CancellationTokenSource());
			let settled = false;
			const activation = (async () => {
				const result = await context.instantiation.invokeFunction(accessor => activator.waitForActivation(accessor, sessionType, cancellation.token));
				settled = true;
				return result;
			})();
			await timeout(0);
			const beforeChoice = settled;
			if (outcome === 'removed') {
				await context.setConfiguration(WorkspaceRemoteAgentHostsSettingId, []);
			} else if (outcome === 'disabled') {
				await context.setConfiguration(RemoteAgentHostsEnabledSettingId, false);
			} else if (outcome === 'abandoned') {
				cancellation.cancel();
			} else if (outcome === 'dismissed') {
				context.notifications.model.notifications[0].close();
			} else if (outcome === 'cleared') {
				store.add(context.instantiation.createInstance(NotificationsCenter, $('div'), context.notifications.model)).clearAll();
			} else {
				const connect = context.notifications.model.notifications[0]?.actions?.primary?.[0];
				assert.ok(connect);
				await connect.run();
			}
			await timeout(0);
			const afterChoice = settled;
			if (!settled) {
				await context.setConfiguration(WorkspaceRemoteAgentHostsSettingId, []);
			}
			assert.deepStrictEqual({ beforeChoice, afterChoice, result: await activation }, {
				beforeChoice: false, afterChoice: true, result: outcome === 'approved',
			});
		});
	}

	test('same-name consent notifications remain independently actionable and disposable', async () => {
		const context = fixture(['first-consent.example:8080/one?token=private-first', 'second-consent.example:8080/two?token=private-second'], false);
		await timeout(0);
		const notices = [...context.notifications.model.notifications];
		const before = {
			count: notices.length,
			ids: new Set(notices.map(notice => notice.id)).size,
			containsCredential: notices.some(notice => `${notice.id} ${notice.message.raw}`.includes('private-')),
		};
		await context.setConfiguration(WorkspaceRemoteAgentHostsSettingId, [{ address: 'second-consent.example:8080/two?token=private-second', name: 'Same name' }]);
		const remaining = context.notifications.model.notifications.length;
		await context.notifications.model.notifications[0]?.actions?.primary?.[0]?.run();
		await timeout(0);
		assert.deepStrictEqual({ before, remaining, retry: context.notifications.model.notifications.map(notice => notice.actions?.primary?.map(action => action.label) ?? []) }, {
			before: { count: 2, ids: 2, containsCredential: false }, remaining: 1, retry: [['Retry']],
		});
	});
});

suite('Remote Agent Host silent MCP authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request: IAgentHostMcpAuthenticationRequest = {
		target: { kind: AuthenticateTargetKind.McpServer, session: 'other-agent://tenant/conversations/opaque-session', customizationId: 'urn:example:mcp:docs' },
		serverName: 'Docs',
		auth: {
			reason: McpAuthRequiredReason.Required,
			resource: { resource: 'https://docs.example/mcp', authorization_servers: ['https://issuer.example'], scopes_supported: ['read'] },
			oauthClient: { clientId: 'docs-client' },
			requiredScopes: ['read'],
		},
	};

	function fixture(customization?: IRemoteAgentHostConnectionCustomization, allowed = true, isSessionsWindow = true, address = 'cloudsandbox:remote') {
		const instantiation = store.add(new TestInstantiationService());
		const connectionsChanged = store.add(new Emitter<void>());
		const notifications = store.add(new Emitter<INotification>());
		const opened: { steps: IProgressStep[]; settled: Promise<unknown> }[] = [];
		const sent: AuthenticateParams[] = [];
		const sessionOptions: boolean[] = [];
		const authenticationSent = new DeferredPromise<void>();
		const authenticationError = new DeferredPromise<void>();
		const errors: unknown[][] = [];
		let handler: ((request: IAgentHostMcpAuthenticationRequest) => Promise<boolean>) | undefined;
		let registered = true;
		const connection = new class extends mock<IAgentConnection>() {
			override readonly clientId = 'client';
			override readonly rootState = {
				value: undefined, verifiedValue: undefined,
				onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
			};
			override readonly onDidNotification = notifications.event;
			override registerMcpAuthenticationHandler(value: typeof handler) {
				handler = value;
				return toDisposable(() => { handler = undefined; });
			}
			override async authenticate(params: AuthenticateParams) {
				sent.push(params);
				void authenticationSent.complete();
				return { authenticated: true };
			}
		}();
		instantiation.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = connectionsChanged.event;
			override readonly onDidChangeDisplayName = Event.None;
			override get connections() {
				return registered ? [new class extends mock<IRemoteAgentHostConnectionInfo>() {
					override readonly address = address;
					override readonly clientId = connection.clientId;
					override readonly status = RemoteAgentHostConnectionStatus.connected;
				}()] : [];
			}
			override getConnection() { return connection; }
		}());
		instantiation.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
			override readonly onDidRegisterAuthenticationProvider = Event.None;
			override readonly onDidChangeSessions = Event.None;
			override isDynamicAuthenticationProvider() { return true; }
			override isAuthenticationProviderRegistered() { return true; }
			override async getOrActivateProviderIdForServer() { return 'docs-provider'; }
			override async getSessions(_providerId: string, _scopes: string[] | undefined, options?: { silent?: boolean }) {
				sessionOptions.push(options?.silent === true);
				return [{ id: 'docs-session', scopes: ['read'], accessToken: 'docs-token', account: { id: 'account', label: 'Docs Account' } }];
			}
		}());
		instantiation.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None });
		instantiation.stub(IAuthenticationMcpAccessService, { isAccessAllowedForUrl: () => allowed });
		instantiation.stub(IAuthenticationMcpService, { getAccountPreference: () => undefined });
		instantiation.stub(IAuthenticationMcpUsageService, { addAccountUsage: () => { } });
		instantiation.stub(IDynamicAuthenticationProviderStorageService, { getClientRegistration: async () => ({ clientId: 'docs-client' }) });
		instantiation.stub(IRemoteAgentHostConnectionCustomizationService, { get: () => customization });
		instantiation.stub(IRemoteAgentHostAuthenticationService, new RemoteAgentHostAuthenticationService());
		instantiation.stub(IAgentHostFileSystemService, { registerAuthority: () => Disposable.None });
		instantiation.stubInstance(RemoteAgentHostLogForwarder, store.add(toDisposable(() => { })));
		instantiation.stub(IChatSessionsService, {});
		instantiation.stub(ILanguageModelsService, {});
		instantiation.stub(IAgentHostSessionWorkingDirectoryResolver, {});
		instantiation.stub(ICustomizationHarnessService, {});
		instantiation.stub(IAgentHostTerminalService, {});
		instantiation.stub(IAgentHostActiveClientService, {});
		instantiation.stub(IWorkbenchEnvironmentService, { isSessionsWindow });
		instantiation.stub(IEditorGroupsService, {});
		instantiation.stub(IEditorService, {});
		instantiation.stub(IProgressService, new class extends mock<IProgressService>() {
			override withProgress<R>(options: Parameters<IProgressService['withProgress']>[0], task: (progress: { report(step: IProgressStep): void }) => Promise<R>): Promise<R> {
				const steps: IProgressStep[] = [];
				const settled = task({ report: step => steps.push(step) });
				opened.push({ steps, settled });
				return settled;
			}
		}());
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(ILogService, store.add(new class extends NullLogService {
			override error(...args: unknown[]) {
				errors.push(args);
				void authenticationError.complete();
			}
		}()));
		instantiation.stub(IAgentHostAdvertisedAuthenticationResolver, { takePendingSessionRemovals: () => [] });
		instantiation.stub(ILabelService, { getHostLabel: () => 'Remote' });
		instantiation.stub(ITelemetryService, NullTelemetryService);
		store.add(instantiation.createInstance(RemoteAgentHostContribution));
		return {
			authenticate: (value: IAgentHostMcpAuthenticationRequest) => { assert.ok(handler); return handler(value); }, sent, sessionOptions,
			notifications, opened, authenticationSent: authenticationSent.p, authenticationError: authenticationError.p, errors,
			removeConnection: () => { registered = false; connectionsChanged.fire(); },
		};
	}

	for (const address of ['cloudsandbox:remote', 'ws://remote.example:8081']) {
		test(`editor forwards indeterminate progress and disposes it on disconnect: ${address}`, async () => {
			const context = fixture(undefined, true, false, address);
			context.notifications.fire({ type: 'root/progress', channel: 'custom-host:/root', progressToken: 'policy', progress: 0, message: 'Loading settings' });
			assert.deepStrictEqual(context.opened.map(record => record.steps), [[]]);
			context.removeConnection();
			await context.opened[0].settled;
			context.notifications.fire({ type: 'root/progress', channel: 'custom-host:/root', progressToken: 'late', progress: 0 });
			assert.strictEqual(context.opened.length, 1);
		});
	}

	test('Agents window leaves progress to the session provider', () => {
		const context = fixture();
		context.notifications.fire({ type: 'root/progress', channel: 'custom-host:/root', progressToken: 'policy', progress: 0 });
		assert.strictEqual(context.opened.length, 0);
	});

	test('forwards remembered MCP credentials to the user-local protocol sealing boundary', async () => {
		const customization = createCloudSandboxConnectionCustomization('cloudsandbox:remote',
			new class extends mock<ICloudSandboxAgentHostService>() { }(), true);
		const context = fixture(customization);
		const authenticated = await context.authenticate(request);
		assert.deepStrictEqual({ authenticated, sent: context.sent, silent: context.sessionOptions }, {
			authenticated: true,
			sent: [{ target: request.target, resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token' }],
			silent: [true],
		});
	});

	test('ordinary remotes keep their remembered credential path', async () => {
		const context = fixture();
		const authenticated = await context.authenticate(request);
		assert.deepStrictEqual({ authenticated, sent: context.sent }, {
			authenticated: true, sent: [{ target: request.target, resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token' }],
		});
	});

	test('renews an expired relay identity without authorization-server metadata or a provider session', async () => {
		const identity = new DeferredPromise<AuthenticateParams>();
		const calls: { environmentId: string; resource: string; renew: boolean }[] = [];
		const customization = createCloudSandboxConnectionCustomization('cloudsandbox:remote',
			new class extends mock<ICloudSandboxAgentHostService>() {
				override resolveUserLocalAuthentication(environmentId: string, resource: string, renew = false) {
					calls.push({ environmentId, resource, renew });
					return identity.p;
				}
			}(), true);
		const context = fixture(customization);
		const challenge: INotification = {
			type: 'auth/required', channel: 'ahp-root://', reason: AuthRequiredReason.Expired,
			resource: { resource: 'https://api.github.com' },
		};
		context.notifications.fire(challenge);
		context.notifications.fire(challenge);
		await identity.complete({ resource: 'https://api.github.com', token: 'fresh-identity-token', expiresIn: 120 });
		await context.authenticationSent;
		assert.deepStrictEqual({ calls, sent: context.sent, sessionOptions: context.sessionOptions, errors: context.errors }, {
			calls: [{ environmentId: 'remote', resource: 'https://api.github.com', renew: true }],
			sent: [{ resource: 'https://api.github.com', token: 'fresh-identity-token', expiresIn: 120, scopes: undefined }],
			sessionOptions: [],
			errors: [],
		});
	});

	test('user-local expiry challenges for other resources retain provider recovery', async () => {
		const customization = createCloudSandboxConnectionCustomization('cloudsandbox:remote',
			new class extends mock<ICloudSandboxAgentHostService>() { }(), true);
		const context = fixture(customization);
		context.notifications.fire({
			type: 'auth/required', channel: 'ahp-root://', reason: AuthRequiredReason.Expired,
			resource: request.auth.resource,
		});
		await context.authenticationSent;
		assert.deepStrictEqual({ sent: context.sent, errors: context.errors }, {
			sent: [{ resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token', _meta: authenticationAccountMeta({ providerId: 'docs-provider', accountId: 'account' }) }],
			errors: [],
		});
	});

	for (const removed of [false, true]) {
		test(`identity renewal ${removed ? 'disconnection' : 'failure'} never sends a fallback credential`, async () => {
			const identity = new DeferredPromise<AuthenticateParams>();
			const customization = createCloudSandboxConnectionCustomization('cloudsandbox:remote',
				new class extends mock<ICloudSandboxAgentHostService>() {
					override resolveUserLocalAuthentication() { return identity.p; }
				}(), true);
			const context = fixture(customization);
			context.notifications.fire({
				type: 'auth/required', channel: 'ahp-root://', reason: AuthRequiredReason.Expired,
				resource: { resource: 'https://api.github.com' },
			});
			if (removed) {
				context.removeConnection();
				await identity.complete({ resource: 'https://api.github.com', token: 'fresh-identity-token' });
			} else {
				await identity.error(new Error('Identity renewal failed'));
			}
			await context.authenticationError;
			assert.deepStrictEqual({ sent: context.sent, sessionOptions: context.sessionOptions }, { sent: [], sessionOptions: [] });
		});
	}

	test('denied MCP access never seals or sends a credential', async () => {
		let sealed = false;
		const context = fixture({ authenticate: async params => { sealed = true; return params; } }, false);
		const authenticated = await context.authenticate(request);
		assert.deepStrictEqual({ authenticated, sealed, sent: context.sent }, { authenticated: false, sealed: false, sent: [] });
	});

	test('sealing failure never falls back to plaintext authentication', async () => {
		const context = fixture({ authenticate: async () => { throw new Error('Untrusted recipient'); } });
		await assert.rejects(context.authenticate(request), /Untrusted recipient/);
		assert.deepStrictEqual(context.sent, []);
	});

	test('removing a connection during sealing prevents credential forwarding', async () => {
		const started = new DeferredPromise<void>();
		const sealed = new DeferredPromise<AuthenticateParams>();
		const context = fixture({ authenticate: async () => { void started.complete(); return sealed.p; } });
		const rejected = assert.rejects(context.authenticate(request), CancellationError);
		await started.p;
		context.removeConnection();
		await sealed.complete({ resource: 'https://docs.example/mcp', token: 'copilot-sealed.v1.mcp.ciphertext' });
		await rejected;
		assert.deepStrictEqual(context.sent, []);
	});
});
