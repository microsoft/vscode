/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @kycutler https://github.com/microsoft/vscode/issues/209652

	export interface MarkdownString {

		/**
		 * Indicates that this markdown string can contain alert syntax. Defaults to `false`.
		 *
		 * When `supportAlertSyntax` is true, the markdown renderer will parse GitHub-style alert syntax:
		 *
		 * ```markdown
		 * > [!NOTE]
		 * > This is a note alert
		 *
		 * > [!WARNING]
		 * > This is a warning alert
		 * ```
		 *
		 * Supported alert types: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`.
		 */
		supportAlertSyntax?: boolean;
	}
}
