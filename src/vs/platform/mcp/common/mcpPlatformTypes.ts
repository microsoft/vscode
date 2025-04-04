/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMcpConfiguration {
	inputs?: unknown[];
	/** @deprecated Only for rough cross-compat with other formats */
	mcpServers?: Record<string, IMcpConfigurationStdio>;
	servers?: Record<string, IMcpConfigurationStdio | IMcpConfigurationSSE>;
}

export type McpConfigurationServer = IMcpConfigurationStdio | IMcpConfigurationSSE;

export interface IMcpConfigurationStdio {
	type?: 'stdio';
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
	envFile?: string;
}

export interface IMcpConfigurationSSE {
	type: 'sse';
	url: string;
	headers?: Record<string, string>;
}
