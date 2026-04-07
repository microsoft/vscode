/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Migrates a pull request from microsoft/vscode-copilot-chat to microsoft/vscode.
//
// The diff is fetched, file paths are rewritten to prepend `extensions/copilot/`,
// and a new PR is created in microsoft/vscode via the `gh` CLI.
//
// Usage:
//   node scripts/copilot-migrate-pr.ts <PR_NUMBER> [--dry-run]
//
// Requirements:
//   - `gh` CLI installed and authenticated with access to both repos
//   - Local checkout of microsoft/vscode with `main` branch up to date

import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const SOURCE_REPO = 'microsoft/vscode-copilot-chat';
const TARGET_REPO = 'microsoft/vscode';
const PATH_PREFIX = 'extensions/copilot';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface Options {
	prNumber: number;
	dryRun: boolean;
}

function parseArgs(): Options {
	const args = process.argv.slice(2);
	let prNumber: number | undefined;
	let dryRun = false;

	for (const arg of args) {
		if (arg === '--dry-run') {
			dryRun = true;
		} else if (!prNumber && /^\d+$/.test(arg)) {
			prNumber = parseInt(arg, 10);
		} else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(1);
		}
	}

	if (!prNumber) {
		console.error('Usage: node scripts/copilot-migrate-pr.ts <PR_NUMBER> [--dry-run]');
		process.exit(1);
	}

	return { prNumber, dryRun };
}

// ---------------------------------------------------------------------------
// gh CLI helpers
// ---------------------------------------------------------------------------

function gh(args: string[]): string {
	return execFileSync('gh', args, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
}

function git(args: string[], cwd?: string): string {
	return execFileSync('git', args, { encoding: 'utf-8', cwd, maxBuffer: 50 * 1024 * 1024 });
}

// ---------------------------------------------------------------------------
// PR metadata
// ---------------------------------------------------------------------------

interface PrMetadata {
	title: string;
	body: string;
	baseRefName: string;
	headRefName: string;
	isDraft: boolean;
	number: number;
	author: { login: string };
	labels: { name: string }[];
	assignees: { login: string }[];
}

function fetchPrMetadata(prNumber: number): PrMetadata {
	const json = gh([
		'pr', 'view', String(prNumber),
		'--repo', SOURCE_REPO,
		'--json', 'title,body,baseRefName,headRefName,isDraft,number,author,labels,assignees',
	]);
	return JSON.parse(json);
}

function fetchPrDiff(prNumber: number): string {
	return gh([
		'pr', 'diff', String(prNumber),
		'--repo', SOURCE_REPO,
	]);
}

// ---------------------------------------------------------------------------
// Diff path rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrites file paths in a unified diff to prepend `extensions/copilot/`.
 *
 * Handles:
 *   - `diff --git a/path b/path`
 *   - `--- a/path` / `+++ b/path`
 *   - `/dev/null` (new/deleted files) — left unchanged
 *   - `rename from path` / `rename to path`
 *   - `copy from path` / `copy to path`
 */
function rewriteDiff(diff: string): string {
	const lines = diff.split('\n');
	const result: string[] = [];

	for (const line of lines) {
		result.push(rewriteDiffLine(line));
	}

	return result.join('\n');
}

function rewriteDiffLine(line: string): string {
	// diff --git a/path b/path
	const diffGitMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
	if (diffGitMatch) {
		return `diff --git a/${PATH_PREFIX}/${diffGitMatch[1]} b/${PATH_PREFIX}/${diffGitMatch[2]}`;
	}

	// --- a/path or --- /dev/null
	const minusMatch = line.match(/^--- a\/(.+)$/);
	if (minusMatch) {
		return `--- a/${PATH_PREFIX}/${minusMatch[1]}`;
	}

	// +++ b/path or +++ /dev/null
	const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
	if (plusMatch) {
		return `+++ b/${PATH_PREFIX}/${plusMatch[1]}`;
	}

	// rename from path / rename to path
	const renameFromMatch = line.match(/^rename from (.+)$/);
	if (renameFromMatch) {
		return `rename from ${PATH_PREFIX}/${renameFromMatch[1]}`;
	}

	const renameToMatch = line.match(/^rename to (.+)$/);
	if (renameToMatch) {
		return `rename to ${PATH_PREFIX}/${renameToMatch[1]}`;
	}

	// copy from path / copy to path
	const copyFromMatch = line.match(/^copy from (.+)$/);
	if (copyFromMatch) {
		return `copy from ${PATH_PREFIX}/${copyFromMatch[1]}`;
	}

	const copyToMatch = line.match(/^copy to (.+)$/);
	if (copyToMatch) {
		return `copy to ${PATH_PREFIX}/${copyToMatch[1]}`;
	}

	// Everything else (context lines, hunk headers, /dev/null, etc.) passes through
	return line;
}

// ---------------------------------------------------------------------------
// Branch and PR creation
// ---------------------------------------------------------------------------

function createBranchAndApplyDiff(
	prNumber: number,
	title: string,
	rewrittenDiff: string,
	repoRoot: string,
): string {
	const branchName = `vscode-copilot-chat/migrate-${prNumber}`;

	// Ensure we're on a clean state based on main
	git(['checkout', 'main'], repoRoot);
	git(['pull', '--ff-only', 'origin', 'main'], repoRoot);

	// Create and switch to the new branch
	try {
		git(['checkout', '-b', branchName], repoRoot);
	} catch {
		// Branch may already exist from a previous attempt
		git(['checkout', branchName], repoRoot);
		git(['reset', '--hard', 'main'], repoRoot);
	}

	// Write diff to a temp file and apply
	const tmpDiff = path.join(os.tmpdir(), `copilot-migrate-pr-${prNumber}.patch`);
	try {
		fs.writeFileSync(tmpDiff, rewrittenDiff);
		git(['apply', '--3way', tmpDiff], repoRoot);
	} finally {
		fs.unlinkSync(tmpDiff);
	}

	// Stage and commit
	git(['add', '-A'], repoRoot);
	git([
		'commit',
		'-m', `Migrate ${SOURCE_REPO}#${prNumber}: ${title}`,
		'--allow-empty',
	], repoRoot);

	return branchName;
}

function pushBranch(branchName: string, repoRoot: string): void {
	git(['push', '-u', 'origin', branchName, '--force-with-lease'], repoRoot);
}

function createPr(meta: PrMetadata, branchName: string): string {
	const migrationNote = [
		`> Migrated from ${SOURCE_REPO}#${meta.number}`,
		`> Original author: @${meta.author.login}`,
		'',
	].join('\n');

	const body = meta.body
		? `${migrationNote}\n---\n\n${meta.body}`
		: migrationNote;

	const args = [
		'pr', 'create',
		'--repo', TARGET_REPO,
		'--head', branchName,
		'--base', 'main',
		'--title', meta.title,
		'--body', body,
	];

	if (meta.isDraft) {
		args.push('--draft');
	}

	for (const assignee of meta.assignees) {
		args.push('--assignee', assignee.login);
	}

	for (const label of meta.labels) {
		args.push('--label', label.name);
	}

	return gh(args).trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const { prNumber, dryRun } = parseArgs();
	const repoRoot = path.dirname(import.meta.dirname);

	console.log(`Fetching PR #${prNumber} from ${SOURCE_REPO}...`);
	const meta = fetchPrMetadata(prNumber);
	console.log(`  Title: ${meta.title}`);
	console.log(`  Author: @${meta.author.login}`);
	console.log(`  Base: ${meta.baseRefName} -> Head: ${meta.headRefName}`);
	console.log(`  Draft: ${meta.isDraft}`);
	console.log(`  Labels: ${meta.labels.map(l => l.name).join(', ') || '(none)'}`);
	console.log(`  Assignees: ${meta.assignees.map(a => a.login).join(', ') || '(none)'}`);

	console.log(`\nFetching diff...`);
	const diff = fetchPrDiff(prNumber);
	const rewrittenDiff = rewriteDiff(diff);

	if (dryRun) {
		console.log('\n=== DRY RUN — Rewritten diff ===\n');
		console.log(rewrittenDiff);
		console.log('\n=== DRY RUN — No changes were made ===');
		return;
	}

	console.log(`\nCreating branch and applying diff...`);
	const branchName = createBranchAndApplyDiff(prNumber, meta.title, rewrittenDiff, repoRoot);
	console.log(`  Branch: ${branchName}`);

	console.log(`\nPushing branch...`);
	pushBranch(branchName, repoRoot);

	console.log(`\nCreating PR in ${TARGET_REPO}...`);
	const prUrl = createPr(meta, branchName);
	console.log(`\nDone! PR created: ${prUrl}`);
}

main();
