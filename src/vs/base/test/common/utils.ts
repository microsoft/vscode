/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { SetMap, groupBy } from 'vs/base/common/collections';
import { DisposableStore, IDisposable, IDisposableTracker, setDisposableTracker } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { trim } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export type ValueCallback<T = any> = (value: T | Promise<T>) => void;

export function toResource(this: any, path: string): URI {
	if (isWindows) {
		return URI.file(join('C:\\', btoa(this.test.fullTitle()), path));
	}

	return URI.file(join('/', btoa(this.test.fullTitle()), path));
}

export function suiteRepeat(n: number, description: string, callback: (this: any) => void): void {
	for (let i = 0; i < n; i++) {
		suite(`${description} (iteration ${i})`, callback);
	}
}

export function testRepeat(n: number, description: string, callback: (this: any) => any): void {
	for (let i = 0; i < n; i++) {
		test(`${description} (iteration ${i})`, callback);
	}
}

export async function assertThrowsAsync(block: () => any, message: string | Error = 'Missing expected exception'): Promise<void> {
	try {
		await block();
	} catch {
		return;
	}

	const err = message instanceof Error ? message : new Error(message);
	throw err;
}

interface DisposableInfo {
	value: IDisposable;
	source: string | null;
	parent: IDisposable | null;
	isSingleton: boolean;
	idx: number;
}

export class DisposableTracker implements IDisposableTracker {
	private static idx = 0;

	private readonly livingDisposables = new Map<IDisposable, DisposableInfo>();

	private getDisposableData(d: IDisposable) {
		let val = this.livingDisposables.get(d);
		if (!val) {
			val = { parent: null, source: null, isSingleton: false, value: d, idx: DisposableTracker.idx++ };
			this.livingDisposables.set(d, val);
		}
		return val;
	}

	trackDisposable(d: IDisposable): void {
		const data = this.getDisposableData(d);
		if (!data.source) {
			data.source =
				new Error().stack!;
		}
	}

	setParent(child: IDisposable, parent: IDisposable | null): void {
		const data = this.getDisposableData(child);
		data.parent = parent;
	}

	markAsDisposed(x: IDisposable): void {
		this.livingDisposables.delete(x);
	}

	markAsSingleton(disposable: IDisposable): void {
		this.getDisposableData(disposable).isSingleton = true;
	}

	private getRootParent(data: DisposableInfo, cache: Map<DisposableInfo, DisposableInfo>): DisposableInfo {
		const cacheValue = cache.get(data);
		if (cacheValue) {
			return cacheValue;
		}

		const result = data.parent ? this.getRootParent(this.getDisposableData(data.parent), cache) : data;
		cache.set(data, result);
		return result;
	}

	getTrackedDisposables() {
		const rootParentCache = new Map<DisposableInfo, DisposableInfo>();

		const leaking = [...this.livingDisposables.entries()]
			.filter(([, v]) => v.source !== null && !this.getRootParent(v, rootParentCache).isSingleton)
			.map(([k]) => k)
			.flat();

		return leaking;
	}

	ensureNoLeakingDisposables() {
		const rootParentCache = new Map<DisposableInfo, DisposableInfo>();

		const leakingObjects = [...this.livingDisposables.values()]
			.filter((info) => info.source !== null && !this.getRootParent(info, rootParentCache).isSingleton);

		if (leakingObjects.length === 0) {
			return;
		}
		const leakingObjsSet = new Set(leakingObjects.map(o => o.value));

		// Remove all objects that are a child of other leaking objects. Assumes there are no cycles.
		const uncoveredLeakingObjs = leakingObjects.filter(l => {
			return !(l.parent && leakingObjsSet.has(l.parent));
		});

		if (uncoveredLeakingObjs.length === 0) {
			throw new Error('There are cyclic diposable chains!');
		}

		function getStackTracePath(leaking: DisposableInfo): string[] {
			function removePrefix(array: string[], linesToRemove: (string | RegExp)[]) {
				while (array.length > 0 && linesToRemove.some(regexp => typeof regexp === 'string' ? regexp === array[0] : array[0].match(regexp))) {
					array.shift();
				}
			}

			const lines = leaking.source!.split('\n').map(p => trim(p.trim(), 'at ')).filter(l => l !== '');
			removePrefix(lines, ['Error', /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]);
			return lines.reverse();
		}

		const stackTraceStarts = new SetMap<string, DisposableInfo>();
		for (const leaking of uncoveredLeakingObjs) {
			const stackTracePath = getStackTracePath(leaking);
			for (let i = 0; i <= stackTracePath.length; i++) {
				stackTraceStarts.add(stackTracePath.slice(0, i).join('\n'), leaking);
			}
		}

		// Put earlier leaks first
		uncoveredLeakingObjs.sort(compareBy(l => l.idx, numberComparator));

		const maxReported = 10;

		let message = '';

		let i = 0;
		for (const leaking of uncoveredLeakingObjs.slice(0, maxReported)) {
			i++;
			const stackTracePath = getStackTracePath(leaking);
			const stackTraceFormattedLines = [];

			for (let i = 0; i < stackTracePath.length; i++) {
				let line = stackTracePath[i];
				const starts = stackTraceStarts.get(stackTracePath.slice(0, i + 1).join('\n'));
				line = `(shared with ${starts.size}/${uncoveredLeakingObjs.length} leaks) at ${line}`;

				const prevStarts = stackTraceStarts.get(stackTracePath.slice(0, i).join('\n'));
				const continuations = groupBy([...prevStarts].map(d => getStackTracePath(d)[i]), v => v);
				delete continuations[stackTracePath[i]];
				for (const [cont, set] of Object.entries(continuations)) {
					stackTraceFormattedLines.unshift(`    - stacktraces of ${set.length} other leaks continue with ${cont}`);
				}

				stackTraceFormattedLines.unshift(line);
			}

			message += `\n\n\n==================== Leaking disposable ${i}/${uncoveredLeakingObjs.length}: ${leaking.value.constructor.name} ====================\n${stackTraceFormattedLines.join('\n')}\n============================================================\n\n`;
		}

		if (uncoveredLeakingObjs.length > maxReported) {
			message += `\n\n\n... and ${uncoveredLeakingObjs.length - maxReported} more leaking disposables\n\n`;
		}

		console.error(message);

		throw new Error(`There are ${uncoveredLeakingObjs.length} undisposed disposables!${message}`);
	}
}

/**
 * Use this function to ensure that all disposables are cleaned up at the end of each test in the current suite.
 *
 * Use `markAsSingleton` if disposable singletons are created lazily that are allowed to outlive the test.
 * Make sure that the singleton properly registers all child disposables so that they are excluded too.
 *
 * @returns A {@link DisposableStore} that can optionally be used to track disposables in the test.
 * This will be automatically disposed on test teardown.
*/
export function ensureNoDisposablesAreLeakedInTestSuite(): Pick<DisposableStore, 'add'> {
	let tracker: DisposableTracker | undefined;
	let store: DisposableStore;
	setup(() => {
		store = new DisposableStore();
		tracker = new DisposableTracker();
		setDisposableTracker(tracker);
	});

	teardown(function (this: import('mocha').Context) {
		store.dispose();
		setDisposableTracker(null);
		if (this.currentTest?.state !== 'failed') {
			tracker!.ensureNoLeakingDisposables();
		}
	});

	// Wrap store as the suite function is called before it's initialized
	const testContext = {
		add<T extends IDisposable>(o: T): T {
			return store.add(o);
		}
	};
	return testContext;
}

export function throwIfDisposablesAreLeaked(body: () => void): void {
	const tracker = new DisposableTracker();
	setDisposableTracker(tracker);
	body();
	setDisposableTracker(null);
	tracker.ensureNoLeakingDisposables();
}

export async function throwIfDisposablesAreLeakedAsync(body: () => Promise<void>): Promise<void> {
	const tracker = new DisposableTracker();
	setDisposableTracker(tracker);
	await body();
	setDisposableTracker(null);
	tracker.ensureNoLeakingDisposables();
}
