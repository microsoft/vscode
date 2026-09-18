/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs';
import * as path from 'node:path';

const arms = ['control', 'hook', 'title', 'combined'];
const surfaces = ['editor', 'agents'];
const cohorts = ['coldProcess', 'warmProcessNewSession', 'existingSessionTurn'];
const outcomes = ['success', 'cancelled', 'error', 'notDispatched', 'incomplete'];
const controlKeys = ['commit', 'buildMode', 'sdkVersion', 'cliVersion', 'workspaceHash', 'promptHash', 'model', 'reasoning', 'contextSize', 'inventoryHash'];
const maxLogBytes = 64 * 1024 * 1024;

interface Run {
	runId: string;
	block: string;
	arm: string;
	surface: string;
	cohort: string;
	bundle: string;
	turnId: string;
	chatChannel: string | undefined;
	rendererResource: string | undefined;
	utcOffset: string | undefined;
}

interface Measurement {
	clock: string;
	outcome: string;
	firstTextMs: number | null;
	totalMs: number | null;
	host?: { rootTurnOrdinal: number; processAgeMs: number } | null;
	usage?: {
		status: 'missing' | 'captured';
		unattributedRecords: number;
		legacyRecords: number;
		calls: Record<string, string | number>[];
	};
}

interface Results {
	schemaVersion: number;
	controls: Record<string, string>;
	runs: Array<Omit<Run, 'bundle' | 'chatChannel' | 'rendererResource' | 'utcOffset'> & Measurement>;
}

function object(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} must be a nonempty string`);
	}
	return value;
}

function choice(value: unknown, values: readonly string[], label: string): string {
	const result = text(value, label);
	if (!values.includes(result)) {
		throw new Error(`${label} must be one of: ${values.join(', ')}`);
	}
	return result;
}

function duration(value: unknown, label: string): number | null {
	if (value === null) {
		return null;
	}
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative finite number or null`);
	}
	return value;
}

function controls(value: unknown): Record<string, string> {
	const input = object(value, 'controls');
	return Object.fromEntries(controlKeys.map(key => [key, text(input[key], `controls.${key}`)]));
}

function readText(file: string): string {
	if (fs.statSync(file).size > maxLogBytes) {
		throw new Error(`Log exceeds ${maxLogBytes} bytes: ${file}`);
	}
	return fs.readFileSync(file, 'utf8');
}

function parseJson(input: string, label: string): unknown {
	try {
		return JSON.parse(input);
	} catch {
		throw new Error(`Invalid JSON in ${label}`);
	}
}

function matchingFiles(directory: string, pattern: RegExp): string[] {
	if (!fs.existsSync(directory)) {
		return [];
	}
	return fs.readdirSync(directory, { withFileTypes: true })
		.filter(entry => entry.isFile() && pattern.test(entry.name))
		.map(entry => path.join(directory, entry.name)).sort();
}

function run(value: unknown, base: string): Run {
	const input = object(value, 'run');
	return {
		runId: text(input.runId, 'runId'),
		block: text(input.block, 'block'),
		arm: choice(input.arm, arms, 'arm'),
		surface: choice(input.surface, surfaces, 'surface'),
		cohort: choice(input.cohort, cohorts, 'cohort'),
		bundle: path.resolve(base, text(input.bundle, 'bundle')),
		turnId: text(input.turnId, 'turnId'),
		chatChannel: input.chatChannel === undefined ? undefined : text(input.chatChannel, 'chatChannel'),
		rendererResource: input.rendererResource === undefined ? undefined : text(input.rendererResource, 'rendererResource'),
		utcOffset: input.utcOffset === undefined ? undefined : text(input.utcOffset, 'utcOffset'),
	};
}

function timestampMs(timestamp: string): number {
	const result = Date.parse(timestamp);
	if (!Number.isFinite(result)) {
		throw new Error('Invalid capture timestamp');
	}
	return result;
}

function historicalMeasurement(input: Run, rendererLines: string[]): Measurement {
	if (!input.chatChannel || !input.rendererResource || !input.utcOffset || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(input.utcOffset)) {
		throw new Error('Historical extraction requires chatChannel, rendererResource and explicit utcOffset (for example -07:00)');
	}
	const suffix = `_invokeAgent called for resource: ${input.rendererResource}`;
	const invocations = rendererLines.filter(line => line.endsWith(suffix));
	if (invocations.length !== 1) {
		throw new Error(`Expected exactly one historical invocation for ${input.runId}; found ${invocations.length}`);
	}
	const match = /^(?<date>\d{4}-\d{2}-\d{2}) (?<time>\d{2}:\d{2}:\d{2}\.\d{3}) /.exec(invocations[0]);
	if (!match?.groups) {
		throw new Error('Historical invocation has no supported local timestamp');
	}
	const start = timestampMs(`${match.groups.date}T${match.groups.time}${input.utcOffset}`);
	const actions: { time: number; action: Record<string, unknown> }[] = [];
	for (const file of matchingFiles(path.join(input.bundle, 'ahp'), /\.jsonl$/)) {
		for (const [index, line] of readText(file).split(/\r?\n/).entries()) {
			if (!line.trim()) {
				continue;
			}
			const record = object(parseJson(line, `${path.basename(file)}:${index + 1}`), 'AHP record');
			if (record.method !== 'action') {
				continue;
			}
			const params = object(record.params, 'AHP params');
			if (params.channel !== input.chatChannel) {
				continue;
			}
			const action = object(params.action, 'AHP action');
			if (action.turnId !== input.turnId) {
				continue;
			}
			const log = object(record._ahpLog, 'AHP log metadata');
			if (log.dir !== 's2c') {
				continue;
			}
			if (log.truncated === true) {
				throw new Error(`Truncated action for ${input.runId}; cannot reconstruct first text safely`);
			}
			actions.push({ time: timestampMs(text(log.ts, 'AHP timestamp')), action });
		}
	}
	actions.sort((a, b) => a.time - b.time);
	let firstTextMs: number | null = null;
	let totalMs: number | null = null;
	let outcome = 'incomplete';
	const markdownParts = new Set<string>();
	for (const { time, action } of actions) {
		let content;
		if (action.type === 'chat/responsePart') {
			const part = object(action.part, 'response part');
			if (part.kind === 'markdown') {
				markdownParts.add(text(part.id, 'markdown part id'));
				content = part.content;
			}
		} else if (action.type === 'chat/delta' && typeof action.partId === 'string' && markdownParts.has(action.partId)) {
			content = action.content;
		}
		if (firstTextMs === null && typeof content === 'string' && content.trim()) {
			firstTextMs = duration(time - start, 'historical first text');
		}
		const terminalOutcome = action.type === 'chat/turnComplete' ? 'success'
			: action.type === 'chat/turnCancelled' ? 'cancelled'
				: action.type === 'chat/error' ? 'error' : undefined;
		if (terminalOutcome && totalMs === null) {
			outcome = terminalOutcome;
			totalMs = duration(time - start, 'historical completion');
			break;
		}
	}
	return { clock: 'historicalWallClock', outcome, firstTextMs, totalMs };
}

function extractMeasurement(input: Run, historical: boolean): Measurement {
	const files = matchingFiles(path.join(input.bundle, 'vscode-logs', 'Window'), /^renderer(?:\.\d+)?\.log$/);
	const lines = files.flatMap(file => readText(file).split(/\r?\n/));
	if (historical) {
		return historicalMeasurement(input, lines);
	}
	const marker = '[AgentHostFirstResponse] ';
	const records = new Map<string, Measurement>();
	for (const line of lines) {
		const index = line.indexOf(marker);
		if (index < 0) {
			continue;
		}
		const record = object(parseJson(line.slice(index + marker.length), 'renderer first-response record'), 'first-response record');
		if (record.requestId !== input.turnId) {
			continue;
		}
		const invocationKind = choice(record.invocationKind, ['newTurn', 'existingTurn', 'subagent', 'unknown'], 'invocationKind');
		if (invocationKind === 'existingTurn' || invocationKind === 'subagent') {
			continue;
		}
		if (record.schemaVersion !== 1 || typeof record.hasResponseText !== 'boolean') {
			throw new Error(`Unsupported first-response timing schema for ${input.runId}`);
		}
		const turnKind = choice(record.sessionTurnKind, ['first', 'later', 'unknown'], 'sessionTurnKind');
		if ((input.cohort === 'existingSessionTurn' && turnKind === 'first') || (input.cohort !== 'existingSessionTurn' && turnKind === 'later')) {
			throw new Error(`Declared cohort contradicts captured sessionTurnKind for ${input.runId}`);
		}
		const firstTextMs = duration(record.firstResponseTextMs ?? null, 'firstResponseTextMs');
		const totalMs = duration(record.totalElapsedMs, 'totalElapsedMs');
		if (record.hasResponseText !== (firstTextMs !== null) || totalMs === null || (firstTextMs !== null && firstTextMs > totalMs)) {
			throw new Error(`Inconsistent first-response timing record for ${input.runId}`);
		}
		const measurement = {
			clock: 'rendererMonotonic',
			outcome: choice(record.outcome, outcomes.filter(outcome => outcome !== 'incomplete'), 'outcome'),
			firstTextMs,
			totalMs,
		};
		records.set(JSON.stringify(record), measurement);
	}
	if (records.size !== 1) {
		throw new Error(`Expected one monotonic timing record for ${input.runId}; found ${records.size}`);
	}
	return { ...records.values().next().value!, host: extractHostTiming(input), usage: extractUsage(input) };
}

function extractHostTiming(input: Run): Measurement['host'] {
	const marker = '[AgentHostTurnTiming] ';
	const records = new Map<string, NonNullable<Measurement['host']>>();
	for (const file of matchingFiles(input.bundle, /^(?:agenthost|agenthost-server|remote-agenthost)(?:\.\d+)?\.log$/)) {
		for (const line of readText(file).split(/\r?\n/)) {
			const index = line.indexOf(marker);
			if (index < 0) {
				continue;
			}
			const record = object(parseJson(line.slice(index + marker.length), 'host turn-timing record'), 'host turn timing');
			if (record.turnId !== input.turnId) {
				continue;
			}
			const rootTurnOrdinal = duration(record.hostRootTurnOrdinal, 'hostRootTurnOrdinal');
			const processAgeMs = duration(record.hostProcessAgeMs, 'hostProcessAgeMs');
			if (record.schemaVersion !== 1 || rootTurnOrdinal === null || rootTurnOrdinal < 1 || !Number.isInteger(rootTurnOrdinal) || processAgeMs === null) {
				throw new Error(`Unsupported host turn-timing record for ${input.runId}`);
			}
			records.set(JSON.stringify(record), { rootTurnOrdinal, processAgeMs });
		}
	}
	if (records.size > 1) {
		throw new Error(`Conflicting host turn-timing records for ${input.runId}`);
	}
	return records.values().next().value ?? null;
}

function extractUsage(input: Run): NonNullable<Measurement['usage']> {
	const file = path.join(input.bundle, 'usage.jsonl');
	if (!fs.existsSync(file)) {
		return { status: 'missing', unattributedRecords: 0, legacyRecords: 0, calls: [] };
	}
	const calls = new Map<string, Record<string, string | number>>();
	let unattributedRecords = 0;
	let legacyRecords = 0;
	for (const [index, line] of readText(file).split(/\r?\n/).entries()) {
		if (!line.trim()) {
			continue;
		}
		const record = object(parseJson(line, `usage.jsonl:${index + 1}`), 'usage record');
		if (record.schemaVersion === undefined) {
			legacyRecords++;
			continue;
		}
		if (record.schemaVersion !== 2) {
			throw new Error(`Unsupported usage schema in usage.jsonl:${index + 1}`);
		}
		if (record.correlation !== 'exact' || typeof record.turnId !== 'string') {
			unattributedRecords++;
			continue;
		}
		if (record.turnId !== input.turnId) {
			continue;
		}
		const sdkSessionId = text(record.sdkSessionId, 'sdkSessionId');
		const eventId = text(record.eventId, 'eventId');
		const apiCallId = record.apiCallId === undefined ? undefined : text(record.apiCallId, 'apiCallId');
		const key = JSON.stringify([sdkSessionId, apiCallId ?? eventId]);
		const call: Record<string, string | number> = { ...calls.get(key), sdkSessionId, eventId };
		for (const name of ['apiCallId', 'providerCallId', 'serviceRequestId', 'agentId', 'model']) {
			if (record[name] !== undefined) {
				call[name] = text(record[name], name);
			}
		}
		for (const name of ['durationMs', 'timeToFirstTokenMs', 'outputTtftMs', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalNanoAiu']) {
			if (record[name] !== undefined) {
				const value = duration(record[name], name);
				if (value === null) {
					throw new Error(`Unexpected null ${name} in usage record`);
				}
				call[name] = value;
			}
		}
		calls.set(key, call);
	}
	return { status: 'captured', unattributedRecords, legacyRecords, calls: [...calls.values()] };
}

export function extract(value: unknown, base: string, historical = false): Results {
	const manifest = object(value, 'manifest');
	if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.runs) || !manifest.runs.length) {
		throw new Error('Expected schemaVersion 1 and a nonempty runs array');
	}
	const runs = manifest.runs.map(value => run(value, base));
	const ids = new Set();
	const turnIds = new Set();
	for (const item of runs) {
		if (ids.has(item.runId) || turnIds.has(item.turnId)) {
			throw new Error(`Duplicate runId or turnId: ${item.runId}`);
		}
		ids.add(item.runId);
		turnIds.add(item.turnId);
	}
	return {
		schemaVersion: 1,
		controls: controls(manifest.controls),
		runs: runs.map(item => ({
			runId: item.runId, block: item.block, arm: item.arm, surface: item.surface, cohort: item.cohort, turnId: item.turnId,
			...extractMeasurement(item, historical),
		})),
	};
}

export function statistics(values: number[]) {
	if (!values.length) {
		return { n: 0, median: null, q1: null, q3: null, min: null, max: null, p95: null };
	}
	const sorted = [...values].sort((a, b) => a - b);
	const quantile = (fraction: number) => {
		const position = (sorted.length - 1) * fraction;
		const lower = Math.floor(position);
		return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
	};
	return {
		n: values.length, median: quantile(0.5), q1: quantile(0.25), q3: quantile(0.75),
		min: sorted[0], max: sorted[sorted.length - 1], p95: values.length >= 100 ? quantile(0.95) : null,
	};
}

export function compare(values: unknown[]) {
	const runs: Results['runs'] = [];
	let expectedControls: string | undefined;
	const ids = new Set();
	const turnIds = new Set();
	const slots = new Set();
	for (const value of values) {
		const input = object(value, 'results');
		const checkedControls = controls(input.controls);
		if (input.schemaVersion !== 1 || !Array.isArray(input.runs)) {
			throw new Error('Expected schemaVersion 1 results');
		}
		const signature = JSON.stringify(checkedControls);
		if (expectedControls !== undefined && expectedControls !== signature) {
			throw new Error('Cannot compare different build, dependency, prompt, model, workspace or inventory controls');
		}
		expectedControls = signature;
		for (const value of input.runs) {
			const item = object(value, 'result');
			const entry = {
				runId: text(item.runId, 'runId'), block: text(item.block, 'block'),
				arm: choice(item.arm, arms, 'arm'), surface: choice(item.surface, surfaces, 'surface'),
				cohort: choice(item.cohort, cohorts, 'cohort'), turnId: text(item.turnId, 'turnId'),
				clock: choice(item.clock, ['rendererMonotonic'], 'clock'),
				outcome: choice(item.outcome, outcomes, 'outcome'),
				firstTextMs: duration(item.firstTextMs, 'firstTextMs'), totalMs: duration(item.totalMs, 'totalMs'),
			};
			const slot = JSON.stringify([entry.block, entry.surface, entry.cohort, entry.arm]);
			if (ids.has(entry.runId) || turnIds.has(entry.turnId) || slots.has(slot)) {
				throw new Error(`Duplicate run or matched-block slot: ${entry.runId}`);
			}
			if (entry.firstTextMs !== null && entry.totalMs !== null && entry.firstTextMs > entry.totalMs) {
				throw new Error('First text cannot follow completion');
			}
			ids.add(entry.runId);
			turnIds.add(entry.turnId);
			slots.add(slot);
			runs.push(entry);
		}
	}
	if (!runs.length || expectedControls === undefined) {
		throw new Error('No runs to compare');
	}
	return {
		schemaVersion: 1,
		controls: controls(parseJson(expectedControls, 'validated controls')),
		groups: surfaces.flatMap(surface => cohorts.flatMap(cohort => {
			const group = runs.filter(run => run.surface === surface && run.cohort === cohort);
			if (!group.length) {
				return [];
			}
			const summaries = arms.map(arm => {
				const selected = group.filter(run => run.arm === arm);
				const withText = selected.filter(run => run.firstTextMs !== null);
				return {
					arm, runs: selected.length, noText: selected.length - withText.length,
					outcomes: Object.fromEntries(outcomes.map(outcome => [outcome, selected.filter(run => run.outcome === outcome).length])),
					firstTextMs: statistics(selected.flatMap(run => run.firstTextMs === null ? [] : [run.firstTextMs])),
					totalMs: statistics(selected.flatMap(run => run.totalMs === null ? [] : [run.totalMs])),
				};
			});
			const deltas = arms.slice(1).map(arm => {
				const treatment = group.filter(run => run.arm === arm);
				const control = group.filter(run => run.arm === 'control');
				const blocks = new Set([...treatment, ...control].map(run => run.block));
				const differences = [];
				for (const block of blocks) {
					const before = control.find(run => run.block === block);
					const after = treatment.find(run => run.block === block);
					if (before?.firstTextMs !== null && before?.firstTextMs !== undefined && after?.firstTextMs !== null && after?.firstTextMs !== undefined) {
						differences.push(after.firstTextMs - before.firstTextMs);
					}
				}
				return { arm, unmatchedOrNoText: blocks.size - differences.length, treatmentMinusControlMs: statistics(differences) };
			});
			return [{ surface, cohort, summaries, deltas }];
		})),
	};
}

if (import.meta.main) {
	try {
		const [command, ...args] = process.argv.slice(2);
		if (command === 'extract' || command === 'extract-historical') {
			if (args.length !== 1) {
				throw new Error('extract requires exactly one manifest file');
			}
			const file = path.resolve(args[0]);
			console.log(JSON.stringify(extract(parseJson(readText(file), file), path.dirname(file), command === 'extract-historical'), null, 2));
		} else if (command === 'compare' && args.length) {
			console.log(JSON.stringify(compare(args.map(file => parseJson(readText(file), file))), null, 2));
		} else {
			throw new Error('Usage: node scripts\\agent-host-first-response.mts extract|extract-historical manifest.json\n       node scripts\\agent-host-first-response.mts compare results1.json [results2.json ...]');
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
