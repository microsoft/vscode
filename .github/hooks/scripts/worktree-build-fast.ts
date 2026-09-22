/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as fs from 'fs';

function readStopHookActive(): boolean {
	if (process.stdin.isTTY) {
		return false;
	}

	const input = fs.readFileSync(0, 'utf8').trim();
	if (!input) {
		return false;
	}

	try {
		const hookInput = JSON.parse(input) as { stop_hook_active?: boolean; stopHookActive?: boolean };
		return hookInput.stop_hook_active === true || hookInput.stopHookActive === true;
	} catch (error) {
		process.stderr.write(`Cannot parse the agentStop hook input: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(2);
	}
}

function fail(reason: string, stopHookActive: boolean): never {
	if (stopHookActive) {
		process.stderr.write(`${reason}\n`);
		process.exit(1);
	}

	process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
	process.exit(0);
}

function runGit(args: readonly string[], cwd: string): string | undefined {
	const result = child_process.spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});

	if (result.error) {
		process.stderr.write(`${result.error.message}\n`);
		return undefined;
	}

	return result.status === 0 ? result.stdout.trim() : undefined;
}

function runNpm(args: readonly string[], cwd: string): boolean {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const result = child_process.spawnSync(npm, args, {
		cwd,
		stdio: ['ignore', process.stderr, process.stderr],
		shell: process.platform === 'win32',
	});

	if (result.error) {
		process.stderr.write(`${result.error.message}\n`);
		return false;
	}

	return result.status === 0;
}

const stopHookActive = readStopHookActive();

const repositoryRoot = runGit(['rev-parse', '--show-toplevel'], process.cwd());
if (!repositoryRoot) {
	fail('Cannot inspect the Git worktree. Run git rev-parse --show-toplevel to inspect the errors and fix repository access before finishing. Do not disable this hook or bypass the failure.', stopHookActive);
}

const gitDirectory = runGit(['rev-parse', '--path-format=absolute', '--git-dir'], repositoryRoot);
const commonDirectory = gitDirectory
	? runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], repositoryRoot)
	: undefined;

if (!gitDirectory || !commonDirectory) {
	fail('Cannot inspect the Git worktree. Run git rev-parse --path-format=absolute --git-dir and git rev-parse --path-format=absolute --git-common-dir to inspect the errors and fix repository access before finishing. Do not disable this hook or bypass the failure.', stopHookActive);
}

if (gitDirectory === commonDirectory) {
	process.exit(0);
}

if (!runNpm(['install'], repositoryRoot)) {
	fail('npm install failed. Run it to inspect the errors and fix dependency installation before building. Do not disable this hook or bypass the failure.', stopHookActive);
}

if (!runNpm(['run', 'build-fast'], repositoryRoot)) {
	fail('npm run build-fast failed. Run it to inspect the errors, fix the underlying issue, and finish only after it passes. Do not disable this hook or weaken the build to bypass the failure.', stopHookActive);
}

process.exit(0);
