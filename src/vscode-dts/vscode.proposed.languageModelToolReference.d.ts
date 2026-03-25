/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 1

declare module 'vscode' {

	export interface LanguageModelToolInformation {
		/**
		 * The full reference name of this tool as used in agent definition files.
		 *
		 * For MCP tools, this is the canonical name in the format `serverShortName/toolReferenceName`
		 * (e.g., `github/search_issues`). This can be used to map between the tool names specified
		 * in agent `.md` files and the tool's internal {@link LanguageModelToolInformation.name id}.
		 *
		 * This property is only set for MCP tools. For other tool types, it is `undefined`.
		 */
		readonly fullReferenceName?: string;
	}
}
