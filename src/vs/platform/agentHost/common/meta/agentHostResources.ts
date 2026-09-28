/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';
import type { RootMeta, RootState } from '../state/sessionState.js';

const ROOT_META_RESOURCES_KEY = 'vscode.agentHost.resources';

/** Execution resources of the host environment; absent fields are unknown. */
export interface IAgentHostResources {
	readonly platform?: 'windows' | 'linux' | 'macos';
	readonly architecture?: string;
	/** Logical processors available to the host process. */
	readonly cpuCount?: number;
	/** Memory capacity in bytes, accounting for environment limits rather than current free memory. */
	readonly memoryBytes?: number;
}

export function readAgentHostResources(root: RootState | undefined): IAgentHostResources | undefined {
	return validateAgentHostResources(root?._meta?.[ROOT_META_RESOURCES_KEY]);
}

/** Merges resource metadata, or removes the slot when no valid resources are provided. */
export function withAgentHostResources(meta: RootMeta | undefined, resources: IAgentHostResources | undefined): RootMeta | undefined {
	const next: RootMeta = { ...meta };
	const validated = validateAgentHostResources(resources);
	if (validated) {
		next[ROOT_META_RESOURCES_KEY] = validated;
	} else {
		delete next[ROOT_META_RESOURCES_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function validateAgentHostResources(value: unknown): IAgentHostResources | undefined {
	if (!isResourceRecord(value)) {
		return undefined;
	}

	const { platform: rawPlatform, architecture: rawArchitecture, cpuCount: rawCpuCount, memoryBytes: rawMemoryBytes } = value;
	const platform = rawPlatform === 'windows' || rawPlatform === 'linux' || rawPlatform === 'macos' ? rawPlatform : undefined;
	const architecture = typeof rawArchitecture === 'string' && rawArchitecture.trim().length > 0 ? rawArchitecture : undefined;
	const cpuCount = isPositiveSafeInteger(rawCpuCount) ? rawCpuCount : undefined;
	const memoryBytes = isPositiveSafeInteger(rawMemoryBytes) ? rawMemoryBytes : undefined;
	if (platform === undefined && architecture === undefined && cpuCount === undefined && memoryBytes === undefined) {
		return undefined;
	}

	return {
		...(platform !== undefined ? { platform } : {}),
		...(architecture !== undefined ? { architecture } : {}),
		...(cpuCount !== undefined ? { cpuCount } : {}),
		...(memoryBytes !== undefined ? { memoryBytes } : {}),
	};
}

function isResourceRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
