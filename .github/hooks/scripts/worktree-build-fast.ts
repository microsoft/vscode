/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as dns from 'dns';

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

async function canAccessNuGetFeed(url: URL): Promise<boolean> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
		if (!response.ok) {
			await response.body?.cancel();
			process.stderr.write(`Cannot access ${url}: HTTP ${response.status}.\n`);
			return false;
		}

		const serviceIndex = await response.json() as { resources?: readonly { '@type'?: string }[] };
		if (!serviceIndex.resources?.some(resource => resource['@type']?.startsWith('PackageBaseAddress/3.0.0'))) {
			process.stderr.write(`Cannot access ${url}: NuGet package base address is missing.\n`);
			return false;
		}

		return true;
	} catch (error) {
		process.stderr.write(`Cannot access ${url}: ${error instanceof Error ? error.message : String(error)}\n`);
		return false;
	}
}

const repositoryRoot = runGit(['rev-parse', '--show-toplevel'], process.cwd());
if (!repositoryRoot) {
	process.stderr.write('Cannot inspect the Git worktree; skipping the best-effort agentStop hook.\n');
	process.exit(0);
}

const gitDirectory = runGit(['rev-parse', '--path-format=absolute', '--git-dir'], repositoryRoot);
const commonDirectory = gitDirectory
	? runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], repositoryRoot)
	: undefined;

if (!gitDirectory || !commonDirectory) {
	process.stderr.write('Cannot inspect the Git worktree; skipping the best-effort agentStop hook.\n');
	process.exit(0);
}

if (gitDirectory === commonDirectory) {
	process.exit(0);
}

const npmRegistry = new URL('https://registry.npmjs.org');
let canResolveNpmRegistry = false;
try {
	await dns.promises.lookup(npmRegistry.hostname);
	canResolveNpmRegistry = true;
} catch (error) {
	process.stderr.write(`Cannot resolve ${npmRegistry.origin}; skipping npm install: ${error instanceof Error ? error.message : String(error)}\n`);
}

if (canResolveNpmRegistry) {
	const publicNuGetFeed = new URL('https://api.nuget.org/v3/index.json');
	if (await canAccessNuGetFeed(publicNuGetFeed)) {
		if (!runNpm(['install'], repositoryRoot)) {
			process.stderr.write('npm install failed; continuing with the best-effort agentStop hook.\n');
		}
	} else {
		process.stderr.write('Cannot access the public NuGet feed; skipping npm install.\n');
	}
}

if (!runNpm(['run', 'build-fast'], repositoryRoot)) {
	process.stderr.write('npm run build-fast failed; continuing with the best-effort agentStop hook.\n');
}

process.exit(0);
