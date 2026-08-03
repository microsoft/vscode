/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse as parseJSONC } from '../../../base/common/json.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';

export const AGENT_PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const AGENT_PLUGIN_MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

const agentPluginSchemaPrefix = 'https://agent-plugins.org/schemas/';

export interface IAgentPluginManifest {
	readonly $schema: string;
	readonly name?: string;
	readonly version?: string;
	readonly description?: string;
}

export async function readAgentPluginManifest(pluginUri: URI, fileService: IFileService): Promise<IAgentPluginManifest | undefined> {
	const manifestUri = joinPath(pluginUri, 'plugin.json');
	if (!await fileService.exists(manifestUri)) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = parseJSONC((await fileService.readFile(manifestUri)).value.toString());
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isAgentPluginSchema(parsed['$schema'])) {
		return undefined;
	}

	const manifest: IAgentPluginManifest = {
		$schema: parsed['$schema'],
	};
	const name = asNonEmptyString(parsed['name']);
	const version = asString(parsed['version']);
	const description = asString(parsed['description']);
	return {
		...manifest,
		...(name ? { name } : {}),
		...(version ? { version } : {}),
		...(description ? { description } : {}),
	};
}

function isAgentPluginSchema(value: unknown): value is string {
	return typeof value === 'string'
		&& value.startsWith(agentPluginSchemaPrefix)
		&& value.endsWith('/plugin.schema.json');
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
