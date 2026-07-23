/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fetchAuthorizationServerMetadata } from '../../../../../../base/common/oauth.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type McpOAuthClient, type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { localize } from '../../../../../../nls.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { AuthenticationSession, getDynamicAuthenticationProviderId, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { IChatSetupResult } from '../../chatSetup/chatSetup.js';

/**
 * Stable identity for an agent-host MCP server, used as the key for
 * remembered authentication (allowed-server access, account preference and
 * usage). Agent-host customization ids are **not** stable across reloads —
 * bare/top-level ids embed the agent-host session id, and synced child ids
 * embed a per-sync nonce — so keying remembered auth on them orphans the
 * grant on every reload. Instead we key on the session's host `authority`
 * plus the server `name` and its resource `url`, all of which are stable
 * for a given server across sessions and reloads.
 */
export function agentHostMcpServerId(authority: string, serverName: string, resourceUrl: string): string {
	return `agent-host-mcp:${authority}/${encodeURIComponent(serverName)}/${encodeURIComponent(resourceUrl)}`;
}

/**
 * Tracks the last bearer token pushed to a given agent host connection
 * for each protected resource, so that redundant `authenticate` RPCs can
 * be suppressed when neither the resource nor the token has changed.
 *
 * One instance per connection. Owned by the contribution that drives
 * authentication for that connection so the cache is dropped naturally
 * when the connection is disposed.
 */
export class AgentHostAuthTokenCache {
	private readonly _completedTokens = new Map<string, string>();
	private readonly _pendingAuthentications = new Map<string, { readonly token: string; readonly promise: Promise<void> }>();
	private readonly _keyGenerations = new Map<string, number>();
	private _globalGeneration = 0;

	/**
	 * Forwards a token once per resource/scope pair. Same-token callers share
	 * and await an in-flight authentication.
	 */
	async authenticate(resource: string, scopes: readonly string[] | undefined, token: string, authenticate: () => Promise<unknown>): Promise<boolean> {
		const key = this._key(resource, scopes);
		const globalGeneration = this._globalGeneration;
		const keyGeneration = this._keyGenerations.get(key) ?? 0;
		const pending = this._pendingAuthentications.get(key);
		if (pending) {
			if (pending.token === token) {
				await pending.promise;
				if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
					throw new CancellationError();
				}
				return false;
			}

			try {
				await pending.promise;
			} catch {
				// The newer token gets its own attempt regardless of the previous result.
			}
			if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
				throw new CancellationError();
			}
			return this.authenticate(resource, scopes, token, authenticate);
		}

		if (this._completedTokens.get(key) === token) {
			return false;
		}

		const promise = (async () => {
			await authenticate();
			if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
				throw new CancellationError();
			}
			this._completedTokens.set(key, token);
		})();
		this._pendingAuthentications.set(key, { token, promise });
		try {
			await promise;
			return true;
		} finally {
			if (this._pendingAuthentications.get(key)?.promise === promise) {
				this._pendingAuthentications.delete(key);
			}
		}
	}

	/**
	 * Clear the cached token for a specific resource/scope pair, a whole resource,
	 * or all resources if no argument is given. Call after a failed `authenticate`
	 * RPC or when the agent host process restarts.
	 */
	clear(resource?: string, scopes?: readonly string[]): void {
		if (resource !== undefined) {
			if (scopes !== undefined) {
				const key = this._key(resource, scopes);
				this._invalidateKey(key);
				this._completedTokens.delete(key);
				this._pendingAuthentications.delete(key);
				return;
			}
			const prefix = `${resource}\x00`;
			const keys = new Set([...this._completedTokens.keys(), ...this._pendingAuthentications.keys(), ...this._keyGenerations.keys()]);
			for (const key of keys) {
				if (key.startsWith(prefix)) {
					this._invalidateKey(key);
					this._completedTokens.delete(key);
					this._pendingAuthentications.delete(key);
				}
			}
		} else {
			this._globalGeneration++;
			this._completedTokens.clear();
			this._pendingAuthentications.clear();
			this._keyGenerations.clear();
		}
	}

	private _invalidateKey(key: string): void {
		this._keyGenerations.set(key, (this._keyGenerations.get(key) ?? 0) + 1);
	}

	private _isCurrentGeneration(key: string, globalGeneration: number, keyGeneration: number): boolean {
		return this._globalGeneration === globalGeneration && (this._keyGenerations.get(key) ?? 0) === keyGeneration;
	}

	private _key(resource: string, scopes: readonly string[] | undefined): string {
		return `${resource}\x00${scopes ? [...new Set(scopes)].sort().join('\x00') : ''}`;
	}
}

/**
 * Resolves a bearer token for a protected resource by trying each
 * authorization server in order. First attempts an exact scope match,
 * then falls back to finding the session whose scopes are the narrowest
 * superset of the requested scopes.
 */
export async function resolveTokenForResource(
	resourceServer: URI,
	authorizationServers: readonly string[],
	scopes: readonly string[],
	authenticationService: IAuthenticationService,
	logService: ILogService,
	logPrefix: string,
): Promise<string | undefined> {
	for (const server of authorizationServers) {
		const serverUri = URI.parse(server);
		const providerId = await authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
		if (!providerId) {
			logService.trace(`${logPrefix} No auth provider found for server: ${server}`);
			continue;
		}
		logService.trace(`${logPrefix} Resolved auth provider '${providerId}' for server: ${server}`);

		// Try exact scope match first
		const sessions = await authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
		if (sessions.length > 0) {
			return sessions[0].accessToken;
		}

		// Fall back: get all sessions and find the narrowest superset of requested scopes
		const allSessions = await authenticationService.getSessions(providerId, undefined, { authorizationServer: serverUri }, true);
		const requestedSet = new Set(scopes);
		let bestToken: string | undefined;
		let bestExtraScopes = Infinity;
		for (const session of allSessions) {
			const sessionScopes = new Set(session.scopes);
			let isSuperset = true;
			for (const scope of requestedSet) {
				if (!sessionScopes.has(scope)) {
					isSuperset = false;
					break;
				}
			}
			if (isSuperset) {
				const extraScopes = sessionScopes.size - requestedSet.size;
				if (extraScopes < bestExtraScopes) {
					bestExtraScopes = extraScopes;
					bestToken = session.accessToken;
				}
			}
		}
		if (bestToken) {
			return bestToken;
		}
	}
	return undefined;
}

export interface IAgentHostAuthenticateRequest {
	readonly resource: string;
	readonly scopes?: readonly string[];
	readonly token: string;
}

export interface IAgentHostAuthenticationOptions {
	readonly authTokenCache?: AgentHostAuthTokenCache;
	readonly logPrefix: string;
	readonly authenticate: (request: IAgentHostAuthenticateRequest) => Promise<unknown>;
}

export interface IAgentHostMcpAuthenticationOptionsBase {
	readonly allowInteraction: boolean;
	readonly authTokenCache?: AgentHostAuthTokenCache;
	readonly logPrefix: string;
	readonly mcpServerId: string;
	readonly mcpServerName: string;
	readonly mcpServerUrl: string;
	readonly oauthClient?: McpOAuthClient;
	readonly scopes: readonly string[];
	readonly authorizationServerMetadataFetcher?: typeof fetchAuthorizationServerMetadata;
	/**
	 * Identifies the agent host backing this MCP server so remembered-auth
	 * entries can be surfaced in their own section of the "Manage Trusted MCP
	 * Servers" picker. When set, the resolved host label (via
	 * {@link ILabelService.getHostLabel}) is recorded on the allowed-server
	 * entry. Omit for non-agent-host callers.
	 */
	readonly agentHost?: { readonly scheme: string; readonly authority: string };
	readonly authenticate: (request: IAgentHostAuthenticateRequest) => Promise<unknown>;
}

async function forwardAuthenticationToken(
	options: Pick<IAgentHostAuthenticationOptions, 'authTokenCache' | 'authenticate'>,
	resource: string,
	scopes: readonly string[],
	token: string,
): Promise<boolean> {
	const request = { resource, scopes, token };
	if (options.authTokenCache) {
		return options.authTokenCache.authenticate(resource, scopes, token, () => options.authenticate(request));
	}
	await options.authenticate(request);
	return true;
}

/**
 * Resolves and forwards bearer tokens for the protected resources declared by
 * the agents currently published from an agent host.
 */
export async function authenticateProtectedResources(
	accessor: ServicesAccessor,
	agents: readonly AgentInfo[],
	options: IAgentHostAuthenticationOptions,
): Promise<void> {
	const authenticationService = accessor.get(IAuthenticationService);
	const logService = accessor.get(ILogService);
	for (const agent of agents) {
		for (const resource of agent.protectedResources ?? []) {
			const resourceUri = URI.parse(resource.resource);
			const scopes = resource.scopes_supported ?? [];
			const token = await resolveTokenForResource(
				resourceUri,
				resource.authorization_servers ?? [],
				scopes,
				authenticationService,
				logService,
				options.logPrefix,
			);
			if (!token) {
				logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
				continue;
			}

			const authenticated = await forwardAuthenticationToken(options, resource.resource, scopes, token);
			if (!authenticated) {
				logService.trace(`${options.logPrefix} Auth token for ${resource.resource} unchanged; skipping authenticate RPC`);
				continue;
			}
			logService.info(`${options.logPrefix} Authenticating for resource: ${resource.resource}`);
		}
	}
}

/**
 * Prompts the user to authenticate one of the provided protected resources and
 * forwards the resulting token to the agent host connection.
 */
export async function resolveAuthenticationInteractively(
	accessor: ServicesAccessor,
	protectedResources: readonly ProtectedResourceMetadata[],
	options: IAgentHostAuthenticationOptions,
): Promise<boolean> {
	const authenticationService = accessor.get(IAuthenticationService);
	const commandService = accessor.get(ICommandService);
	const logService = accessor.get(ILogService);
	for (const resource of protectedResources) {
		const resourceUri = URI.parse(resource.resource);
		const scopes = resource.scopes_supported ?? [];
		let token = await resolveTokenForResource(
			resourceUri,
			resource.authorization_servers ?? [],
			scopes,
			authenticationService,
			logService,
			options.logPrefix,
		);
		if (token) {
			await forwardAuthenticationToken(options, resource.resource, scopes, token);
			logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
			return true;
		}

		const setupResult = await commandService.executeCommand<IChatSetupResult>(CHAT_SETUP_ACTION_ID, undefined, {
			forceSignInDialog: true,
			additionalScopes: scopes,
			dialogTitle: localize('agentHost.signInDialogTitle', "Sign in to use GitHub Copilot"),
			disableChatViewReveal: true,
			returnResult: true,
		});
		if (setupResult?.success === undefined) {
			return false;
		}
		if (!setupResult.success) {
			throw setupResult.error ?? new Error(localize('agentHost.signInFailed', "Failed to sign in to use GitHub Copilot."));
		}
		token = await resolveTokenForResource(
			resourceUri,
			resource.authorization_servers ?? [],
			scopes,
			authenticationService,
			logService,
			options.logPrefix,
		);
		if (!token) {
			return false;
		}
		await forwardAuthenticationToken(options, resource.resource, scopes, token);
		logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
		return true;
	}

	return false;
}

export async function resolveMcpServerAuthentication(
	accessor: ServicesAccessor,
	protectedResource: ProtectedResourceMetadata,
	options: IAgentHostMcpAuthenticationOptionsBase,
): Promise<boolean> {
	const authenticationService = accessor.get(IAuthenticationService);
	const authenticationMcpAccessService = accessor.get(IAuthenticationMcpAccessService);
	const authenticationMcpService = accessor.get(IAuthenticationMcpService);
	const authenticationMcpUsageService = accessor.get(IAuthenticationMcpUsageService);
	const logService = accessor.get(ILogService);
	const dynamicAuthenticationProviderStorageService = options.oauthClient
		? accessor.get(IDynamicAuthenticationProviderStorageService)
		: undefined;
	const agentHostMeta = options.agentHost
		? { authority: options.agentHost.authority, label: accessor.get(ILabelService).getHostLabel(options.agentHost.scheme, options.agentHost.authority) }
		: undefined;
	// GitHub MCP supports demand-driven step-up auth, while other servers may reject authorization requests with no scopes.
	const scopes = options.scopes.length > 0 || isGitHubMcpResource(protectedResource)
		? options.scopes
		: protectedResource.scopes_supported ?? [];
	for (const authorizationServer of protectedResource.authorization_servers ?? []) {
		const authorizationServerUri = URI.parse(authorizationServer);
		const providerId = await getOrCreateProviderForMcpResource(
			authorizationServerUri,
			protectedResource,
			options.oauthClient,
			authenticationService,
			dynamicAuthenticationProviderStorageService,
			logService,
			options.logPrefix,
			options.allowInteraction,
			options.authorizationServerMetadataFetcher ?? fetchAuthorizationServerMetadata,
		);
		if (!providerId) {
			continue;
		}

		const oauthClientOptions = options.oauthClient
			? { clientId: options.oauthClient.clientId, clientSecret: options.oauthClient.clientSecret }
			: {};
		const sessions = await authenticationService.getSessions(providerId, [...scopes], {
			authorizationServer: authorizationServerUri,
			resource: protectedResource.resource,
			...oauthClientOptions,
		}, true);
		const allowedSession = getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options);
		if (allowedSession) {
			await authenticateMcpSession(providerId, allowedSession, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, false, agentHostMeta);
			return true;
		}

		if (!options.allowInteraction) {
			continue;
		}

		const provider = authenticationService.getProvider(providerId);
		const session = sessions.length
			? provider.supportsMultipleAccounts
				? await authenticationMcpService.selectSession(providerId, options.mcpServerId, options.mcpServerName, [...scopes], sessions)
				: sessions[0]
			: await authenticationService.createSession(providerId, [...scopes], {
				activateImmediate: true,
				authorizationServer: authorizationServerUri,
				resource: protectedResource.resource,
				...oauthClientOptions,
			});
		await authenticateMcpSession(providerId, session, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, true, agentHostMeta);
		return true;
	}
	return false;
}

function isGitHubMcpResource(resource: ProtectedResourceMetadata): boolean {
	return resource.resource_name === 'GitHub MCP Server';
}

async function getOrCreateProviderForMcpResource(
	authorizationServer: URI,
	protectedResource: ProtectedResourceMetadata,
	oauthClient: McpOAuthClient | undefined,
	authenticationService: IAuthenticationService,
	dynamicAuthenticationProviderStorageService: IDynamicAuthenticationProviderStorageService | undefined,
	logService: ILogService,
	logPrefix: string,
	allowCreation: boolean,
	authorizationServerMetadataFetcher: typeof fetchAuthorizationServerMetadata,
): Promise<string | undefined> {
	const resourceUri = URI.parse(protectedResource.resource);
	if (oauthClient) {
		if (!dynamicAuthenticationProviderStorageService) {
			throw new Error('Dynamic authentication provider storage is required for a configured OAuth client.');
		}
		const dynamicProviderId = getDynamicAuthenticationProviderId(authorizationServer, protectedResource);
		const isProviderActive = authenticationService.isDynamicAuthenticationProvider(dynamicProviderId);
		const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
		const clientMatches = registeredClient?.clientId === oauthClient.clientId && registeredClient.clientSecret === oauthClient.clientSecret;
		if (clientMatches) {
			if (isProviderActive) {
				return dynamicProviderId;
			}
		} else {
			if (!allowCreation) {
				return undefined;
			}
			if (isProviderActive) {
				authenticationService.unregisterAuthenticationProvider(dynamicProviderId);
				await dynamicAuthenticationProviderStorageService.removeDynamicProvider(dynamicProviderId);
			}
		}
	} else {
		const existing = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceUri);
		if (existing || !allowCreation) {
			return existing;
		}
	}

	try {
		const { metadata } = await authorizationServerMetadataFetcher(authorizationServer.toString(true));
		const provider = await authenticationService.createDynamicAuthenticationProvider(authorizationServer, metadata, protectedResource, oauthClient?.clientId, oauthClient?.clientSecret);
		return provider?.id;
	} catch (err) {
		logService.warn(`${logPrefix} Failed to create MCP auth provider for ${authorizationServer.toString(true)}`, err);
		return undefined;
	}
}

function getAllowedMcpSession(
	providerId: string,
	sessions: readonly AuthenticationSession[],
	authenticationMcpAccessService: IAuthenticationMcpAccessService,
	authenticationMcpService: IAuthenticationMcpService,
	options: IAgentHostMcpAuthenticationOptionsBase,
): AuthenticationSession | undefined {
	const accountNamePreference = authenticationMcpService.getAccountPreference(options.mcpServerId, providerId);
	if (accountNamePreference) {
		const preferred = sessions.find(session => session.account.label === accountNamePreference);
		if (preferred && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, preferred.account.label, options.mcpServerId, options.mcpServerUrl)) {
			return preferred;
		}
	}

	if (sessions.length === 1 && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, sessions[0].account.label, options.mcpServerId, options.mcpServerUrl)) {
		return sessions[0];
	}

	return undefined;
}

async function authenticateMcpSession(
	providerId: string,
	session: AuthenticationSession,
	scopes: readonly string[],
	authenticationMcpAccessService: IAuthenticationMcpAccessService,
	authenticationMcpService: IAuthenticationMcpService,
	authenticationMcpUsageService: IAuthenticationMcpUsageService,
	logService: ILogService,
	options: IAgentHostMcpAuthenticationOptionsBase,
	updateAccess: boolean,
	agentHost: { readonly authority: string; readonly label: string } | undefined,
): Promise<void> {
	await forwardAuthenticationToken(options, options.mcpServerUrl, scopes, session.accessToken);
	if (updateAccess) {
		authenticationMcpAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: options.mcpServerId, name: options.mcpServerName, allowed: true, url: options.mcpServerUrl, agentHost }]);
		authenticationMcpService.updateAccountPreference(options.mcpServerId, providerId, session.account);
	}
	authenticationMcpUsageService.addAccountUsage(providerId, session.account.label, scopes, options.mcpServerId, options.mcpServerName);
	logService.info(`${options.logPrefix} MCP authentication succeeded for ${options.mcpServerName}`);
}
