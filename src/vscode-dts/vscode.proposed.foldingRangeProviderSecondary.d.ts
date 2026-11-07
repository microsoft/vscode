/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/265661

	export interface FoldingRangeProvider {
		/**
		 * Whether this provider supplements indentation folding when all selected providers are secondary; read at registration.
		 * Defaults to `false`; only applies to `editor.foldingStrategy: auto` and preserves range ordering between providers.
		 */
		readonly isSecondary?: boolean;
	}
}
