/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as os from 'os';

const processorPattern = /^processor\s*:/;
const modelNamePrefix = 'model name\t: ';

let cpuModelNames: string | undefined;
let cpuModelNamesPromise: Promise<string> | undefined;

/**
 * Sets the `common_cpu` telemetry property to the de-duplicated, comma separated model names
 * of the machine's CPUs, matching `Array.from(new Set(os.cpus().map(c => c.model))).join()`.
 *
 * On Linux, `os.cpus()` also reads each CPU's current frequency from sysfs. Some kernels
 * sleep ~10-20ms per CPU for every read, which blocks the extension host for seconds on
 * many-core machines. On x86 Linux the model names are therefore read asynchronously from
 * `/proc/cpuinfo` and the property is set once they are available. The model names are
 * computed only once per process.
 */
export function setCommonCpuProperty(properties: Record<string, string>): void {
	const names = getCpuModelNames();
	if (typeof names === 'string') {
		properties.common_cpu = names;
	} else {
		void names.then(names => properties.common_cpu = names);
	}
}

function getCpuModelNames(): string | Promise<string> {
	if (cpuModelNames !== undefined) {
		return cpuModelNames;
	}
	if (process.platform !== 'linux' || (process.arch !== 'x64' && process.arch !== 'ia32')) {
		cpuModelNames = joinModelNames(os.cpus().map(cpu => cpu.model));
		return cpuModelNames;
	}
	cpuModelNamesPromise ??= readCpuInfoModelNames().then(names => cpuModelNames = names);
	return cpuModelNamesPromise;
}

async function readCpuInfoModelNames(): Promise<string> {
	let models: string[] = [];
	try {
		models = parseCpuInfoModelNames(await fs.readFile('/proc/cpuinfo', 'utf8'));
	} catch {
		// Fall back to os.cpus() below
	}
	if (models.length === 0) {
		models = os.cpus().map(cpu => cpu.model);
	}
	return joinModelNames(models);
}

function joinModelNames(models: readonly string[]): string {
	return Array.from(new Set(models)).join();
}

/**
 * Parses the model name of each processor from x86 Linux `/proc/cpuinfo` content, in the
 * same way as libuv's `uv_cpu_info`.
 */
export function parseCpuInfoModelNames(cpuInfo: string): string[] {
	const models: string[] = [];
	for (const block of cpuInfo.split('\n\n')) {
		const lines = block.split('\n');
		if (!processorPattern.test(lines[0])) {
			continue;
		}
		const modelLine = lines.find(line => line.startsWith(modelNamePrefix));
		models.push(modelLine?.substring(modelNamePrefix.length) ?? 'unknown');
	}
	return models;
}
