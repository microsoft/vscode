/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';

export interface IMcpConfiguration {
	inputs?: unknown[];
	/** @deprecated Only for rough cross-compat with other formats */
	mcpServers?: Record<string, IMcpConfigurationStdio>;
	servers?: Record<string, IMcpConfigurationStdio | IMcpConfigurationHTTP>;
}

export type McpConfigurationServer = IMcpConfigurationStdio | IMcpConfigurationHTTP;

export interface IMcpConfigurationStdio {
	type?: 'stdio';
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
	envFile?: string;
	manifest?: IMcpServerManifest;
}

export interface IMcpConfigurationHTTP {
	type?: 'http';
	url: string;
	headers?: Record<string, string>;
	manifest?: IMcpServerManifest;
}

export type IMcpServerLaunchConfig = IStringDictionary<{
	readonly version?: string;
	readonly package: {
		readonly name: string;
		readonly version?: string;
		readonly args?: readonly string[];
	};
}>;

export interface IMcpRemoteServerConfig {
	readonly url: string;
	readonly headers?: Record<string, string>;
}

export interface IRelaxedMcpServerManifest {
	id?: string;
	name: string;
	displayName?: string;
	version: string;
	description?: string;
	url?: string;
	config: IMcpServerLaunchConfig | IMcpRemoteServerConfig;
	iconUrl?: string;
	codicon?: string;
	repository?: { url: string };
	bugs?: { url: string };
	categories?: string[];
	keywords?: string[];
	publisher?: string;
	publisherDisplayName?: string;
}

export type IMcpServerManifest = Readonly<IRelaxedMcpServerManifest>;

export interface IMcpServerConfiguration {
	readonly manifest?: IMcpServerManifest;
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
	readonly servers: IStringDictionary<Readonly<IMcpServerConfiguration>>;
}
