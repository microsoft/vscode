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
//   node build/copilot-migrate-pr.ts <PR_NUMBER> [--dry-run] [--verbose]
//
// Requirements:
//   - `gh` CLI installed and authenticated with access to both repos
//   - Local checkout of microsoft/vscode with `main` branch up to date

import { execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const SOURCE_REPO = 'microsoft/vscode-copilot-chat';
const TARGET_REPO = 'microsoft/vscode';
const PATH_PREFIX = 'extensions/copilot';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface Options {
	prNumber: number;
	dryRun: boolean;
	verbose: boolean;
}

function parseArgs(): Options {
	const args = process.argv.slice(2);
	let prNumber: number | undefined;
	let dryRun = false;
	let verbose = false;

	for (const arg of args) {
		if (arg === '--dry-run') {
			dryRun = true;
		} else if (arg === '--verbose') {
			verbose = true;
		} else if (!prNumber && /^\d+$/.test(arg)) {
			prNumber = parseInt(arg, 10);
		} else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(1);
		}
	}

	if (!prNumber) {
		console.error('Usage: node build/copilot-migrate-pr.ts <PR_NUMBER> [--dry-run] [--verbose]');
		process.exit(1);
	}

	return { prNumber, dryRun, verbose };
}

interface Logger {
	info(message: string): void;
	detail(message: string): void;
	step(message: string): void;
	warn(message: string): void;
	success(message: string): void;
}

function createLogger(verbose: boolean): Logger {
	return {
		info: message => console.log(message),
		detail: message => {
			if (verbose) {
				console.log(`  ${message}`);
			}
		},
		step: message => console.log(`\n- ${message}`),
		warn: message => console.log(`! ${message}`),
		success: message => console.log(`\nDone: ${message}`),
	};
}

async function promptYesNo(question: string, defaultNo = true): Promise<boolean> {
	const rl = createInterface({ input, output });
	try {
		const suffix = defaultNo ? ' [y/N]: ' : ' [Y/n]: ';
		const answer = (await rl.question(`${question}${suffix}`)).trim().toLowerCase();

		if (!answer) {
			return !defaultNo;
		}

		return answer === 'y' || answer === 'yes';
	} finally {
		rl.close();
	}
}

async function waitForEnter(message: string): Promise<void> {
	const rl = createInterface({ input, output });
	try {
		await rl.question(`${message}\nPress Enter to continue...`);
	} finally {
		rl.close();
	}
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

function getCurrentRef(repoRoot: string): string {
	try {
		return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRoot).trim();
	} catch {
		return git(['rev-parse', 'HEAD'], repoRoot).trim();
	}
}

function checkoutRef(ref: string, repoRoot: string): void {
	git(['checkout', ref], repoRoot);
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

async function createBranchAndApplyDiff(
	prNumber: number,
	title: string,
	rewrittenDiff: string,
	repoRoot: string,
): Promise<string> {
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

		try {
			git(['apply', '--3way', tmpDiff], repoRoot);
		} catch {
			console.log('\nThe diff could not be applied cleanly.');
			console.log('Resolve merge conflicts in your working tree, then continue.');
			for (; ;) {
				await waitForEnter('After resolving conflicts and staging the changes, continue.');
				const unresolved = git(['diff', '--name-only', '--diff-filter=U'], repoRoot).trim();
				if (!unresolved) {
					break;
				}

				console.log('\nThese files still have unresolved conflicts:');
				for (const file of unresolved.split('\n')) {
					console.log(`  - ${file}`);
				}
			}
		}
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

function closeSourcePr(prNumber: number, targetPrUrl: string): void {
	const comment = `Superseded by ${targetPrUrl}`;
	gh([
		'pr', 'close', String(prNumber),
		'--repo', SOURCE_REPO,
		'--comment', comment,
	]);
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

async function main() {
	const { prNumber, dryRun, verbose } = parseArgs();
	const logger = createLogger(verbose);
	const repoRoot = path.dirname(import.meta.dirname);
	const originalRef = getCurrentRef(repoRoot);
	let shouldRestoreRef = false;

	try {
		logger.info(`Migrating PR #${prNumber} from ${SOURCE_REPO} to ${TARGET_REPO}`);
		logger.detail(`Starting ref: ${originalRef}`);
		logger.step('Fetching source PR metadata');
		const meta = fetchPrMetadata(prNumber);
		logger.info(`Title: ${meta.title}`);
		logger.detail(`Author: @${meta.author.login}`);
		logger.detail(`Base: ${meta.baseRefName} -> Head: ${meta.headRefName}`);
		logger.detail(`Draft: ${meta.isDraft}`);
		logger.detail(`Labels: ${meta.labels.map(l => l.name).join(', ') || '(none)'}`);
		logger.detail(`Assignees: ${meta.assignees.map(a => a.login).join(', ') || '(none)'}`);

		logger.step('Fetching and rewriting diff');
		const diff = fetchPrDiff(prNumber);
		const rewrittenDiff = rewriteDiff(diff);
		logger.detail(`Diff size: ${diff.length} bytes (rewritten: ${rewrittenDiff.length} bytes)`);

		if (dryRun) {
			logger.info('\n=== DRY RUN — Rewritten diff ===\n');
			console.log(rewrittenDiff);
			logger.info('\n=== DRY RUN — No changes were made ===');
			return;
		}

		logger.step('Creating branch and applying diff');
		const branchName = await createBranchAndApplyDiff(prNumber, meta.title, rewrittenDiff, repoRoot);
		shouldRestoreRef = true;
		logger.info(`Branch: ${branchName}`);

		logger.step('Pushing branch');
		pushBranch(branchName, repoRoot);

		logger.step(`Creating PR in ${TARGET_REPO}`);
		const prUrl = createPr(meta, branchName);
		logger.success(`PR created: ${prUrl}`);

		const closeOldPr = await promptYesNo(`Close source PR #${prNumber} in ${SOURCE_REPO}?`);
		if (closeOldPr) {
			try {
				closeSourcePr(prNumber, prUrl);
				logger.info(`Closed source PR #${prNumber}`);
			} catch (error) {
				logger.warn(`Failed to close source PR #${prNumber}: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else {
			logger.info(`Left source PR #${prNumber} open`);
		}
	} finally {
		if (shouldRestoreRef) {
			logger.step(`Restoring original ref (${originalRef})`);
			try {
				checkoutRef(originalRef, repoRoot);
				logger.info(`Checked out ${originalRef}`);
			} catch (error) {
				logger.warn(`Failed to restore original ref ${originalRef}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
