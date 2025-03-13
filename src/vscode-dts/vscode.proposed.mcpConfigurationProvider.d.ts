/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare module 'vscode' {

	// TODO@API make this a class
	export interface McpStdioServerDefinition {

		label: string;

		cwd?: Uri;
		command: string;
		args: readonly string[];
		env: Record<string, string | number | null>;

		// constructor(label: string, command: string, args: string[], env: { [key: string]: string });
	}

	export type McpServerDefinition = McpStdioServerDefinition;

	export interface McpConfigurationProvider {

		onDidChange?: Event<void>;

		provideMcpServerDefinitions(token: CancellationToken): ProviderResult<McpServerDefinition[]>;

	}

	namespace lm {
		export function registerMcpConfigurationProvider(provider: McpConfigurationProvider, metadata?: { label: string }): Disposable;
	}
}
