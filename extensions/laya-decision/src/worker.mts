/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from 'node:worker_threads';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Laya, type Question } from '@receptron/laya';

interface WorkerRequest {
	readonly type: 'decide';
	readonly id: number;
	readonly state: unknown;
	readonly questions: Record<string, Question>;
	readonly cacheDir: string;
	readonly modelDir?: string;
}

let laya: Laya | undefined;
let loading: Promise<Laya> | undefined;

parentPort?.on('message', async (request: WorkerRequest) => {
	try {
		const startedAt = performance.now();
		const cpuBefore = process.cpuUsage();
		const before = snapshot();
		const modelWasLoaded = laya !== undefined;
		const model = await getLaya(request);
		const afterLoad = snapshot();
		const modelLoadedAt = performance.now();
		const result = await model.systemOne(request.state, request.questions);
		const afterInference = snapshot();
		const completedAt = performance.now();
		const cpu = process.cpuUsage(cpuBefore);
		parentPort?.postMessage({
			type: 'result',
			id: request.id,
			result,
			metrics: {
				executionProvider: 'cpu',
				gpuUsed: false,
				modelWasLoaded,
				modelLoadMs: modelLoadedAt - startedAt,
				inferenceMs: completedAt - modelLoadedAt,
				totalMs: completedAt - startedAt,
				cpuUserMs: cpu.user / 1000,
				cpuSystemMs: cpu.system / 1000,
				systemCpuUtilizationPercent: systemCpuUtilization(before, afterInference),
				rssDeltaBytes: afterInference.rssBytes - before.rssBytes,
				systemFreeMemoryDeltaBytes: afterInference.systemFreeMemoryBytes - before.systemFreeMemoryBytes,
				before,
				afterLoad,
				afterInference,
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		parentPort?.postMessage({ type: 'error', id: request.id, message });
	}
});

function snapshot() {
	const memory = process.memoryUsage();
	const cpuTimes = cpus().reduce((result, cpu) => {
		const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
		return {
			idleMs: result.idleMs + cpu.times.idle,
			totalMs: result.totalMs + total,
		};
	}, { idleMs: 0, totalMs: 0 });
	return {
		timestamp: new Date().toISOString(),
		rssBytes: memory.rss,
		heapUsedBytes: memory.heapUsed,
		externalBytes: memory.external,
		arrayBuffersBytes: memory.arrayBuffers,
		systemFreeMemoryBytes: freemem(),
		systemTotalMemoryBytes: totalmem(),
		systemLoadAverage: loadavg(),
		systemCpuTimes: cpuTimes,
	};
}

function systemCpuUtilization(before: ReturnType<typeof snapshot>, after: ReturnType<typeof snapshot>): number {
	const totalDelta = after.systemCpuTimes.totalMs - before.systemCpuTimes.totalMs;
	const idleDelta = after.systemCpuTimes.idleMs - before.systemCpuTimes.idleMs;
	return totalDelta > 0 ? (totalDelta - idleDelta) / totalDelta * 100 : 0;
}

async function getLaya(request: WorkerRequest): Promise<Laya> {
	if (laya) {
		return laya;
	}
	if (!loading) {
		loading = Laya.load({
			cacheDir: request.cacheDir,
			...(request.modelDir ? { modelDir: request.modelDir } : {}),
			onProgress: progress => parentPort?.postMessage({
				type: 'progress',
				id: request.id,
				...progress,
			}),
		});
	}
	try {
		laya = await loading;
		return laya;
	} finally {
		loading = undefined;
	}
}
