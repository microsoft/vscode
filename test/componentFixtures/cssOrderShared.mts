/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared primitives for the CSS cascade-order dependency tools.
 *
 * Both `cssOrderBisect.mts` (localize one fixture's conflicting pair) and
 * `cssOrderScan.mts` (scan every fixture and produce a report) drive
 * `@vscode/component-explorer`'s `render` command against an already-running
 * `serve` and use the rendered image hash as an oracle: reversing the document
 * order of the bundled CSS flips cascade ties that are decided purely by source
 * order, so a hash change under reversal means the appearance depends on CSS
 * order. None of this code understands the bundle format — the fixture runtime
 * reports the document count and the index→source-file mapping in the render
 * manifest's `output` (requested via `--input '{"outputStylesheetFiles":true}'`).
 */

import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Absolute path to the component-explorer CLI entry (its `bin`). */
export const cliEntry = resolve(dirname(fileURLToPath(import.meta.url)), '../../node_modules/@vscode/component-explorer-cli/dist/index.js');

/** A single fixture's entry in a render manifest (only the fields we use). */
export interface FixtureEntry {
	readonly fixtureId: string;
	readonly imageHash?: string;
	/** Image path relative to the render target directory (e.g. `images/<hash>.png`). */
	readonly imagePath?: string;
	readonly background?: 'light' | 'dark';
	readonly labels?: readonly string[];
	readonly hasError?: boolean;
	/** Arbitrary data returned by the fixture render function. */
	readonly output?: { readonly stylesheetFiles?: readonly string[] };
}

/** The result of a single `render` invocation. */
export interface RenderResult {
	readonly entries: readonly FixtureEntry[];
	/** Absolute path to the render target directory, for resolving `imagePath`. */
	readonly targetDir: string;
}

/** Options accepted by the `reverseStylesheetsRange` input value. */
export interface ReverseWindow {
	readonly fromIndex: number;
	readonly toIndex: number;
}

/** Reads the serve URL from the component-explorer config (top-level or first session), for logging. */
export async function readServeUrl(configPath: string): Promise<string | undefined> {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const url = config.server?.url ?? config.sessions?.[0]?.server?.url;
	return typeof url === 'string' ? url.replace(/\/$/, '') : undefined;
}

/** Escapes a string so it can be used as a literal inside a `--fixture-id-regex`. */
export function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regex that matches exactly the given fixture id. */
export function exactFixtureRegex(fixtureId: string): string {
	return `^${escapeRegex(fixtureId)}$`;
}

/**
 * Keeps each `--fixture-id-regex` argument well below command-line length
 * limits (32K characters on Windows, 128KB per argument on Linux).
 */
const maxFixtureRegexLength = 24_000;

/**
 * Splits fixture ids into regexes that each match exactly a subset of the ids,
 * keeping every regex below {@link maxFixtureRegexLength}.
 */
function exactFixturesRegexes(fixtureIds: readonly string[]): string[] {
	const regexes: string[] = [];
	let current: string[] = [];
	let length = 0;
	for (const fixtureId of fixtureIds) {
		const escaped = escapeRegex(fixtureId);
		if (current.length > 0 && length + escaped.length + 1 > maxFixtureRegexLength) {
			regexes.push(`^(?:${current.join('|')})$`);
			current = [];
			length = 0;
		}
		current.push(escaped);
		length += escaped.length + 1;
	}
	if (current.length > 0) {
		regexes.push(`^(?:${current.join('|')})$`);
	}
	return regexes;
}

/**
 * Drives the component-explorer `render` command against the configured serve.
 * Each call spawns a fresh `render` (browser navigation), writing into its own
 * numbered sub-directory of `probeRoot` so manifests and images never collide.
 */
export class Renderer {
	private count = 0;
	private readonly configPath: string;
	private readonly configDir: string;
	private readonly probeRoot: string;
	private readonly keepProbeRenders: boolean;

	/**
	 * @param options.keepProbeRenders Keep the output of {@link hashes} renders
	 * on disk. They are deleted by default because only their hashes are needed
	 * and a full scan renders tens of thousands of probe images.
	 */
	constructor(configPath: string, probeRoot: string, options?: { readonly keepProbeRenders?: boolean }) {
		this.configPath = configPath;
		this.configDir = dirname(configPath);
		this.probeRoot = probeRoot;
		this.keepProbeRenders = options?.keepProbeRenders ?? false;
	}

	/**
	 * Renders every fixture matching `fixtureRegex` with the given `--input` and
	 * returns all manifest entries plus the target directory. Content-hash image
	 * paths (`useHashPaths`) deduplicate identical images and are the default;
	 * pass `useHashPaths: false` to get readable `<fixtureId>.png` paths when the
	 * images themselves are needed (e.g. for a report).
	 */
	async render(fixtureRegex: string, input: object, options?: { readonly useHashPaths?: boolean }): Promise<RenderResult> {
		const useHashPaths = options?.useHashPaths ?? true;
		const target = join(this.probeRoot, `r${this.count++}`);
		const args = [
			cliEntry, 'render',
			'-p', this.configPath,
			'--fixture-id-regex', fixtureRegex,
			'--target', target,
			'--input', JSON.stringify(input),
		];
		if (useHashPaths) {
			args.push('--useHashPaths');
		}
		await execFileAsync(process.execPath, args, { cwd: this.configDir, maxBuffer: 64 * 1024 * 1024 });

		const targetDir = isAbsolute(target) ? target : join(this.configDir, target);
		const manifest = JSON.parse(await readFile(join(targetDir, 'manifest.json'), 'utf8'));
		const entries: FixtureEntry[] = manifest.fixtures ?? [];
		return { entries, targetDir };
	}

	/** Renders a single fixture with the given reversal window and returns its image hash. */
	async hash(fixtureRegex: string, window: ReverseWindow): Promise<string> {
		const { entries } = await this.render(fixtureRegex, { reverseStylesheetsRange: window });
		const hash = entries[0]?.imageHash;
		if (!hash) {
			throw new Error(`Render produced no image hash for ${fixtureRegex}`);
		}
		return hash;
	}

	/**
	 * Renders the given fixtures with one reversal window, in as few `render`
	 * calls as the command-line length allows, and returns each fixture's image
	 * hash. Fixtures that produced no image are missing from the result.
	 */
	async hashes(fixtureIds: readonly string[], window: ReverseWindow): Promise<Map<string, string>> {
		const result = new Map<string, string>();
		for (const regex of exactFixturesRegexes(fixtureIds)) {
			const { entries, targetDir } = await this.render(regex, { reverseStylesheetsRange: window });
			for (const entry of entries) {
				if (entry.imageHash) {
					result.set(entry.fixtureId, entry.imageHash);
				}
			}
			if (!this.keepProbeRenders) {
				await rm(targetDir, { recursive: true, force: true });
			}
		}
		return result;
	}
}

/** Renders a reversal window `[fromIndex, toIndex)` and returns the image hash. */
export type HashFn = (fromIndex: number, toIndex: number) => Promise<string>;

/**
 * A binary search over reversal windows: it yields each window to probe,
 * receives whether reversing that window changes the image, and returns the
 * boundary it found. Driving searches step by step lets {@link bisectConflicts}
 * batch the probes of many fixtures that share a window.
 */
type WindowSearch = Generator<ReverseWindow, number, boolean>;

/**
 * Searches for the largest `fromIndex` in `[0, n]` for which reversing
 * `[fromIndex, n)` still changes the image — the later document of the
 * conflicting pair. Reversing `[0, n)` must change the image; the empty window
 * `[n, n)` trivially does not.
 */
function* searchLastConflictStart(n: number): WindowSearch {
	let lo = 0;        // reversing [lo, n) differs
	let hi = n;        // reversing [hi, n) matches the baseline (empty window)
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (yield { fromIndex: mid, toIndex: n }) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/**
 * Searches for the smallest `toIndex` in `[0, n]` for which reversing
 * `[0, toIndex)` changes the image. The empty window `[0, 0)` trivially does
 * not and reversing `[0, n)` must. Returns that boundary `toIndex` (the earlier
 * document is `toIndex - 1`).
 */
function* searchFirstConflictEnd(n: number): WindowSearch {
	let lo = 0;        // reversing [0, lo) matches the baseline
	let hi = n;        // reversing [0, hi) differs
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (yield { fromIndex: 0, toIndex: mid }) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hi;
}

async function runSearch(search: WindowSearch, hash: HashFn, baseline: string): Promise<number> {
	let step = search.next();
	while (!step.done) {
		step = search.next(await hash(step.value.fromIndex, step.value.toIndex) !== baseline);
	}
	return step.value;
}

/**
 * Finds the largest `fromIndex` in `[0, n]` for which `hash(fromIndex, n)`
 * still differs from `baseline` — the later document of the conflicting pair.
 * `hash(0, n)` must differ and `hash(n, n)` (an empty window) must equal `baseline`.
 */
export function findLastConflictStart(hash: HashFn, n: number, baseline: string): Promise<number> {
	return runSearch(searchLastConflictStart(n), hash, baseline);
}

/**
 * Finds the smallest `toIndex` in `[0, n]` for which `hash(0, toIndex)` differs
 * from `baseline`. `hash(0, 0)` must equal `baseline` and `hash(0, n)` must
 * differ. Returns that boundary `toIndex` (the earlier document is `toIndex - 1`).
 */
export function findFirstConflictEnd(hash: HashFn, n: number, baseline: string): Promise<number> {
	return runSearch(searchFirstConflictEnd(n), hash, baseline);
}

/** The two documents of a localized cascade-order conflict (indices into the document list). */
export interface ConflictPair {
	/** The later document (higher index); wins the cascade tie in product order. */
	readonly later: number;
	/** The earlier document (lower index); loses the cascade tie in product order. */
	readonly earlier: number;
}

/**
 * Localizes the dominant conflicting document pair for a single fixture by
 * binary-searching reversal windows. `baseline` is the fixture's un-reversed
 * image hash; reversing the whole document range `[0, n)` must already be known
 * to change it. `onProbe` is an optional progress callback.
 */
export async function bisectConflict(
	renderer: Renderer,
	fixtureId: string,
	n: number,
	baseline: string,
	onProbe?: (info: { fromIndex: number; toIndex: number; differs: boolean; ms: number }) => void,
): Promise<ConflictPair> {
	const rx = exactFixtureRegex(fixtureId);
	const hash: HashFn = async (fromIndex, toIndex) => {
		const started = Date.now();
		const h = await renderer.hash(rx, { fromIndex, toIndex });
		onProbe?.({ fromIndex, toIndex, differs: h !== baseline, ms: Date.now() - started });
		return h;
	};
	const later = await findLastConflictStart(hash, n, baseline);
	const earlier = (await findFirstConflictEnd(hash, n, baseline)) - 1;
	return { later, earlier };
}

/** A fixture whose cascade-order conflict should be localized. */
export interface ConflictTarget {
	readonly fixtureId: string;
	/** Number of bundled CSS documents the fixture reported. */
	readonly documentCount: number;
}

/** The result of localizing one {@link ConflictTarget}. */
export type ConflictOutcome =
	| { readonly kind: 'localized'; readonly pair: ConflictPair }
	| { readonly kind: 'failed'; readonly reason: string };

/** Progress information for one batched probe render. */
export interface BatchProbeInfo {
	readonly window: ReverseWindow;
	readonly fixtureCount: number;
	readonly ms: number;
}

/**
 * Localizes one fixture's conflict: yields the windows to render next, receives
 * their image hashes in the same order, and returns the conflicting pair or the
 * reason it could not be localized.
 */
type ConflictLocalizer = Generator<readonly ReverseWindow[], ConflictPair | string, readonly string[]>;

function* localizeConflict(n: number): ConflictLocalizer {
	// Compare probes against product order rendered the same way as the probes
	// (with a reversal-window input), not against the scan's full render: some
	// fixtures render differently when no input is given.
	const [baseline, reversed] = yield [{ fromIndex: n, toIndex: n }, { fromIndex: 0, toIndex: n }];
	if (baseline === reversed) {
		return 'not reproducible: reversing all documents in a probe render does not change the image';
	}

	const later = searchLastConflictStart(n);
	const firstEnd = searchFirstConflictEnd(n);
	let laterStep = later.next();
	let firstEndStep = firstEnd.next();
	while (!laterStep.done || !firstEndStep.done) {
		const windows: ReverseWindow[] = [];
		if (!laterStep.done) {
			windows.push(laterStep.value);
		}
		if (!firstEndStep.done) {
			windows.push(firstEndStep.value);
		}
		const hashes = yield windows;
		let index = 0;
		if (!laterStep.done) {
			laterStep = later.next(hashes[index++] !== baseline);
		}
		if (!firstEndStep.done) {
			firstEndStep = firstEnd.next(hashes[index++] !== baseline);
		}
	}
	return { later: laterStep.value, earlier: firstEndStep.value - 1 };
}

/**
 * Localizes the conflicting document pair of many fixtures at once. Every
 * target runs the same two binary searches as {@link bisectConflict}, but all
 * fixtures that need the same reversal window are rendered by a single
 * `render` call. Fixtures usually share a handful of conflicting pairs (and
 * therefore probe windows), so this needs far fewer renders, and each render
 * uses the CLI's parallel workers instead of starting a browser for one fixture.
 *
 * Each search compares against product order rendered under the same
 * conditions as its probes. A fixture whose full reversal does not change that
 * image, or whose probe produces no image, is reported as failed instead of
 * yielding a meaningless pair or aborting the run. Once `deadline` (epoch
 * milliseconds) passes, all remaining fixtures are reported as failed.
 */
export async function bisectConflicts(
	renderer: Renderer,
	targets: readonly ConflictTarget[],
	options: { readonly deadline?: number; readonly onProbe?: (info: BatchProbeInfo) => void } = {},
): Promise<Map<string, ConflictOutcome>> {
	interface Pending {
		readonly localizer: ConflictLocalizer;
		readonly windows: readonly ReverseWindow[];
		readonly hashes: string[];
	}

	const outcomes = new Map<string, ConflictOutcome>();
	const pending = new Map<string, Pending>();
	const advance = (fixtureId: string, localizer: ConflictLocalizer, step: IteratorResult<readonly ReverseWindow[], ConflictPair | string>) => {
		if (!step.done) {
			pending.set(fixtureId, { localizer, windows: step.value, hashes: [] });
			return;
		}
		pending.delete(fixtureId);
		outcomes.set(fixtureId, typeof step.value === 'string' ? { kind: 'failed', reason: step.value } : { kind: 'localized', pair: step.value });
	};
	const fail = (fixtureId: string, reason: string) => {
		pending.delete(fixtureId);
		outcomes.set(fixtureId, { kind: 'failed', reason });
	};

	for (const target of targets) {
		const localizer = localizeConflict(target.documentCount);
		advance(target.fixtureId, localizer, localizer.next());
	}

	while (pending.size > 0) {
		const byWindow = new Map<string, { readonly window: ReverseWindow; readonly requests: { readonly fixtureId: string; readonly index: number }[] }>();
		for (const [fixtureId, { windows }] of pending) {
			windows.forEach((window, index) => {
				const key = `${window.fromIndex}:${window.toIndex}`;
				let group = byWindow.get(key);
				if (!group) {
					group = { window, requests: [] };
					byWindow.set(key, group);
				}
				group.requests.push({ fixtureId, index });
			});
		}

		for (const { window, requests } of byWindow.values()) {
			// An earlier window in this pass may already have failed some of these fixtures.
			const live = requests.filter(request => pending.has(request.fixtureId));
			if (live.length === 0) {
				continue;
			}
			if (options.deadline !== undefined && Date.now() > options.deadline) {
				for (const fixtureId of [...pending.keys()]) {
					fail(fixtureId, 'time budget exceeded');
				}
				return outcomes;
			}

			const fixtureIds = [...new Set(live.map(request => request.fixtureId))];
			const started = Date.now();
			let hashes: ReadonlyMap<string, string>;
			try {
				hashes = await renderer.hashes(fixtureIds, window);
			} catch (err) {
				const message = (err instanceof Error ? err.message : String(err)).split('\n')[0];
				for (const fixtureId of fixtureIds) {
					fail(fixtureId, `render failed for reverse[${window.fromIndex}, ${window.toIndex}): ${message}`);
				}
				continue;
			}
			options.onProbe?.({ window, fixtureCount: fixtureIds.length, ms: Date.now() - started });

			for (const { fixtureId, index } of live) {
				const hash = hashes.get(fixtureId);
				if (!hash) {
					fail(fixtureId, `render produced no image for reverse[${window.fromIndex}, ${window.toIndex})`);
					continue;
				}
				const entry = pending.get(fixtureId);
				if (entry) {
					entry.hashes[index] = hash;
				}
			}
		}

		// Every window requested in this pass has been rendered (or its fixture failed).
		for (const [fixtureId, { localizer, hashes }] of [...pending]) {
			advance(fixtureId, localizer, localizer.next(hashes));
		}
	}
	return outcomes;
}
