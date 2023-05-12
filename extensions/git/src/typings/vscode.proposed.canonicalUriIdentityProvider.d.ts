/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/180582

	export namespace workspace {
		/**
		 *
		 * @param scheme The URI scheme that this provider can provide canonical URI identities for.
		 * @param provider A provider which can convert URIs for workspace folders of scheme @param scheme to
		 * a canonical URI identifier which is stable across machines.
		 */
		export function registerCanonicalUriIdentityProvider(scheme: string, provider: CanonicalUriIdentityProvider): Disposable;

		/**
		 *
		 * @param uri The URI to provide a canonical URI identity for.
		 * @param token A cancellation token for the request.
		 */
		export function provideCanonicalUriIdentity(uri: Uri, token: CancellationToken): ProviderResult<Uri>;
	}

	export interface CanonicalUriIdentityProvider {
		/**
		 *
		 * @param uri The URI to provide a canonical URI identity for.
		 * @param token A cancellation token for the request.
		 * @returns The canonical URI identity for the requested URI.
		 */
		provideCanonicalUriIdentity(uri: Uri, token: CancellationToken): ProviderResult<Uri>;
	}
}
