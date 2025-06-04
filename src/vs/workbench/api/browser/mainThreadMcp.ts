/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../base/common/observable.js';
import Severity from '../../../base/common/severity.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IDialogService, IPromptButton } from '../../../platform/dialogs/common/dialogs.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { IMcpMessageTransport, IMcpRegistry } from '../../contrib/mcp/common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { IAuthenticationMcpAccessService } from '../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../services/authentication/browser/authenticationMcpUsageService.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { ExtensionHostKind, extensionHostKindToString } from '../../services/extensions/common/extensionHostKind.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostMcpShape, MainContext, MainThreadMcpShape } from '../common/extHost.protocol.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata } from '../../../base/common/oauth.js';

@extHostNamedCustomer(MainContext.MainThreadMcp)
export class MainThreadMcp extends Disposable implements MainThreadMcpShape {

	private _serverIdCounter = 0;

	private readonly _servers = new Map<number, ExtHostMcpServerLaunch>();
	private readonly _serverDefinitions = new Map<number, McpServerDefinition>();
	private readonly _proxy: Proxied<ExtHostMcpShape>;
	private readonly _collectionDefinitions = this._register(new DisposableMap<string, {
		fromExtHost: McpCollectionDefinition.FromExtHost;
		servers: ISettableObservable<readonly McpServerDefinition[]>;
		dispose(): void;
	}>());

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IDialogService private readonly dialogService: IDialogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IAuthenticationMcpService private readonly authenticationMcpServersService: IAuthenticationMcpService,
		@IAuthenticationMcpAccessService private readonly authenticationMCPServerAccessService: IAuthenticationMcpAccessService,
		@IAuthenticationMcpUsageService private readonly authenticationMCPServerUsageService: IAuthenticationMcpUsageService,
	) {
		super();
		const proxy = this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostMcp);
		this._register(this._mcpRegistry.registerDelegate({
			// Prefer Node.js extension hosts when they're available. No CORS issues etc.
			priority: _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
			waitForInitialProviderPromises() {
				return proxy.$waitForInitialCollectionProviders();
			},
			canStart(collection, serverDefinition) {
				if (collection.remoteAuthority !== _extHostContext.remoteAuthority) {
					return false;
				}
				if (serverDefinition.launch.type === McpServerTransportType.Stdio && _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker) {
					return false;
				}
				return true;
			},
			start: (_collection, serverDefiniton, resolveLaunch) => {
				const id = ++this._serverIdCounter;
				const launch = new ExtHostMcpServerLaunch(
					_extHostContext.extensionHostKind,
					() => proxy.$stopMcp(id),
					msg => proxy.$sendMessage(id, JSON.stringify(msg)),
				);
				this._servers.set(id, launch);
				this._serverDefinitions.set(id, serverDefiniton);
				proxy.$startMcp(id, resolveLaunch);

				return launch;
			},
		}));
	}

	$upsertMcpCollection(collection: McpCollectionDefinition.FromExtHost, serversDto: McpServerDefinition.Serialized[]): void {
		const servers = serversDto.map(McpServerDefinition.fromSerialized);
		const existing = this._collectionDefinitions.get(collection.id);
		if (existing) {
			existing.servers.set(servers, undefined);
		} else {
			const serverDefinitions = observableValue<readonly McpServerDefinition[]>('mcpServers', servers);
			const handle = this._mcpRegistry.registerCollection({
				...collection,
				resolveServerLanch: collection.canResolveLaunch ? (async def => {
					const r = await this._proxy.$resolveMcpLaunch(collection.id, def.label);
					return r ? McpServerLaunch.fromSerialized(r) : undefined;
				}) : undefined,
				remoteAuthority: this._extHostContext.remoteAuthority,
				serverDefinitions,
			});

			this._collectionDefinitions.set(collection.id, {
				fromExtHost: collection,
				servers: serverDefinitions,
				dispose: () => handle.dispose(),
			});
		}
	}

	$deleteMcpCollection(collectionId: string): void {
		this._collectionDefinitions.deleteAndDispose(collectionId);
	}

	$onDidChangeState(id: number, update: McpConnectionState): void {
		const server = this._servers.get(id);
		if (!server) {
			return;
		}

		server.state.set(update, undefined);
		if (!McpConnectionState.isRunning(update)) {
			server.dispose();
			this._servers.delete(id);
			this._serverDefinitions.delete(id);
		}
	}

	$onDidPublishLog(id: number, level: LogLevel, log: string): void {
		if (typeof level === 'string') {
			level = LogLevel.Info;
			log = level as unknown as string;
		}

		this._servers.get(id)?.pushLog(level, log);
	}

	$onDidReceiveMessage(id: number, message: string): void {
		this._servers.get(id)?.pushMessage(message);
	}

	async $getTokenFromServerMetadata(id: number, authServerComponents: UriComponents, serverMetadata: IAuthorizationServerMetadata, resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined): Promise<string | undefined> {
		const server = this._serverDefinitions.get(id);
		if (!server) {
			return undefined;
		}

		const authorizationServer = URI.revive(authServerComponents);
		const scopesSupported = resourceMetadata?.scopes_supported || serverMetadata.scopes_supported || [];
		let providerId = await this._authenticationService.getOrActivateProviderIdForServer(authorizationServer);
		if (!providerId) {
			const provider = await this._authenticationService.createDynamicAuthenticationProvider(authorizationServer, serverMetadata, resourceMetadata);
			if (!provider) {
				return undefined;
			}
			providerId = provider.id;
		}
		const sessions = await this._authenticationService.getSessions(providerId, scopesSupported, { authorizationServer: authorizationServer }, true);
		const accountNamePreference = this.authenticationMcpServersService.getAccountPreference(server.id, providerId);
		let matchingAccountPreferenceSession: AuthenticationSession | undefined;
		if (accountNamePreference) {
			matchingAccountPreferenceSession = sessions.find(session => session.account.label === accountNamePreference);
		}
		const provider = this._authenticationService.getProvider(providerId);
		let session: AuthenticationSession;
		if (sessions.length) {
			// If we have an existing session preference, use that. If not, we'll return any valid session at the end of this function.
			if (matchingAccountPreferenceSession && this.authenticationMCPServerAccessService.isAccessAllowed(providerId, matchingAccountPreferenceSession.account.label, server.id)) {
				return matchingAccountPreferenceSession.accessToken;
			}
			// If we only have one account for a single auth provider, lets just check if it's allowed and return it if it is.
			if (!provider.supportsMultipleAccounts && this.authenticationMCPServerAccessService.isAccessAllowed(providerId, sessions[0].account.label, server.id)) {
				return sessions[0].accessToken;
			}
		}

		const isAllowed = await this.loginPrompt(server.label, provider.label, false);
		if (!isAllowed) {
			throw new Error('User did not consent to login.');
		}

		if (sessions.length) {
			session = provider.supportsMultipleAccounts
				? await this.authenticationMcpServersService.selectSession(providerId, server.id, server.label, scopesSupported, sessions)
				: sessions[0];
		}
		else {
			const accountToCreate: AuthenticationSessionAccount | undefined = matchingAccountPreferenceSession?.account;
			do {
				session = await this._authenticationService.createSession(
					providerId,
					scopesSupported,
					{
						activateImmediate: true,
						account: accountToCreate,
						authorizationServer
					});
			} while (
				accountToCreate
				&& accountToCreate.label !== session.account.label
				&& !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label)
			);
		}

		this.authenticationMCPServerAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: server.id, name: server.label, allowed: true }]);
		this.authenticationMcpServersService.updateAccountPreference(server.id, providerId, session.account);
		this.authenticationMCPServerUsageService.addAccountUsage(providerId, session.account.label, scopesSupported, server.id, server.label);
		return session.accessToken;
	}

	private async continueWithIncorrectAccountPrompt(chosenAccountLabel: string, requestedAccountLabel: string): Promise<boolean> {
		const result = await this.dialogService.prompt({
			message: nls.localize('incorrectAccount', "Incorrect account detected"),
			detail: nls.localize('incorrectAccountDetail', "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
			type: Severity.Warning,
			cancelButton: true,
			buttons: [
				{
					label: nls.localize('keep', 'Keep {0}', chosenAccountLabel),
					run: () => chosenAccountLabel
				},
				{
					label: nls.localize('loginWith', 'Login with {0}', requestedAccountLabel),
					run: () => requestedAccountLabel
				}
			],
		});

		if (!result.result) {
			throw new CancellationError();
		}

		return result.result === chosenAccountLabel;
	}

	private async loginPrompt(mcpLabel: string, providerLabel: string, recreatingSession: boolean): Promise<boolean> {
		const message = recreatingSession
			? nls.localize('confirmRelogin', "The MCP Server Definition '{0}' wants you to authenticate to {1}.", mcpLabel, providerLabel)
			: nls.localize('confirmLogin', "The MCP Server Definition '{0}' wants to authenticate to {1}.", mcpLabel, providerLabel);

		const buttons: IPromptButton<boolean | undefined>[] = [
			{
				label: nls.localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
				run() {
					return true;
				},
			}
		];
		const { result } = await this.dialogService.prompt({
			type: Severity.Info,
			message,
			buttons,
			cancelButton: true,
		});

		return result ?? false;
	}

	override dispose(): void {
		for (const server of this._servers.values()) {
			server.extHostDispose();
		}
		this._servers.clear();
		this._serverDefinitions.clear();
		super.dispose();
	}
}


class ExtHostMcpServerLaunch extends Disposable implements IMcpMessageTransport {
	public readonly state = observableValue<McpConnectionState>('mcpServerState', { state: McpConnectionState.Kind.Starting });

	private readonly _onDidLog = this._register(new Emitter<{ level: LogLevel; message: string }>());
	public readonly onDidLog = this._onDidLog.event;

	private readonly _onDidReceiveMessage = this._register(new Emitter<MCP.JSONRPCMessage>());
	public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

	pushLog(level: LogLevel, message: string): void {
		this._onDidLog.fire({ message, level });
	}

	pushMessage(message: string): void {
		let parsed: MCP.JSONRPCMessage | undefined;
		try {
			parsed = JSON.parse(message);
		} catch (e) {
			this.pushLog(LogLevel.Warning, `Failed to parse message: ${JSON.stringify(message)}`);
		}

		if (parsed) {
			if (Array.isArray(parsed)) { // streamable HTTP supports batching
				parsed.forEach(p => this._onDidReceiveMessage.fire(p));
			} else {
				this._onDidReceiveMessage.fire(parsed);
			}
		}
	}

	constructor(
		extHostKind: ExtensionHostKind,
		public readonly stop: () => void,
		public readonly send: (message: MCP.JSONRPCMessage) => void,
	) {
		super();

		this._register(disposableTimeout(() => {
			this.pushLog(LogLevel.Info, `Starting server from ${extensionHostKindToString(extHostKind)} extension host`);
		}));
	}

	public extHostDispose() {
		if (McpConnectionState.isRunning(this.state.get())) {
			this.pushLog(LogLevel.Warning, 'Extension host shut down, server will stop.');
			this.state.set({ state: McpConnectionState.Kind.Stopped }, undefined);
		}
		this.dispose();
	}

	public override dispose(): void {
		if (McpConnectionState.isRunning(this.state.get())) {
			this.stop();
		}

		super.dispose();
	}
}
