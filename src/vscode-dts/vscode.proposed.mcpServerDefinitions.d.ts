/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/288777 @DonJayamanne

	/**
	 * Namespace for language model related functionality.
	 */
	export namespace lm {
		/**
		 * All MCP server definitions known to the editor. This includes
		 * servers defined in user and workspace mcp.json files as well as those
		 * provided by extensions.
		 *
		 * Consumers should listen to {@link onDidChangeMcpServerDefinitions} and
		 * re-read this property when it fires.
		 */
		export const mcpServerDefinitions: readonly McpServerDefinition[];

		/**
		 * Event that fires when the set of MCP server definitions changes.
		 * This can be due to additions, deletions, or modifications of server
		 * definitions from any source.
		 */
		export const onDidChangeMcpServerDefinitions: Event<void>;
	}
}
