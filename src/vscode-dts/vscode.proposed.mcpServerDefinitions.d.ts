/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/288777 @DonJayamanne

	/**
	 * Represents an MCP gateway that exposes MCP servers via HTTP.
	 * The gateway provides an HTTP endpoint that external processes can connect
	 * to in order to interact with MCP servers known to the editor.
	 */
	export interface McpGateway extends Disposable {
		/**
		 * The address of the HTTP MCP server endpoint.
		 * External processes can connect to this URI to interact with MCP servers.
		 */
		readonly address: Uri;
	}

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

		/**
		 * Starts an MCP gateway that exposes MCP servers via an HTTP endpoint.
		 *
		 * The gateway creates a localhost HTTP server that external processes (such as
		 * CLI-based agent loops) can connect to in order to interact with MCP servers
		 * that the editor knows about.
		 *
		 * The HTTP server is shared among all gateways and is automatically torn down
		 * when the last gateway is disposed.
		 *
		 * @returns A promise that resolves to an {@link McpGateway} if successful,
		 * or `undefined` if no Node process is available (e.g., in serverless web environments).
		 */
		export function startMcpGateway(): Thenable<McpGateway | undefined>;
	}
}
