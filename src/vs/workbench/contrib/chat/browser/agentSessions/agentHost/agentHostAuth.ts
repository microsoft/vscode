/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fetchAuthorizationServerMetadata } from '../../../../../../base/common/oauth.js';
import { SequencerByKey } from '../../../../../../base/common/async.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { readAgentModelByokIdentifier } from '../../../../../../platform/agentHost/common/agentModelByokMeta.js';
import { type McpOAuthClient, type ModelSelection, type ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
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
 * Whether creating a session with the selected model requires the agent's protected-resource authentication.
 */
export function modelRequiresAgentAuthentication(agent: AgentInfo | undefined, model: ModelSelection | undefined, allowSignedOutWhenUsable = false): boolean {
	if (!agent?.protectedResources?.length) {
		return false;
	}
	const requiresAuthentication = agent.protectedResources.some(resource => resource.required !== false);
	if (!allowSignedOutWhenUsable || !agent.models.some(candidate => readAgentModelByokIdentifier(candidate) !== undefined)) {
		return requiresAuthentication;
	}
	if (!model) {
		return true;
	}
	const selectedModel = agent.models.find(candidate => candidate.id === model.id);
	return !selectedModel || readAgentModelByokIdentifier(selectedModel) === undefined;
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
 * Returns a stable identity for an authentication challenge.
 */
function protectedResourceAuthenticationKey(resource: ProtectedResourceMetadata): string {
	return JSON.stringify([
		resource.resource,
		[...new Set(resource.scopes_supported ?? [])].sort(),
		resource.authorization_servers ?? [],
	]);
}

/**
 * Coordinates recovery from authentication challenges for one agent-host connection.
 */
export class AgentHostAuthenticationRecovery {
	private readonly _resentTokens = new Map<string, string>();
	private readonly _pendingRecoveries = new Map<string, Promise<void>>();

	clear(): void {
		this._resentTokens.clear();
		this._pendingRecoveries.clear();
	}

	recover(accessor: ServicesAccessor, resource: ProtectedResourceMetadata, options: IAgentHostAuthenticationOptions): Promise<void> {
		const key = protectedResourceAuthenticationKey(resource);
		const pendingRecovery = this._pendingRecoveries.get(key);
		if (pendingRecovery) {
			return pendingRecovery;
		}

		const recovery = this._recover(accessor, key, resource, options)
			.finally(() => {
				if (this._pendingRecoveries.get(key) === recovery) {
					this._pendingRecoveries.delete(key);
				}
			});
		this._pendingRecoveries.set(key, recovery);
		return recovery;
	}

	private async _recover(accessor: ServicesAccessor, key: string, resource: ProtectedResourceMetadata, options: IAgentHostAuthenticationOptions): Promise<void> {
		throwIfAuthenticationStale(options);
		const authenticationService = accessor.get(IAuthenticationService);
		const commandService = accessor.get(ICommandService);
		const logService = accessor.get(ILogService);
		const scopes = resource.scopes_supported ?? [];
		const token = await resolveTokenForResource(
			URI.parse(resource.resource),
			resource.authorization_servers ?? [],
			scopes,
			authenticationService,
			logService,
			options.logPrefix,
		);
		throwIfAuthenticationStale(options);
		if (!token) {
			logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
			options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
			if (await forwardAuthenticationToken(options, resource.resource, scopes, '')) {
				this._resentTokens.delete(key);
				logService.info(`${options.logPrefix} Clearing authentication for resource: ${resource.resource}`);
			}
			return;
		}

		const previousToken = this._resentTokens.get(key);
		if (previousToken !== undefined && previousToken === token) {
			options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
			throwIfAuthenticationStale(options);
			const interactiveToken = await forceAuthenticationInteractively(authenticationService, commandService, logService, resource, options);
			throwIfAuthenticationStale(options);
			if (interactiveToken) {
				this._resentTokens.set(key, interactiveToken);
				if (interactiveToken === token) {
					logService.info(`${options.logPrefix} Interactive authentication completed without a new token for ${resource.resource}`);
				}
			}
			return;
		}

		options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
		if (await forwardAuthenticationToken(options, resource.resource, resource.scopes_supported ?? [], token)) {
			this._resentTokens.set(key, token);
			logService.info(`${options.logPrefix} Authenticating for resource: ${resource.resource}`);
		}
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
		const exactSession = sessions[0];
		if (exactSession) {
			return exactSession.accessToken;
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
	/** An empty token revokes the credential previously forwarded for this resource and scope set. */
	readonly token: string;
}

export interface IAgentHostAuthenticationOptions {
	readonly authTokenCache?: AgentHostAuthTokenCache;
	readonly logPrefix: string;
	readonly isCurrent?: () => boolean;
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
	options: Pick<IAgentHostAuthenticationOptions, 'authTokenCache' | 'authenticate' | 'isCurrent'>,
	resource: string,
	scopes: readonly string[],
	token: string,
): Promise<boolean> {
	throwIfAuthenticationStale(options);
	const request = { resource, scopes, token };
	if (options.authTokenCache) {
		return options.authTokenCache.authenticate(resource, scopes, token, () => options.authenticate(request));
	}
	await options.authenticate(request);
	return true;
}

function throwIfAuthenticationStale(options: Pick<IAgentHostAuthenticationOptions, 'isCurrent'>): void {
	if (options.isCurrent?.() === false) {
		throw new CancellationError();
	}
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
			await authenticateProtectedResourceWithServices(authenticationService, logService, resource, options);
		}
	}
}

/**
 * Resolves and forwards a bearer token for a single protected resource.
 */
export async function authenticateProtectedResource(
	accessor: ServicesAccessor,
	resource: ProtectedResourceMetadata,
	options: IAgentHostAuthenticationOptions,
): Promise<boolean> {
	return authenticateProtectedResourceWithServices(accessor.get(IAuthenticationService), accessor.get(ILogService), resource, options);
}

async function authenticateProtectedResourceWithServices(
	authenticationService: IAuthenticationService,
	logService: ILogService,
	resource: ProtectedResourceMetadata,
	options: IAgentHostAuthenticationOptions,
): Promise<boolean> {
	throwIfAuthenticationStale(options);
	const token = await resolveTokenForProtectedResource(authenticationService, logService, resource, options);
	throwIfAuthenticationStale(options);

	const authenticated = await forwardAuthenticationToken(options, resource.resource, resource.scopes_supported ?? [], token ?? '');
	if (!authenticated) {
		logService.trace(`${options.logPrefix} Authentication state for ${resource.resource} unchanged; skipping authenticate RPC`);
		return false;
	}
	logService.info(token
		? `${options.logPrefix} Authenticating for resource: ${resource.resource}`
		: `${options.logPrefix} Clearing authentication for resource: ${resource.resource}`);
	return true;
}

async function resolveTokenForProtectedResource(
	authenticationService: IAuthenticationService,
	logService: ILogService,
	resource: ProtectedResourceMetadata,
	options: Pick<IAgentHostAuthenticationOptions, 'logPrefix'>,
): Promise<string | undefined> {
	const token = await resolveTokenForResource(
		URI.parse(resource.resource),
		resource.authorization_servers ?? [],
		resource.scopes_supported ?? [],
		authenticationService,
		logService,
		options.logPrefix,
	);
	if (!token) {
		logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
	}
	return token;
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
		throwIfAuthenticationStale(options);
		const resourceUri = URI.parse(resource.resource);
		const scopes = resource.scopes_supported ?? [];
		const existingToken = await resolveTokenForResource(
			resourceUri,
			resource.authorization_servers ?? [],
			scopes,
			authenticationService,
			logService,
			options.logPrefix,
		);
		throwIfAuthenticationStale(options);
		if (existingToken) {
			await forwardAuthenticationToken(options, resource.resource, scopes, existingToken);
			logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
			return true;
		}

		return (await forceAuthenticationInteractively(authenticationService, commandService, logService, resource, options)) !== undefined;
	}

	return false;
}

async function forceAuthenticationInteractively(
	authenticationService: IAuthenticationService,
	commandService: ICommandService,
	logService: ILogService,
	resource: ProtectedResourceMetadata,
	options: IAgentHostAuthenticationOptions,
): Promise<string | undefined> {
	throwIfAuthenticationStale(options);
	const scopes = resource.scopes_supported ?? [];
	const setupResult = await commandService.executeCommand<IChatSetupResult>(CHAT_SETUP_ACTION_ID, undefined, {
		forceSignInDialog: true,
		additionalScopes: scopes,
		dialogTitle: localize('agentHost.signInDialogTitle', "Sign in to use GitHub Copilot"),
		disableChatViewReveal: true,
		returnResult: true,
	});
	throwIfAuthenticationStale(options);
	if (setupResult?.success === undefined) {
		return undefined;
	}
	if (!setupResult.success) {
		throw setupResult.error ?? new Error(localize('agentHost.signInFailed', "Failed to sign in to use GitHub Copilot."));
	}
	const token = await resolveTokenForResource(
		URI.parse(resource.resource),
		resource.authorization_servers ?? [],
		scopes,
		authenticationService,
		logService,
		options.logPrefix,
	);
	throwIfAuthenticationStale(options);
	if (!token) {
		logService.info(`${options.logPrefix} Interactive authentication did not provide a token for ${resource.resource}`);
		return undefined;
	}
	options.authTokenCache?.clear(resource.resource, scopes);
	if (!await forwardAuthenticationToken(options, resource.resource, scopes, token)) {
		return undefined;
	}
	logService.info(`${options.logPrefix} Interactive authentication completed for ${resource.resource}`);
	return token;
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
	const dynamicAuthenticationProviderStorageService = accessor.get(IDynamicAuthenticationProviderStorageService);
	const logService = accessor.get(ILogService);
	const agentHostMeta = options.agentHost
		? { authority: options.agentHost.authority, label: accessor.get(ILabelService).getHostLabel(options.agentHost.scheme, options.agentHost.authority) }
		: undefined;
	// GitHub MCP supports demand-driven step-up auth, while other servers may reject authorization requests with no scopes.
	const scopes = options.scopes.length > 0 || isGitHubMcpResource(protectedResource)
		? options.scopes
		: protectedResource.scopes_supported ?? [];
	const authenticationOperations = getMcpAuthenticationOperations(authenticationService);
	for (const authorizationServer of protectedResource.authorization_servers ?? []) {
		const authorizationServerUri = URI.parse(authorizationServer);
		const providerOperationId = getDynamicAuthenticationProviderId(authorizationServerUri, protectedResource);
		const authenticated = await authenticationOperations.queue(providerOperationId, async () => {
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
				return false;
			}

			const oauthClientOptions = options.oauthClient
				? { clientId: options.oauthClient.clientId, clientSecret: options.oauthClient.clientSecret }
				: {};
			const sessions = await authenticationService.getSessions(providerId, [...scopes], {
				authorizationServer: authorizationServerUri,
				resource: protectedResource.resource,
				...oauthClientOptions,
				silent: !options.allowInteraction,
			}, true);
			const allowedSession = getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options);
			if (allowedSession) {
				await authenticateMcpSession(providerId, allowedSession, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, false, agentHostMeta);
				return true;
			}

			if (!options.allowInteraction) {
				return false;
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
		});
		if (authenticated) {
			return true;
		}
	}
	return false;
}

const mcpAuthenticationOperations = new WeakMap<IAuthenticationService, SequencerByKey<string>>();

function getMcpAuthenticationOperations(authenticationService: IAuthenticationService): SequencerByKey<string> {
	let operations = mcpAuthenticationOperations.get(authenticationService);
	if (!operations) {
		operations = new SequencerByKey();
		mcpAuthenticationOperations.set(authenticationService, operations);
	}
	return operations;
}

function isGitHubMcpResource(resource: ProtectedResourceMetadata): boolean {
	return resource.resource_name === 'GitHub MCP Server';
}

async function getOrCreateProviderForMcpResource(
	authorizationServer: URI,
	protectedResource: ProtectedResourceMetadata,
	oauthClient: McpOAuthClient | undefined,
	authenticationService: IAuthenticationService,
	dynamicAuthenticationProviderStorageService: IDynamicAuthenticationProviderStorageService,
	logService: ILogService,
	logPrefix: string,
	allowCreation: boolean,
	authorizationServerMetadataFetcher: typeof fetchAuthorizationServerMetadata,
): Promise<string | undefined> {
	const resourceUri = URI.parse(protectedResource.resource);
	const dynamicProviderId = getDynamicAuthenticationProviderId(authorizationServer, protectedResource);
	let clientId = oauthClient?.clientId;
	let clientSecret = oauthClient?.clientSecret;
	if (oauthClient) {
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
		if (existing) {
			return existing;
		}
		const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
		if (!registeredClient?.clientId && !allowCreation) {
			return undefined;
		}
		clientId = registeredClient?.clientId;
		clientSecret = registeredClient?.clientSecret;
	}

	try {
		const { metadata } = await authorizationServerMetadataFetcher(authorizationServer.toString(true));
		const provider = await authenticationService.createDynamicAuthenticationProvider(authorizationServer, metadata, protectedResource, clientId, clientSecret);
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
