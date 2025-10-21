/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @kycutler https://github.com/microsoft/vscode/issues/271523

	export interface TreeViewOptions<T> {
		/**
		 * Whether to render icons in tree item labels. When `true`, icons embedded in the label
		 * (e.g., codicons like `$(icon-name)`) will be rendered as icons. When `false`, they will
		 * be rendered as plain text. Defaults to `false`.
		 */
		renderLabelIcons?: boolean;
	}
}
