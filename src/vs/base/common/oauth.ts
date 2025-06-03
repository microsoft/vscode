/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from './buffer.js';

const WELL_KNOWN_ROUTE = '/.well-known';
export const AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-protected-resource`;
export const AUTH_SERVER_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-authorization-server`;

//#region types

/**
 * Metadata about a protected resource.
 */
export interface IAuthorizationProtectedResourceMetadata {
	/**
	 * REQUIRED. The protected resource's resource identifier URL that uses https scheme and has no fragment components.
	 */
	resource: string;

	/**
	 * OPTIONAL. Human-readable name of the protected resource intended for display to the end user.
	 */
	resource_name?: string;

	/**
	 * OPTIONAL. JSON array containing a list of OAuth authorization server identifiers.
	 */
	authorization_servers?: string[];

	/**
	 * OPTIONAL. URL of the protected resource's JWK Set document.
	 */
	jwks_uri?: string;

	/**
	 * RECOMMENDED. JSON array containing a list of the OAuth 2.0 scope values used in authorization requests.
	 */
	scopes_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of the OAuth 2.0 Bearer Token presentation methods supported.
	 */
	bearer_methods_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of the JWS signing algorithms supported.
	 */
	resource_signing_alg_values_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of the JWE encryption algorithms supported.
	 */
	resource_encryption_alg_values_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of the JWE encryption algorithms supported.
	 */
	resource_encryption_enc_values_supported?: string[];

	/**
	 * OPTIONAL. URL of a page containing human-readable documentation.
	 */
	resource_documentation?: string;

	/**
	 * OPTIONAL. URL that provides the resource's requirements on how clients can use the data.
	 */
	resource_policy_uri?: string;

	/**
	 * OPTIONAL. URL that provides the resource's terms of service.
	 */
	resource_tos_uri?: string;
}

/**
 * Metadata about an OAuth 2.0 Authorization Server.
 */
export interface IAuthorizationServerMetadata {
	/**
	 * REQUIRED. The authorization server's issuer identifier URL that uses https scheme and has no query or fragment components.
	 */
	issuer: string;

	/**
	 * URL of the authorization server's authorization endpoint.
	 * This is REQUIRED unless no grant types are supported that use the authorization endpoint.
	 */
	authorization_endpoint?: string;

	/**
	 * URL of the authorization server's token endpoint.
	 * This is REQUIRED unless only the implicit grant type is supported.
	 */
	token_endpoint?: string;

	/**
	 * OPTIONAL. URL of the authorization server's device code endpoint.
	 */
	device_authorization_endpoint?: string;

	/**
	 * OPTIONAL. URL of the authorization server's JWK Set document containing signing keys.
	 */
	jwks_uri?: string;

	/**
	 * OPTIONAL. URL of the authorization server's OAuth 2.0 Dynamic Client Registration endpoint.
	 */
	registration_endpoint?: string;

	/**
	 * RECOMMENDED. JSON array containing a list of the OAuth 2.0 scope values supported.
	 */
	scopes_supported?: string[];

	/**
	 * REQUIRED. JSON array containing a list of the OAuth 2.0 response_type values supported.
	 */
	response_types_supported: string[];

	/**
	 * OPTIONAL. JSON array containing a list of the OAuth 2.0 response_mode values supported.
	 * Default is ["query", "fragment"].
	 */
	response_modes_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of OAuth 2.0 grant type values supported.
	 * Default is ["authorization_code", "implicit"].
	 */
	grant_types_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of client authentication methods supported by the token endpoint.
	 * Default is "client_secret_basic".
	 */
	token_endpoint_auth_methods_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of JWS signing algorithms supported by the token endpoint.
	 */
	token_endpoint_auth_signing_alg_values_supported?: string[];

	/**
	 * OPTIONAL. URL of a page containing human-readable documentation for developers.
	 */
	service_documentation?: string;

	/**
	 * OPTIONAL. Languages and scripts supported for the user interface, as a JSON array of BCP 47 language tags.
	 */
	ui_locales_supported?: string[];

	/**
	 * OPTIONAL. URL that the authorization server provides to read about the authorization server's requirements.
	 */
	op_policy_uri?: string;

	/**
	 * OPTIONAL. URL that the authorization server provides to read about the authorization server's terms of service.
	 */
	op_tos_uri?: string;

	/**
	 * OPTIONAL. URL of the authorization server's OAuth 2.0 revocation endpoint.
	 */
	revocation_endpoint?: string;

	/**
	 * OPTIONAL. JSON array containing a list of client authentication methods supported by the revocation endpoint.
	 */
	revocation_endpoint_auth_methods_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of JWS signing algorithms supported by the revocation endpoint.
	 */
	revocation_endpoint_auth_signing_alg_values_supported?: string[];

	/**
	 * OPTIONAL. URL of the authorization server's OAuth 2.0 introspection endpoint.
	 */
	introspection_endpoint?: string;

	/**
	 * OPTIONAL. JSON array containing a list of client authentication methods supported by the introspection endpoint.
	 */
	introspection_endpoint_auth_methods_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of JWS signing algorithms supported by the introspection endpoint.
	 */
	introspection_endpoint_auth_signing_alg_values_supported?: string[];

	/**
	 * OPTIONAL. JSON array containing a list of PKCE code challenge methods supported.
	 */
	code_challenge_methods_supported?: string[];
}

export interface IRequiredAuthorizationServerMetadata extends IAuthorizationServerMetadata {
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint: string;
}

/**
 * Response from the dynamic client registration endpoint.
 */
export interface IAuthorizationDynamicClientRegistrationResponse {
	/**
	 * REQUIRED. The client identifier issued by the authorization server.
	 */
	client_id: string;

	/**
	 * OPTIONAL. The client secret issued by the authorization server.
	 * Not returned for public clients.
	 */
	client_secret?: string;

	/**
	 * OPTIONAL. Time at which the client secret will expire in seconds since the Unix Epoch.
	 */
	client_secret_expires_at?: number;

	/**
	 * REQUIRED. Client name as provided during registration.
	 */
	client_name: string;

	/**
	 * OPTIONAL. Client URI as provided during registration.
	 */
	client_uri?: string;

	/**
	 * OPTIONAL. Array of redirection URIs as provided during registration.
	 */
	redirect_uris?: string[];

	/**
	 * OPTIONAL. Array of grant types allowed for the client.
	 */
	grant_types?: string[];

	/**
	 * OPTIONAL. Array of response types allowed for the client.
	 */
	response_types?: string[];

	/**
	 * OPTIONAL. Type of authentication method used by the client.
	 */
	token_endpoint_auth_method?: string;
}

/**
 * Response from the authorization endpoint.
 * Typically returned as query parameters in a redirect.
 */
export interface IAuthorizationAuthorizeResponse {
	/**
	 * REQUIRED. The authorization code generated by the authorization server.
	 */
	code: string;

	/**
	 * REQUIRED. The state value that was sent in the authorization request.
	 * Used to prevent CSRF attacks.
	 */
	state: string;
}

/**
 * Error response from the authorization endpoint.
 */
export interface IAuthorizationAuthorizeErrorResponse {
	/**
	 * REQUIRED. Error code as specified in OAuth 2.0.
	 */
	error: string;

	/**
	 * OPTIONAL. Human-readable description of the error.
	 */
	error_description?: string;

	/**
	 * OPTIONAL. URI to a human-readable web page with more information about the error.
	 */
	error_uri?: string;

	/**
	 * REQUIRED. The state value that was sent in the authorization request.
	 */
	state: string;
}

/**
 * Response from the token endpoint.
 */
export interface IAuthorizationTokenResponse {
	/**
	 * REQUIRED. The access token issued by the authorization server.
	 */
	access_token: string;

	/**
	 * REQUIRED. The type of the token issued. Usually "Bearer".
	 */
	token_type: string;

	/**
	 * RECOMMENDED. The lifetime in seconds of the access token.
	 */
	expires_in?: number;

	/**
	 * OPTIONAL. The refresh token, which can be used to obtain new access tokens.
	 */
	refresh_token?: string;

	/**
	 * OPTIONAL. The scope of the access token as a space-delimited list of strings.
	 */
	scope?: string;

	/**
	 * OPTIONAL. ID Token value associated with the authenticated session for OpenID Connect flows.
	 */
	id_token?: string;
}

/**
 * Error response from the token endpoint.
 */
export interface IAuthorizationTokenErrorResponse {
	/**
	 * REQUIRED. Error code as specified in OAuth 2.0.
	 */
	error: string;

	/**
	 * OPTIONAL. Human-readable description of the error.
	 */
	error_description?: string;

	/**
	 * OPTIONAL. URI to a human-readable web page with more information about the error.
	 */
	error_uri?: string;
}

/**
 * Response from the device authorization endpoint as per RFC 8628 section 3.2.
 */
export interface IAuthorizationDeviceResponse {
	/**
	 * REQUIRED. The device verification code.
	 */
	device_code: string;

	/**
	 * REQUIRED. The end-user verification code.
	 */
	user_code: string;

	/**
	 * REQUIRED. The end-user verification URI on the authorization server.
	 */
	verification_uri: string;

	/**
	 * OPTIONAL. A verification URI that includes the user_code, designed for non-textual transmission.
	 */
	verification_uri_complete?: string;

	/**
	 * REQUIRED. The lifetime in seconds of the device_code and user_code.
	 */
	expires_in: number;

	/**
	 * OPTIONAL. The minimum amount of time in seconds that the client should wait between polling requests.
	 * If no value is provided, clients must use 5 as the default.
	 */
	interval?: number;
}

/**
 * Error response from the token endpoint when using device authorization grant.
 * As defined in RFC 8628 section 3.5.
 */
export interface IAuthorizationDeviceTokenErrorResponse {
	/**
	 * REQUIRED. Error code as specified in OAuth 2.0 or in RFC 8628 section 3.5.
	 * Standard OAuth 2.0 error codes plus:
	 * - "authorization_pending": The authorization request is still pending as the end user hasn't completed the user interaction steps
	 * - "slow_down": A variant of "authorization_pending", polling should continue but interval must be increased by 5 seconds
	 * - "access_denied": The authorization request was denied
	 * - "expired_token": The "device_code" has expired and the device authorization session has concluded
	 */
	error: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unauthorized_client' |
	'unsupported_grant_type' | 'invalid_scope' | 'authorization_pending' |
	'slow_down' | 'access_denied' | 'expired_token' | string;

	/**
	 * OPTIONAL. Human-readable description of the error.
	 */
	error_description?: string;

	/**
	 * OPTIONAL. URI to a human-readable web page with more information about the error.
	 */
	error_uri?: string;
}

export interface IAuthorizationJWTClaims {
	/**
	 * REQUIRED. JWT ID. Unique identifier for the token.
	 */
	jti: string;

	/**
	 * REQUIRED. Subject. Principal about which the token asserts information.
	 */
	sub: string;

	/**
	 * REQUIRED. Issuer. Entity that issued the token.
	 */
	iss: string;

	/**
	 * OPTIONAL. Audience. Recipients that the token is intended for.
	 */
	aud?: string | string[];

	/**
	 * OPTIONAL. Expiration time. Time after which the token is invalid (seconds since Unix epoch).
	 */
	exp?: number;

	/**
	 * OPTIONAL. Not before time. Time before which the token is not valid (seconds since Unix epoch).
	 */
	nbf?: number;

	/**
	 * OPTIONAL. Issued at time when the token was issued (seconds since Unix epoch).
	 */
	iat?: number;

	/**
	 * OPTIONAL. Authorized party. The party to which the token was issued.
	 */
	azp?: string;

	/**
	 * OPTIONAL. Scope values for which the token is valid.
	 */
	scope?: string;

	/**
	 * OPTIONAL. Full name of the user.
	 */
	name?: string;

	/**
	 * OPTIONAL. Given or first name of the user.
	 */
	given_name?: string;

	/**
	 * OPTIONAL. Family name or last name of the user.
	 */
	family_name?: string;

	/**
	 * OPTIONAL. Middle name of the user.
	 */
	middle_name?: string;

	/**
	 * OPTIONAL. Preferred username or email the user wishes to be referred to.
	 */
	preferred_username?: string;

	/**
	 * OPTIONAL. Email address of the user.
	 */
	email?: string;

	/**
	 * OPTIONAL. True if the user's email has been verified.
	 */
	email_verified?: boolean;

	/**
	 * OPTIONAL. User's profile picture URL.
	 */
	picture?: string;

	/**
	 * OPTIONAL. Authentication time. Time when the user authentication occurred.
	 */
	auth_time?: number;

	/**
	 * OPTIONAL. Authentication context class reference.
	 */
	acr?: string;

	/**
	 * OPTIONAL. Authentication methods references.
	 */
	amr?: string[];

	/**
	 * OPTIONAL. Session ID. String identifier for a session.
	 */
	sid?: string;

	/**
	 * OPTIONAL. Address component.
	 */
	address?: {
		formatted?: string;
		street_address?: string;
		locality?: string;
		region?: string;
		postal_code?: string;
		country?: string;
	};

	/**
	 * OPTIONAL. Groups that the user belongs to.
	 */
	groups?: string[];

	/**
	 * OPTIONAL. Roles assigned to the user.
	 */
	roles?: string[];

	/**
	 * OPTIONAL. Handles optional claims that are not explicitly defined in the standard.
	 */
	[key: string]: unknown;
}

//#endregion

//#region is functions

export function isAuthorizationProtectedResourceMetadata(obj: unknown): obj is IAuthorizationProtectedResourceMetadata {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}

	const metadata = obj as IAuthorizationProtectedResourceMetadata;
	return metadata.resource !== undefined;
}

export function isAuthorizationServerMetadata(obj: unknown): obj is IAuthorizationServerMetadata {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const metadata = obj as IAuthorizationServerMetadata;
	return metadata.issuer !== undefined;
}

export function isAuthorizationDynamicClientRegistrationResponse(obj: unknown): obj is IAuthorizationDynamicClientRegistrationResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationDynamicClientRegistrationResponse;
	return response.client_id !== undefined && response.client_name !== undefined;
}

export function isAuthorizationAuthorizeResponse(obj: unknown): obj is IAuthorizationAuthorizeResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationAuthorizeResponse;
	return response.code !== undefined && response.state !== undefined;
}

export function isAuthorizationTokenResponse(obj: unknown): obj is IAuthorizationTokenResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationTokenResponse;
	return response.access_token !== undefined && response.token_type !== undefined;
}

export function isDynamicClientRegistrationResponse(obj: unknown): obj is IAuthorizationDynamicClientRegistrationResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationDynamicClientRegistrationResponse;
	return response.client_id !== undefined && response.client_name !== undefined;
}

export function isAuthorizationDeviceResponse(obj: unknown): obj is IAuthorizationDeviceResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationDeviceResponse;
	return response.device_code !== undefined && response.user_code !== undefined && response.verification_uri !== undefined && response.expires_in !== undefined;
}

export function isAuthorizationDeviceTokenErrorResponse(obj: unknown): obj is IAuthorizationDeviceTokenErrorResponse {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	const response = obj as IAuthorizationDeviceTokenErrorResponse;
	return response.error !== undefined && response.error_description !== undefined;
}

//#endregion

export function getDefaultMetadataForUrl(authorizationServer: URL): IRequiredAuthorizationServerMetadata & IRequiredAuthorizationServerMetadata {
	return {
		issuer: authorizationServer.toString(),
		authorization_endpoint: new URL('/authorize', authorizationServer).toString(),
		token_endpoint: new URL('/token', authorizationServer).toString(),
		registration_endpoint: new URL('/register', authorizationServer).toString(),
		// Default values for Dynamic OpenID Providers
		// https://openid.net/specs/openid-connect-discovery-1_0.html
		response_types_supported: ['code', 'id_token', 'id_token token'],
	};
}

export function getMetadataWithDefaultValues(metadata: IAuthorizationServerMetadata): IAuthorizationServerMetadata & IRequiredAuthorizationServerMetadata {
	const issuer = new URL(metadata.issuer);
	return {
		...metadata,
		authorization_endpoint: metadata.authorization_endpoint ?? new URL('/authorize', issuer).toString(),
		token_endpoint: metadata.token_endpoint ?? new URL('/token', issuer).toString(),
		registration_endpoint: metadata.registration_endpoint ?? new URL('/register', issuer).toString(),
	};
}

/**
 * Default port for the authorization flow. We try to use this port so that
 * the redirect URI does not change when running on localhost. This is useful
 * for servers that only allow exact matches on the redirect URI. The spec
 * says that the port should not matter, but some servers do not follow
 * the spec and require an exact match.
 */
export const DEFAULT_AUTH_FLOW_PORT = 33418;
export async function fetchDynamicRegistration(registrationEndpoint: string, clientName: string): Promise<IAuthorizationDynamicClientRegistrationResponse> {
	const response = await fetch(registrationEndpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			client_name: clientName,
			client_uri: 'https://code.visualstudio.com',
			grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
			response_types: ['code'],
			redirect_uris: [
				'https://insiders.vscode.dev/redirect',
				'https://vscode.dev/redirect',
				'http://localhost/',
				'http://127.0.0.1/',
				// Added these for any server that might do
				// only exact match on the redirect URI even
				// though the spec says it should not care
				// about the port.
				`http://localhost:${DEFAULT_AUTH_FLOW_PORT}/`,
				`http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
			],
			token_endpoint_auth_method: 'none'
		})
	});

	if (!response.ok) {
		throw new Error(`Registration failed: ${response.statusText}`);
	}

	const registration = await response.json();
	if (isAuthorizationDynamicClientRegistrationResponse(registration)) {
		return registration;
	}
	throw new Error(`Invalid authorization dynamic client registration response: ${JSON.stringify(registration)}`);
}


export function parseWWWAuthenticateHeader(wwwAuthenticateHeaderValue: string) {
	const parts = wwwAuthenticateHeaderValue.split(' ');
	const scheme = parts[0];
	const params: Record<string, string> = {};

	if (parts.length > 1) {
		const attributes = parts.slice(1).join(' ').split(',');
		attributes.forEach(attr => {
			const [key, value] = attr.split('=').map(s => s.trim().replace(/"/g, ''));
			params[key] = value;
		});
	}

	return { scheme, params };
}

export function getClaimsFromJWT(token: string): IAuthorizationJWTClaims {
	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new Error('Invalid JWT token format: token must have three parts separated by dots');
	}

	const [header, payload, _signature] = parts;

	try {
		const decodedHeader = JSON.parse(decodeBase64(header).toString());
		if (typeof decodedHeader !== 'object') {
			throw new Error('Invalid JWT token format: header is not a JSON object');
		}

		const decodedPayload = JSON.parse(decodeBase64(payload).toString());
		if (typeof decodedPayload !== 'object') {
			throw new Error('Invalid JWT token format: payload is not a JSON object');
		}

		return decodedPayload;
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`Failed to parse JWT token: ${e.message}`);
		}
		throw new Error('Failed to parse JWT token');
	}
}
