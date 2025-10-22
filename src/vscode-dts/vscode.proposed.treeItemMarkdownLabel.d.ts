/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @kycutler https://github.com/microsoft/vscode/issues/271523

	/**
	 * Enhanced {@link TreeItemLabel} that supports MarkdownString labels.
	 */
	export interface TreeItemLabel2 {
		highlights?: [number, number][];

		/**
		 * A human-readable string or MarkdownString describing the {@link TreeItem Tree item}.
		 */
		label: string | MarkdownString;
	}

	/**
	 * Enhanced {@link TreeItem} that supports MarkdownString labels via {@link TreeItemLabel2}.
	 */
	export class TreeItem2 {
		id?: string;
		iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;
		description?: string | boolean;
		resourceUri?: Uri;
		tooltip?: string | MarkdownString | undefined;
		command?: Command;
		collapsibleState?: TreeItemCollapsibleState;
		contextValue?: string;
		accessibilityInformation?: AccessibilityInformation;
		checkboxState?: TreeItemCheckboxState | {
			readonly state: TreeItemCheckboxState;
			readonly tooltip?: string;
			readonly accessibilityInformation?: AccessibilityInformation;
		};
		constructor(resourceUri: Uri, collapsibleState?: TreeItemCollapsibleState);


		label?: string | MarkdownString | TreeItemLabel2;
		constructor(label: string | MarkdownString | TreeItemLabel2, collapsibleState?: TreeItemCollapsibleState);
	}
}
