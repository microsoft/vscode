/**
 * Authentication handler for DIAL API.
 * Supports OpenID Connect (OIDC) and API Key authentication.
 */

import * as vscode from 'vscode';
import axios from 'axios';
import { DialSecrets } from './dialSecrets';
import { formatHttpError, isTransientHttpError } from './httpError';
import { isAccessTokenExpired, summarizeAccessToken, summarizeAccessTokenClaims } from './jwtUtils';
import {
	buildKeycloakClientRegistrationBody,
	buildOidcClientRegistrationBody,
	keycloakClientRegistrationUrl,
	keycloakDefaultRegistrationUrl,
	mergeDefaultClientScopes,
	missingDefaultClientScopes,
	normalizeRegisteredClientMetadata,
	readDefaultClientScopesFromResponse,
	readRegistrationAccessToken,
} from './keycloakClientRegistration';
import { sanitizeHttpUrlForLog } from './logSanitize';
import { dialLog } from './logger';
import { createOAuthState, createPkcePair } from './oidcPkce';
import { runOAuthBrowserSignIn } from './oauthBrowserLogin';
import { DEFAULT_OAUTH_CALLBACK_PORT, getLoopbackRedirectUri } from './oauthLocalServer';
import {
	clearOidcClientCredentials,
	describeOidcClientSource,
	isExtensionManagedOidcClient,
	persistRegisteredOidcClient,
} from './oidcClientSettings';
import {
	asRecord,
	isStringArray,
	readNonEmptyString,
	readNumber,
	type JsonObject,
	type JsonValue,
} from './runtimeGuards';
import { type ClientMetadata, type DialConfig, type Nullable, type OpenIDConfig } from './types';

/** Upper bound for proactive refresh before JWT expiry. */
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
/** Lower bound for the refresh skew window. */
const ACCESS_TOKEN_REFRESH_SKEW_MIN_MS = 30_000;

interface OidcTokenResponse {
	readonly access_token: string;
	readonly refresh_token?: string;
	readonly expires_in: number;
	readonly scope?: string;
}

function parseOidcTokenResponse(rawInput: JsonValue): OidcTokenResponse {
	const raw = asRecord(rawInput);
	const accessToken = readNonEmptyString(raw, 'access_token');
	if (!accessToken) {
		throw new Error('OIDC token response missing access_token');
	}
	const expiresIn = readNumber(raw, 'expires_in');
	if (expiresIn === undefined) {
		throw new Error('OIDC token response missing expires_in');
	}

	const refreshToken = readNonEmptyString(raw, 'refresh_token');
	const scope = readNonEmptyString(raw, 'scope');

	return {
		access_token: accessToken,
		expires_in: expiresIn,
		...(refreshToken !== undefined ? { refresh_token: refreshToken } : {}),
		...(scope !== undefined ? { scope } : {}),
	};
}

function parseOpenIdConfig(rawInput: JsonValue): OpenIDConfig {
	const raw = asRecord(rawInput);
	const issuer = readNonEmptyString(raw, 'issuer');
	const authorizationEndpoint = readNonEmptyString(raw, 'authorization_endpoint');
	const tokenEndpoint = readNonEmptyString(raw, 'token_endpoint');
	if (!issuer || !authorizationEndpoint || !tokenEndpoint) {
		throw new Error(
			'OIDC discovery response missing issuer/authorization_endpoint/token_endpoint',
		);
	}
	const registrationEndpoint = readNonEmptyString(raw, 'registration_endpoint');
	const scopesSupported = isStringArray(raw.scopes_supported)
		? [...raw.scopes_supported]
		: undefined;

	return {
		issuer,
		authorization_endpoint: authorizationEndpoint,
		token_endpoint: tokenEndpoint,
		...(registrationEndpoint !== undefined
			? { registration_endpoint: registrationEndpoint }
			: {}),
		...(scopesSupported !== undefined ? { scopes_supported: scopesSupported } : {}),
	};
}

export interface AuthResult {
	readonly token: string;
	/** True only after a new browser sign-in or first-time API key entry. */
	readonly newlyAuthenticated: boolean;
}

export class DialAuthHandler {
	private readonly context: vscode.ExtensionContext;
	private readonly config: DialConfig;
	private readonly secrets: DialSecrets;
	private oidcConfig: Nullable<OpenIDConfig>;
	private clientMetadata: Nullable<ClientMetadata>;
	private refreshInFlight: Nullable<Promise<Nullable<string>>>;

	constructor(context: vscode.ExtensionContext, config: DialConfig) {
		this.context = context;
		this.config = config;
		this.secrets = new DialSecrets(context);
	}

	private oauthCallbackPort(): number {
		const port = this.config.oauthCallbackPort ?? DEFAULT_OAUTH_CALLBACK_PORT;
		if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
			return DEFAULT_OAUTH_CALLBACK_PORT;
		}
		return port;
	}

	private get redirectUri(): string {
		return getLoopbackRedirectUri(this.oauthCallbackPort());
	}

	async initializeOpenIDConnect(interactive = false): Promise<void> {
		if (!this.config.serverUrl) {
			throw new Error('DIAL server URL is not configured');
		}

		const wellKnownUrl = `${this.config.serverUrl.trimEnd()}/.well-known/openid-configuration`;
		dialLog.info(`OIDC discovery GET ${wellKnownUrl}`);

		try {
			if (interactive) {
				vscode.window.showInformationMessage(
					`Retrieving OpenID Connect configuration from ${wellKnownUrl}...`,
				);
			}

			const response = await axios.get<JsonValue>(wellKnownUrl, { timeout: 10_000 });
			this.oidcConfig = parseOpenIdConfig(response.data);
			dialLog.info(
				'OIDC discovery succeeded',
				`issuer=${this.oidcConfig.issuer}`,
				`token_endpoint=${this.oidcConfig.token_endpoint}`,
				`registration_endpoint=${this.oidcConfig.registration_endpoint ?? '(not advertised)'}`,
			);
			if (interactive) {
				vscode.window.showInformationMessage(
					'OpenID Connect configuration retrieved successfully',
				);
			}
		} catch (error: unknown) {
			const detail = await formatHttpError(error);
			dialLog.error('OIDC discovery failed', detail);
			vscode.window.showErrorMessage(
				`Failed to retrieve OpenID Connect configuration: ${detail}`,
			);
			throw new Error(detail);
		}
	}

	private requireOidcConfig(): OpenIDConfig {
		if (!this.oidcConfig) {
			throw new Error('OpenID Connect not initialized');
		}
		return this.oidcConfig;
	}

	async registerClient(interactive = false): Promise<void> {
		const oidcConfig = this.requireOidcConfig();
		const registrationUrl = oidcConfig.registration_endpoint;
		if (!registrationUrl) {
			const message =
				'OpenID provider did not advertise registration_endpoint — dynamic client registration is unavailable. Ask an admin for a pre-registered client_id.';
			dialLog.error('OIDC client registration unavailable', message);
			throw new Error(message);
		}

		if (!(await this.secrets.getOidcInitialAccessToken())) {
			dialLog.info(
				'No OIDC initial access token — using anonymous dynamic client registration',
			);
		}

		const registrationScopes = this.registrationClientScopes();
		dialLog.info('OIDC DCR client scopes', registrationScopes.join(' '));

		const keycloakDefaultUrl = keycloakDefaultRegistrationUrl(registrationUrl);
		const initialAccessToken = await this.secrets.getOidcInitialAccessToken();
		try {
			if (interactive) {
				vscode.window.showInformationMessage('Registering client with OpenID provider...');
			}
			const clientRepresentation = await this.createRegisteredClient(
				registrationUrl,
				keycloakDefaultUrl,
				registrationScopes,
				initialAccessToken,
			);
			const registered = normalizeRegisteredClientMetadata(clientRepresentation);
			const appliedScopes = readDefaultClientScopesFromResponse(clientRepresentation);
			dialLog.info(
				'Keycloak client scopes after registration',
				appliedScopes.length > 0 ? appliedScopes.join(' ') : '(none reported by Keycloak)',
			);

			const stillMissing = missingDefaultClientScopes(appliedScopes, registrationScopes);
			if (stillMissing.length > 0) {
				const policyHint =
					'Ask admin to whitelist scopes under Keycloak → Clients → Client registration → Anonymous request or Authenticated request → Allowed Client Scopes (see keycloak.org/securing-apps/client-registration).';
				dialLog.warn(
					'Keycloak did not assign requested client scopes',
					stillMissing.join(' '),
					policyHint,
				);
				vscode.window.showWarningMessage(
					`DIAL: client registered but Keycloak omitted scopes: ${stillMissing.join(', ')}. ${policyHint}`,
				);
			}

			await this.persistRegisteredClient(
				registered.client_id,
				registered.client_secret,
				interactive,
			);
		} catch (error: unknown) {
			const detail = await formatHttpError(error);
			dialLog.error(
				'OIDC client registration failed',
				detail,
				'Configure Keycloak Client Registration Policies (Anonymous or Authenticated request) for redirect URI and scopes, or set dial.oidcInitialAccessToken.',
			);
			vscode.window.showErrorMessage(`Client registration failed: ${detail}`);
			throw new Error(detail);
		}
	}

	private async createRegisteredClient(
		oidcRegistrationUrl: string,
		keycloakDefaultUrl: Nullable<string>,
		registrationScopes: string[],
		initialAccessToken: Nullable<string>,
	): Promise<JsonObject> {
		const order: readonly ('default' | 'openid-connect')[] = initialAccessToken
			? ['default', 'openid-connect']
			: ['openid-connect', 'default'];

		let lastError: unknown;
		for (const endpoint of order) {
			try {
				if (endpoint === 'default' && keycloakDefaultUrl) {
					dialLog.info(
						'Keycloak client registration POST (default provider)',
						keycloakDefaultUrl,
					);
					const created = await this.postKeycloakClientRegistration(
						keycloakDefaultUrl,
						buildKeycloakClientRegistrationBody(this.redirectUri, registrationScopes),
						initialAccessToken,
					);
					return await this.ensureKeycloakDefaultClientScopes(
						keycloakDefaultUrl,
						created,
						registrationScopes,
					);
				}

				if (endpoint === 'openid-connect') {
					dialLog.info(
						'OIDC client registration POST (openid-connect provider)',
						oidcRegistrationUrl,
					);
					const created = await this.postKeycloakClientRegistration(
						oidcRegistrationUrl,
						buildOidcClientRegistrationBody(this.redirectUri, registrationScopes),
						initialAccessToken,
					);

					if (!keycloakDefaultUrl) {
						return created;
					}

					return await this.ensureKeycloakDefaultClientScopes(
						keycloakDefaultUrl,
						created,
						registrationScopes,
					);
				}
			} catch (error: unknown) {
				lastError = error;
				const detail = await formatHttpError(error);
				dialLog.warn(`OIDC client registration via ${endpoint} failed`, detail);
			}
		}

		if (lastError instanceof Error) {
			throw lastError;
		}
		throw new Error(String(lastError ?? 'Client registration failed'));
	}

	private async postKeycloakClientRegistration(
		url: string,
		body: JsonObject,
		initialAccessToken: Nullable<string>,
	): Promise<JsonObject> {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (initialAccessToken) {
			headers.Authorization = `Bearer ${initialAccessToken}`;
		}
		const response = await axios.post<JsonValue>(url, body, {
			timeout: 10_000,
			headers,
		});
		return asRecord(response.data);
	}

	/** Keycloak docs: update client via PUT to default provider using registration access token. */
	private async ensureKeycloakDefaultClientScopes(
		defaultRegistrationUrl: string,
		clientRepresentation: JsonObject,
		requestedScopes: string[],
	): Promise<JsonObject> {
		const registered = normalizeRegisteredClientMetadata(clientRepresentation);
		const appliedScopes = readDefaultClientScopesFromResponse(clientRepresentation);
		const missing = missingDefaultClientScopes(appliedScopes, requestedScopes);
		if (missing.length === 0) {
			return clientRepresentation;
		}

		const registrationToken = readRegistrationAccessToken(clientRepresentation);
		if (!registrationToken) {
			dialLog.warn(
				'Cannot update Keycloak client scopes — registration access token missing from registration response',
			);
			return clientRepresentation;
		}

		const clientUrl = keycloakClientRegistrationUrl(
			defaultRegistrationUrl,
			registered.client_id,
		);
		dialLog.info(
			'Keycloak client registration PUT (assign default client scopes)',
			clientUrl,
			missing.join(' '),
		);

		let current = clientRepresentation;
		try {
			const getResponse = await axios.get<JsonValue>(clientUrl, {
				timeout: 10_000,
				headers: { Authorization: `Bearer ${registrationToken}` },
			});
			current = asRecord(getResponse.data);
		} catch (error: unknown) {
			const detail = await formatHttpError(error);
			dialLog.warn(
				'Keycloak client GET before scope update failed — using create response',
				detail,
			);
		}

		const updateToken = readRegistrationAccessToken(current) ?? registrationToken;
		const putResponse = await axios.put<JsonValue>(
			clientUrl,
			mergeDefaultClientScopes(current, requestedScopes),
			{
				timeout: 10_000,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${updateToken}`,
				},
			},
		);

		return asRecord(putResponse.data);
	}

	private async persistRegisteredClient(
		clientId: string,
		clientSecret: Nullable<string>,
		interactive = false,
	): Promise<void> {
		this.clientMetadata = { client_id: clientId };
		await persistRegisteredOidcClient(this.context, clientId, clientSecret);
		dialLog.info(
			'OIDC client registration succeeded',
			`client_id=${clientId}`,
			`has_secret=${Boolean(clientSecret)}`,
		);
		if (interactive) {
			vscode.window.showInformationMessage('Client registration completed successfully');
		}
	}

	async loginWithOpenID(interactive = true): Promise<AuthResult> {
		dialLog.info('OpenID login started', `serverUrl=${this.config.serverUrl}`);

		if (!this.oidcConfig) {
			await this.initializeOpenIDConnect(interactive);
		}
		if (!this.oidcConfig) {
			throw new Error('Failed to initialize OpenID Connect');
		}

		const validToken = await this.getValidAccessToken();
		if (validToken) {
			dialLog.info('OpenID login using valid access token', summarizeAccessToken(validToken));
			return { token: validToken, newlyAuthenticated: false };
		}

		try {
			const clientSource = await describeOidcClientSource(this.context, this.config);
			dialLog.info('OIDC client source', clientSource);

			let clientId = this.resolveOidcClientId();

			if (clientId) {
				dialLog.info('Using client_id for authorization', `client_id=${clientId}`);
				if (await isExtensionManagedOidcClient(this.context)) {
					dialLog.info(
						'If Keycloak shows "Client not found", run **DIAL: Clear OAuth Client** then login again',
					);
				}
			} else {
				dialLog.info('No client_id configured — attempting dynamic client registration');
				await this.registerClient(interactive);
				if (!this.clientMetadata) {
					throw new Error('Client registration failed');
				}
				clientId = this.clientMetadata.client_id;
			}

			const token = await this.runOpenIdAuthorization(clientId);
			return { token, newlyAuthenticated: true };
		} catch (error: unknown) {
			const detail = error instanceof Error ? error.message : String(error);
			if (
				isStaleOidcClientError(detail) &&
				(await isExtensionManagedOidcClient(this.context))
			) {
				const cleared = await this.clearStoredOidcClient();
				dialLog.warn(
					'Stale OIDC client removed — retrying login with new registration',
					cleared ? `was=${cleared}` : '',
				);
				try {
					await this.registerClient(interactive);
					if (!this.clientMetadata) {
						throw new Error('Client registration failed after clearing stale client');
					}
					const token = await this.runOpenIdAuthorization(this.clientMetadata.client_id);
					return { token, newlyAuthenticated: true };
				} catch (retryError: unknown) {
					const retryDetail =
						retryError instanceof Error ? retryError.message : String(retryError);
					dialLog.error('OpenID login retry failed', retryDetail);
					vscode.window.showErrorMessage(`OpenID Connect login failed: ${retryDetail}`);
					throw retryError instanceof Error ? retryError : new Error(retryDetail);
				}
			}

			dialLog.error('OpenID login failed', detail);
			vscode.window.showErrorMessage(`OpenID Connect login failed: ${detail}`);
			throw error instanceof Error ? error : new Error(detail);
		}
	}

	private async runOpenIdAuthorization(clientId: string): Promise<string> {
		const oidcConfig = this.requireOidcConfig();

		const pkce = createPkcePair();
		const state = createOAuthState();
		const scopeList = this.authorizationScopes();
		dialLog.info('OIDC authorization scopes', scopeList.join(' '));

		const authUrl = new URL(oidcConfig.authorization_endpoint);
		authUrl.searchParams.set('client_id', clientId);
		authUrl.searchParams.set('response_type', 'code');
		authUrl.searchParams.set('redirect_uri', this.redirectUri);
		authUrl.searchParams.set('scope', scopeList.join(' '));
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
		authUrl.searchParams.set('code_challenge_method', 'S256');

		dialLog.info('Opening authorization URL (PKCE)', sanitizeHttpUrlForLog(authUrl.toString()));
		dialLog.info('OIDC redirect URI (register in Keycloak)', this.redirectUri);

		const code = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'DIAL: waiting for sign-in…',
				cancellable: true,
			},
			async (_progress, cancellationToken) => {
				const abort = new AbortController();
				cancellationToken.onCancellationRequested(() => abort.abort());

				return await runOAuthBrowserSignIn({
					port: this.oauthCallbackPort(),
					expectedState: state,
					authorizationUrl: authUrl.toString(),
					profileMode: this.config.oauthBrowserProfile ?? 'auto',
					timeoutMs: 300_000,
					signal: abort.signal,
				});
			},
		);

		dialLog.info('Exchanging authorization code for tokens (PKCE)');
		const token = await this.exchangeCodeForToken(code, pkce.codeVerifier);
		dialLog.info('OpenID login succeeded', summarizeAccessToken(token));
		return token;
	}

	private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
		const oidcConfig = this.requireOidcConfig();
		const clientId = this.resolveOidcClientId();
		const clientSecret = await this.secrets.getOidcClientSecret();

		if (!clientId) {
			throw new Error('Client ID not found');
		}

		dialLog.info(
			'OIDC token exchange POST',
			oidcConfig.token_endpoint,
			`client_id=${clientId}`,
		);

		try {
			const body = new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: this.redirectUri,
				client_id: clientId,
				code_verifier: codeVerifier,
			});
			if (clientSecret) {
				body.set('client_secret', clientSecret);
			}

			const response = await axios.post<JsonValue>(oidcConfig.token_endpoint, body, {
				timeout: 10_000,
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			});

			const parsed = parseOidcTokenResponse(response.data);

			dialLog.info(
				'OIDC token exchange succeeded',
				`expires_in=${parsed.expires_in}s`,
				parsed.scope ? `response_scope=${parsed.scope}` : '',
				parsed.refresh_token ? 'refresh_token=yes' : 'refresh_token=no',
				summarizeAccessToken(parsed.access_token),
				summarizeAccessTokenClaims(parsed.access_token),
			);

			if (!parsed.refresh_token) {
				dialLog.warn(
					'No refresh_token in token response — add offline_access to dial.oidcScopes, whitelist it in Keycloak Client Registration, then DIAL: Clear OAuth Client and login again',
				);
			}

			await this.storeAccessToken(
				parsed.access_token,
				parsed.expires_in,
				parsed.refresh_token,
			);

			return parsed.access_token;
		} catch (error: unknown) {
			const detail = await formatHttpError(error);
			dialLog.error('OIDC token exchange failed', detail);
			vscode.window.showErrorMessage(`Token exchange failed: ${detail}`);
			throw new Error(detail);
		}
	}

	async getApiKeyAuth(): Promise<string> {
		dialLog.info('API key auth started');

		const stored = await this.secrets.getApiKey();
		if (stored) {
			dialLog.info('Using API key from secure storage');
			return stored;
		}

		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your DIAL API Key',
			placeHolder: 'API Key',
			password: true,
			ignoreFocusOut: true,
		});

		if (!apiKey) {
			dialLog.warn('API key auth cancelled');
			throw new Error('API Key not provided');
		}

		await this.secrets.setApiKey(apiKey);
		dialLog.info('API key stored in secure storage (OS keychain)');
		return apiKey;
	}

	async getAuthToken(): Promise<AuthResult> {
		if (this.config.authMethod === 'openid') {
			return this.loginWithOpenID(true);
		}
		const hadKey = Boolean(await this.secrets.getApiKey());
		const token = await this.getApiKeyAuth();
		return { token, newlyAuthenticated: !hadKey };
	}

	async getCachedToken(): Promise<Nullable<string>> {
		if (this.config.authMethod === 'apikey') {
			return this.secrets.getApiKey();
		}
		return this.getValidAccessToken();
	}

	/** Returns a non-expired access token, refreshing silently when possible. */
	async getValidAccessToken(): Promise<Nullable<string>> {
		if (this.config.authMethod === 'apikey') {
			return this.secrets.getApiKey();
		}

		const token = await this.secrets.getAccessToken();
		const expiryMs = this.secrets.getTokenExpiryMs();
		const refreshSkewMs = computeRefreshSkewMs(expiryMs);

		if (token && expiryMs !== undefined && !isAccessTokenExpired(expiryMs, refreshSkewMs)) {
			return token;
		}

		dialLog.info('Access token expired or near expiry — attempting refresh');
		const refreshed = await this.refreshAccessToken();
		if (refreshed) {
			return refreshed;
		}

		if (token && expiryMs !== undefined && !isAccessTokenExpired(expiryMs, 0)) {
			dialLog.warn(
				'OIDC refresh unavailable — continuing with existing access token until it expires',
			);
			return token;
		}

		return undefined;
	}

	async refreshAccessToken(): Promise<Nullable<string>> {
		if (this.refreshInFlight) {
			return this.refreshInFlight;
		}

		this.refreshInFlight = this.performRefreshAccessToken();
		try {
			return await this.refreshInFlight;
		} finally {
			this.refreshInFlight = undefined;
		}
	}

	private async performRefreshAccessToken(): Promise<Nullable<string>> {
		const refreshToken = await this.secrets.getRefreshToken();
		if (!refreshToken) {
			dialLog.warn('No refresh token available');
			return undefined;
		}

		await this.ensureOidcConfig();
		if (!this.oidcConfig) {
			return undefined;
		}

		const clientId = this.resolveOidcClientId();
		if (!clientId) {
			dialLog.warn('Cannot refresh token — no OIDC client_id');
			return undefined;
		}

		const clientSecret = await this.secrets.getOidcClientSecret();
		const body = new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: clientId,
		});
		if (clientSecret) {
			body.set('client_secret', clientSecret);
		}

		try {
			const oidcConfig = this.requireOidcConfig();
			const response = await axios.post<JsonValue>(oidcConfig.token_endpoint, body, {
				timeout: 10_000,
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			});

			const parsed = parseOidcTokenResponse(response.data);

			dialLog.info(
				'OIDC token refresh succeeded',
				`expires_in=${parsed.expires_in}s`,
				parsed.scope ? `response_scope=${parsed.scope}` : '',
				parsed.refresh_token ? 'refresh_token=rotated' : 'refresh_token=reused',
				summarizeAccessToken(parsed.access_token),
				summarizeAccessTokenClaims(parsed.access_token),
			);

			await this.storeAccessToken(
				parsed.access_token,
				parsed.expires_in,
				parsed.refresh_token ?? refreshToken,
			);
			return parsed.access_token;
		} catch (error: unknown) {
			const detail = await formatHttpError(error);
			if (isTransientHttpError(detail)) {
				dialLog.warn('OIDC token refresh temporarily unavailable', detail);
			} else {
				dialLog.error('OIDC token refresh failed', detail);
			}
			if (isRefreshTokenRejected(detail)) {
				await this.clearAccessTokenSecrets();
			}
			return undefined;
		}
	}

	private async ensureOidcConfig(): Promise<void> {
		if (!this.oidcConfig) {
			await this.initializeOpenIDConnect(false);
		}
	}

	private async storeAccessToken(
		accessToken: string,
		expiresIn: number,
		refreshToken?: string,
	): Promise<void> {
		await this.secrets.storeSession(accessToken, expiresIn, refreshToken);
	}

	/** Scopes requested in the authorization URL (must include openid). */
	private configuredAuthorizationScopes(): string[] {
		const requested = parseScopeSetting(
			this.config.oidcScopes,
			'openid profile offline_access dial-api',
		);
		return requested.includes('openid') ? requested : ['openid', ...requested];
	}

	/** Scopes assigned at dynamic client registration (oidcScopes without openid). */
	private registrationClientScopes(): string[] {
		return this.configuredAuthorizationScopes().filter((scope) => scope !== 'openid');
	}

	private authorizationScopes(): string[] {
		return this.warnUnknownDiscoveryScopes(this.configuredAuthorizationScopes());
	}

	private async clearAccessTokenSecrets(): Promise<void> {
		await this.secrets.clearSession();
	}

	/** Drop access/refresh tokens without removing the registered OIDC client. */
	async invalidateSession(): Promise<void> {
		dialLog.info('Invalidating OIDC session tokens');
		await this.clearAccessTokenSecrets();
	}

	async logout(): Promise<void> {
		dialLog.info('Logout — clearing stored session tokens');
		await this.clearAccessTokenSecrets();
		await this.secrets.deleteApiKey();
	}

	/** Remove the auto-registered OIDC client from settings. */
	async clearStoredOidcClient(): Promise<Nullable<string>> {
		this.clientMetadata = undefined;
		return clearOidcClientCredentials(this.context);
	}

	async describeOidcClientSource(): Promise<string> {
		return describeOidcClientSource(this.context, this.config);
	}

	private warnUnknownDiscoveryScopes(scopes: readonly string[]): string[] {
		const supported = this.oidcConfig?.scopes_supported;
		if (supported && supported.length > 0) {
			const unknown = scopes.filter((scope) => !supported.includes(scope));
			if (unknown.length > 0) {
				dialLog.warn(
					'OIDC scopes not advertised by provider',
					`unknown=${unknown.join(',')}`,
					`supported=${supported.join(',')}`,
				);
			}
		}
		return [...new Set(scopes)];
	}

	private resolveOidcClientId(): Nullable<string> {
		const fromMemory = this.clientMetadata?.client_id;
		if (fromMemory && fromMemory.length > 0) {
			return fromMemory;
		}
		const fromConfig = this.config.oidcClientId?.trim();
		return fromConfig ? fromConfig : undefined;
	}
}

function parseScopeSetting(raw: Nullable<string>, fallback: string): string[] {
	const trimmed = raw?.trim();
	const source = trimmed && trimmed.length > 0 ? trimmed : fallback;
	return [...new Set(source.split(/\s+/).filter(Boolean))];
}

function isStaleOidcClientError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes('client not found') ||
		lower.includes('invalid_client') ||
		lower.includes('unknown client')
	);
}

function isRefreshTokenRejected(detail: string): boolean {
	if (isTransientHttpError(detail)) {
		return false;
	}

	const lower = detail.toLowerCase();
	return (
		lower.includes('invalid_grant') ||
		lower.includes('invalid_token') ||
		lower.includes('http 401') ||
		lower.includes('token is not active') ||
		lower.includes('session not active') ||
		lower.includes('refresh token expired')
	);
}

/** Skew for proactive refresh; never treats a fresh token as immediately stale. */
function computeRefreshSkewMs(expiryTimeMs: Nullable<number>): number {
	if (expiryTimeMs === undefined) {
		return ACCESS_TOKEN_REFRESH_SKEW_MS;
	}

	const remainingMs = expiryTimeMs - Date.now();
	if (remainingMs <= 0) {
		return 0;
	}

	return Math.min(
		ACCESS_TOKEN_REFRESH_SKEW_MS,
		Math.max(ACCESS_TOKEN_REFRESH_SKEW_MIN_MS, Math.floor(remainingMs / 2)),
	);
}
