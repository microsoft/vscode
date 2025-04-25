/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/243522

	/**
	 * McpStdioServerDefinition represents an MCP server available by running
	 * a local process and listening to its stdin and stdout streams. The process
	 * will be spawned as a child process of the extension host and by default
	 * will not run in a shell environment.
	 */
	export class McpStdioServerDefinition {
		/**
		 * The human-readable name of the server.
		 */
		readonly label: string;

		/**
		 * The working directory used to start the server.
		 */
		cwd?: Uri;

		/**
		 * The command used to start the server. Node.js-based servers may use
		 * `process.execPath` to use the editor's version of Node.js to run the script.
		 */
		command: string;
		/**
		 * Additional command-line arguments passed to the server.
		 */
		args: string[];

		/**
		 * Optional additional environment information for the server. Variables
		 * in this environment will overwrite or remove (if null) the default
		 * environment variables.
		 */
		env: Record<string, string | number | null>;

		/**
		 * Optional version identification for the server. If this changes, the
		 * editor will indicate that tools have changed and prompt to refresh them.
		 */
		version?: string;

		/**
		 * @param label The human-readable name of the server.
		 * @param command The command used to start the server.
		 * @param args Additional command-line arguments passed to the server.
		 * @param env Optional additional environment information for the server.
		 * @param version Optional version identification for the server.
		 */
		constructor(label: string, command: string, args?: string[], env?: Record<string, string | number | null>, version?: string);
	}

	/**
	 * McpHttpServerDefinition represents an MCP server available using the
	 * Streamable HTTP transport.
	 */
	export class McpHttpServerDefinition {
		/**
		 * The human-readable name of the server.
		 */
		readonly label: string;

		/**
		 * The URI of the server. The editor will make a POST request to this URI
		 * to begin each session.
		 */
		uri: Uri;

		/**
		 * Optional additional heads included with each request to the server.
		 */
		headers: Record<string, string>;

		/**
		 * Optional version identification for the server. If this changes, the
		 * editor will indicate that tools have changed and prompt to refresh them.
		 */
		version?: string;

		/**
		 * @param label The human-readable name of the server.
		 * @param uri The URI of the server.
		 * @param headers Optional additional heads included with each request to the server.
		 */
		constructor(label: string, uri: Uri, headers?: Record<string, string>, version?: string);
	}

	export type McpServerDefinition = McpStdioServerDefinition | McpHttpServerDefinition;

	/**
	 * A type that can provide server configurations. This may only be used in
	 * conjunction with `contributes.modelContextServerCollections` in the
	 * extension's package.json.
	 *
	 * To allow the editor to cache available servers, extensions should register
	 * this before `activate()` resolves.
	 */
	export interface McpServerDefinitionProvider<T extends McpServerDefinition = McpServerDefinition> {
		/**
		 * Optional event fired to signal that the set of available servers has changed.
		 */
		onDidChangeServerDefinitions?: Event<void>;

		/**
		 * Provides available MCP servers. The editor will call this method eagerly
		 * to ensure the availability of servers for the language model, and so
		 * extensions should not take actions which would require user
		 * interaction, such as authentication.
		 *
		 * @param token A cancellation token.
		 * @returns An array of MCP available MCP servers
		 */
		provideMcpServerDefinitions(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * This function will be called when the editor needs to start MCP server.
		 * At this point, the extension may take any actions which may require user
		 * interaction, such as authentication.
		 *
		 * The extension may return undefined on error to indicate that the server
		 * should not be started.
		 *
		 * @param server The MCP server to resolve
		 * @param token A cancellation token.
		 * @returns The given, resolved server or thenable that resolves to such.
		 */
		resolveMcpServerDefinition?(server: T, token: CancellationToken): ProviderResult<T>;
	}

	namespace lm {
		export function registerMcpServerDefinitionProvider(id: string, provider: McpServerDefinitionProvider): Disposable;
	}
}
