/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fetches a screenshot diff from the service and prints the PR comment markdown to stdout.
// Usage: node build/lib/screenshotDiffReport.ts <service-url> <owner> <repo> <base-sha> <current-sha>
// Outputs nothing (exit 0) when there are no visual changes.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMENT_MARKER = '<!-- screenshot-diff-report -->';
const EXPAND_FIRST_N = 5;
const EXCLUDED_LABELS = new Set(['animated', 'flaky']);

interface CompareEntry {
	readonly fixtureId: string;
	readonly imageUrl: string;
	readonly labels?: readonly string[];
	readonly changeCount?: number;
}

interface CompareChangedEntry {
	readonly fixtureId: string;
	readonly beforeImageUrl: string;
	readonly afterImageUrl: string;
	readonly labels?: readonly string[];
	readonly changeCount?: number;
}

interface CompareResult {
	readonly baseCommitSha: string;
	readonly added: readonly CompareEntry[];
	readonly removed: readonly CompareEntry[];
	readonly changed: readonly CompareChangedEntry[];
	readonly unchanged: readonly CompareEntry[];
}

function shouldIncludeInReport(labels: readonly string[] | undefined): boolean {
	return !labels?.some(l => EXCLUDED_LABELS.has(l));
}

function generateMarkdown(result: CompareResult, baseSha: string, currentSha: string): string {
	const changed = result.changed.filter(e => shouldIncludeInReport(e.labels));
	const added = result.added.filter(e => shouldIncludeInReport(e.labels));
	const removed = result.removed.filter(e => shouldIncludeInReport(e.labels));

	if (changed.length === 0 && added.length === 0 && removed.length === 0) {
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
			lines.push(`| ![before](${entry.beforeImageUrl}) | ![after](${entry.afterImageUrl}) |`);
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
			lines.push(`![current](${entry.imageUrl})`);
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
			lines.push(`![baseline](${entry.imageUrl})`);
			lines.push('');
			lines.push('</details>');
			lines.push('');
		}
	}

	return lines.join('\n');
}

async function fetchCompare(serviceUrl: string, owner: string, repo: string, baseSha: string, currentSha: string): Promise<CompareResult> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const token = process.env.SCREENSHOT_SERVICE_TOKEN;
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	const response = await fetch(`${serviceUrl}/compare`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ owner, repo, baseCommitSha: baseSha, currentCommitSha: currentSha }),
	});

	if (!response.ok) {
		const body = await response.json().catch(() => ({})) as { error?: string };
		throw new Error(body.error ?? `Service returned ${response.status}`);
	}

	const result = await response.json() as CompareResult;

	// Write result to .tmp for debugging
	const tmpDir = path.join(__dirname, '../../.tmp');
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(path.join(tmpDir, 'screenshotDiffReport.json'), JSON.stringify(result, null, 2));

	return result;
}

async function main(): Promise<void> {
	const [serviceUrl, owner, repo, baseSha, currentSha] = process.argv.slice(2);
	if (!serviceUrl || !owner || !repo || !baseSha || !currentSha) {
		console.error('Usage: node build/lib/screenshotDiffReport.ts <service-url> <owner> <repo> <base-sha> <current-sha>');
		process.exit(1);
	}

	const result = await fetchCompare(serviceUrl, owner, repo, baseSha, currentSha);

	console.error(`Compare result: ${result.changed.length} changed, ${result.added.length} added, ${result.removed.length} removed, ${result.unchanged.length} unchanged`);

	const markdown = generateMarkdown(result, baseSha, currentSha);

	if (!markdown) {
		console.error('No reportable changes (all entries may be excluded by labels).');
		process.exit(0);
	}

	process.stdout.write(`${COMMENT_MARKER}\n${markdown}`);
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
