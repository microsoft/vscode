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
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMENT_MARKER = '<!-- screenshot-diff-report -->';
const EXPAND_FIRST_N = 5;
const EXCLUDED_LABELS = new Set(['animated', 'flaky']);
const MAX_BODY_BYTES = 750 * 1024;

interface LocalManifestFixture {
	readonly fixtureId: string;
	readonly imageHash?: string;
	readonly imagePath?: string;
	readonly labels?: readonly string[];
	readonly hasError?: boolean;
	readonly error?: { readonly message?: string; readonly stack?: string } | string;
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
			const rawError = cur.error;
			const errorMessage = typeof rawError === 'string'
				? rawError
				: rawError?.message ?? 'unknown error (no image hash produced)';
			const errorStack = typeof rawError === 'object' ? rawError?.stack : undefined;
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
): string {
	const changed = diff.changed.filter(e => shouldIncludeInReport(e.labels));
	const added = diff.added.filter(e => shouldIncludeInReport(e.labels));
	const removed = diff.removed.filter(e => shouldIncludeInReport(e.labels));
	const errored = diff.errored.filter(e => shouldIncludeInReport(e.labels));

	if (changed.length === 0 && added.length === 0 && removed.length === 0 && errored.length === 0) {
		return '';
	}

	const lines: string[] = [];
	lines.push('## Screenshot Changes');
	lines.push('');
	lines.push(`**Base:** \`${baseSha.slice(0, 8)}\` **Current:** \`${currentSha.slice(0, 8)}\``);
	lines.push('');

	if (changed.length > 0) {
		lines.push(`### Changed (${changed.length})`);
		lines.push('');
		for (let i = 0; i < changed.length; i++) {
			const entry = changed[i];
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

function main(): void {
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

	const tmpDir = path.join(__dirname, '../../.tmp');
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(
		path.join(tmpDir, 'screenshotDiffReport.json'),
		JSON.stringify(diff, null, 2),
	);

	const markdown = generateMarkdown(diff, serviceUrl, baseSha, currentSha);

	if (!markdown) {
		console.error('No reportable changes.');
		process.exit(0);
	}

	process.stdout.write(`${COMMENT_MARKER}\n${markdown}`);
}

main();
