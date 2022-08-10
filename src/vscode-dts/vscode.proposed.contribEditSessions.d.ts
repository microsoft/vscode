/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/157734

	export namespace workspace {
		/**
		 *
		 * @param scheme The URI scheme that this provider can provide workspace identities for.
		 * @param provider A provider which can convert URIs for workspace folders of scheme @param scheme to
		 * a canonical workspace identifier which is stable across machines. This enables edit sessions to be resolved.
		 */
		export function registerCanonicalWorkspaceIdentityProvider(scheme: string, provider: CanonicalWorkspaceIdentityProvider): Disposable;
	}

	export interface CanonicalWorkspaceIdentity {
		[key: string]: string | null;
	}

	export interface CanonicalWorkspaceIdentityProvider {
		/**
		 *
		 * @param uri The URI for a workspace folder.
		 * @param token A cancellation token for the request.
		 * @returns An object representing the canonical workspace identity for the requested workspace folder.
		 */
		provideCanonicalWorkspaceIdentity(uri: Uri, token: CancellationToken): ProviderResult<CanonicalWorkspaceIdentity>;
	}
}
