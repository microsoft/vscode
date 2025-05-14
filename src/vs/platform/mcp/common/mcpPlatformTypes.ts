/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMcpConfiguration {
	inputs?: unknown[];
	/** @deprecated Only for rough cross-compat with other formats */
	mcpServers?: Record<string, IMcpConfigurationStdio>;
	servers?: Record<string, IMcpConfigurationStdio | IMcpConfigurationHTTP>;
}

export type McpConfigurationServer = IMcpConfigurationStdio | IMcpConfigurationHTTP;

export interface IMcpDevModeConfig {
	/** Pattern or list of glob patterns to watch relative to the workspace folder. */
	watch?: string | string[];
	/** Whether to debug the MCP server when it's started. */
	debug?: 'node';
}

export interface IMcpConfigurationCommon {
	dev?: IMcpDevModeConfig;
}

export interface IMcpConfigurationStdio extends IMcpConfigurationCommon {
	type?: 'stdio';
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
	envFile?: string;
}

export interface IMcpConfigurationHTTP extends IMcpConfigurationCommon {
	type?: 'http';
	url: string;
	headers?: Record<string, string>;
}
