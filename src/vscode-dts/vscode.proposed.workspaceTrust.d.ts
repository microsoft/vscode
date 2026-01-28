/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/120173

	export interface ResourceTrustRequestOptions {
		/**
		 * An resource related to the trust request.
		 */
		readonly uri: Uri;

		/**
		 * Custom message describing the user action that requires resource
		 * trust. If omitted, a generic message will be displayed in the resource
		 * trust request dialog.
		 */
		readonly message?: string;
	}

	/**
	 * The object describing the properties of the workspace trust request
	 */
	export interface WorkspaceTrustRequestOptions {
		/**
		 * Custom message describing the user action that requires workspace
		 * trust. If omitted, a generic message will be displayed in the workspace
		 * trust request dialog.
		 */
		readonly message?: string;
	}

	export namespace workspace {
		/**
		 * Prompt the user to chose whether to trust the specified resource (ex: folder)
		 * @param options Object describing the properties of the resource trust request.
		 */
		export function requestResourceTrust(options: ResourceTrustRequestOptions): Thenable<boolean | undefined>;

		/**
		 * Prompt the user to chose whether to trust the current workspace
		 * @param options Optional object describing the properties of the
		 * workspace trust request.
		 */
		export function requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined>;
	}
}
