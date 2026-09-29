/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/272000 @connor4312

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
		 * The MCP tool is conditionally available when certain preconditions are met.
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

	/**
	 * Metadata which the editor can use to hydrate information about the server
	 * prior to starting it. The extension can provide tools and basic server
	 * instructions as they would be expected to appear on MCP itself.
	 *
	 * Once a server is started, the observed values will be cached and take
	 * precedence over those statically declared here unless and until the
	 * server's {@link McpStdioServerDefinition.version version} is updated. If
	 * you can ensure the metadata is always accurate and do not otherwise have
	 * a server `version` to use, it is reasonable to set the server `version`
	 * to a hash of this object to ensure the cache tracks the {@link McpServerMetadata}.
	 */
	export interface McpServerMetadata {
		/**
		 * Tools the MCP server exposes.
		 */
		tools?: McpServerLanguageModelToolDefinition[];

		/**
		 * MCP server instructions as it would appear on the `initialize` result in the protocol.
		 */
		instructions?: string;

		/**
		 * MCP server capabilities as they would appear on the `initialize` result in the protocol.
		 */
		capabilities?: unknown;

		/**
		 * MCP server info as it would appear on the `initialize` result in the protocol.
		 */
		serverInfo?: unknown;
	}


	export class McpStdioServerDefinition2 extends McpStdioServerDefinition {
		metadata?: McpServerMetadata;
		constructor(label: string, command: string, args?: string[], env?: Record<string, string | number | null>, version?: string, metadata?: McpServerMetadata);
	}

	export class McpHttpServerDefinition2 extends McpHttpServerDefinition {
		metadata?: McpServerMetadata;

		/**
		 * Authentication information to use to get a session for the initial MCP server connection.
		 */
		authentication?: {
			providerId: string;
			scopes: string[];
		};

		constructor(label: string, uri: Uri, headers?: Record<string, string>, version?: string, metadata?: McpServerMetadata, authentication?: { providerId: string; scopes: string[] });
	}
}
