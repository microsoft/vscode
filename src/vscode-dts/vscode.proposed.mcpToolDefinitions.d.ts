/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Defines when a {@link McpServerLanguageModelToolDefinition} is available
	 * for calling.
	 */
	export enum McpToolAvailability {
		/**
		 * The MCP tool is available when the server starts up.
		 */
		Initial = 0,

		/**
		 * The MCP tool may be available only when certain preconditions are met.
		 */
		Dynamic = 1,
	}

	/**
	 * The definition for a tool an MCP server provides. Extensions may provide
	 * this as part of their server metadata to allow the editor to defer
	 * starting the server until it's called by a language model.
	 */
	export interface McpServerLanguageModelToolDefinition {
		/**
		 * The definition of the tool as it appears on the MCP protocol. This should
		 * be an object that includes the `inputSchema` and `name`,
		 * among other optional properties.
		 */
		definition?: unknown;

		/**
		 * An indicator for when the tool is available for calling.
		 */
		availability: McpToolAvailability;
	}

	export interface McpServerMetadata {
		/**
		 * Tools the MCP server exposes.
		 */
		tools?: McpServerLanguageModelToolDefinition[];
	}


	export class McpStdioServerDefinition2 extends McpStdioServerDefinition {
		metadata?: McpServerMetadata;
		constructor(label: string, command: string, args?: string[], env?: Record<string, string | number | null>, version?: string, metadata?: McpServerMetadata);
	}

	export class McpHttpServerDefinition2 extends McpHttpServerDefinition {
		metadata?: McpServerMetadata;
		constructor(label: string, uri: Uri, headers?: Record<string, string>, version?: string, metadata?: McpServerMetadata);
	}
}
