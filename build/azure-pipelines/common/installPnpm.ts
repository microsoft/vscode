/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Installs the pnpm version that the `packageManager` field of the root package.json pins, unless
 * it is already installed. The npm registry and its authentication must already be configured, so
 * that pnpm comes from the same registry as the dependencies.
 *
 * Runs the same on every platform, so `install-pnpm.yml` needs only one step per job.
 */

const ROOT = path.join(import.meta.dirname, '../../../');
const IS_WINDOWS = process.platform === 'win32';

/**
 * On Windows `npm` and `pnpm` are `.cmd` shims: Node doesn't resolve them through PATHEXT for
 * `spawn`, and since Node 20 (CVE-2024-27980) only spawns them with `shell: true`. The version is
 * validated before it is passed on.
 */
const NPM = IS_WINDOWS ? 'npm.cmd' : 'npm';
const PNPM = IS_WINDOWS ? 'pnpm.cmd' : 'pnpm';

const ATTEMPTS = 4;

/**
 * Returns the pnpm version from the `packageManager` field of the root package.json.
 */
export function getPinnedPnpmVersion(): string {
	const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
	const packageManager: unknown = packageJson.packageManager;
	const match = typeof packageManager === 'string' ? /^pnpm@(?<version>\d+\.\d+\.\d+)(?:\+.*)?$/.exec(packageManager) : null;
	if (!match?.groups) {
		throw new Error(`[install-pnpm] Expected "packageManager": "pnpm@<version>" in ${path.join(ROOT, 'package.json')}, found ${JSON.stringify(packageManager)}.`);
	}
	return match.groups.version;
}

function getInstalledPnpmVersion(): string | undefined {
	const result = spawnSync(PNPM, ['--version'], { encoding: 'utf8', shell: IS_WINDOWS });
	return result.status === 0 ? result.stdout.trim() : undefined;
}

function sleep(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Makes sure that the pinned pnpm version is the `pnpm` on PATH, installing it globally with npm
 * if needed. Retries the installation, as the pipeline step did before.
 */
export function ensurePnpm(): void {
	const version = getPinnedPnpmVersion();
	if (getInstalledPnpmVersion() !== version) {
		for (let attempt = 1; ; attempt++) {
			const result = spawnSync(NPM, ['install', '-g', `pnpm@${version}`], { stdio: 'inherit', shell: IS_WINDOWS });
			if (result.status === 0) {
				break;
			}
			if (attempt === ATTEMPTS) {
				throw new Error(`[install-pnpm] npm install -g pnpm@${version} failed ${ATTEMPTS} times.`);
			}
			console.log(`[install-pnpm] npm install -g pnpm@${version} failed (attempt ${attempt} of ${ATTEMPTS}), trying again...`);
			sleep(1000 * attempt * attempt);
		}
	}

	const installed = getInstalledPnpmVersion();
	if (installed !== version) {
		throw new Error(`[install-pnpm] Expected pnpm ${version} on PATH after installing it, found ${installed ?? 'none'}.`);
	}
	console.log(`[install-pnpm] pnpm ${installed}`);
}

if (import.meta.main) {
	ensurePnpm();
}
