/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection, type AuthenticateParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostMcpAuthenticationRequest } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { ICloudSandboxAgentHostService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { McpAuthRequiredReason } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { createCloudSandboxConnectionCustomization } from '../../../browser/remoteAgentHost/cloudSandboxConnectionCustomization.js';
import { RemoteAgentHostAuthenticationService, IRemoteAgentHostAuthenticationService } from '../../../browser/remoteAgentHost/remoteAgentHostAuthentication.js';
import { RemoteAgentHostContribution } from '../../../browser/remoteAgentHost/remoteAgentHostChatContribution.js';
import { IRemoteAgentHostConnectionCustomization, IRemoteAgentHostConnectionCustomizationService } from '../../../browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { RemoteAgentHostLogForwarder } from '../../../browser/remoteAgentHost/remoteAgentHostLogForwarder.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

suite('Remote Agent Host silent MCP authentication', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const request: IAgentHostMcpAuthenticationRequest = {
		serverName: 'Docs',
		auth: {
			reason: McpAuthRequiredReason.Required,
			resource: { resource: 'https://docs.example/mcp', authorization_servers: ['https://issuer.example'], scopes_supported: ['read'] },
			oauthClient: { clientId: 'docs-client' },
			requiredScopes: ['read'],
		},
	};

	function fixture(customization?: IRemoteAgentHostConnectionCustomization, allowed = true) {
		const instantiation = store.add(new TestInstantiationService());
		const connectionsChanged = store.add(new Emitter<void>());
		const sent: AuthenticateParams[] = [];
		const sessionOptions: boolean[] = [];
		let handler: ((request: IAgentHostMcpAuthenticationRequest) => Promise<boolean>) | undefined;
		let registered = true;
		const address = 'cloudsandbox:remote';
		const connection = new class extends mock<IAgentConnection>() {
			override readonly clientId = 'client';
			override readonly rootState = {
				value: undefined, verifiedValue: undefined,
				onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
			};
			override readonly onDidNotification = Event.None;
			override registerMcpAuthenticationHandler(value: typeof handler) {
				handler = value;
				return toDisposable(() => { handler = undefined; });
			}
			override async authenticate(params: AuthenticateParams) {
				sent.push(params);
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
		instantiation.stub(IWorkbenchEnvironmentService, { isSessionsWindow: true });
		instantiation.stub(IConfigurationService, new TestConfigurationService());
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(ILabelService, { getHostLabel: () => 'Remote' });
		instantiation.stub(ITelemetryService, NullTelemetryService);
		store.add(instantiation.createInstance(RemoteAgentHostContribution));
		assert.ok(handler);
		return {
			authenticate: handler, sent, sessionOptions,
			removeConnection: () => { registered = false; connectionsChanged.fire(); },
		};
	}

	test('seals remembered MCP credentials through the user-local connection customization', async () => {
		const sealed: AuthenticateParams[] = [];
		const customization = createCloudSandboxConnectionCustomization('cloudsandbox:remote',
			new class extends mock<ICloudSandboxAgentHostService>() { }(), true, async params => {
				sealed.push(params);
				return { ...params, token: 'copilot-sealed.v1.mcp.ciphertext' };
			});
		const context = fixture(customization);
		const authenticated = await context.authenticate(request);
		assert.deepStrictEqual({ authenticated, sealed, sent: context.sent, silent: context.sessionOptions }, {
			authenticated: true,
			sealed: [{ resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token' }],
			sent: [{ resource: 'https://docs.example/mcp', scopes: ['read'], token: 'copilot-sealed.v1.mcp.ciphertext' }],
			silent: [true],
		});
	});

	test('ordinary remotes keep their remembered credential path', async () => {
		const context = fixture();
		const authenticated = await context.authenticate(request);
		assert.deepStrictEqual({ authenticated, sent: context.sent }, {
			authenticated: true, sent: [{ resource: 'https://docs.example/mcp', scopes: ['read'], token: 'docs-token' }],
		});
	});

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
