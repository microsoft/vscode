/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Diffs a locally rendered screenshot manifest against a base-commit manifest
// and prints Markdown to stdout. Empty output (exit 0) means no reportable
// changes. The base manifest is supplied as a file path — the caller is
// responsible for fetching it (e.g. via curl from the screenshot service's
// public /commits/<owner>/<repo>/<sha> endpoint).
//
// Usage:
//   node build/lib/screenshotDiffReport.ts \
//     <service-url> <base-sha> <current-sha> <base-manifest> <local-manifest>
//
// Both before- and after-images are referenced via the public /images/<hash>
// endpoint of the screenshot service. After-images become available there
// once the workflow's upload step has pushed them. Note: GitHub markdown
// does not render `data:` URIs, so we cannot inline images as base64; for
// runs that skip the upload (e.g. fork PRs) the after-image URL will 404
// until the service has the hash, which is acceptable since fork PRs do
// not post a PR comment.

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMENT_MARKER = '<!-- screenshot-diff-report -->';
const EXPAND_FIRST_N = 5;
const EXCLUDED_LABELS = new Set(['animated', 'flaky']);
const MAX_BODY_BYTES = 300 * 1024;

// ---------------------------------------------------------------------------
// Pixel-level image comparison
// ---------------------------------------------------------------------------

const MAX_INSIGNIFICANT_PIXELS = 20;
const MAX_INSIGNIFICANT_CHANNEL_DELTA = 2;

interface RawImage {
	readonly width: number;
	readonly height: number;
	readonly data: Buffer;
}

function readPngPixels(buf: Buffer): RawImage {
	if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
		throw new Error('Not a PNG file');
	}
	let offset = 8;
	let width = 0, height = 0, colorType = 0;
	const idatChunks: Buffer[] = [];
	while (offset < buf.length) {
		const length = buf.readUInt32BE(offset);
		const type = buf.toString('ascii', offset + 4, offset + 8);
		const data = buf.subarray(offset + 8, offset + 8 + length);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			if (data[8] !== 8) { throw new Error(`Unsupported bit depth: ${data[8]}`); }
			colorType = data[9];
			if (colorType !== 2 && colorType !== 6) { throw new Error(`Unsupported color type: ${colorType}`); }
		} else if (type === 'IDAT') {
			idatChunks.push(data);
		} else if (type === 'IEND') {
			break;
		}
		offset += 12 + length;
	}
	const bpp = colorType === 6 ? 4 : 3;
	const raw = zlib.inflateSync(Buffer.concat(idatChunks));
	const stride = width * bpp + 1;
	const pixels = Buffer.alloc(width * height * 4);
	const prevRow = Buffer.alloc(width * bpp);
	const currRow = Buffer.alloc(width * bpp);
	for (let y = 0; y < height; y++) {
		const filterType = raw[y * stride];
		const rowData = raw.subarray(y * stride + 1, y * stride + 1 + width * bpp);
		for (let i = 0; i < width * bpp; i++) {
			const a = i >= bpp ? currRow[i - bpp] : 0;
			const b = prevRow[i];
			const c = i >= bpp ? prevRow[i - bpp] : 0;
			let val = rowData[i];
			switch (filterType) {
				case 0: break;
				case 1: val = (val + a) & 0xff; break;
				case 2: val = (val + b) & 0xff; break;
				case 3: val = (val + ((a + b) >> 1)) & 0xff; break;
				case 4: {
					const p = a + b - c;
					const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
					val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
					break;
				}
			}
			currRow[i] = val;
		}
		for (let x = 0; x < width; x++) {
			const pi = (y * width + x) * 4;
			pixels[pi] = currRow[x * bpp];
			pixels[pi + 1] = currRow[x * bpp + 1];
			pixels[pi + 2] = currRow[x * bpp + 2];
			pixels[pi + 3] = bpp === 4 ? currRow[x * bpp + 3] : 255;
		}
		prevRow.set(currRow);
	}
	return { width, height, data: pixels };
}

class ImageDiffResult {
	readonly changedPixelCount: number;
	readonly maxChannelDelta: number;

	constructor(changedPixelCount: number, maxChannelDelta: number) {
		this.changedPixelCount = changedPixelCount;
		this.maxChannelDelta = maxChannelDelta;
	}

	get isSignificant(): boolean {
		return this.changedPixelCount > MAX_INSIGNIFICANT_PIXELS
			|| this.maxChannelDelta > MAX_INSIGNIFICANT_CHANNEL_DELTA;
	}

	toString(): string {
		if (this.changedPixelCount === 0) {
			return 'identical';
		}
		return `${this.changedPixelCount} px changed, max \u0394${this.maxChannelDelta}${this.isSignificant ? '' : ' (insignificant)'}`;
	}
}

function diffImages(before: Buffer, after: Buffer): ImageDiffResult {
	const imgA = readPngPixels(before);
	const imgB = readPngPixels(after);
	if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
		return new ImageDiffResult(imgA.width * imgA.height, 255);
	}
	let changedPixels = 0;
	let maxDelta = 0;
	for (let i = 0; i < imgA.data.length; i += 4) {
		const dr = Math.abs(imgA.data[i] - imgB.data[i]);
		const dg = Math.abs(imgA.data[i + 1] - imgB.data[i + 1]);
		const db = Math.abs(imgA.data[i + 2] - imgB.data[i + 2]);
		const da = Math.abs(imgA.data[i + 3] - imgB.data[i + 3]);
		if (dr || dg || db || da) {
			changedPixels++;
			maxDelta = Math.max(maxDelta, dr, dg, db, da);
		}
	}
	return new ImageDiffResult(changedPixels, maxDelta);
}

function fetchBuffer(url: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				fetchBuffer(res.headers.location).then(resolve, reject);
				return;
			}
			if (!res.statusCode || res.statusCode !== 200) {
				reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				return;
			}
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks)));
			res.on('error', reject);
		}).on('error', reject);
	});
}

async function computePixelDiffs(
	changed: readonly ChangedDiffEntry[],
	serviceUrl: string,
	localManifestDir: string,
): Promise<Map<string, ImageDiffResult>> {
	const results = new Map<string, ImageDiffResult>();
	await Promise.all(changed.map(async (entry) => {
		try {
			const beforeUrl = loadImageUrl(serviceUrl, entry.beforeHash);
			const [beforeBuf, afterBuf] = await Promise.all([
				fetchBuffer(beforeUrl),
				fs.promises.readFile(path.resolve(localManifestDir, entry.afterPath)),
			]);
			results.set(entry.fixtureId, diffImages(beforeBuf, afterBuf));
		} catch (err) {
			console.error(`  Warning: pixel diff failed for ${entry.fixtureId}: ${err}`);
		}
	}));
	return results;
}

interface ManifestEvent {
	readonly type?: string;
	readonly message?: string;
	readonly stack?: string;
	readonly phase?: string;
	readonly isError?: boolean;
}

interface LocalManifestFixture {
	readonly fixtureId: string;
	readonly imageHash?: string;
	readonly imagePath?: string;
	readonly labels?: readonly string[];
	readonly hasError?: boolean;
	readonly events?: readonly ManifestEvent[];
}

interface LocalManifest {
	readonly fixtures: readonly LocalManifestFixture[];
}

interface BaseFixture {
	readonly fixtureId: string;
	readonly imageHash: string;
	readonly labels?: readonly string[];
}

interface BaseCommitResponse {
	readonly commitSha: string;
	readonly fixtures: readonly BaseFixture[];
}

interface DiffEntry {
	readonly fixtureId: string;
	readonly labels?: readonly string[];
}

interface ChangedDiffEntry extends DiffEntry {
	readonly beforeHash: string;
	readonly afterHash: string;
	readonly afterPath: string;
}

interface AddedDiffEntry extends DiffEntry {
	readonly afterHash: string;
	readonly afterPath: string;
}

interface RemovedDiffEntry extends DiffEntry {
	readonly beforeHash: string;
}

interface ErroredDiffEntry extends DiffEntry {
	readonly errorMessage: string;
	readonly errorStack?: string;
}

interface DiffResult {
	readonly changed: readonly ChangedDiffEntry[];
	readonly added: readonly AddedDiffEntry[];
	readonly removed: readonly RemovedDiffEntry[];
	readonly errored: readonly ErroredDiffEntry[];
}

function shouldIncludeInReport(labels: readonly string[] | undefined): boolean {
	return !labels?.some(l => EXCLUDED_LABELS.has(l));
}

function diffManifests(local: LocalManifest, base: BaseCommitResponse): DiffResult {
	const baseByFixture = new Map<string, BaseFixture>();
	for (const f of base.fixtures) {
		baseByFixture.set(f.fixtureId, f);
	}
	const localByFixture = new Map<string, LocalManifestFixture>();
	for (const f of local.fixtures) {
		localByFixture.set(f.fixtureId, f);
	}

	const changed: ChangedDiffEntry[] = [];
	const added: AddedDiffEntry[] = [];
	const removed: RemovedDiffEntry[] = [];
	const errored: ErroredDiffEntry[] = [];

	for (const cur of local.fixtures) {
		if (cur.hasError || !cur.imageHash || !cur.imagePath) {
			const errorEvents = (cur.events ?? []).filter(e => e.isError);
			const errorMessage = errorEvents.map(e => e.message).filter(Boolean).join('; ')
				|| 'unknown error (no image hash produced)';
			const errorStack = errorEvents.map(e => e.stack).find(s => s !== undefined);
			errored.push({
				fixtureId: cur.fixtureId,
				labels: cur.labels,
				errorMessage,
				errorStack,
			});
			continue;
		}
		const baseEntry = baseByFixture.get(cur.fixtureId);
		if (!baseEntry) {
			added.push({
				fixtureId: cur.fixtureId,
				labels: cur.labels,
				afterHash: cur.imageHash,
				afterPath: cur.imagePath,
			});
			continue;
		}
		if (baseEntry.imageHash !== cur.imageHash) {
			changed.push({
				fixtureId: cur.fixtureId,
				labels: cur.labels,
				beforeHash: baseEntry.imageHash,
				afterHash: cur.imageHash,
				afterPath: cur.imagePath,
			});
		}
	}

	for (const baseEntry of base.fixtures) {
		if (!localByFixture.has(baseEntry.fixtureId)) {
			removed.push({
				fixtureId: baseEntry.fixtureId,
				labels: baseEntry.labels,
				beforeHash: baseEntry.imageHash,
			});
		}
	}

	return { changed, added, removed, errored };
}

function loadImageUrl(serviceUrl: string, hash: string): string {
	return `${serviceUrl.replace(/\/$/, '')}/images/${hash}`;
}

function generateMarkdown(
	diff: DiffResult,
	serviceUrl: string,
	baseSha: string,
	currentSha: string,
	pixelDiffs: ReadonlyMap<string, ImageDiffResult>,
): string {
	const changed = diff.changed.filter(e => shouldIncludeInReport(e.labels));
	const added = diff.added.filter(e => shouldIncludeInReport(e.labels));
	const removed = diff.removed.filter(e => shouldIncludeInReport(e.labels));
	const errored = diff.errored.filter(e => shouldIncludeInReport(e.labels));

	const significantChanged = changed.filter(e => {
		const pd = pixelDiffs.get(e.fixtureId);
		return !pd || pd.isSignificant;
	});
	const insignificantChangedCount = changed.length - significantChanged.length;

	if (significantChanged.length === 0 && added.length === 0 && removed.length === 0 && errored.length === 0) {
		if (insignificantChangedCount > 0) {
			console.error(`All ${insignificantChangedCount} changed screenshot(s) are insignificant — suppressing PR comment.`);
		}
		return '';
	}

	const lines: string[] = [];
	lines.push('## Screenshot Changes');
	lines.push('');
	lines.push(`**Base:** \`${baseSha.slice(0, 8)}\` **Current:** \`${currentSha.slice(0, 8)}\``);
	lines.push('');

	if (significantChanged.length > 0 || insignificantChangedCount > 0) {
		if (significantChanged.length > 0) {
			lines.push(`### Changed (${significantChanged.length})`);
			lines.push('');
			for (let i = 0; i < significantChanged.length; i++) {
				const entry = significantChanged[i];
				const open = i < EXPAND_FIRST_N ? ' open' : '';
				lines.push(`<details${open}><summary><code>${entry.fixtureId}</code></summary>`);
				lines.push('');
				lines.push('| Before | After |');
				lines.push('|--------|-------|');
				lines.push(`| ![before](${loadImageUrl(serviceUrl, entry.beforeHash)}) | ![after](${loadImageUrl(serviceUrl, entry.afterHash)}) |`);
				lines.push('');
				lines.push('</details>');
				lines.push('');
			}
		}
		if (insignificantChangedCount > 0) {
			lines.push(`_${insignificantChangedCount} insignificant change(s) omitted (\u2264${MAX_INSIGNIFICANT_PIXELS} px, \u0394\u2264${MAX_INSIGNIFICANT_CHANNEL_DELTA}). See CI logs for details._`);
			lines.push('');
		}
	}

	if (added.length > 0) {
		lines.push(`### Added (${added.length})`);
		lines.push('');
		for (let i = 0; i < added.length; i++) {
			const entry = added[i];
			const open = i < EXPAND_FIRST_N ? ' open' : '';
			lines.push(`<details${open}><summary><code>${entry.fixtureId}</code></summary>`);
			lines.push('');
			lines.push(`![current](${loadImageUrl(serviceUrl, entry.afterHash)})`);
			lines.push('');
			lines.push('</details>');
			lines.push('');
		}
	}

	if (removed.length > 0) {
		lines.push(`### Removed (${removed.length})`);
		lines.push('');
		for (let i = 0; i < removed.length; i++) {
			const entry = removed[i];
			const open = i < EXPAND_FIRST_N ? ' open' : '';
			lines.push(`<details${open}><summary><code>${entry.fixtureId}</code></summary>`);
			lines.push('');
			lines.push(`![baseline](${loadImageUrl(serviceUrl, entry.beforeHash)})`);
			lines.push('');
			lines.push('</details>');
			lines.push('');
		}
	}

	if (errored.length > 0) {
		lines.push(`### Errored (${errored.length})`);
		lines.push('');
		lines.push('Fixtures that failed to render — no screenshot was produced.');
		lines.push('');
		const reservedForFooter = 200;
		const usedBytes = () => Buffer.byteLength(lines.join('\n'), 'utf8');
		let truncatedAt = -1;
		for (let i = 0; i < errored.length; i++) {
			const entry = errored[i];
			const open = i < EXPAND_FIRST_N ? ' open' : '';
			const header = `<details${open}><summary><code>${entry.fixtureId}</code> — ${escapeMarkdown(entry.errorMessage)}</summary>`;
			const fullStack = entry.errorStack ?? entry.errorMessage;
			const fullBlock = `${header}\n\n\`\`\`\n${fullStack}\n\`\`\`\n\n</details>\n`;

			const remainingBudget = MAX_BODY_BYTES - usedBytes() - reservedForFooter;
			if (Buffer.byteLength(fullBlock, 'utf8') <= remainingBudget) {
				lines.push(header);
				lines.push('');
				lines.push('```');
				lines.push(fullStack);
				lines.push('```');
				lines.push('');
				lines.push('</details>');
				lines.push('');
				continue;
			}

			const minimalBlock = `${header}\n\n\`\`\`\n…\n\`\`\`\n\n</details>\n`;
			const minimalBudget = remainingBudget - Buffer.byteLength(minimalBlock, 'utf8');
			if (minimalBudget < 0) {
				truncatedAt = i;
				break;
			}
			const truncationMarker = '\n…(truncated)';
			const stackBudget = minimalBudget + Buffer.byteLength('…', 'utf8') - Buffer.byteLength(truncationMarker, 'utf8');
			const truncatedStack = stackBudget > 0
				? fullStack.slice(0, stackBudget) + truncationMarker
				: '…(truncated)';
			lines.push(header);
			lines.push('');
			lines.push('```');
			lines.push(truncatedStack);
			lines.push('```');
			lines.push('');
			lines.push('</details>');
			lines.push('');
		}
		if (truncatedAt !== -1) {
			lines.push(`_…and ${errored.length - truncatedAt} more errored fixture(s) omitted to stay under the ${Math.round(MAX_BODY_BYTES / 1024)}KB body limit. See workflow logs for the full list._`);
			lines.push('');
		}
	}

	return lines.join('\n');
}

function escapeMarkdown(text: string): string {
	return text.replace(/[\r\n]+/g, ' ').replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
}

async function main(): Promise<void> {
	const [serviceUrl, baseSha, currentSha, baseManifestPath, localManifestPath] = process.argv.slice(2);
	if (!serviceUrl || !baseSha || !currentSha || !baseManifestPath || !localManifestPath) {
		console.error('Usage: node build/lib/screenshotDiffReport.ts <service-url> <base-sha> <current-sha> <base-manifest> <local-manifest>');
		process.exit(1);
	}

	if (!fs.existsSync(localManifestPath)) {
		console.error(`Local manifest not found: ${localManifestPath}`);
		process.exit(1);
	}
	if (!fs.existsSync(baseManifestPath)) {
		console.error(`Base manifest not found: ${baseManifestPath}. Skipping diff.`);
		process.exit(0);
	}

	const local = JSON.parse(fs.readFileSync(localManifestPath, 'utf8')) as LocalManifest;
	const base = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8')) as BaseCommitResponse;

	const diff = diffManifests(local, base);
	console.error(`Compare result: ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed, ${diff.errored.length} errored.`);

	const localManifestDir = path.dirname(path.resolve(localManifestPath));
	const pixelDiffs = await computePixelDiffs(diff.changed, serviceUrl, localManifestDir);
	for (const entry of diff.changed) {
		const pd = pixelDiffs.get(entry.fixtureId);
		console.error(`  ${entry.fixtureId}: ${pd?.toString() ?? 'pixel diff unavailable'}`);
	}

	const tmpDir = path.join(__dirname, '../../.tmp');
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(
		path.join(tmpDir, 'screenshotDiffReport.json'),
		JSON.stringify(diff, null, 2),
	);

	const markdown = generateMarkdown(diff, serviceUrl, baseSha, currentSha, pixelDiffs);

	if (!markdown) {
		console.error('No reportable changes.');
		process.exit(0);
	}

	process.stdout.write(`${COMMENT_MARKER}\n${markdown}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
