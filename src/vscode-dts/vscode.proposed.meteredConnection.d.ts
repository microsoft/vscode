/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/103451

	export namespace env {
		/**
		 * Checks if the current network connection is metered.
		 * A metered connection is one where bandwidth is limited or expensive, such as:
		 * - Mobile data connections (3G, 4G, LTE, etc.)
		 * - Tethered/hotspot connections
		 * - Connections with data saver mode enabled
		 *
		 * Extensions should avoid or reduce automatic downloads and updates when on a metered connection.
		 *
		 * @returns A promise that resolves to `true` if the connection is metered, `false` otherwise.
		 * Returns `false` if the metered status cannot be determined.
		 */
		export function isMeteredConnection(): Thenable<boolean>;
	}
}
