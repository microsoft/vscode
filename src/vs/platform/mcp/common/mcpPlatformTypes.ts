/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchemaMap } from '../../../base/common/jsonSchema.js';

export interface IMcpConfiguration {
	inputs?: unknown[];
	/** @deprecated Only for rough cross-compat with other formats */
	mcpServers?: Record<string, IMcpConfigurationStdio>;
	servers?: Record<string, IMcpConfigurationStdio | IMcpConfigurationHTTP>;
}

export type McpConfigurationServer = IMcpConfigurationStdio | IMcpConfigurationHTTP;

export interface IMetadata {
	publisher?: string;
	publisherDisplayName?: string;
}

export interface IMcpConfigurationStdio {
	type?: 'stdio';
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
	envFile?: string;
	location?: string;
	metadata?: IMetadata;
}

export interface IMcpConfigurationHTTP {
	type?: 'http';
	url: string;
	headers?: Record<string, string>;
	location?: string;
	metadata?: IMetadata;
}

export interface IMcpServerContributions {
	readonly tools?: {
		readonly name: string;
		readonly description: string;
	};
}

/**
 * A command for an MCP server.
 *
 * - In the command, arguments, and `env` keys, properties in the form
 *   `{{name}}` may be replaced with configuration values from the manifest schema.
 * - Arguments or environment variables that use a key not defined in the
 *   configuration will be omitted.
 * - Replacements are unescaped with triple `{{{braces}}}` (to output `{{braces}}`).
 */
export interface IMcpServerConfig {
	readonly command: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string | number | null>;
	/** Mapping of environment variables, a JSON schema object */
	readonly configuration?: {
		/** JSON schema properties. Properties are stringified, e.g. JSON objects will be encoded */
		properties: IJSONSchemaMap;
		required?: string[];
	};
}

export interface IMcpRemoteServerConfig {
	readonly url: string;
	readonly headers?: Record<string, string>;
}

export interface IRelaxedMcpServerManifest {
	name: string;
	displayName?: string;
	version: string;
	description?: string;
	server: IMcpServerConfig | IMcpRemoteServerConfig;
	contributes?: IMcpServerContributions;
	iconUrl?: string;
	repository?: { url: string };
	bugs?: { url: string };
	categories?: string[];
	keywords?: string[];
}

export type IMcpServerManifest = Readonly<IRelaxedMcpServerManifest>;
