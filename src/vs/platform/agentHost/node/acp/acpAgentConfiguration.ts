/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../log/common/log.js';
import { IAgentHostAcpAgentConfiguration } from '../../common/agentService.js';

const validAgentId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined;
}

function readEnvironment(value: unknown): Readonly<Record<string, string>> | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value) || !Object.values(value).every(item => typeof item === 'string')) {
		return undefined;
	}
	const environment: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'string') {
			environment[key] = item;
		}
	}
	return environment;
}

export function parseAcpAgentConfigurations(serialized: string | undefined, logService: ILogService): readonly IAgentHostAcpAgentConfiguration[] {
	if (!serialized) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch (error) {
		logService.error('[Agent Rosetta] Failed to parse ACP agent configuration.', error);
		return [];
	}

	if (!Array.isArray(parsed)) {
		logService.error('[Agent Rosetta] ACP agent configuration must be an array.');
		return [];
	}

	const result: IAgentHostAcpAgentConfiguration[] = [];
	const identifiers = new Set<string>();
	for (const [index, value] of parsed.entries()) {
		if (!isRecord(value)) {
			logService.error(`[Agent Rosetta] Ignoring ACP agent configuration at index ${index}: expected an object.`);
			continue;
		}

		const id = typeof value.id === 'string' ? value.id.trim() : '';
		const command = typeof value.command === 'string' ? value.command.trim() : '';
		const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined;
		const args = readStringArray(value.args);
		const env = readEnvironment(value.env);
		if (!validAgentId.test(id)) {
			logService.error(`[Agent Rosetta] Ignoring ACP agent configuration at index ${index}: invalid id "${id}".`);
			continue;
		}
		if (identifiers.has(id)) {
			logService.error(`[Agent Rosetta] Ignoring duplicate ACP agent id "${id}".`);
			continue;
		}
		if (!command) {
			logService.error(`[Agent Rosetta] Ignoring ACP agent "${id}": command is required.`);
			continue;
		}
		if (value.args !== undefined && args === undefined) {
			logService.error(`[Agent Rosetta] Ignoring ACP agent "${id}": args must contain only strings.`);
			continue;
		}
		if (value.env !== undefined && env === undefined) {
			logService.error(`[Agent Rosetta] Ignoring ACP agent "${id}": env values must be strings.`);
			continue;
		}

		identifiers.add(id);
		result.push({ id, name, command, args, env });
	}
	return result;
}
