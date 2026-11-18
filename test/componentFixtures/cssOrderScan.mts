/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CSS cascade-order dependency scanner.
 *
 * Renders every component fixture twice — once normally and once with the
 * bundled CSS documents reversed — and flags every fixture whose screenshot
 * changes under reversal: its appearance depends on the source-concatenation
 * order of two CSS files (a cascade tie broken only by order). For each flagged
 * fixture it then binary-searches to localize the two conflicting source files
 * (see `cssOrderShared.mts`), and writes a self-contained Markdown report with
 * the baseline/reversed images so the fragile pairs can be reviewed.
 *
 * The binary searches of all flagged fixtures run together, and every probe
 * window is rendered once for all fixtures that need it, so the scan scales with
 * the number of distinct conflicts rather than the number of fixtures. With
 * `--time-budget-minutes`, fixtures that are not localized in time are listed
 * in the report instead of the scan running unbounded.
 *
 * Intended for a scheduled CI job; runs against an already-running `serve`
 * (see `component-explorer-attach.json`). Prerequisites: start the serve, e.g.
 * `npm run serve-out-rspack`, then run:
 *   node test/componentFixtures/cssOrderScan.mts [--out <dir>] [--fixture-id-regex <rx>]
 *     [--time-budget-minutes <n>] [--batch-size <n>]
 */

import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bisectConflicts, type ConflictOutcome, type ConflictTarget, type FixtureEntry, readServeUrl, Renderer } from './cssOrderShared.mts';

interface Args {
	readonly config: string;
	readonly fixtureRegex: string;
	readonly out: string;
	/** When set, images are linked as `<imageBaseUrl>/<hash>` instead of bundled relative paths. */
	readonly imageBaseUrl: string | undefined;
	/** Stop localizing (and report the rest as not localized) after this many minutes since the scan started. */
	readonly timeBudgetMinutes: number | undefined;
	/** Number of order-dependent fixtures localized together; earlier batches complete even if the time budget runs out. */
	readonly batchSize: number;
	readonly keep: boolean;
}

function parseArgs(argv: readonly string[]): Args {
	const get = (name: string): string | undefined => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
	};
	const getPositiveNumber = (name: string): number | undefined => {
		const value = get(name);
		if (value === undefined) {
			return undefined;
		}
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			throw new Error(`--${name} must be a positive number, got '${value}'`);
		}
		return parsed;
	};
	const here = dirname(fileURLToPath(import.meta.url));
	const config = resolve(get('config') ?? join(here, 'component-explorer-attach.json'));
	return {
		config,
		fixtureRegex: get('fixture-id-regex') ?? '.*',
		out: resolve(get('out') ?? join(dirname(config), '.build', 'css-order-report')),
		imageBaseUrl: get('image-base-url'),
		timeBudgetMinutes: getPositiveNumber('time-budget-minutes'),
		batchSize: Math.ceil(getPositiveNumber('batch-size') ?? 1000),
		keep: argv.includes('--keep'),
	};
}

/** A localized cascade-order conflict for one fixture. */
interface Problem {
	readonly fixtureId: string;
	readonly background: 'light' | 'dark' | undefined;
	readonly labels: readonly string[];
	readonly docCount: number;
	readonly baselineHash: string;
	readonly reversedHash: string;
	/** Document index + source file of the later document (wins the tie in product order). */
	readonly laterIndex: number;
	readonly laterFile: string;
	/** Document index + source file of the earlier document (loses the tie in product order). */
	readonly earlierIndex: number;
	readonly earlierFile: string;
	/** Relative path of the baseline image within the report, if captured. */
	readonly baselineImage: string | undefined;
	/** Relative path of the reversed image within the report, if captured. */
	readonly reversedImage: string | undefined;
}

/** An order-dependent fixture whose conflicting pair could not be localized. */
interface Unlocalized {
	readonly fixtureId: string;
	readonly reason: string;
}

interface ScanTotals {
	readonly scanned: number;
	readonly orderDependent: number;
	readonly errored: number;
}

const GITHUB_SERVER = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const GITHUB_REPO = process.env.GITHUB_REPOSITORY;
const GITHUB_SHA = process.env.GITHUB_SHA;

/** Maps a bundled `out/…` document path back to its `src/…` source. */
function toSourcePath(path: string): string {
	return path.startsWith('out/') ? `src/${path.slice('out/'.length)}` : path;
}

/** A Markdown link to the source file on GitHub (when running in Actions), else inline code. */
function fileLink(path: string): string {
	const src = toSourcePath(path);
	if (GITHUB_REPO && GITHUB_SHA) {
		return `[\`${src}\`](${GITHUB_SERVER}/${GITHUB_REPO}/blob/${GITHUB_SHA}/${src})`;
	}
	return `\`${src}\``;
}

/** Just the file name of a bundled document path, for compact tables. */
function fileBaseName(path: string): string {
	const src = toSourcePath(path);
	return src.slice(src.lastIndexOf('/') + 1);
}

function slugify(fixtureId: string): string {
	return fixtureId.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

/**
 * An embedded Markdown image (`![]()`) of a captured render.
 * When `--image-base-url` is set, the image source is `<base>/<hash>`. Otherwise,
 * it stays relative to the report directory.
 */
async function imageLink(args: Args, label: string, hash: string, relativePath: string | undefined): Promise<string | undefined> {
	if (!relativePath) {
		return undefined;
	}
	if (args.imageBaseUrl) {
		return `![${label}](${args.imageBaseUrl.replace(/\/$/, '')}/${hash})`;
	}
	return `![${label}](${relativePath})`;
}

async function renderMarkdown(args: Args, problems: readonly Problem[], unlocalized: readonly Unlocalized[], totals: ScanTotals): Promise<string> {
	const lines: string[] = [];
	const clean = totals.scanned - totals.orderDependent - totals.errored;

	lines.push('# CSS Cascade-Order Dependency Report', '');
	lines.push(`- Generated: ${new Date().toISOString()}`);
	if (GITHUB_REPO && GITHUB_SHA) {
		lines.push(`- Commit: [\`${GITHUB_SHA.slice(0, 8)}\`](${GITHUB_SERVER}/${GITHUB_REPO}/commit/${GITHUB_SHA})`);
	}
	lines.push(`- Fixtures scanned: **${totals.scanned}**`);
	lines.push(`- Order-dependent: **${totals.orderDependent}**`);
	if (unlocalized.length > 0) {
		lines.push(`- Order-dependent but not localized: **${unlocalized.length}**`);
	}
	lines.push(`- Clean: **${clean}**`);
	lines.push(`- Errored / no image: **${totals.errored}**`, '');

	lines.push('> **How this works.** Each fixture is rendered normally and again with the');
	lines.push('> bundled CSS documents reversed. A changed screenshot means the appearance');
	lines.push('> depends on the source-concatenation order of two CSS files — a cascade tie');
	lines.push('> broken only by order. A binary search then localizes the two source files.');
	lines.push('> The later document (by product source order) currently wins the tie.');
	lines.push('>');
	lines.push('> **Caveats.** Detects the dominant conflicting pair per fixture; only flips');
	lines.push('> ties of equal specificity and importance; assumes no `@layer`.', '');

	if (totals.orderDependent === 0) {
		lines.push('No order-dependent fixtures detected. :tada:', '');
		return lines.join('\n');
	}

	if (problems.length > 0) {
		renderProblems(lines, problems);
		await renderProblemDetails(args, lines, problems);
	}

	if (unlocalized.length > 0) {
		lines.push('## Not localized', '');
		lines.push('These fixtures change when the CSS order is reversed, but the conflicting pair was not localized.', '');
		lines.push('| Fixture | Reason |');
		lines.push('| --- | --- |');
		for (const u of unlocalized) {
			lines.push(`| \`${u.fixtureId}\` | ${u.reason} |`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

function renderProblems(lines: string[], problems: readonly Problem[]): void {
	// Aggregate by CSS source file so the most frequently fragile files surface.
	const byFile = new Map<string, { fixtures: Set<string>; partners: Set<string> }>();
	const note = (file: string, partner: string, fixtureId: string) => {
		let entry = byFile.get(file);
		if (!entry) {
			entry = { fixtures: new Set(), partners: new Set() };
			byFile.set(file, entry);
		}
		entry.fixtures.add(fixtureId);
		entry.partners.add(partner);
	};
	for (const p of problems) {
		note(p.laterFile, p.earlierFile, p.fixtureId);
		note(p.earlierFile, p.laterFile, p.fixtureId);
	}

	lines.push('## Problematic CSS files', '');
	lines.push('| CSS source file | Fixtures affected | Conflicts with |');
	lines.push('| --- | ---: | --- |');
	const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].fixtures.size - a[1].fixtures.size);
	for (const [file, entry] of sortedFiles) {
		const partners = [...entry.partners].map(fileBaseName).sort().join(', ');
		lines.push(`| ${fileLink(file)} | ${entry.fixtures.size} | ${partners} |`);
	}
	lines.push('');

	lines.push('## Affected fixtures', '');
	lines.push('| Fixture | Theme | Earlier doc (loses) | Later doc (wins) |');
	lines.push('| --- | --- | --- | --- |');
	for (const p of problems) {
		lines.push(`| \`${p.fixtureId}\` | ${p.background ?? '—'} | ${fileLink(p.earlierFile)} (#${p.earlierIndex}) | ${fileLink(p.laterFile)} (#${p.laterIndex}) |`);
	}
	lines.push('');
}

async function renderProblemDetails(args: Args, lines: string[], problems: readonly Problem[]): Promise<void> {
	lines.push('## Details', '');
	for (const p of problems) {
		lines.push(`### \`${p.fixtureId}\``, '');
		lines.push(`- Theme: ${p.background ?? '—'}`);
		if (p.labels.length > 0) {
			lines.push(`- Labels: ${p.labels.map(l => `\`${l}\``).join(', ')}`);
		}
		lines.push(`- Later document (wins): ${fileLink(p.laterFile)} — document #${p.laterIndex}`);
		lines.push(`- Earlier document (loses): ${fileLink(p.earlierFile)} — document #${p.earlierIndex}`);
		lines.push(`- Image hash: \`${p.baselineHash.slice(0, 12)}\` (baseline) → \`${p.reversedHash.slice(0, 12)}\` (reversed)`);

		const baseLink = await imageLink(args, 'baseline image', p.baselineHash, p.baselineImage);
		const revLink = await imageLink(args, 'reversed image', p.reversedHash, p.reversedImage);
		if (baseLink && revLink) {
			lines.push(`- Images: ${baseLink} (product order) · ${revLink} (reversed order)`);
		}
		lines.push('');
	}
}

async function main(): Promise<void> {
	const startedAt = Date.now();
	const args = parseArgs(process.argv.slice(2));
	const configDir = dirname(args.config);
	const serveUrl = await readServeUrl(args.config);
	const deadline = args.timeBudgetMinutes !== undefined ? startedAt + args.timeBudgetMinutes * 60_000 : undefined;

	process.stdout.write(`Serve:   ${serveUrl ?? '(from config)'}\n`);
	process.stdout.write(`Fixtures: ${args.fixtureRegex}\n`);
	process.stdout.write(`Output:  ${args.out}\n`);
	process.stdout.write(`Budget:  ${args.timeBudgetMinutes !== undefined ? `${args.timeBudgetMinutes} minutes` : 'none'}\n\n`);

	const probeRoot = join(configDir, '.build', 'css-order-scan');
	await rm(probeRoot, { recursive: true, force: true });
	await mkdir(probeRoot, { recursive: true });
	await rm(args.out, { recursive: true, force: true });
	const assetsDir = join(args.out, 'assets');
	await mkdir(assetsDir, { recursive: true });
	const renderer = new Renderer(args.config, probeRoot, { keepProbeRenders: args.keep });

	// One render of every fixture in product order: this is the per-fixture
	// baseline image and also reports each fixture's document list, so the scan
	// never has to parse the bundle itself.
	process.stdout.write('Rendering all fixtures (baseline)...\n');
	const baseline = await renderer.render(args.fixtureRegex, { outputStylesheetFiles: true }, { useHashPaths: false });
	// One render of every fixture with all documents reversed: fixtures whose
	// image changes here are order-dependent.
	process.stdout.write('Rendering all fixtures (reversed)...\n');
	const reversed = await renderer.render(args.fixtureRegex, { reverseStylesheets: true }, { useHashPaths: false });

	const reversedById = new Map<string, FixtureEntry>(reversed.entries.map(e => [e.fixtureId, e]));
	const candidates = baseline.entries.filter(base => {
		const rev = reversedById.get(base.fixtureId);
		return !base.hasError && base.imageHash && rev?.imageHash && base.imageHash !== rev.imageHash;
	});
	const errored = baseline.entries.filter(e => e.hasError || !e.imageHash).length;
	process.stdout.write(`\nScanned ${baseline.entries.length} fixtures: ${candidates.length} order-dependent, ${errored} errored/no-image.\n`);

	const unlocalized: Unlocalized[] = [];
	const targets: ConflictTarget[] = [];
	for (const base of candidates) {
		const documentCount = base.output?.stylesheetFiles?.length ?? 0;
		if (documentCount === 0) {
			process.stderr.write(`::warning::${base.fixtureId} did not report stylesheetFiles; skipping.\n`);
			unlocalized.push({ fixtureId: base.fixtureId, reason: 'did not report stylesheet files' });
			continue;
		}
		targets.push({ fixtureId: base.fixtureId, documentCount });
	}

	const outcomes = new Map<string, ConflictOutcome>();
	for (let start = 0; start < targets.length; start += args.batchSize) {
		const batch = targets.slice(start, start + args.batchSize);
		process.stdout.write(`\nLocalizing order-dependent fixtures ${start + 1}-${start + batch.length} of ${targets.length}...\n`);
		const batchOutcomes = await bisectConflicts(renderer, batch, {
			deadline,
			onProbe: ({ window, fixtureCount, ms }) => {
				process.stdout.write(`  reverse[${window.fromIndex}, ${window.toIndex}) x ${fixtureCount} fixture(s) (${ms}ms)\n`);
			},
		});
		for (const [fixtureId, outcome] of batchOutcomes) {
			outcomes.set(fixtureId, outcome);
		}
	}

	const problems: Problem[] = [];
	for (const base of candidates) {
		const outcome = outcomes.get(base.fixtureId);
		if (!outcome) {
			continue;
		}
		if (outcome.kind === 'failed') {
			unlocalized.push({ fixtureId: base.fixtureId, reason: outcome.reason });
			continue;
		}
		const rev = reversedById.get(base.fixtureId)!;
		const files = base.output!.stylesheetFiles!;
		const { later, earlier } = outcome.pair;

		// Copy the baseline and reversed images into the report so it is
		// self-contained (links resolve when the artifact is downloaded).
		const slug = slugify(base.fixtureId);
		let baselineImage: string | undefined;
		let reversedImage: string | undefined;
		if (base.imagePath) {
			baselineImage = `assets/${slug}.baseline.png`;
			await copyFile(join(baseline.targetDir, base.imagePath), join(args.out, baselineImage));
		}
		if (rev.imagePath) {
			reversedImage = `assets/${slug}.reversed.png`;
			await copyFile(join(reversed.targetDir, rev.imagePath), join(args.out, reversedImage));
		}

		problems.push({
			fixtureId: base.fixtureId,
			background: base.background,
			labels: base.labels ?? [],
			docCount: files.length,
			baselineHash: base.imageHash!,
			reversedHash: rev.imageHash!,
			laterIndex: later,
			laterFile: files[later] ?? '(out of range)',
			earlierIndex: earlier,
			earlierFile: files[earlier] ?? '(out of range)',
			baselineImage,
			reversedImage,
		});
		process.stdout.write(`${base.fixtureId}: #${earlier} ${fileBaseName(files[earlier] ?? '?')} loses to #${later} ${fileBaseName(files[later] ?? '?')}\n`);
	}

	const totals: ScanTotals = { scanned: baseline.entries.length, orderDependent: candidates.length, errored };
	const markdown = await renderMarkdown(args, problems, unlocalized, totals);
	await writeFile(join(args.out, 'report.md'), `${markdown}\n`, 'utf8');
	await writeFile(join(args.out, 'report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), commit: GITHUB_SHA, ...totals, problems, unlocalized }, undefined, '\t')}\n`, 'utf8');

	if (!args.keep) {
		await rm(probeRoot, { recursive: true, force: true });
	}

	if (unlocalized.length > 0) {
		process.stderr.write(`::warning::${unlocalized.length} of ${candidates.length} order-dependent fixtures were not localized; see the report for reasons.\n`);
	}
	const minutes = ((Date.now() - startedAt) / 60_000).toFixed(1);
	process.stdout.write(`\nReport written to ${join(args.out, 'report.md')} (${problems.length} localized, ${unlocalized.length} not localized, ${minutes} minutes).\n`);
}

main().catch(err => {
	process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
	process.exitCode = 1;
});
