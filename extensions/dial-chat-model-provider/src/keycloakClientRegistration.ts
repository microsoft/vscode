/** Keycloak-specific dynamic client registration helpers. */

import { isStringArray, readNonEmptyString, type JsonObject } from './runtimeGuards';
import { type Nullable } from './types';

export function keycloakDefaultRegistrationUrl(registrationEndpoint: string): Nullable<string> {
	const trimmed = registrationEndpoint.replace(/\/$/, '');
	const oidcSuffix = '/clients-registrations/openid-connect';

	if (trimmed.endsWith(oidcSuffix)) {
		return `${trimmed.slice(0, -oidcSuffix.length)}/clients-registrations/default`;
	}

	if (trimmed.includes(`${oidcSuffix}/`)) {
		return trimmed.replace(`${oidcSuffix}/`, '/clients-registrations/default/');
	}

	return undefined;
}

export function keycloakClientRegistrationUrl(
	defaultRegistrationUrl: string,
	clientId: string,
): string {
	return `${defaultRegistrationUrl.replace(/\/$/, '')}/${encodeURIComponent(clientId)}`;
}

export function buildKeycloakClientRegistrationBody(
	redirectUri: string,
	defaultClientScopes: readonly string[],
): JsonObject {
	return {
		name: 'VS Code DIAL Chat Model Provider',
		protocol: 'openid-connect',
		publicClient: true,
		standardFlowEnabled: true,
		implicitFlowEnabled: false,
		directAccessGrantsEnabled: false,
		serviceAccountsEnabled: false,
		redirectUris: [redirectUri],
		defaultClientScopes: [...defaultClientScopes],
		attributes: {
			'pkce.code.challenge.method': 'S256',
		},
	};
}

export function buildOidcClientRegistrationBody(
	redirectUri: string,
	defaultClientScopes: readonly string[],
): JsonObject {
	return {
		client_name: 'VS Code DIAL Chat Model Provider',
		redirect_uris: [redirectUri],
		response_types: ['code'],
		application_type: 'native',
		grant_types: ['authorization_code', 'refresh_token'],
		token_endpoint_auth_method: 'none',
		scope: defaultClientScopes.join(' '),
	};
}

export interface RegisteredClient {
	readonly client_id: string;
	readonly client_secret?: string;
}

export function normalizeRegisteredClientMetadata(data: JsonObject): RegisteredClient {
	const clientId = readNonEmptyString(data, 'client_id') ?? readNonEmptyString(data, 'clientId');
	if (!clientId) {
		throw new Error('Client registration response missing client_id');
	}

	const secret =
		readNonEmptyString(data, 'client_secret') ?? readNonEmptyString(data, 'clientSecret');
	return secret ? { client_id: clientId, client_secret: secret } : { client_id: clientId };
}

export function readRegistrationAccessToken(data: JsonObject): Nullable<string> {
	return (
		readNonEmptyString(data, 'registration_access_token') ??
		readNonEmptyString(data, 'registrationAccessToken')
	);
}

export function readDefaultClientScopesFromResponse(data: JsonObject): readonly string[] {
	const scopes = data.defaultClientScopes;
	return isStringArray(scopes) ? scopes : [];
}

export function missingDefaultClientScopes(
	applied: readonly string[],
	requested: readonly string[],
): string[] {
	const appliedSet = new Set(applied);
	return requested.filter((scope) => !appliedSet.has(scope));
}

export function mergeDefaultClientScopes(
	clientRepresentation: JsonObject,
	defaultClientScopes: readonly string[],
): JsonObject {
	return {
		...clientRepresentation,
		defaultClientScopes: [...defaultClientScopes],
	};
}
