/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { decodeBase64 } from './buffer.js';
const WELL_KNOWN_ROUTE = '/.well-known';
export const AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-protected-resource`;
export const AUTH_SERVER_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-authorization-server`;
export const OPENID_CONNECT_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/openid-configuration`;
export const AUTH_SCOPE_SEPARATOR = ' ';
//#region types
/**
 * Base OAuth 2.0 error codes as specified in RFC 6749.
 */
export var AuthorizationErrorType;
(function (AuthorizationErrorType) {
    AuthorizationErrorType["InvalidRequest"] = "invalid_request";
    AuthorizationErrorType["InvalidClient"] = "invalid_client";
    AuthorizationErrorType["InvalidGrant"] = "invalid_grant";
    AuthorizationErrorType["UnauthorizedClient"] = "unauthorized_client";
    AuthorizationErrorType["UnsupportedGrantType"] = "unsupported_grant_type";
    AuthorizationErrorType["InvalidScope"] = "invalid_scope";
})(AuthorizationErrorType || (AuthorizationErrorType = {}));
/**
 * Device authorization grant specific error codes as specified in RFC 8628 section 3.5.
 */
export var AuthorizationDeviceCodeErrorType;
(function (AuthorizationDeviceCodeErrorType) {
    /**
     * The authorization request is still pending as the end user hasn't completed the user interaction steps.
     */
    AuthorizationDeviceCodeErrorType["AuthorizationPending"] = "authorization_pending";
    /**
     * A variant of "authorization_pending", polling should continue but interval must be increased by 5 seconds.
     */
    AuthorizationDeviceCodeErrorType["SlowDown"] = "slow_down";
    /**
     * The authorization request was denied.
     */
    AuthorizationDeviceCodeErrorType["AccessDenied"] = "access_denied";
    /**
     * The "device_code" has expired and the device authorization session has concluded.
     */
    AuthorizationDeviceCodeErrorType["ExpiredToken"] = "expired_token";
})(AuthorizationDeviceCodeErrorType || (AuthorizationDeviceCodeErrorType = {}));
/**
 * Dynamic client registration specific error codes as specified in RFC 7591.
 */
export var AuthorizationRegistrationErrorType;
(function (AuthorizationRegistrationErrorType) {
    /**
     * The value of one or more redirection URIs is invalid.
     */
    AuthorizationRegistrationErrorType["InvalidRedirectUri"] = "invalid_redirect_uri";
    /**
     * The value of one of the client metadata fields is invalid and the server has rejected this request.
     */
    AuthorizationRegistrationErrorType["InvalidClientMetadata"] = "invalid_client_metadata";
    /**
     * The software statement presented is invalid.
     */
    AuthorizationRegistrationErrorType["InvalidSoftwareStatement"] = "invalid_software_statement";
    /**
     * The software statement presented is not approved for use by this authorization server.
     */
    AuthorizationRegistrationErrorType["UnapprovedSoftwareStatement"] = "unapproved_software_statement";
})(AuthorizationRegistrationErrorType || (AuthorizationRegistrationErrorType = {}));
//#endregion
//#region is functions
export function isAuthorizationProtectedResourceMetadata(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const metadata = obj;
    if (!metadata.resource) {
        return false;
    }
    if (metadata.scopes_supported !== undefined && !Array.isArray(metadata.scopes_supported)) {
        return false;
    }
    return true;
}
const urisToCheck = [
    'issuer',
    'authorization_endpoint',
    'token_endpoint',
    'registration_endpoint',
    'jwks_uri'
];
export function isAuthorizationServerMetadata(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const metadata = obj;
    if (!metadata.issuer) {
        throw new Error('Authorization server metadata must have an issuer');
    }
    for (const uri of urisToCheck) {
        if (!metadata[uri]) {
            continue;
        }
        if (typeof metadata[uri] !== 'string') {
            throw new Error(`Authorization server metadata '${uri}' must be a string`);
        }
        if (!metadata[uri].startsWith('https://') && !metadata[uri].startsWith('http://')) {
            throw new Error(`Authorization server metadata '${uri}' must start with http:// or https://`);
        }
    }
    return true;
}
export function isAuthorizationDynamicClientRegistrationResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.client_id !== undefined;
}
export function isAuthorizationAuthorizeResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.code !== undefined && response.state !== undefined;
}
export function isAuthorizationTokenResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.access_token !== undefined && response.token_type !== undefined;
}
export function isAuthorizationDeviceResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.device_code !== undefined && response.user_code !== undefined && response.verification_uri !== undefined && response.expires_in !== undefined;
}
export function isAuthorizationErrorResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.error !== undefined;
}
export function isAuthorizationRegistrationErrorResponse(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const response = obj;
    return response.error !== undefined;
}
//#endregion
export function getDefaultMetadataForUrl(authorizationServer) {
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
/**
 * The grant types that we support
 */
const grantTypesSupported = ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'];
/**
 * Default port for the authorization flow. We try to use this port so that
 * the redirect URI does not change when running on localhost. This is useful
 * for servers that only allow exact matches on the redirect URI. The spec
 * says that the port should not matter, but some servers do not follow
 * the spec and require an exact match.
 */
export const DEFAULT_AUTH_FLOW_PORT = 33418;
export async function fetchDynamicRegistration(serverMetadata, clientName, scopes) {
    if (!serverMetadata.registration_endpoint) {
        throw new Error('Server does not support dynamic registration');
    }
    const requestBody = {
        client_name: clientName,
        client_uri: 'https://code.visualstudio.com',
        grant_types: serverMetadata.grant_types_supported
            ? serverMetadata.grant_types_supported.filter(gt => grantTypesSupported.includes(gt))
            : grantTypesSupported,
        response_types: ['code'],
        redirect_uris: [
            'https://insiders.vscode.dev/redirect',
            'https://vscode.dev/redirect',
            'http://127.0.0.1/',
            // Added these for any server that might do
            // only exact match on the redirect URI even
            // though the spec says it should not care
            // about the port.
            `http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
        ],
        scope: scopes?.join(AUTH_SCOPE_SEPARATOR),
        token_endpoint_auth_method: 'none',
        application_type: 'native'
    };
    const response = await fetch(serverMetadata.registration_endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
        const result = await response.text();
        let errorDetails = result;
        try {
            const errorResponse = JSON.parse(result);
            if (isAuthorizationRegistrationErrorResponse(errorResponse)) {
                errorDetails = `${errorResponse.error}${errorResponse.error_description ? `: ${errorResponse.error_description}` : ''}`;
            }
        }
        catch {
            // JSON parsing failed, use raw text
        }
        throw new Error(`Registration to ${serverMetadata.registration_endpoint} failed: ${errorDetails}`);
    }
    const registration = await response.json();
    if (isAuthorizationDynamicClientRegistrationResponse(registration)) {
        return registration;
    }
    throw new Error(`Invalid authorization dynamic client registration response: ${JSON.stringify(registration)}`);
}
export function parseWWWAuthenticateHeader(wwwAuthenticateHeaderValue) {
    const challenges = [];
    // According to RFC 7235, multiple challenges are separated by commas
    // But parameters within a challenge can also be separated by commas
    // We need to identify scheme names to know where challenges start
    // First, split by commas while respecting quoted strings
    const tokens = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < wwwAuthenticateHeaderValue.length; i++) {
        const char = wwwAuthenticateHeaderValue[i];
        if (char === '"') {
            inQuotes = !inQuotes;
            current += char;
        }
        else if (char === ',' && !inQuotes) {
            if (current.trim()) {
                tokens.push(current.trim());
            }
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim()) {
        tokens.push(current.trim());
    }
    // Now process tokens to identify challenges
    // A challenge starts with a scheme name (a token that doesn't contain '=' and is followed by parameters or is standalone)
    let currentChallenge;
    for (const token of tokens) {
        const hasEquals = token.includes('=');
        if (!hasEquals) {
            // This token doesn't have '=', so it's likely a scheme name
            if (currentChallenge) {
                challenges.push(currentChallenge);
            }
            currentChallenge = { scheme: token.trim(), params: {} };
        }
        else {
            // This token has '=', it could be:
            // 1. A parameter for the current challenge
            // 2. A new challenge that starts with "Scheme param=value"
            const spaceIndex = token.indexOf(' ');
            if (spaceIndex > 0) {
                const beforeSpace = token.substring(0, spaceIndex);
                const afterSpace = token.substring(spaceIndex + 1);
                // Check if what's before the space looks like a scheme name (no '=')
                if (!beforeSpace.includes('=') && afterSpace.includes('=')) {
                    // This is a new challenge starting with "Scheme param=value"
                    if (currentChallenge) {
                        challenges.push(currentChallenge);
                    }
                    currentChallenge = { scheme: beforeSpace.trim(), params: {} };
                    // Parse the parameter part
                    const equalIndex = afterSpace.indexOf('=');
                    if (equalIndex > 0) {
                        const key = afterSpace.substring(0, equalIndex).trim();
                        const value = afterSpace.substring(equalIndex + 1).trim().replace(/^"|"$/g, '');
                        if (key && value !== undefined) {
                            currentChallenge.params[key] = value;
                        }
                    }
                    continue;
                }
            }
            // This is a parameter for the current challenge
            if (currentChallenge) {
                const equalIndex = token.indexOf('=');
                if (equalIndex > 0) {
                    const key = token.substring(0, equalIndex).trim();
                    const value = token.substring(equalIndex + 1).trim().replace(/^"|"$/g, '');
                    if (key && value !== undefined) {
                        currentChallenge.params[key] = value;
                    }
                }
            }
        }
    }
    // Don't forget the last challenge
    if (currentChallenge) {
        challenges.push(currentChallenge);
    }
    return challenges;
}
export function getClaimsFromJWT(token) {
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
    }
    catch (e) {
        if (e instanceof Error) {
            throw new Error(`Failed to parse JWT token: ${e.message}`);
        }
        throw new Error('Failed to parse JWT token');
    }
}
/**
 * Checks if two scope lists are equivalent, regardless of order.
 * This is useful for comparing OAuth scopes where the order should not matter.
 *
 * @param scopes1 First list of scopes to compare (can be undefined)
 * @param scopes2 Second list of scopes to compare (can be undefined)
 * @returns true if the scope lists contain the same scopes (order-independent), false otherwise
 *
 * @example
 * ```typescript
 * scopesMatch(['read', 'write'], ['write', 'read']) // Returns: true
 * scopesMatch(['read'], ['write']) // Returns: false
 * scopesMatch(undefined, undefined) // Returns: true
 * scopesMatch(['read'], undefined) // Returns: false
 * ```
 */
export function scopesMatch(scopes1, scopes2) {
    if (scopes1 === scopes2) {
        return true;
    }
    if (!scopes1 || !scopes2) {
        return false;
    }
    if (scopes1.length !== scopes2.length) {
        return false;
    }
    // Sort both arrays for comparison to handle different orderings
    const sortedScopes1 = [...scopes1].sort();
    const sortedScopes2 = [...scopes2].sort();
    return sortedScopes1.every((scope, index) => scope === sortedScopes2[index]);
}
/**
 * Fetches and validates OAuth 2.0 protected resource metadata from the given URL.
 *
 * @param targetResource The target resource URL to compare origins with (e.g., the MCP server URL)
 * @param resourceMetadataUrl Optional URL to fetch the resource metadata from. If not provided, will try well-known URIs.
 * @param options Configuration options for the fetch operation
 * @returns Promise that resolves to an object containing the validated resource metadata and any errors encountered during discovery
 * @throws Error if the fetch fails, returns non-200 status, or the response is invalid on all attempted URLs
 */
export async function fetchResourceMetadata(targetResource, resourceMetadataUrl, options = {}) {
    const { sameOriginHeaders = {}, fetch: fetchImpl = fetch } = options;
    const targetResourceUrlObj = new URL(targetResource);
    const fetchPrm = async (prmUrl, validateUrl) => {
        // Determine if we should include same-origin headers
        let headers = {
            'Accept': 'application/json'
        };
        const resourceMetadataUrlObj = new URL(prmUrl);
        if (resourceMetadataUrlObj.origin === targetResourceUrlObj.origin) {
            headers = {
                ...headers,
                ...sameOriginHeaders
            };
        }
        const response = await fetchImpl(prmUrl, { method: 'GET', headers });
        if (response.status !== 200) {
            let errorText;
            try {
                errorText = await response.text();
            }
            catch {
                errorText = response.statusText;
            }
            throw new Error(`Failed to fetch resource metadata from ${prmUrl}: ${response.status} ${errorText}`);
        }
        const body = await response.json();
        if (isAuthorizationProtectedResourceMetadata(body)) {
            // Validate that the resource matches the target resource
            // Use URL constructor for normalization - it handles hostname case and trailing slashes
            const prmValue = new URL(body.resource).toString();
            const expectedResource = new URL(validateUrl).toString();
            if (prmValue !== expectedResource) {
                throw new Error(`Protected Resource Metadata 'resource' property value "${prmValue}" does not match expected value "${expectedResource}" for URL ${prmUrl}. Per RFC 9728, these MUST match. See https://datatracker.ietf.org/doc/html/rfc9728#PRConfigurationValidation`);
            }
            return body;
        }
        else {
            throw new Error(`Invalid resource metadata from ${prmUrl}. Expected to follow shape of https://datatracker.ietf.org/doc/html/rfc9728#name-protected-resource-metadata (Hints: is scopes_supported an array? Is resource a string?). Current payload: ${JSON.stringify(body)}`);
        }
    };
    const errors = [];
    if (resourceMetadataUrl) {
        try {
            const metadata = await fetchPrm(resourceMetadataUrl, targetResource);
            return { metadata, discoveryUrl: resourceMetadataUrl, errors };
        }
        catch (e) {
            errors.push(e instanceof Error ? e : new Error(String(e)));
        }
    }
    // Try well-known URIs starting with path-appended, then root
    const hasPathComponent = targetResourceUrlObj.pathname !== '/';
    const rootUrl = `${targetResourceUrlObj.origin}${AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH}`;
    if (hasPathComponent) {
        const pathAppendedUrl = `${rootUrl}${targetResourceUrlObj.pathname}`;
        try {
            const metadata = await fetchPrm(pathAppendedUrl, targetResource);
            return { metadata, discoveryUrl: pathAppendedUrl, errors };
        }
        catch (e) {
            errors.push(e instanceof Error ? e : new Error(String(e)));
        }
    }
    // Finally, try root discovery
    try {
        const metadata = await fetchPrm(rootUrl, targetResourceUrlObj.origin);
        return { metadata, discoveryUrl: rootUrl, errors };
    }
    catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
    }
    // If we've tried all methods and none worked, throw the error(s)
    if (errors.length === 1) {
        throw errors[0];
    }
    else {
        throw new AggregateError(errors, 'Failed to fetch resource metadata from all attempted URLs');
    }
}
/** Helper to try parsing the response as authorization server metadata */
async function tryParseAuthServerMetadata(response) {
    if (response.status !== 200) {
        return undefined;
    }
    try {
        const body = await response.json();
        if (isAuthorizationServerMetadata(body)) {
            return body;
        }
    }
    catch {
        // Failed to parse as JSON or not valid metadata
    }
    return undefined;
}
/** Helper to get error text from response */
async function getErrText(res) {
    try {
        return await res.text();
    }
    catch {
        return res.statusText;
    }
}
/**
 * Fetches and validates OAuth 2.0 authorization server metadata from the given authorization server URL.
 *
 * This function tries multiple discovery endpoints in the following order:
 * 1. OAuth 2.0 Authorization Server Metadata with path insertion (RFC 8414)
 * 2. OpenID Connect Discovery with path insertion
 * 3. OpenID Connect Discovery with path addition
 *
 * Path insertion: For issuer URLs with path components (e.g., https://example.com/tenant),
 * the well-known path is inserted after the origin and before the path:
 * https://example.com/.well-known/oauth-authorization-server/tenant
 *
 * Path addition: The well-known path is simply appended to the existing path:
 * https://example.com/tenant/.well-known/openid-configuration
 *
 * @param authorizationServer The authorization server URL (issuer identifier)
 * @param options Configuration options for the fetch operation
 * @returns Promise that resolves to the validated authorization server metadata
 * @throws Error if all discovery attempts fail or the response is invalid
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8414#section-3
 */
export async function fetchAuthorizationServerMetadata(authorizationServer, options = {}) {
    const { additionalHeaders = {}, fetch: fetchImpl = fetch } = options;
    const authorizationServerUrl = new URL(authorizationServer);
    const extraPath = authorizationServerUrl.pathname === '/' ? '' : authorizationServerUrl.pathname;
    const errors = [];
    const doFetch = async (url) => {
        try {
            const rawResponse = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    ...additionalHeaders,
                    'Accept': 'application/json'
                }
            });
            const metadata = await tryParseAuthServerMetadata(rawResponse);
            if (metadata) {
                return metadata;
            }
            // No metadata found, collect error from response
            errors.push(new Error(`Failed to fetch authorization server metadata from ${url}: ${rawResponse.status} ${await getErrText(rawResponse)}`));
            return undefined;
        }
        catch (e) {
            // Collect error from fetch failure
            errors.push(e instanceof Error ? e : new Error(String(e)));
            return undefined;
        }
    };
    // For the oauth server metadata discovery path, we _INSERT_
    // the well known path after the origin and before the path.
    // https://datatracker.ietf.org/doc/html/rfc8414#section-3
    const pathToFetch = new URL(AUTH_SERVER_METADATA_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
    let metadata = await doFetch(pathToFetch);
    if (metadata) {
        return { metadata, discoveryUrl: pathToFetch, errors };
    }
    // Try fetching the OpenID Connect Discovery with path insertion.
    // For issuer URLs with path components, this inserts the well-known path
    // after the origin and before the path.
    const openidPathInsertionUrl = new URL(OPENID_CONNECT_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
    metadata = await doFetch(openidPathInsertionUrl);
    if (metadata) {
        return { metadata, discoveryUrl: openidPathInsertionUrl, errors };
    }
    // Try fetching the other discovery URL. For the openid metadata discovery
    // path, we _ADD_ the well known path after the existing path.
    // https://datatracker.ietf.org/doc/html/rfc8414#section-3
    const openidPathAdditionUrl = authorizationServer.endsWith('/')
        ? authorizationServer + OPENID_CONNECT_DISCOVERY_PATH.substring(1) // Remove leading slash if authServer ends with slash
        : authorizationServer + OPENID_CONNECT_DISCOVERY_PATH;
    metadata = await doFetch(openidPathAdditionUrl);
    if (metadata) {
        return { metadata, discoveryUrl: openidPathAdditionUrl, errors };
    }
    // If we've tried all URLs and none worked, throw the error(s)
    if (errors.length === 1) {
        throw errors[0];
    }
    else {
        throw new AggregateError(errors, 'Failed to fetch authorization server metadata from all attempted URLs');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2F1dGguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYXV0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBRTNDLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDO0FBQ3hDLE1BQU0sQ0FBQyxNQUFNLCtDQUErQyxHQUFHLEdBQUcsZ0JBQWdCLDJCQUEyQixDQUFDO0FBQzlHLE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLEdBQUcsZ0JBQWdCLDZCQUE2QixDQUFDO0FBQ3BHLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLEdBQUcsZ0JBQWdCLHVCQUF1QixDQUFDO0FBQ3hGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztBQUV4QyxlQUFlO0FBRWY7O0dBRUc7QUFDSCxNQUFNLENBQU4sSUFBa0Isc0JBT2pCO0FBUEQsV0FBa0Isc0JBQXNCO0lBQ3ZDLDREQUFrQyxDQUFBO0lBQ2xDLDBEQUFnQyxDQUFBO0lBQ2hDLHdEQUE4QixDQUFBO0lBQzlCLG9FQUEwQyxDQUFBO0lBQzFDLHlFQUErQyxDQUFBO0lBQy9DLHdEQUE4QixDQUFBO0FBQy9CLENBQUMsRUFQaUIsc0JBQXNCLEtBQXRCLHNCQUFzQixRQU92QztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGdDQWlCakI7QUFqQkQsV0FBa0IsZ0NBQWdDO0lBQ2pEOztPQUVHO0lBQ0gsa0ZBQThDLENBQUE7SUFDOUM7O09BRUc7SUFDSCwwREFBc0IsQ0FBQTtJQUN0Qjs7T0FFRztJQUNILGtFQUE4QixDQUFBO0lBQzlCOztPQUVHO0lBQ0gsa0VBQThCLENBQUE7QUFDL0IsQ0FBQyxFQWpCaUIsZ0NBQWdDLEtBQWhDLGdDQUFnQyxRQWlCakQ7QUFFRDs7R0FFRztB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