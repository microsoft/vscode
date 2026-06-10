/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared types and helpers across `build/agent-sdk/*.ts`. Kept tiny on purpose
 * — every entry exists to remove duplication between two or more scripts.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** SDKs distributed by `build/agent-sdk/`. */
export type Sdk = 'claude' | 'codex';

/**
 * The npm registry package each SDK is published under. Used by `package.ts`
 * to drive `npm install <packageName>@<version>` for the foreign-platform
 * matrix entry.
 */
export const PACKAGE_NAME: { readonly [K in Sdk]: string } = {
	claude: '@anthropic-ai/claude-agent-sdk',
	codex: '@openai/codex',
};

/**
 * Resolves the pinned SDK version from the repo-root `package.json` devDeps.
 * Bumping the devDep is the entire "land a new SDK" workflow — the next
 * pipeline run picks up the new version, produces new content-addressed
 * tarballs, uploads them, and `aggregate.ts` prints the shas for a human
 * to paste into vscode-distro's `product.json`.
 *
 * Both SDKs MUST be pinned to exact versions (no `^` or `~` ranges) in
 * `package.json`. Caret ranges would let `npm install` resolve different
 * versions across runs, breaking the "this build is reproducible given
 * the same inputs" contract.
 *
 * We deliberately do NOT pin transitive deps via a committed package-lock
 * for the build's scratch install: day-to-day drift in Claude's transitive
 * resolutions surfaces at upload time as a sha mismatch, where a human
 * investigates.
 */
export function getSdkVersion(sdk: Sdk): string {
	// ESM equivalent of `__dirname` — `build/agent-sdk/`. Two `..` segments
	// up to the repo root, then `package.json`.
	const thisDir = path.dirname(fileURLToPath(import.meta.url));
	const packageJsonPath = path.resolve(thisDir, '..', '..', 'package.json');
	const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
		devDependencies?: Record<string, string>;
	};
	const version = json.devDependencies?.[PACKAGE_NAME[sdk]];
	if (!version) {
		throw new Error(`Cannot resolve ${sdk} SDK version: ${PACKAGE_NAME[sdk]} is not in repo-root package.json devDependencies`);
	}
	// Reject range specifiers — exact pins only. A `^0.3.168` would let
	// npm resolve a different version every day; the whole point of the
	// build pipeline is to publish a known sha for a known version.
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		throw new Error(`Refusing to use ${PACKAGE_NAME[sdk]}@${version} from package.json: must be an exact version (no ^ or ~ ranges)`);
	}
	return version;
}

/**
 * The `(sdk, sdkTarget)` matrix this pipeline supports — read live from each
 * SDK's own `optionalDependencies` in `node_modules`. The SDK is what
 * declares which platforms it ships, so we ask it directly instead of
 * keeping a parallel list here that would silently drift.
 *
 * Requires the repo-root `npm install` to have run (the SDKs are devDeps
 * in `package.json`). All pipeline jobs run after the standard install
 * step so `node_modules/<sdk-package>/` exists for them to read.
 */
export function getTargets(sdk: Sdk): readonly string[] {
	const thisDir = path.dirname(fileURLToPath(import.meta.url));
	const sdkPackageJson = path.resolve(thisDir, '..', '..', 'node_modules', PACKAGE_NAME[sdk], 'package.json');
	const json = JSON.parse(fs.readFileSync(sdkPackageJson, 'utf8')) as {
		optionalDependencies?: Record<string, string>;
	};
	const prefix = `${PACKAGE_NAME[sdk]}-`;
	const targets: string[] = [];
	for (const name of Object.keys(json.optionalDependencies ?? {})) {
		if (name.startsWith(prefix)) {
			targets.push(name.slice(prefix.length));
		}
	}
	if (targets.length === 0) {
		throw new Error(`No platform packages found in ${sdkPackageJson}'s optionalDependencies (expected entries starting with '${prefix}')`);
	}
	return targets.sort();
}

export function fail(script: string, msg: string): never {
	console.error(`[${script}] ${msg}`);
	process.exit(1);
}

/**
 * Parse `--key=value` flags from argv into a Map. Unknown / non-matching args
 * are silently ignored — callers validate which keys they require.
 */
export function parseFlags(argv: readonly string[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const arg of argv) {
		const match = /^--([a-zA-Z-]+)=(.+)$/.exec(arg);
		if (match) {
			out.set(match[1], match[2]);
		}
	}
	return out;
}

export function parseSdk(value: string | undefined, script: string): Sdk {
	if (value !== 'claude' && value !== 'codex') {
		fail(script, `--sdk must be 'claude' or 'codex'; got '${value}'`);
	}
	return value;
}

export function parseTarget(sdk: Sdk, value: string | undefined, script: string): string {
	if (!value) {
		fail(script, `--target is required`);
	}
	const targets = getTargets(sdk);
	if (!targets.includes(value)) {
		fail(script, `--target='${value}' is not a supported ${sdk} target. Expected one of: ${targets.join(', ')}`);
	}
	return value;
}

/**
 * Sidecar metadata written by `package.ts` next to each `<sdk>-<version>-<target>.tgz`.
 * Read by `upload.ts` (populates blob `metadata.sha256` + does the HEAD-skip
 * comparison) and by `aggregate.ts` (builds the `product.agentSdks` fragment).
 *
 * One file = one source of truth for everything downstream needs about a
 * built tarball.
 */
export interface ITarballSidecar {
	readonly sdk: Sdk;
	readonly sdkVersion: string;
	readonly sdkTarget: string;
	readonly sha256: string;
}

/** Filename convention: `<sdk>-<sdkVersion>-<sdkTarget>.tgz.json`. */
export function sidecarPathFor(tarballPath: string): string {
	return `${tarballPath}.json`;
}

export function writeSidecar(tarballPath: string, sidecar: ITarballSidecar): void {
	fs.writeFileSync(sidecarPathFor(tarballPath), JSON.stringify(sidecar, null, 2) + '\n');
}

export function readSidecar(sidecarPath: string, script: string): ITarballSidecar {
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
	} catch (err) {
		fail(script, `Cannot read sidecar ${sidecarPath}: ${(err as Error).message}`);
	}
	const obj = parsed as Partial<ITarballSidecar>;
	if (
		(obj.sdk !== 'claude' && obj.sdk !== 'codex') ||
		typeof obj.sdkVersion !== 'string' ||
		typeof obj.sdkTarget !== 'string' ||
		typeof obj.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(obj.sha256)
	) {
		fail(script, `Sidecar ${sidecarPath} is malformed: ${JSON.stringify(parsed)}`);
	}
	return obj as ITarballSidecar;
}

/** Lists every `*.tgz.json` sidecar in `dir`, recursing into subdirectories.
 *  Recursion makes us forgiving of the artifact-staging layout (Azure
 *  Pipelines drops each per-target artifact under its own subdir). */
export function listSidecars(dir: string, script: string): readonly ITarballSidecar[] {
	if (!fs.existsSync(dir)) {
		fail(script, `Sidecar directory does not exist: ${dir}`);
	}
	const out: ITarballSidecar[] = [];
	const walk = (current: string) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && entry.name.endsWith('.tgz.json')) {
				out.push(readSidecar(full, script));
			}
		}
	};
	walk(dir);
	return out;
}

/** Streams `filePath` into a sha256 hasher. Avoids reading the whole file
 *  into memory — agent SDK tarballs are 50-100MB. */
export function sha256OfFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		const stream = fs.createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}
