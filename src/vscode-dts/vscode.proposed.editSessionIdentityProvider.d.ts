/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/157734

	export namespace workspace {
		/**
		 *
		 * @param scheme The URI scheme that this provider can provide edit session identities for.
		 * @param provider A provider which can convert URIs for workspace folders of scheme @param scheme to
		 * an edit session identifier which is stable across machines. This enables edit sessions to be resolved.
		 */
		export function registerEditSessionIdentityProvider(scheme: string, provider: EditSessionIdentityProvider): Disposable;
	}

	export interface EditSessionIdentityProvider {
		/**
		 *
		 * @param workspaceFolder The workspace folder to provide an edit session identity for.
		 * @param token A cancellation token for the request.
		 * @returns A string representing the edit session identity for the requested workspace folder.
		 */
		provideEditSessionIdentity(workspaceFolder: WorkspaceFolder, token: CancellationToken): ProviderResult<string>;

		/**
		 *
		 * @param identity1 An edit session identity.
		 * @param identity2 A second edit session identity to compare to @param identity1.
		 * @param token A cancellation token for the request.
		 * @returns An {@link EditSessionIdentityMatch} representing the edit session identity match confidence for the provided identities.
		 */
		provideEditSessionIdentityMatch(identity1: string, identity2: string, token: CancellationToken): ProviderResult<EditSessionIdentityMatch>;
	}

	export enum EditSessionIdentityMatch {
		Complete = 100,
		Partial = 50,
		None = 0
	}
}
