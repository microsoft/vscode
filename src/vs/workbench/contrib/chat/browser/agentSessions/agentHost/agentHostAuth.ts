/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fetchAuthorizationServerMetadata } from '../../../../../../base/common/oauth.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type McpOAuthClient, type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type AgentInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAuthenticationMcpAccessService } from '../../../../../services/authentication/browser/authenticationMcpAccessService.js';
import { IAuthenticationMcpService } from '../../../../../services/authentication/browser/authenticationMcpService.js';
import { IAuthenticationMcpUsageService } from '../../../../../services/authentication/browser/authenticationMcpUsageService.js';
import { AuthenticationSession, getDynamicAuthenticationProviderId, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IDynamicAuthenticationProviderStorageService } from '../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js';

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
	private readonly _lastTokens = new Map<string, string>();

	/**
	 * Record that we just sent `token` for `resource` and `scopes`, and return
	 * whether this is a change from the last token sent. When `false`, callers
	 * should skip the `authenticate` RPC.
	 */
	updateAndIsChanged(resource: string, scopes: readonly string[] | undefined, token: string): boolean {
		const key = this._key(resource, scopes);
		const previous = this._lastTokens.get(key);
		if (previous === token) {
			return false;
		}
		this._lastTokens.set(key, token);
		return true;
	}

	/**
	 * Clear the cached token for a specific resource/scope pair, a whole resource,
	 * or all resources if no argument is given. Call after a failed `authenticate`
	 * RPC or when the agent host process restarts.
	 */
	clear(resource?: string, scopes?: readonly string[]): void {
		if (resource !== undefined) {
			if (scopes !== undefined) {
				this._lastTokens.delete(this._key(resource, scopes));
				return;
			}
			const prefix = `${resource}\x00`;
			for (const key of [...this._lastTokens.keys()]) {
				if (key.startsWith(prefix)) {
					this._lastTokens.delete(key);
				}
			}
		} else {
			this._lastTokens.clear();
		}
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
	readonly authenticationService: IAuthenticationService;
	readonly logPrefix: string;
	readonly logService: ILogService;
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

/**
 * Resolves and forwards bearer tokens for the protected resources declared by
 * the agents currently published from an agent host.
 */
export async function authenticateProtectedResources(
	agents: readonly AgentInfo[],
	options: IAgentHostAuthenticationOptions,
): Promise<void> {
	for (const agent of agents) {
		for (const resource of agent.protectedResources ?? []) {
			const resourceUri = URI.parse(resource.resource);
			const scopes = resource.scopes_supported ?? [];
			const token = await resolveTokenForResource(
				resourceUri,
				resource.authorization_servers ?? [],
				scopes,
				options.authenticationService,
				options.logService,
				options.logPrefix,
			);
			if (!token) {
				options.logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
				continue;
			}

			if (options.authTokenCache && !options.authTokenCache.updateAndIsChanged(resource.resource, scopes, token)) {
				options.logService.trace(`${options.logPrefix} Auth token for ${resource.resource} unchanged; skipping authenticate RPC`);
				continue;
			}

			options.logService.info(`${options.logPrefix} Authenticating for resource: ${resource.resource}`);
			try {
				await options.authenticate({ resource: resource.resource, scopes, token });
			} catch (err) {
				options.authTokenCache?.clear(resource.resource, scopes);
				throw err;
			}
		}
	}
}

/**
 * Prompts the user to authenticate one of the provided protected resources and
 * forwards the resulting token to the agent host connection.
 */
export async function resolveAuthenticationInteractively(
	protectedResources: readonly ProtectedResourceMetadata[],
	options: IAgentHostAuthenticationOptions,
): Promise<boolean> {
	for (const resource of protectedResources) {
		const resourceUri = URI.parse(resource.resource);
		const scopes = resource.scopes_supported ?? [];
		const token = await resolveTokenForResource(
			resourceUri,
			resource.authorization_servers ?? [],
			scopes,
			options.authenticationService,
			options.logService,
			options.logPrefix,
		);
		if (token) {
			await options.authenticate({ resource: resource.resource, scopes, token });
			options.authTokenCache?.updateAndIsChanged(resource.resource, scopes, token);
			options.logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
			return true;
		}

		for (const server of resource.authorization_servers ?? []) {
			const serverUri = URI.parse(server);
			const providerId = await options.authenticationService.getOrActivateProviderIdForServer(serverUri, resourceUri);
			if (!providerId) {
				continue;
			}

			const session = await options.authenticationService.createSession(providerId, [...scopes], {
				activateImmediate: true,
				authorizationServer: serverUri,
			});

			await options.authenticate({ resource: resource.resource, scopes, token: session.accessToken });
			options.authTokenCache?.updateAndIsChanged(resource.resource, scopes, session.accessToken);
			options.logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
			return true;
		}
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
		if (authenticationService.isDynamicAuthenticationProvider(dynamicProviderId)) {
			const registered = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
			if (registered?.clientId === oauthClient.clientId && registered.clientSecret === oauthClient.clientSecret) {
				return dynamicProviderId;
			}
			if (!allowCreation) {
				return undefined;
			}
			authenticationService.unregisterAuthenticationProvider(dynamicProviderId);
			await dynamicAuthenticationProviderStorageService.removeDynamicProvider(dynamicProviderId);
		} else if (!allowCreation) {
			return undefined;
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
	await options.authenticate({ resource: options.mcpServerUrl, scopes, token: session.accessToken });
	options.authTokenCache?.updateAndIsChanged(options.mcpServerUrl, scopes, session.accessToken);
	if (updateAccess) {
		authenticationMcpAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: options.mcpServerId, name: options.mcpServerName, allowed: true, url: options.mcpServerUrl, agentHost }]);
		authenticationMcpService.updateAccountPreference(options.mcpServerId, providerId, session.account);
	}
	authenticationMcpUsageService.addAccountUsage(providerId, session.account.label, scopes, options.mcpServerId, options.mcpServerName);
	logService.info(`${options.logPrefix} MCP authentication succeeded for ${options.mcpServerName}`);
}
