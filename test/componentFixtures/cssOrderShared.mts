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
import { readFile } from 'node:fs/promises';
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

/** Options accepted by a `reverseStylesheets` input value. */
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
 * Drives the component-explorer `render` command against the configured serve.
 * Each call spawns a fresh `render` (browser navigation), writing into its own
 * numbered sub-directory of `probeRoot` so manifests and images never collide.
 */
export class Renderer {
	private count = 0;
	private readonly configPath: string;
	private readonly configDir: string;
	private readonly probeRoot: string;

	constructor(configPath: string, probeRoot: string) {
		this.configPath = configPath;
		this.configDir = dirname(configPath);
		this.probeRoot = probeRoot;
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
		const { entries } = await this.render(fixtureRegex, { reverseStylesheets: window });
		const hash = entries[0]?.imageHash;
		if (!hash) {
			throw new Error(`Render produced no image hash for ${fixtureRegex}`);
		}
		return hash;
	}
}

/** Renders a reversal window `[fromIndex, toIndex)` and returns the image hash. */
export type HashFn = (fromIndex: number, toIndex: number) => Promise<string>;

/**
 * Finds the largest `fromIndex` in `[0, n]` for which `hash(fromIndex, n)`
 * still differs from `baseline` — the later document of the conflicting pair.
 * `hash(0, n)` must differ and `hash(n, n)` (an empty window) must equal `baseline`.
 */
export async function findLastConflictStart(hash: HashFn, n: number, baseline: string): Promise<number> {
	let lo = 0;        // hash(lo, n) differs
	let hi = n;        // hash(hi, n) == baseline (empty window)
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (await hash(mid, n) !== baseline) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/**
 * Finds the smallest `toIndex` in `[0, n]` for which `hash(0, toIndex)` differs
 * from `baseline`. `hash(0, 0)` must equal `baseline` and `hash(0, n)` must
 * differ. Returns that boundary `toIndex` (the earlier document is `toIndex - 1`).
 */
export async function findFirstConflictEnd(hash: HashFn, n: number, baseline: string): Promise<number> {
	let lo = 0;        // hash(0, lo) == baseline
	let hi = n;        // hash(0, hi) differs
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (await hash(0, mid) !== baseline) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hi;
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
