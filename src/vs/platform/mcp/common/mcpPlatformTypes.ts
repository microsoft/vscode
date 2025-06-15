/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { UriComponents } from '../../../base/common/uri.js';

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
	debug?: { type: 'node' } | { type: 'debugpy'; debugpyPath?: string };
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
	cwd?: string;
}

export interface IMcpConfigurationHTTP extends IMcpConfigurationCommon {
	type?: 'http';
	url: string;
	headers?: Record<string, string>;
}

export const enum McpServerVariableType {
	PROMPT = 'promptString',
	PICK = 'pickString',
}

export interface IMcpServerVariable {
	readonly id: string;
	readonly type: McpServerVariableType;
	readonly description: string;
	readonly password: boolean;
	readonly default?: string;
	readonly options?: readonly string[];
	readonly serverName?: string;
}

export interface IMcpServerConfiguration {
	readonly location?: UriComponents;
}

export interface IMcpStdioServerConfiguration extends IMcpServerConfiguration {
	readonly type: 'stdio';
	readonly command: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string | number | null>;
	readonly envFile?: string;
}

export interface IMcpRemtoeServerConfiguration extends IMcpServerConfiguration {
	readonly type: 'http';
	readonly url: string;
	readonly headers?: Record<string, string>;
}

export interface IMcpServersConfiguration {
	servers?: IStringDictionary<IMcpServerConfiguration>;
	inputs?: IMcpServerVariable[];
}
