/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync, SpawnSyncOptions } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

interface ESLintMessage {
	ruleId: string | null;
	severity: number;
	message: string;
	line: number;
	column: number;
}

interface ESLintResult {
	filePath: string;
	messages: ESLintMessage[];
}

interface CommitHandleCache {
	[commit: string]: string;
}

const owner = 'microsoft';
const repo = 'vscode-copilot-chat';
const repoRoot = path.resolve(__dirname, '../..');
const alternateRepoRoot = path.resolve(repoRoot, '..', 'vscode-copilot');
const lintCacheDir = path.join(repoRoot, '.lint-cache');
const lintOutputPath = path.join(lintCacheDir, 'eslint-output.json');
const commitHandleCachePath = path.join(lintCacheDir, 'commit-handles.json');
const failedHandleCommits = new Set<string>();
const alternateRepoHandleCache = new Map<string, string | null>();

let alternateRepoAvailability: boolean | undefined;

void main().catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});

async function main(): Promise<void> {
	await fs.mkdir(lintCacheDir, { recursive: true });

	const { cacheKey, results } = await getLintResults();
	const violatingFiles = collectViolations(results);

	if (!violatingFiles.size) {
		console.log('No ESLint violations detected.');
		return;
	}

	const commitHandles = await loadCommitHandles();
	let cacheDirty = false;
	const reportLines: string[] = [];

	for (const [file, messages] of violatingFiles) {
		const resolvedMessages: { message: ESLintMessage; username: string }[] = [];

		for (const message of messages) {
			const handle = await resolveHandleForMessage(file, message.line, commitHandles);
			if (handle.commit) {
				commitHandles[handle.commit] = handle.username;
			}
			cacheDirty = cacheDirty || handle.isNew;
			resolvedMessages.push({ message, username: handle.username });
		}

		const uniqueHandles = new Set(resolvedMessages.map(entry => entry.username));
		if (uniqueHandles.size === 1 && resolvedMessages.length) {
			const onlyHandle = resolvedMessages[0].username;
			reportLines.push(`- [ ] ${file} @${onlyHandle}`);
		} else {
			reportLines.push(`- [ ] ${file}`);
			for (const { message, username } of resolvedMessages) {
				reportLines.push(formatReportLine(message, username));
			}
		}
		reportLines.push('');
	}

	if (cacheDirty) {
		await fs.writeFile(commitHandleCachePath, JSON.stringify(commitHandles, null, 2), 'utf8');
	}

	await updateEslintIgnores(Array.from(violatingFiles.keys()));

	console.log(reportLines.join('\n'));
	console.log(`Cached lint results key: ${cacheKey}`);
}

async function getLintResults(): Promise<{ cacheKey: string; results: ESLintResult[] }> {
	const gitHead = runGit(['rev-parse', 'HEAD']);
	const gitStatus = runGit(['status', '--porcelain']);
	const cacheKey = createHash('sha1').update(`${gitHead}\n${gitStatus}`).digest('hex');
	const cacheFile = path.join(lintCacheDir, `${cacheKey}.json`);

	if (await fileExists(cacheFile)) {
		const cached = await fs.readFile(cacheFile, 'utf8');
		return { cacheKey, results: JSON.parse(cached) as ESLintResult[] };
	}

	await fs.rm(lintOutputPath, { force: true });
	runLintCommand();

	const lintOutput = await fs.readFile(lintOutputPath, 'utf8');
	const parsed = JSON.parse(lintOutput) as ESLintResult[];
	await fs.writeFile(cacheFile, JSON.stringify(parsed, null, 2), 'utf8');

	return { cacheKey, results: parsed };
}

function runLintCommand(): void {
	const cacheLocation = path.join(lintCacheDir, '.eslintcache');
	const args = ['run', 'lint', '--', '--format', 'json', '--output-file', lintOutputPath, '--cache', '--cache-location', cacheLocation];
	const result = spawnSync('npm', args, spawnOptions());

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0 && result.status !== 1) {
		throw new Error(`npm run lint failed with exit code ${result.status ?? 'unknown'}`);
	}
}

function spawnOptions(): SpawnSyncOptions {
	return {
		cwd: repoRoot,
		stdio: 'inherit'
	};
}

function collectViolations(results: ESLintResult[]): Map<string, ESLintMessage[]> {
	const violations = new Map<string, ESLintMessage[]>();

	for (const result of results) {
		const relevantMessages = result.messages.filter(message => message.severity > 0);
		if (!relevantMessages.length) {
			continue;
		}

		const relativeFile = toPosixPath(path.relative(repoRoot, result.filePath));
		const prefixed = relativeFile.startsWith('.') ? relativeFile : `./${relativeFile}`;
		violations.set(prefixed, relevantMessages);
	}

	return violations;
}

async function loadCommitHandles(): Promise<CommitHandleCache> {
	if (!(await fileExists(commitHandleCachePath))) {
		return {};
	}

	const raw = await fs.readFile(commitHandleCachePath, 'utf8');
	try {
		return JSON.parse(raw) as CommitHandleCache;
	} catch (error) {
		console.warn('Failed to parse commit handle cache, starting fresh.');
		return {};
	}
}

interface HandleResolution {
	commit?: string;
	username: string;
	isNew: boolean;
}

async function resolveHandleForMessage(file: string, line: number, cache: CommitHandleCache): Promise<HandleResolution> {
	let blameCommit: string | undefined;
	try {
		blameCommit = extractCommitHash(runGit(['blame', '--line-porcelain', '-L', `${line},${line}`, file]));
	} catch (error) {
		throw new Error(`Failed to run git blame for ${file}:${line}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const blameHandle = await getHandleForCommit(blameCommit, cache);

	if (blameHandle && blameHandle.username !== 'kieferrm') {
		return { commit: blameCommit, username: blameHandle.username, isNew: blameHandle.isNew };
	}

	if (blameHandle && blameHandle.username === 'kieferrm') {
		const alternateHandle = await resolveHandleFromAlternateRepo(file);
		if (alternateHandle) {
			return { username: alternateHandle, isNew: false };
		}
	}

	let lastCommit: string | undefined;
	try {
		lastCommit = extractCommitHash(runGit(['log', '-n', '1', '--pretty=format:%H', '--', file]));
	} catch (error) {
		throw new Error(`Failed to find last change for ${file}: ${error instanceof Error ? error.message : String(error)}`);
	}

	const fallbackHandle = await getHandleForCommit(lastCommit, cache);
	if (fallbackHandle) {
		if (fallbackHandle.username === 'kieferrm') {
			const alternateHandle = await resolveHandleFromAlternateRepo(file);
			if (alternateHandle) {
				return { username: alternateHandle, isNew: false };
			}
		}
		return { commit: lastCommit, username: fallbackHandle.username, isNew: fallbackHandle.isNew };
	}

	return { username: 'kieferrm', isNew: false };
}

interface CommitHandleLookup {
	username: string;
	isNew: boolean;
}


async function getHandleForCommit(commit: string | undefined, cache: CommitHandleCache): Promise<CommitHandleLookup | undefined> {
	if (!commit) {
		return undefined;
	}

	if (cache[commit]) {
		return { username: cache[commit], isNew: false };
	}

	if (failedHandleCommits.has(commit)) {
		return undefined;
	}

	let login: string | undefined;
	const env = {
		...process.env,
		GH_PAGER: 'cat',
		GH_PROMPT_DISABLED: '1'
	};

	const response = spawnSync('gh', ['api', `/repos/${owner}/${repo}/commits/${commit}`], {
		cwd: repoRoot,
		encoding: 'utf8',
		env
	});

	if (response.status === 0 && response.stdout) {
		try {
			const data = JSON.parse(response.stdout);
			login = data.author?.login ?? data.committer?.login ?? data.commit?.author?.name;
		} catch (error) {
			console.warn(`Failed to parse GitHub API response for commit ${commit}`);
		}
	} else if (response.status !== 0) {
		const stderr = typeof response.stderr === 'string' ? response.stderr.trim() : '';
		console.warn(`gh api commit ${commit} exited with code ${response.status}${stderr ? `: ${stderr}` : ''}`);
	}

	if (!login) {
		login = getHandleFromLocalGit(commit);
	}

	if (!login) {
		failedHandleCommits.add(commit);
		console.warn(`Unable to resolve GitHub handle for commit ${commit}`);
		return undefined;
	}

	const normalized = normalizeHandle(login);
	cache[commit] = normalized;
	return { username: normalized, isNew: true };
}

function getHandleFromLocalGit(commit: string): string | undefined {
	try {
		const email = runGit(['show', '-s', '--format=%ae', commit]);
		const handleFromEmail = extractHandleFromEmail(email);
		if (handleFromEmail) {
			return handleFromEmail;
		}
		const author = runGit(['show', '-s', '--format=%an', commit]);
		return normalizePossibleHandle(author);
	} catch {
		return undefined;
	}
}

function extractHandleFromEmail(email: string): string | undefined {
	const noreplyPattern = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/;
	const match = email.match(noreplyPattern);
	if (match) {
		return match[1];
	}
	return undefined;
}

function normalizePossibleHandle(name: string): string | undefined {
	const normalized = name.trim();
	if (!normalized || /\s/.test(normalized)) {
		return undefined;
	}
	return normalized;
}

function normalizeHandle(handle: string): string {
	return handle.startsWith('@') ? handle.substring(1) : handle;
}

function extractCommitHash(blameOutput: string): string | undefined {
	const firstLine = blameOutput.split('\n')[0]?.trim();
	if (!firstLine) {
		return undefined;
	}

	const commit = firstLine.split(' ')[0];
	if (!commit || /^[0]+$/.test(commit)) {
		return undefined;
	}

	return commit.startsWith('^') ? commit.substring(1) : commit;
}

function formatReportLine(message: ESLintMessage, handle: string): string {
	const rule = message.ruleId ?? '';
	const column = message.column ?? 0;
	const line = `${message.line}:${column}`;
	const components = [`  - [ ] ${line}`];
	if (rule) {
		components.push(rule);
	}
	if (handle) {
		components.push(`@${handle}`);
	}
	return components.join('  ');
}

async function updateEslintIgnores(files: string[]): Promise<void> {
	if (!files.length) {
		return;
	}

	const configPath = path.join(repoRoot, 'ignores.md');
	const nextContent = files.map(file => `'${file}'`).join(',\n');
	await fs.writeFile(configPath, nextContent, 'utf8');
}

function toPosixPath(input: string): string {
	return input.split(path.sep).join('/');
}

function runGit(args: string[]): string {
	return runGitCommand(repoRoot, args);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveHandleFromAlternateRepo(file: string): Promise<string | undefined> {
	if (alternateRepoHandleCache.has(file)) {
		const cached = alternateRepoHandleCache.get(file);
		return cached ?? undefined;
	}

	if (!(await hasAlternateRepo())) {
		alternateRepoHandleCache.set(file, null);
		return undefined;
	}

	const relativeFile = file.startsWith('./') ? file.substring(2) : file;
	const fileForGit = relativeFile.split('/').join(path.sep);
	const absolutePath = path.join(alternateRepoRoot, fileForGit);

	if (!(await fileExists(absolutePath))) {
		alternateRepoHandleCache.set(file, null);
		return undefined;
	}

	try {
		const lastCommit = runGitCommand(alternateRepoRoot, ['log', '-n', '1', '--pretty=format:%H', '--', fileForGit]);
		if (!lastCommit) {
			alternateRepoHandleCache.set(file, null);
			return undefined;
		}

		const email = runGitCommand(alternateRepoRoot, ['show', '-s', '--format=%ae', lastCommit]);
		const handleFromEmail = extractHandleFromEmail(email);
		let resolvedHandle = handleFromEmail ? normalizeHandle(handleFromEmail) : undefined;

		if (!resolvedHandle) {
			const author = runGitCommand(alternateRepoRoot, ['show', '-s', '--format=%an', lastCommit]);
			const possibleHandle = normalizePossibleHandle(author);
			if (possibleHandle) {
				resolvedHandle = normalizeHandle(possibleHandle);
			}
		}

		if (resolvedHandle) {
			alternateRepoHandleCache.set(file, resolvedHandle);
			return resolvedHandle;
		}
	} catch (error) {
		console.warn(`Failed to resolve alternate repo handle for ${file}${error instanceof Error ? `: ${error.message}` : ''}`);
	}

	alternateRepoHandleCache.set(file, null);
	return undefined;
}

async function hasAlternateRepo(): Promise<boolean> {
	if (alternateRepoAvailability !== undefined) {
		return alternateRepoAvailability;
	}

	try {
		const stats = await fs.stat(alternateRepoRoot);
		alternateRepoAvailability = stats.isDirectory();
	} catch {
		alternateRepoAvailability = false;
	}

	return alternateRepoAvailability;
}

function runGitCommand(cwd: string, args: string[]): string {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8'
	});

	if (result.status !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
	}

	return (result.stdout ?? '').trim();
}
