/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pinnedRuntimeVersion, RUNTIME_REPO } from './copilotOverride.ts';
import { mintCloneTokenFromEnv } from './mintGithubAppToken.ts';
import { clearRuntimeSourceMarker, materializeRuntimeSourcePackage, resolvePinnedRuntimeCommit, writeRuntimeSourceMarker, writeRuntimeToken } from '../../lib/copilotRuntimeSource.ts';

/**
 * Scheduled verification that the runtime source-build path still works.
 *
 * That path otherwise runs only during an emergency, on agents that have never
 * exercised it — the worst possible time to discover it is broken. This builds
 * the commit the *currently pinned* runtime version was released from, rather
 * than a branch: `main` can be broken, whereas the pinned version is known good
 * and already shipping, so a failure here means the build integration
 * regressed rather than the runtime.
 *
 * Usage:
 *   node --experimental-strip-types build/azure-pipelines/common/verify-copilot-source-build.ts [--target=<platform>-<arch>]
 *
 * `--target` defaults to this host (e.g. `darwin-arm64`); pass an explicit
 * target to also cover a cross-compile.
 */

const ROOT = path.join(import.meta.dirname, '../../../');

function hostTarget(): string {
	// Node reports `linux` for both libc flavors; the glibc package is the
	// default and callers can ask for `linuxmusl-*` explicitly.
	return `${process.platform}-${process.arch}`;
}

function parseTarget(argv: readonly string[]): string {
	const flag = argv.find(arg => arg.startsWith('--target='));
	return flag ? flag.slice('--target='.length) : hostTarget();
}

async function main(): Promise<void> {
	const target = parseTarget(process.argv.slice(2));
	const version = pinnedRuntimeVersion(ROOT);
	console.log(`[verify-source-build] Pinned runtime is ${version}; verifying a source build for ${target}.`);

	const token = await mintCloneTokenFromEnv(RUNTIME_REPO);
	const ref = resolvePinnedRuntimeCommit(ROOT, token);

	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-source-verify-'));
	try {
		writeRuntimeSourceMarker(RUNTIME_REPO, ref);
		if (token) {
			writeRuntimeToken(token);
		}
		// Throws unless the produced package has the entry points and the native
		// addon VS Code depends on (see `assertPackageComplete`).
		materializeRuntimeSourcePackage(outDir, target);
		smokeRun(outDir, target);

		console.log(`[verify-source-build] OK: ${RUNTIME_REPO}@${ref} (${version}) built a complete ${target} package.`);
		console.log(`##vso[build.addbuildtag]copilot-source-verified=${target}`);
	} finally {
		clearRuntimeSourceMarker();
		fs.rmSync(outDir, { recursive: true, force: true });
	}
}

/**
 * Runs the built CLI, because a package can satisfy every structural assertion
 * and still fail to load (a native addon built against the wrong Node ABI, a
 * bundling regression). Skipped for cross-compiled targets, which cannot be
 * executed on this host.
 */
function smokeRun(packageDir: string, target: string): void {
	if (target !== hostTarget()) {
		console.log(`[verify-source-build] ${target} is cross-compiled; skipping the smoke run.`);
		return;
	}
	const entry = path.join(packageDir, 'index.js');
	const version = execFileSync(process.execPath, [entry, '--version'], { encoding: 'utf8', timeout: 120_000 }).trim();
	console.log(`[verify-source-build] smoke run: ${entry} --version -> ${version}`);
}

main().catch(err => {
	console.error(err instanceof Error ? err.stack ?? err.message : String(err));
	process.exit(1);
});
