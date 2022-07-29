/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145307

	export interface Extension<T> {

		/**
		 * `true` when the extension is associated to another extension host.
		 *
		 * *Note* that an extension from another extension host cannot export
		 * API, e.g {@link Extension.exports its exports} are always `undefined`.
		 */
		readonly isFromDifferentExtensionHost: boolean;
	}

	export namespace extensions {

		/**
		 * Get an extension by its full identifier in the form of: `publisher.name`.
		 *
		 * @param extensionId An extension identifier.
		 * @param includeDifferentExtensionHosts Include extensions from different extension host
		 * @return An extension or `undefined`.
		 */
		export function getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts: boolean): Extension<T> | undefined;

		/**
		 * All extensions across all extension hosts.
		 *
		 * @see {@link Extension.isFromDifferentExtensionHost}
		 */
		export const allAcrossExtensionHosts: readonly Extension<void>[];

	}
}
