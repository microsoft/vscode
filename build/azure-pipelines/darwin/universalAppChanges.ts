/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Decides whether a CI build checks the macOS universal app (see product-build-darwin-universal-ci.yml),
// which only the macOS (UNIVERSAL) job of the product build checked before: when a commit that the build
// adds can change how the x64 and arm64 clients are packaged or merged. Without a list of those commits,
// for example for a build of the same commit again, or when the list cannot be read, it checks the app.
// Uses only Node built-ins, so it runs before any installation.

/** The files, besides the build scripts of the packaging, whose changes can affect the packaged clients or their merge. */
const affectingFiles = [
	/^build\/darwin\//,
	/^build\/azure-pipelines\/darwin\//,
	/^build\/\.moduleignore/,
	/^(?:build\/)?(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.pnpmfile\.mjs)$/,
	// The Node.js version of the build
	/^\.nvmrc$/,
	// How the built-in extensions are bundled and which of their files ship (build/lib/extensions.ts)
	/^extensions\/[^/]+\/(?:\.?esbuild[\w.]*\.mts|\.vscodeignore)$/,
	/^extensions\/esbuild-[\w-]+\.mts$/,
];

/**
 * The build scripts that package the client (build/gulpfile.vscode.ts) and merge the clients
 * (create-universal-app.ts), the esbuild scripts that bundle the built-in extensions (build/lib/extensions.ts loads them by file name),
 * and the files that they import, transitively, relative to the repository.
 */
export function packagingFiles(root: string): Set<string> {
	const files = new Set<string>();
	const pending = ['build/gulpfile.vscode.ts', 'build/darwin/create-universal-app.ts'];
	for (const extension of readdirSync(path.join(root, 'extensions'), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
		for (const file of readdirSync(path.join(root, 'extensions', extension.name))) {
			if (/^\.?esbuild[\w.]*\.mts$/.test(file)) {
				pending.push(`extensions/${extension.name}/${file}`);
			}
		}
	}
	const relativeImport = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm;
	while (pending.length) {
		const file = pending.pop()!;
		if (files.has(file)) {
			continue;
		}
		files.add(file);
		for (const [, specifier] of readFileSync(path.join(root, file), 'utf8').matchAll(relativeImport)) {
			const target = path.posix.join(path.posix.dirname(file), specifier);
			if (/\.(?:ts|mts|js|mjs|cjs|json)$/.test(target) && existsSync(path.join(root, target))) {
				pending.push(target);
			}
		}
	}
	return files;
}

export function affectsUniversalApp(file: string, packaging: ReadonlySet<string>): boolean {
	return packaging.has(file) || affectingFiles.some(pattern => pattern.test(file));
}

async function getBuildCommits(): Promise<string[]> {
	const { SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT, BUILD_BUILDID, SYSTEM_ACCESSTOKEN } = process.env;
	if (!SYSTEM_COLLECTIONURI || !SYSTEM_TEAMPROJECT || !BUILD_BUILDID || !SYSTEM_ACCESSTOKEN) {
		throw new Error('Missing SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT, BUILD_BUILDID or SYSTEM_ACCESSTOKEN');
	}
	// The commits since the previous build of the branch
	const res = await fetch(`${SYSTEM_COLLECTIONURI.replace(/\/?$/, '/')}${encodeURIComponent(SYSTEM_TEAMPROJECT)}/_apis/build/builds/${BUILD_BUILDID}/changes?$top=100&api-version=7.1`, {
		headers: { Authorization: `Bearer ${SYSTEM_ACCESSTOKEN}` },
		signal: AbortSignal.timeout(30 * 1000),
	});
	if (!res.ok) {
		throw new Error(`Unexpected status code: ${res.status}`);
	}
	const { value } = await res.json() as { readonly value: readonly { readonly id: string; readonly type: string }[] };
	return value.filter(change => /^[0-9a-f]{40}$/.test(change.id)).map(change => change.id);
}

/** The files that the commits change, from a shallow clone of the build's commit. */
function getChangedFiles(head: string, commits: readonly string[]): string[] {
	// The commits and their parents, which the checkout (fetchDepth 1) doesn't have
	execFileSync('git', ['fetch', '--no-tags', `--depth=${commits.length + 1}`, 'origin', head], { stdio: 'inherit', timeout: 3 * 60 * 1000 });
	return commits.flatMap(commit => execFileSync('git', ['diff-tree', '-r', '-m', '--no-commit-id', '--name-only', commit], { encoding: 'utf8' }).split('\n').filter(Boolean));
}

/** Runs fn up to the given number of attempts, so that the job reaches the fallback well before its timeout. */
async function withAttempts<T>(attempts: number, fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= attempts) {
				throw err;
			}
			console.log(`Attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

async function main(): Promise<void> {
	let affected = true;
	try {
		const head = process.env.BUILD_SOURCEVERSION;
		if (!head) {
			throw new Error('Missing BUILD_SOURCEVERSION');
		}
		const commits = await withAttempts(3, getBuildCommits);
		// The changes API lists at most 100 commits
		if (commits.length === 0 || commits.length >= 100) {
			console.log(`The build adds ${commits.length || 'no'} commits, so it checks the universal app.`);
		} else {
			const packaging = packagingFiles(process.cwd());
			const files = getChangedFiles(head, commits).filter(file => affectsUniversalApp(file, packaging));
			affected = files.length > 0;
			console.log(affected
				? `These changes of the ${commits.length} commits of the build can affect the universal app:\n${[...new Set(files)].map(file => `  ${file}`).join('\n')}`
				: `No change of the ${commits.length} commits of the build can affect the universal app.`);
		}
	} catch (err) {
		console.log(`##vso[task.logissue type=warning]Could not list the changes of the build, so it checks the universal app: ${err instanceof Error ? err.message : String(err)}`);
	}
	console.log(`##vso[task.setvariable variable=AFFECTED;isOutput=true]${affected}`);
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exitCode = 1;
	});
}
