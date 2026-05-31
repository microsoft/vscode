/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/180582

	export namespace workspace {
		/**
		 *
		 * @param scheme The URI scheme that this provider can provide canonical URIs for.
		 * A canonical URI represents the conversion of a resource's alias into a source of truth URI.
		 * Multiple aliases may convert to the same source of truth URI.
		 * @param provider A provider which can convert URIs of scheme @param scheme to
		 * a canonical URI which is stable across machines.
		 */
		export function registerCanonicalUriProvider(scheme: string, provider: CanonicalUriProvider): Disposable;

		/**
		 *
		 * @param uri The URI to provide a canonical URI for.
		 * @param token A cancellation token for the request.
		 */
		export function getCanonicalUri(uri: Uri, options: CanonicalUriRequestOptions, token: CancellationToken): ProviderResult<Uri>;
	}

	export interface CanonicalUriProvider {
		/**
		 *
		 * @param uri The URI to provide a canonical URI for.
		 * @param options Options that the provider should honor in the URI it returns.
		 * @param token A cancellation token for the request.
		 * @returns The canonical URI for the requested URI or undefined if no canonical URI can be provided.
		 */
		provideCanonicalUri(uri: Uri, options: CanonicalUriRequestOptions, token: CancellationToken): ProviderResult<Uri>;
	}

	export interface CanonicalUriRequestOptions {
		/**
		 *
		 * The desired scheme of the canonical URI.
		 */
		targetScheme: string;
	}
}
