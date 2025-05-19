/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const WELL_KNOWN = '.well-known';
export const AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH = `${WELL_KNOWN}/oauth-protected-resource`;
export const AUTH_SERVER_METADATA_DISCOVERY_PATH = `${WELL_KNOWN}/oauth-authorization-server`;

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
	 * OPTIONAL. JSON array containing a list of OAuth authorization server issuer identifiers.
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

//#endregion

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

export function getDefaultMetadataForUrl(issuer: URL): IRequiredAuthorizationServerMetadata & IRequiredAuthorizationServerMetadata {
	return {
		issuer: issuer.toString(),
		authorization_endpoint: new URL('/authorize', issuer).toString(),
		token_endpoint: new URL('/token', issuer).toString(),
		registration_endpoint: new URL('/register', issuer).toString(),
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
