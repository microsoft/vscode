/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @kycutler https://github.com/microsoft/vscode/issues/271523

	export interface TreeItemLabel2 {
		highlights?: [number, number][];

		/**
		 * A human-readable string or MarkdownString describing the {@link TreeItem Tree item}.
		 */
		label: string | MarkdownString;
	}
}
