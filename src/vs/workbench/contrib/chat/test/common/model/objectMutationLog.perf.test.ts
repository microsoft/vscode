/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { isUndefinedOrNull } from '../../../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import * as Adapt from '../../../common/model/objectMutationLog.js';

const enablePerf = process.env.VSCODE_PERF_CHAT_OBJECT_MUTATION_LOG === 'true';

function perfSuite(name: string, callback: (this: Mocha.Suite) => void): void {
	if (enablePerf) {
		suite(name, callback);
	}
}

const enum EntryKind {
	Initial = 0,
	Set = 1,
	Push = 2,
	Delete = 3,
}

type ObjectPath = (string | number)[];

type Entry =
	| { kind: EntryKind.Initial; v: unknown }
	| { kind: EntryKind.Set; k: ObjectPath; v: unknown }
	| { kind: EntryKind.Delete; k: ObjectPath }
	| { kind: EntryKind.Push; k: ObjectPath; v?: unknown[]; i?: number };

interface BenchmarkItem {
	readonly id: string;
	readonly content: string;
	readonly references: readonly string[];
	readonly isSealed: boolean;
}

interface BenchmarkState {
	readonly items: readonly BenchmarkItem[];
}

interface BenchmarkResult {
	readonly elapsedMs: number;
	readonly heapDeltaBytes: number;
	readonly serialized: VSBuffer;
	readonly reusedReferences: number;
}

interface BenchmarkWriter<T> {
	createInitial(current: T): VSBuffer;
	write(current: T): { op: 'append' | 'replace'; data: VSBuffer };
	confirmWrite(): void;
	readonly reusedReferences?: number;
}

function isTransformValue<TFrom, TTo>(transform: Adapt.Transform<TFrom, TTo>): transform is Adapt.TransformValue<TFrom, TTo> {
	return 'equals' in transform;
}

function isTransformArray<TFrom, TTo>(transform: Adapt.Transform<TFrom, TTo>): transform is Adapt.TransformArray<TFrom, TTo> {
	return 'itemSchema' in transform;
}

function isTransformObject<TFrom, TTo>(transform: Adapt.Transform<TFrom, TTo>): transform is Adapt.TransformObject<TFrom, TTo> {
	return 'children' in transform;
}

function isKeyTransform(transform: Adapt.Transform<unknown, unknown>): transform is Adapt.TransformValue<unknown, unknown> {
	return isTransformValue(transform) && transform.kind === 0;
}

function isVoidFunction(value: unknown): value is () => void {
	return typeof value === 'function';
}

const benchmarkConfig = {
	iterations: 120,
	sealedItems: 1500,
	activeItems: 4,
	payloadSize: 128,
	rounds: 5,
} as const;

class ReferenceReusingObjectMutationLog<TFrom, TTo> implements BenchmarkWriter<TFrom> {
	private _previous: TTo | undefined;
	private _entryCount = 0;
	public reusedReferences = 0;

	constructor(
		private readonly _transform: Adapt.Transform<TFrom, TTo>,
		private readonly _compactAfterEntries = 512,
	) { }

	createInitial(current: TFrom): VSBuffer {
		const value = this._transform.extract(current);
		this._previous = value;
		this._entryCount = 1;
		const entry: Entry = { kind: EntryKind.Initial, v: value };
		return VSBuffer.fromString(JSON.stringify(entry) + '\n');
	}

	write(current: TFrom): { op: 'append' | 'replace'; data: VSBuffer } {
		const currentValue = this._transform.extract(current);

		if (!this._previous || this._entryCount > this._compactAfterEntries) {
			this._previous = currentValue;
			this._entryCount = 1;
			const entry: Entry = { kind: EntryKind.Initial, v: currentValue };
			return { op: 'replace', data: VSBuffer.fromString(JSON.stringify(entry) + '\n') };
		}

		const entries: Entry[] = [];
		this._diff(this._transform, [], this._previous, currentValue, entries);

		if (entries.length === 0) {
			return { op: 'append', data: VSBuffer.fromString('') };
		}

		this._entryCount += entries.length;
		this._previous = currentValue;

		let data = '';
		for (const entry of entries) {
			data += JSON.stringify(entry) + '\n';
		}

		return { op: 'append', data: VSBuffer.fromString(data) };
	}

	confirmWrite(): void {
		// Perf benchmark always succeeds, state is eagerly updated in write()
	}

	private _diff<T, R>(
		transform: Adapt.Transform<T, R>,
		path: ObjectPath,
		prev: R,
		curr: R,
		entries: Entry[]
	): void {
		if (isTransformValue(transform)) {
			if (!transform.equals(prev, curr)) {
				entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
			}
		} else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
			if (prev !== curr) {
				if (curr === undefined) {
					entries.push({ kind: EntryKind.Delete, k: path.slice() });
				} else if (curr === null) {
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: null });
				} else {
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
				}
			}
		} else if (isTransformArray(transform)) {
			this._diffArray(transform, path, prev as unknown[], curr as unknown[], entries);
		} else if (isTransformObject(transform)) {
			this._diffObject(transform.children, path, prev, curr, entries, transform.sealed as ((obj: unknown, wasSerialized: boolean) => boolean) | undefined);
		} else {
			throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
		}
	}

	private _diffObject(
		children: Adapt.SchemaEntries,
		path: ObjectPath,
		prev: unknown,
		curr: unknown,
		entries: Entry[],
		sealed?: (obj: unknown, wasSerialized: boolean) => boolean,
	): boolean {
		const prevObj = prev as Record<string, unknown> | undefined;
		const currObj = curr as Record<string, unknown>;

		let i = 0;
		for (; i < children.length; i++) {
			const [key, transform] = children[i];
			if (!isKeyTransform(transform)) {
				break;
			}

			if (!transform.equals(prevObj?.[key], currObj[key])) {
				entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
				return false;
			}
		}

		if (sealed && sealed(prev, true) && sealed(curr, false)) {
			return true;
		}

		for (; i < children.length; i++) {
			const [key, transform] = children[i];
			path.push(key);
			this._diff(transform, path, prevObj?.[key], currObj[key], entries);
			path.pop();
		}

		return false;
	}

	private _diffArray<T, R>(
		transform: Adapt.TransformArray<T, R>,
		path: ObjectPath,
		prev: unknown[] | undefined,
		curr: unknown[] | undefined,
		entries: Entry[]
	): void {
		const prevArr = prev || [];
		const currArr = curr || [];
		const itemSchema = transform.itemSchema;
		const minLen = Math.min(prevArr.length, currArr.length);

		if (isTransformObject(itemSchema)) {
			const childEntries = itemSchema.children;

			for (let i = 0; i < minLen; i++) {
				const prevItem = prevArr[i];
				const currItem = currArr[i];

				if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
					const newItems = currArr.slice(i);
					entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i });
					return;
				}

				path.push(i);
				const wasSealed = this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
				path.pop();

				if (wasSealed) {
					currArr[i] = prevItem;
					this.reusedReferences++;
				}
			}

			if (currArr.length > prevArr.length) {
				entries.push({ kind: EntryKind.Push, k: path.slice(), v: currArr.slice(prevArr.length) });
			} else if (currArr.length < prevArr.length) {
				entries.push({ kind: EntryKind.Push, k: path.slice(), i: currArr.length });
			}
		} else {
			let firstMismatch = -1;

			for (let i = 0; i < minLen; i++) {
				if (!itemSchema.equals(prevArr[i], currArr[i])) {
					firstMismatch = i;
					break;
				}
			}

			if (firstMismatch === -1) {
				if (currArr.length > prevArr.length) {
					entries.push({ kind: EntryKind.Push, k: path.slice(), v: currArr.slice(prevArr.length) });
				} else if (currArr.length < prevArr.length) {
					entries.push({ kind: EntryKind.Push, k: path.slice(), i: currArr.length });
				}
			} else {
				const newItems = currArr.slice(firstMismatch);
				entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i: firstMismatch });
			}
		}
	}

	private _hasKeyMismatch(children: Adapt.SchemaEntries, prev: unknown, curr: unknown): boolean {
		const prevObj = prev as Record<string, unknown> | undefined;
		const currObj = curr as Record<string, unknown>;

		for (const [key, transform] of children) {
			if (!isKeyTransform(transform)) {
				break;
			}

			if (!transform.equals(prevObj?.[key], currObj[key])) {
				return true;
			}
		}

		return false;
	}
}

function createBenchmarkSchema(): Adapt.TransformObject<BenchmarkState, BenchmarkState> {
	const itemSchema = Adapt.object<BenchmarkItem, BenchmarkItem>({
		id: Adapt.t(item => item.id, Adapt.key()),
		content: Adapt.t(item => item.content, Adapt.value()),
		references: Adapt.t(item => item.references, Adapt.array(Adapt.value())),
		isSealed: Adapt.t(item => item.isSealed, Adapt.value()),
	}, {
		sealed: item => item.isSealed,
	});

	return Adapt.object<BenchmarkState, BenchmarkState>({
		items: Adapt.t(state => state.items, Adapt.array(itemSchema)),
	});
}

function createPayload(label: string, size: number): string {
	return `${label}:${'x'.repeat(size)}`;
}

function createBenchmarkState(iteration: number): BenchmarkState {
	const items: BenchmarkItem[] = [];

	for (let i = 0; i < benchmarkConfig.sealedItems; i++) {
		items.push({
			id: `sealed-${i}`,
			content: createPayload(`sealed-${i}`, benchmarkConfig.payloadSize),
			references: [
				createPayload(`ref-${i}-a`, benchmarkConfig.payloadSize / 2),
				createPayload(`ref-${i}-b`, benchmarkConfig.payloadSize / 2),
			],
			isSealed: true,
		});
	}

	for (let i = 0; i < benchmarkConfig.activeItems; i++) {
		const revision = i === benchmarkConfig.activeItems - 1 ? iteration : 0;
		items.push({
			id: `active-${i}`,
			content: createPayload(`active-${i}-${revision}`, benchmarkConfig.payloadSize),
			references: [
				createPayload(`active-ref-${i}-${revision}`, benchmarkConfig.payloadSize / 2),
				createPayload(`active-ref-${i}-stable`, benchmarkConfig.payloadSize / 2),
			],
			isSealed: false,
		});
	}

	return { items };
}

function createBenchmarkStates(): BenchmarkState[] {
	const states: BenchmarkState[] = [];
	for (let i = 0; i < benchmarkConfig.iterations; i++) {
		states.push(createBenchmarkState(i));
	}
	return states;
}

function appendToLog(current: VSBuffer, result: { op: 'append' | 'replace'; data: VSBuffer }): VSBuffer {
	if (result.op === 'replace') {
		return result.data;
	}

	return VSBuffer.concat([current, result.data]);
}

function collectGarbage(): void {
	const gc = Reflect.get(globalThis, 'gc');
	if (isVoidFunction(gc)) {
		gc();
	}
}

function runBenchmarkRound(writer: BenchmarkWriter<BenchmarkState>, states: readonly BenchmarkState[], schema: Adapt.TransformObject<BenchmarkState, BenchmarkState>): BenchmarkResult {
	collectGarbage();
	const initialHeap = process.memoryUsage().heapUsed;

	let serialized = writer.createInitial(states[0]);
	const sw = StopWatch.create();
	for (let i = 1; i < states.length; i++) {
		serialized = appendToLog(serialized, writer.write(states[i]));
		writer.confirmWrite();
	}
	const elapsedMs = sw.elapsed();

	collectGarbage();
	const finalHeap = process.memoryUsage().heapUsed;

	const reader = new Adapt.ObjectMutationLog(schema);
	assert.deepStrictEqual(reader.read(serialized), states[states.length - 1]);

	return {
		elapsedMs,
		heapDeltaBytes: finalHeap - initialHeap,
		serialized,
		reusedReferences: writer.reusedReferences ?? 0,
	};
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[middle - 1] + sorted[middle]) / 2;
	}

	return sorted[middle];
}

function formatBytes(bytes: number): string {
	const sign = bytes < 0 ? '-' : '';
	const absolute = Math.abs(bytes);
	if (absolute < 1024) {
		return `${bytes} B`;
	}
	if (absolute < 1024 * 1024) {
		return `${sign}${(absolute / 1024).toFixed(1)} KB`;
	}

	return `${sign}${(absolute / (1024 * 1024)).toFixed(2)} MB`;
}

perfSuite('Chat ObjectMutationLog - perf', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	const schema = createBenchmarkSchema();
	const states = createBenchmarkStates();

	test('compares baseline writes against sealed-reference reuse', function () {
		this.timeout(120_000);

		// Warm up both variants once so the measured rounds are less noisy.
		runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema);
		runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema);

		const baselineResults: BenchmarkResult[] = [];
		const optimizedResults: BenchmarkResult[] = [];

		for (let i = 0; i < benchmarkConfig.rounds; i++) {
			baselineResults.push(runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema));
			optimizedResults.push(runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema));
		}

		assert.strictEqual(baselineResults[0].serialized.toString(), optimizedResults[0].serialized.toString());

		const baselineElapsed = median(baselineResults.map(result => result.elapsedMs));
		const optimizedElapsed = median(optimizedResults.map(result => result.elapsedMs));
		const baselineHeap = median(baselineResults.map(result => result.heapDeltaBytes));
		const optimizedHeap = median(optimizedResults.map(result => result.heapDeltaBytes));
		const optimizedReusedReferences = median(optimizedResults.map(result => result.reusedReferences));

		console.log('[chat objectMutationLog perf] config', benchmarkConfig);
		console.log('[chat objectMutationLog perf] baseline', {
			medianElapsedMs: baselineElapsed,
			medianHeapDelta: formatBytes(baselineHeap),
			serializedBytes: baselineResults[0].serialized.byteLength,
		});
		console.log('[chat objectMutationLog perf] optimized', {
			medianElapsedMs: optimizedElapsed,
			medianHeapDelta: formatBytes(optimizedHeap),
			serializedBytes: optimizedResults[0].serialized.byteLength,
			reusedReferences: optimizedReusedReferences,
		});
		console.log('[chat objectMutationLog perf] delta', {
			elapsedMs: optimizedElapsed - baselineElapsed,
			heapDelta: formatBytes(optimizedHeap - baselineHeap),
			elapsedRatio: Number((optimizedElapsed / baselineElapsed).toFixed(3)),
		});
	});
});
