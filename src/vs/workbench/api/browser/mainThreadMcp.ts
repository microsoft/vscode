/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from '../../../base/common/arraysFind.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../base/common/observable.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import * as nls from '../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IPromptButton } from '../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { IMcpMessageTransport, IMcpRegistry } from '../../contrib/mcp/common/mcpRegistryTypes.js';
import { extensionPrefixedIdentifier, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust, UserInteractionRequiredError } from '../../contrib/mcp/common/mcpTypes.js';
import { MCP } from '../../contrib/mcp/common/modelContextProtocol.js';
import { IAuthenticationMcpAccessService } from '../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../services/authentication/browser/authenticationMcpUsageService.js';
import { AuthenticationSession, AuthenticationSessionAccount, IAuthenticationService } from '../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { ExtensionHostKind, extensionHostKindToString } from '../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, ExtHostMcpShape, IMcpAuthenticationDetails, IMcpAuthenticationOptions, MainContext, MainThreadMcpShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadMcp)
export class MainThreadMcp extends Disposable implements MainThreadMcpShape {

	private _serverIdCounter = 0;

	private readonly _servers = new Map<number, ExtHostMcpServerLaunch>();
	private readonly _serverDefinitions = new Map<number, McpServerDefinition>();
	private readonly _serverAuthTracking = new McpServerAuthTracker();
	private readonly _proxy: Proxied<ExtHostMcpShape>;
	private readonly _collectionDefinitions = this._register(new DisposableMap<string, {
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
		@IDynamicAuthenticationProviderStorageService private readonly _dynamicAuthenticationProviderStorageService: IDynamicAuthenticationProviderStorageService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._register(_authenticationService.onDidChangeSessions(e => this._onDidChangeAuthSessions(e.providerId, e.label)));
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
			async substituteVariables(serverDefinition, launch) {
				const ser = await proxy.$substituteVariables(serverDefinition.variableReplacement?.folder?.uri, McpServerLaunch.toSerialized(launch));
				return McpServerLaunch.fromSerialized(ser);
			},
			start: (_collection, serverDefiniton, resolveLaunch, options) => {
				const id = ++this._serverIdCounter;
				const launch = new ExtHostMcpServerLaunch(
					_extHostContext.extensionHostKind,
					() => proxy.$stopMcp(id),
					msg => proxy.$sendMessage(id, JSON.stringify(msg)),
				);
				this._servers.set(id, launch);
				this._serverDefinitions.set(id, serverDefiniton);
				proxy.$startMcp(id, {
					launch: resolveLaunch,
					defaultCwd: serverDefiniton.variableReplacement?.folder?.uri,
					errorOnUserInteraction: options?.errorOnUserInteraction,
				});

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
			const extensionId = new ExtensionIdentifier(collection.extensionId);
			const store = new DisposableStore();
			const handle = store.add(new MutableDisposable());
			const register = () => {
				handle.value ??= this._mcpRegistry.registerCollection({
					...collection,
					source: extensionId,
					resolveServerLanch: collection.canResolveLaunch ? (async def => {
						const r = await this._proxy.$resolveMcpLaunch(collection.id, def.label);
						return r ? McpServerLaunch.fromSerialized(r) : undefined;
					}) : undefined,
					trustBehavior: collection.isTrustedByDefault ? McpServerTrust.Kind.Trusted : McpServerTrust.Kind.TrustedOnNonce,
					remoteAuthority: this._extHostContext.remoteAuthority,
					serverDefinitions,
				});
			};

			const whenClauseStr = mapFindFirst(this._extensionService.extensions, e =>
				ExtensionIdentifier.equals(extensionId, e.identifier)
					? e.contributes?.mcpServerDefinitionProviders?.find(p => extensionPrefixedIdentifier(extensionId, p.id) === collection.id)?.when
					: undefined);
			const whenClause = whenClauseStr && ContextKeyExpr.deserialize(whenClauseStr);

			if (!whenClause) {
				register();
			} else {
				const evaluate = () => {
					if (this._contextKeyService.contextMatchesRules(whenClause)) {
						register();
					} else {
						handle.clear();
					}
				};

				store.add(this._contextKeyService.onDidChangeContext(evaluate));
				evaluate();
			}

			this._collectionDefinitions.set(collection.id, {
				servers: serverDefinitions,
				dispose: () => store.dispose(),
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
			this._serverAuthTracking.untrack(id);
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

	async $getTokenForProviderId(id: number, providerId: string, scopes: string[], options: IMcpAuthenticationOptions = {}): Promise<string | undefined> {
		const server = this._serverDefinitions.get(id);
		if (!server) {
			return undefined;
		}
		return this._getSessionForProvider(id, server, providerId, scopes, undefined, options.errorOnUserInteraction);
	}

	async $getTokenFromServerMetadata(id: number, authDetails: IMcpAuthenticationDetails, { errorOnUserInteraction, forceNewRegistration }: IMcpAuthenticationOptions = {}): Promise<string | undefined> {
		const server = this._serverDefinitions.get(id);
		if (!server) {
			return undefined;
		}
		const authorizationServer = URI.revive(authDetails.authorizationServer);
		const resourceServer = authDetails.resourceMetadata?.resource ? URI.parse(authDetails.resourceMetadata.resource) : undefined;
		const resolvedScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? authDetails.authorizationServerMetadata.scopes_supported ?? [];
		let providerId = await this._authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
		if (forceNewRegistration && providerId) {
			if (!this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
				throw new Error('Cannot force new registration for a non-dynamic authentication provider.');
			}
			this._authenticationService.unregisterAuthenticationProvider(providerId);
			// TODO: Encapsulate this and the unregister in one call in the auth service
			await this._dynamicAuthenticationProviderStorageService.removeDynamicProvider(providerId);
			providerId = undefined;
		}

		if (!providerId) {
			const provider = await this._authenticationService.createDynamicAuthenticationProvider(authorizationServer, authDetails.authorizationServerMetadata, authDetails.resourceMetadata);
			if (!provider) {
				return undefined;
			}
			providerId = provider.id;
		}

		return this._getSessionForProvider(id, server, providerId, resolvedScopes, authorizationServer, errorOnUserInteraction);
	}

	private async _getSessionForProvider(
		serverId: number,
		server: McpServerDefinition,
		providerId: string,
		scopes: string[],
		authorizationServer?: URI,
		errorOnUserInteraction: boolean = false
	): Promise<string | undefined> {
		const sessions = await this._authenticationService.getSessions(providerId, scopes, { authorizationServer }, true);
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
				this.authenticationMCPServerUsageService.addAccountUsage(providerId, matchingAccountPreferenceSession.account.label, scopes, server.id, server.label);
				this._serverAuthTracking.track(providerId, serverId, scopes);
				return matchingAccountPreferenceSession.accessToken;
			}
			// If we only have one account for a single auth provider, lets just check if it's allowed and return it if it is.
			if (!provider.supportsMultipleAccounts && this.authenticationMCPServerAccessService.isAccessAllowed(providerId, sessions[0].account.label, server.id)) {
				this.authenticationMCPServerUsageService.addAccountUsage(providerId, sessions[0].account.label, scopes, server.id, server.label);
				this._serverAuthTracking.track(providerId, serverId, scopes);
				return sessions[0].accessToken;
			}
		}

		if (errorOnUserInteraction) {
			throw new UserInteractionRequiredError('authentication');
		}

		const isAllowed = await this.loginPrompt(server.label, provider.label, false);
		if (!isAllowed) {
			throw new Error('User did not consent to login.');
		}

		if (sessions.length) {
			if (provider.supportsMultipleAccounts && errorOnUserInteraction) {
				throw new UserInteractionRequiredError('authentication');
			}
			session = provider.supportsMultipleAccounts
				? await this.authenticationMcpServersService.selectSession(providerId, server.id, server.label, scopes, sessions)
				: sessions[0];
		}
		else {
			if (errorOnUserInteraction) {
				throw new UserInteractionRequiredError('authentication');
			}
			const accountToCreate: AuthenticationSessionAccount | undefined = matchingAccountPreferenceSession?.account;
			do {
				session = await this._authenticationService.createSession(
					providerId,
					scopes,
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
		this.authenticationMCPServerUsageService.addAccountUsage(providerId, session.account.label, scopes, server.id, server.label);
		this._serverAuthTracking.track(providerId, serverId, scopes);
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

	private async _onDidChangeAuthSessions(providerId: string, providerLabel: string): Promise<void> {
		const serversUsingProvider = this._serverAuthTracking.get(providerId);
		if (!serversUsingProvider) {
			return;
		}

		for (const { serverId, scopes } of serversUsingProvider) {
			const server = this._servers.get(serverId);
			const serverDefinition = this._serverDefinitions.get(serverId);

			if (!server || !serverDefinition) {
				continue;
			}

			// Only validate servers that are running
			const state = server.state.get();
			if (state.state !== McpConnectionState.Kind.Running) {
				continue;
			}

			// Validate if the session is still available
			try {
				await this._getSessionForProvider(serverId, serverDefinition, providerId, scopes, undefined, true);
			} catch (e) {
				if (UserInteractionRequiredError.is(e)) {
					// Session is no longer valid, stop the server
					server.pushLog(LogLevel.Warning, nls.localize('mcpAuthSessionRemoved', "Authentication session for {0} removed, stopping server", providerLabel));
					server.stop();
				}
				// Ignore other errors to avoid disrupting other servers
			}
		}
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
		this._serverAuthTracking.clear();
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

/**
 * Tracks which MCP servers are using which authentication providers.
 * Organized by provider ID for efficient lookup when auth sessions change.
 */
class McpServerAuthTracker {
	// Provider ID -> Array of serverId and scopes used
	private readonly _tracking = new Map<string, Array<{ serverId: number; scopes: string[] }>>();

	/**
	 * Track authentication for a server with a specific provider.
	 * Replaces any existing tracking for this server/provider combination.
	 */
	track(providerId: string, serverId: number, scopes: string[]): void {
		const servers = this._tracking.get(providerId) || [];
		const filtered = servers.filter(s => s.serverId !== serverId);
		filtered.push({ serverId, scopes });
		this._tracking.set(providerId, filtered);
	}

	/**
	 * Remove all authentication tracking for a server across all providers.
	 */
	untrack(serverId: number): void {
		for (const [providerId, servers] of this._tracking.entries()) {
			const filtered = servers.filter(s => s.serverId !== serverId);
			if (filtered.length === 0) {
				this._tracking.delete(providerId);
			} else {
				this._tracking.set(providerId, filtered);
			}
		}
	}

	/**
	 * Get all servers using a specific authentication provider.
	 */
	get(providerId: string): ReadonlyArray<{ serverId: number; scopes: string[] }> | undefined {
		return this._tracking.get(providerId);
	}

	/**
	 * Clear all tracking data.
	 */
	clear(): void {
		this._tracking.clear();
	}
}
