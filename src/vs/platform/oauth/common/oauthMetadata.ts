/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { LogLevel } from '../../log/common/log.js';
import { AUTH_SCOPE_SEPARATOR, fetchAuthorizationServerMetadata, fetchResourceMetadata, getDefaultMetadataForUrl, IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata, parseWWWAuthenticateHeader, scopesMatch } from '../../../base/common/oauth.js';

//#region Enums

export const enum IAuthResourceMetadataSource {
	Header = 'header',
	WellKnown = 'wellKnown',
	None = 'none',
}

export const enum IAuthServerMetadataSource {
	ResourceMetadata = 'resourceMetadata',
	WellKnown = 'wellKnown',
	Default = 'default',
}

export interface IAuthMetadataSource {
	resourceMetadataSource: IAuthResourceMetadataSource;
	serverMetadataSource: IAuthServerMetadataSource;
}

//#endregion

//#region AuthMetadata

/**
 * Logger callback type for AuthMetadata operations.
 */
export type AuthMetadataLogger = (level: LogLevel, message: string) => void;

/**
 * Interface for authentication metadata that can be updated when scopes change.
 */
export interface IAuthMetadata {
	readonly authorizationServer: URI;
	readonly serverMetadata: IAuthorizationServerMetadata;
	readonly resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined;
	readonly scopes: string[] | undefined;
	/** Telemetry data about how auth metadata was discovered */
	readonly telemetry: IAuthMetadataSource;

	/**
	 * Updates the scopes based on the WWW-Authenticate header in the response.
	 * @param response The HTTP response containing potential scope challenges
	 * @returns true if scopes were updated, false otherwise
	 */
	update(responseHeaders: Headers): boolean;
}

/**
 * Concrete implementation of IAuthMetadata that manages OAuth authentication metadata.
 * Consumers should use {@link createAuthMetadata} to create instances.
 */
class AuthMetadata implements IAuthMetadata {
	private _scopes: string[] | undefined;

	constructor(
		public readonly authorizationServer: URI,
		public readonly serverMetadata: IAuthorizationServerMetadata,
		public readonly resourceMetadata: IAuthorizationProtectedResourceMetadata | undefined,
		scopes: string[] | undefined,
		public readonly telemetry: IAuthMetadataSource,
		private readonly _log: AuthMetadataLogger,
	) {
		this._scopes = scopes;
	}

	get scopes(): string[] | undefined {
		return this._scopes;
	}

	update(responseHeaders: Headers): boolean {
		const scopesChallenge = this._parseScopesFromResponse(responseHeaders);
		if (!scopesMatch(scopesChallenge, this._scopes)) {
			this._log(LogLevel.Info, `Scopes changed from ${JSON.stringify(this._scopes)} to ${JSON.stringify(scopesChallenge)}, updating`);
			this._scopes = scopesChallenge;
			return true;
		}
		return false;
	}

	private _parseScopesFromResponse(responseHeaders: Headers): string[] | undefined {
		const authHeader = responseHeaders.get('WWW-Authenticate');
		if (!authHeader) {
			return undefined;
		}
		const challenges = parseWWWAuthenticateHeader(authHeader);
		for (const challenge of challenges) {
			if (challenge.scheme === 'Bearer' && challenge.params['scope']) {
				const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
				if (scopes.length) {
					this._log(LogLevel.Info, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
					return scopes;
				}
			}
		}
		return undefined;
	}
}

/**
 * Options for creating AuthMetadata.
 */
export interface ICreateAuthMetadataOptions {
	/** Headers to include when fetching metadata from the same origin as the resource server */
	sameOriginHeaders?: Record<string, string>;
	/** Fetch function to use for HTTP requests */
	fetch: (url: string, init: MinimalRequestInit) => Promise<CommonResponse>;
	/** Logger function for diagnostic output */
	log: AuthMetadataLogger;
}

interface MinimalRequestInit {
	method: string;
	headers: Record<string, string>;
	body?: Uint8Array<ArrayBuffer>;
}

interface CommonResponse {
	status: number;
	statusText: string;
	headers: Headers;
	body?: ReadableStream | null;
	url: string;
	json(): Promise<any>;
	text(): Promise<string>;
}

/**
 * Creates an AuthMetadata instance by discovering OAuth metadata from the server.
 *
 * This function:
 * 1. Parses the WWW-Authenticate header for resource_metadata and scope challenges
 * 2. Fetches OAuth protected resource metadata from well-known URIs or the challenge URL
 * 3. Fetches authorization server metadata
 * 4. Falls back to default metadata if discovery fails
 *
 * @param resourceUrl The resource server URL
 * @param wwwAuthenticateValue The value of the WWW-Authenticate header from the original HTTP response
 * @param options Configuration options including headers, fetch function, and logger
 * @returns A new AuthMetadata instance
 */
export async function createAuthMetadata(
	resourceUrl: string,
	initialResponseHeaders: Headers,
	options: ICreateAuthMetadataOptions
): Promise<AuthMetadata> {
	const { sameOriginHeaders, fetch, log } = options;

	// Track discovery sources for telemetry
	let resourceMetadataSource = IAuthResourceMetadataSource.None;
	let serverMetadataSource: IAuthServerMetadataSource | undefined;

	// Parse the WWW-Authenticate header for resource_metadata and scope challenges
	const { resourceMetadataChallenge, scopesChallenge: scopesChallengeFromHeader } = parseWWWAuthenticateHeaderForChallenges(initialResponseHeaders.get('WWW-Authenticate') ?? undefined, log);

	// Fetch the resource metadata either from the challenge URL or from well-known URIs
	let serverMetadataUrl: string | undefined;
	let resource: IAuthorizationProtectedResourceMetadata | undefined;
	let scopesChallenge = scopesChallengeFromHeader;

	try {
		const { metadata, discoveryUrl, errors } = await fetchResourceMetadata(resourceUrl, resourceMetadataChallenge, {
			sameOriginHeaders,
			fetch: (url, init) => fetch(url, init as MinimalRequestInit)
		});
		for (const err of errors) {
			log(LogLevel.Warning, `Error fetching resource metadata: ${err}`);
		}
		log(LogLevel.Info, `Discovered resource metadata at ${discoveryUrl}`);

		// Determine if resource metadata came from header or well-known
		resourceMetadataSource = resourceMetadataChallenge ? IAuthResourceMetadataSource.Header : IAuthResourceMetadataSource.WellKnown;

		// TODO:@TylerLeonhardt support multiple authorization servers
		// Consider using one that has an auth provider first, over the dynamic flow
		serverMetadataUrl = metadata.authorization_servers?.[0];
		if (!serverMetadataUrl) {
			log(LogLevel.Warning, `No authorization_servers found in resource metadata ${discoveryUrl} - Is this resource metadata configured correctly?`);
		} else {
			log(LogLevel.Info, `Using auth server metadata url: ${serverMetadataUrl}`);
			serverMetadataSource = IAuthServerMetadataSource.ResourceMetadata;
		}
		scopesChallenge ??= metadata.scopes_supported;
		resource = metadata;
	} catch (e) {
		log(LogLevel.Warning, `Could not fetch resource metadata: ${String(e)}`);
	}

	const baseUrl = new URL(resourceUrl).origin;

	// If we are not given a resource_metadata, see if the well-known server metadata is available
	// on the base url.
	let additionalHeaders: Record<string, string> = {};
	if (!serverMetadataUrl) {
		serverMetadataUrl = baseUrl;
		// Maintain the same origin headers when talking to the resource origin.
		if (sameOriginHeaders) {
			additionalHeaders = sameOriginHeaders;
		}
	}

	try {
		log(LogLevel.Debug, `Fetching auth server metadata for: ${serverMetadataUrl} ...`);
		const { metadata, discoveryUrl, errors } = await fetchAuthorizationServerMetadata(serverMetadataUrl, {
			additionalHeaders,
			fetch: (url, init) => fetch(url, init as MinimalRequestInit)
		});
		for (const err of errors) {
			log(LogLevel.Warning, `Error fetching authorization server metadata: ${err}`);
		}
		log(LogLevel.Info, `Discovered authorization server metadata at ${discoveryUrl}`);

		// If serverMetadataSource is not yet defined, it means we fell back to baseUrl
		// and successfully fetched from well-known
		serverMetadataSource ??= IAuthServerMetadataSource.WellKnown;

		return new AuthMetadata(
			URI.parse(serverMetadataUrl),
			metadata,
			resource,
			scopesChallenge,
			{ resourceMetadataSource, serverMetadataSource },
			log
		);
	} catch (e) {
		log(LogLevel.Warning, `Error populating auth server metadata for ${serverMetadataUrl}: ${String(e)}`);
	}

	// If there's no well-known server metadata, then use the default values based off of the url.
	const defaultMetadata = getDefaultMetadataForUrl(new URL(baseUrl));
	log(LogLevel.Info, 'Using default auth metadata');
	return new AuthMetadata(
		URI.parse(baseUrl),
		defaultMetadata,
		resource,
		scopesChallenge,
		{ resourceMetadataSource, serverMetadataSource: IAuthServerMetadataSource.Default },
		log
	);
}

/**
 * Parses the WWW-Authenticate header for resource_metadata and scope challenges.
 */
function parseWWWAuthenticateHeaderForChallenges(
	wwwAuthenticateValue: string | undefined,
	log: AuthMetadataLogger
): { resourceMetadataChallenge?: string; scopesChallenge?: string[] } {
	if (!wwwAuthenticateValue) {
		return {};
	}
	let resourceMetadataChallenge: string | undefined;
	let scopesChallenge: string[] | undefined;

	const challenges = parseWWWAuthenticateHeader(wwwAuthenticateValue);
	for (const challenge of challenges) {
		if (challenge.scheme === 'Bearer') {
			if (!resourceMetadataChallenge && challenge.params['resource_metadata']) {
				resourceMetadataChallenge = challenge.params['resource_metadata'];
				log(LogLevel.Debug, `Found resource_metadata challenge in WWW-Authenticate header: ${resourceMetadataChallenge}`);
			}
			if (!scopesChallenge && challenge.params['scope']) {
				const scopes = challenge.params['scope'].split(AUTH_SCOPE_SEPARATOR).filter(s => s.trim().length);
				if (scopes.length) {
					log(LogLevel.Debug, `Found scope challenge in WWW-Authenticate header: ${challenge.params['scope']}`);
					scopesChallenge = scopes;
				}
			}
			if (resourceMetadataChallenge && scopesChallenge) {
				break;
			}
		}
	}
	return { resourceMetadataChallenge, scopesChallenge };
}

//#endregion
