/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Long-running Agents Hub stress gate for an isolated Code - OSS instance.
//
// It repeatedly opens Hub cards in the side panel, the way a user switches sessions for hours,
// and samples the real renderer after forced GC: JS heap, DOM nodes, event listeners, documents,
// layout/style work and long tasks. Per-switch latency and linear growth trends identify leaks
// (heap/nodes/listeners rising at equal workload) and slowdowns (latency rising over time).
//
// Usage (launch OSS with --remote-debugging-port and open the Agents Hub with several cards):
//   node scripts/stress-project-board.mts http://127.0.0.1:9335 [--switches 300] [--cards 8]
//     [--sample-every 25] [--report stress-report.json] [--snapshots <directory>] [--no-assert]
//
// --snapshots writes heap snapshots after warmup and at the end; load both in DevTools
// (Memory > Comparison) to see which constructors were retained between them.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type CDPSession, type Page } from '@playwright/test';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		switches: { type: 'string', default: '300' },
		cards: { type: 'string', default: '8' },
		'sample-every': { type: 'string', default: '25' },
		warmup: { type: 'string', default: '2' },
		report: { type: 'string' },
		snapshots: { type: 'string' },
		'no-assert': { type: 'boolean', default: false },
		'max-heap-mb-per-100': { type: 'string', default: '2' },
		'max-nodes-per-100': { type: 'string', default: '200' },
		'max-listeners-per-100': { type: 'string', default: '25' },
		'max-latency-growth': { type: 'string', default: '1.5' },
	},
});
const [endpoint] = positionals;
assert.ok(endpoint, 'Usage: node scripts/stress-project-board.mts <CDP endpoint> [options]');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname), 'Use a local, isolated OSS instance');
const switches = Number(values.switches);
const cardLimit = Number(values.cards);
const sampleEvery = Number(values['sample-every']);
const warmupRotations = Number(values.warmup);

interface ISample {
	readonly switch: number;
	readonly heapMb: number;
	readonly nodes: number;
	readonly listeners: number;
	readonly documents: number;
	readonly layoutCount: number;
	readonly recalcStyleCount: number;
	readonly taskSeconds: number;
	readonly longTasks: number;
	readonly longTaskMs: number;
}

const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
try {
	const context = browser.contexts()[0];
	let board: Page | undefined;
	for (const page of context.pages()) {
		if (await page.locator('.project-board [data-chat-resource]').count()) {
			board = page;
			break;
		}
	}
	assert.ok(board, 'Open an Agents Hub board with several chat cards before running this gate');
	const page = board;
	const cdp: CDPSession = await context.newCDPSession(page);
	await cdp.send('Performance.enable');
	await cdp.send('HeapProfiler.enable');

	await page.evaluate(() => {
		const state = { count: 0, total: 0 };
		Reflect.set(window, '__projectBoardStress', state);
		new PerformanceObserver(list => {
			for (const entry of list.getEntries()) {
				state.count++;
				state.total += entry.duration;
			}
		}).observe({ type: 'longtask', buffered: false });
	});

	const resources = (await page.locator('.project-board [data-chat-resource]').evaluateAll(elements =>
		[...new Set(elements.map(element => (element as HTMLElement).dataset.chatResource!))])).slice(0, cardLimit);
	assert.ok(resources.length >= 2, 'The board needs at least two chat cards to switch between');
	console.log(`Switching between ${resources.length} cards for ${switches} switches (warmup ${warmupRotations} rotations)`);

	const card = (resource: string) => page.locator(`.project-board [data-chat-resource=${JSON.stringify(resource)}]`).first();
	const openCard = async (resource: string): Promise<number> => {
		const target = card(resource);
		await target.scrollIntoViewIfNeeded();
		const start = Date.now();
		await target.dblclick();
		// The board marks the exact card active only after the side panel finished loading it.
		await page.waitForFunction(value => {
			const element = [...document.querySelectorAll<HTMLElement>('.project-board [data-chat-resource]')].find(candidate => candidate.dataset.chatResource === value);
			return !!element?.classList.contains('project-board-card-active-chat');
		}, resource, { timeout: 30_000 });
		return Date.now() - start;
	};

	const sample = async (index: number): Promise<ISample> => {
		await cdp.send('HeapProfiler.collectGarbage');
		await cdp.send('HeapProfiler.collectGarbage');
		const { metrics } = await cdp.send('Performance.getMetrics');
		const metric = (name: string) => metrics.find(entry => entry.name === name)?.value ?? 0;
		const longTasks = await page.evaluate(() => Reflect.get(window, '__projectBoardStress') as { count: number; total: number });
		return {
			switch: index,
			heapMb: +(metric('JSHeapUsedSize') / 1024 / 1024).toFixed(2),
			nodes: metric('Nodes'),
			listeners: metric('JSEventListeners'),
			documents: metric('Documents'),
			layoutCount: metric('LayoutCount'),
			recalcStyleCount: metric('RecalcStyleCount'),
			taskSeconds: +metric('TaskDuration').toFixed(3),
			longTasks: longTasks.count,
			longTaskMs: Math.round(longTasks.total),
		};
	};

	const snapshot = async (name: string) => {
		if (!values.snapshots) {
			return;
		}
		mkdirSync(values.snapshots, { recursive: true });
		const chunks: string[] = [];
		const listener = (event: { chunk: string }) => chunks.push(event.chunk);
		cdp.on('HeapProfiler.addHeapSnapshotChunk', listener);
		await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
		cdp.off('HeapProfiler.addHeapSnapshotChunk', listener);
		const file = join(values.snapshots, `${name}.heapsnapshot`);
		writeFileSync(file, chunks.join(''));
		console.log(`Wrote ${file}`);
	};

	for (let index = 0; index < resources.length * warmupRotations; index++) {
		await openCard(resources[index % resources.length]);
	}
	await snapshot('after-warmup');

	const samples: ISample[] = [await sample(0)];
	const latencies: number[] = [];
	for (let index = 1; index <= switches; index++) {
		latencies.push(await openCard(resources[index % resources.length]));
		if (index % sampleEvery === 0 || index === switches) {
			const current = await sample(index);
			samples.push(current);
			const recent = latencies.slice(-sampleEvery).sort((a, b) => a - b);
			console.log(`#${index} heap=${current.heapMb}MB nodes=${current.nodes} listeners=${current.listeners} docs=${current.documents} longTasks=${current.longTasks} p50=${recent[Math.floor(recent.length / 2)]}ms p95=${recent[Math.floor(recent.length * 0.95)]}ms`);
		}
	}
	await snapshot('final');

	// Least-squares slope per 100 switches, robust to GC noise in individual samples.
	const slope = (pick: (sample: ISample) => number) => {
		const xs = samples.map(entry => entry.switch);
		const ys = samples.map(pick);
		const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
		const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
		const numerator = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0);
		const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0) || 1;
		return +(numerator / denominator * 100).toFixed(3);
	};
	const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
	const trendWindow = Math.max(resources.length, Math.floor(latencies.length / 5));
	const summary = {
		cards: resources.length,
		switches,
		heapMbPer100: slope(entry => entry.heapMb),
		nodesPer100: slope(entry => entry.nodes),
		listenersPer100: slope(entry => entry.listeners),
		documentsPer100: slope(entry => entry.documents),
		earlyMedianMs: median(latencies.slice(0, trendWindow)),
		lateMedianMs: median(latencies.slice(-trendWindow)),
		longTasks: samples.at(-1)!.longTasks - samples[0].longTasks,
		longTaskMs: samples.at(-1)!.longTaskMs - samples[0].longTaskMs,
	};
	console.log('Summary', JSON.stringify(summary));
	if (values.report) {
		writeFileSync(values.report, JSON.stringify({ summary, samples, latencies }, undefined, '\t'));
		console.log(`Wrote ${values.report}`);
	}

	if (!values['no-assert']) {
		const failures = [
			summary.heapMbPer100 > Number(values['max-heap-mb-per-100']) && `JS heap grows ${summary.heapMbPer100}MB per 100 switches`,
			summary.nodesPer100 > Number(values['max-nodes-per-100']) && `DOM nodes grow ${summary.nodesPer100} per 100 switches`,
			summary.listenersPer100 > Number(values['max-listeners-per-100']) && `Event listeners grow ${summary.listenersPer100} per 100 switches`,
			summary.documentsPer100 > 0.5 && `Documents grow ${summary.documentsPer100} per 100 switches (detached windows/iframes)`,
			summary.lateMedianMs > summary.earlyMedianMs * Number(values['max-latency-growth']) + 50 && `Switch latency grew from ${summary.earlyMedianMs}ms to ${summary.lateMedianMs}ms`,
		].filter((failure): failure is string => !!failure);
		assert.deepStrictEqual(failures, [], 'Agents Hub stress gate failed');
		console.log('PASS: no heap, DOM, listener, document or latency growth across long Hub session switching');
	}
} finally {
	await browser.close();
}
