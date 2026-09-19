/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { availableParallelism, totalmem } from 'os';
import type { IAgentHostResources } from '../common/meta/agentHostResources.js';

interface IHostResourceSource {
	readonly platform: string;
	readonly architecture: string;
	availableParallelism(): number;
	totalmem(): number;
	constrainedMemory(): number | undefined;
}

/** Collects process-available CPU and environment memory capacity without sampling current utilization. */
export function collectAgentHostResources(source: IHostResourceSource = {
	platform: process.platform,
	architecture: process.arch,
	availableParallelism,
	totalmem,
	constrainedMemory: () => process.constrainedMemory?.(),
}): IAgentHostResources {
	const platform = source.platform === 'win32' ? 'windows'
		: source.platform === 'darwin' ? 'macos'
			: source.platform === 'linux' ? 'linux' : undefined;
	const architecture = source.architecture.trim().length > 0 ? source.architecture : undefined;
	const cpuCount = readCapacity(() => source.availableParallelism());
	const totalMemoryBytes = readCapacity(() => source.totalmem());
	const constrainedMemoryBytes = readCapacity(() => source.constrainedMemory());
	const memoryBytes = totalMemoryBytes === undefined ? constrainedMemoryBytes
		: constrainedMemoryBytes === undefined ? totalMemoryBytes : Math.min(totalMemoryBytes, constrainedMemoryBytes);

	return {
		...(platform !== undefined ? { platform } : {}),
		...(architecture !== undefined ? { architecture } : {}),
		...(cpuCount !== undefined ? { cpuCount } : {}),
		...(memoryBytes !== undefined ? { memoryBytes } : {}),
	};
}

function readCapacity(read: () => number | undefined): number | undefined {
	try {
		const value = read();
		return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
	} catch {
		return undefined;
	}
}
