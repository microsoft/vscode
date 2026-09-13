/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Builds one per-target tarball of the Foundry Local native runtime (the
 * Foundry Local / onnxruntime / onnxruntime-genai shared libraries). Callable
 * as both a Node library (`buildOne(...)`) and a thin
 * CLI (bottom of this file).
 *
 * The library form is what `produce.ts` calls during the per-platform
 * "Dictation runtime: build + upload" pipeline step; the CLI form is for local
 * one-off builds and requires `VSS_NUGET_ACCESSTOKEN` for the VS Code NuGet feed.
 *
 * The Foundry Local library is copied from the pinned `foundry-local-sdk`
 * package's `prebuilds/` (which ships every target), and the ONNX libraries are
 * fetched from NuGet for the requested target's RID via
 * `fetchDependencyLibraries`, so ANY build host can produce ANY target's tarball.
 *
 * The produced tarball's internal layout mirrors the runtime cache layout so the
 * runtime extraction is a plain untar:
 *
 *   prebuilds/<target>/<shared libraries>
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import { getRuntimeVersion, parseFlags, resolveSdkPackageRoot, SDK_PACKAGE_NAME, sha256OfFile, SUPPORTED_TARGETS } from './common.ts';
import { fetchDependencyLibraries, getStandardArtifacts, type IFoundryDependencyVersions, normalizeOrtLibraryName, requiredDependencyLibraryNames } from './nuget.ts';

const SCRIPT = 'package.ts';

const SDK_ROOT = resolveSdkPackageRoot();

export interface IBuildResult {
	readonly tgzPath: string;
	readonly sha256: string;
	readonly version: string;
	readonly sizeBytes: number;
}

export interface IBuildArgs {
	readonly target: string;
	readonly outDir: string;
}

/**
 * Build one runtime tarball for `args.target`. Copies the SDK's prebuilt native
 * files, fetches the matching ONNX libraries from NuGet, and tars them into a
 * single gzipped tarball. Returns the produced `.tgz` path and its sha256.
 */
export async function buildOne(args: IBuildArgs): Promise<IBuildResult> {
	if (!SUPPORTED_TARGETS.has(args.target)) {
		throw new Error(`[${SCRIPT}] Unknown target '${args.target}'. Supported: ${[...SUPPORTED_TARGETS].join(', ')}.`);
	}

	const version = getRuntimeVersion();
	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dictation-runtime-pkg-'));
	try {
		console.log(`[${SCRIPT}] Building ${SDK_PACKAGE_NAME}@${version} native runtime for ${args.target} in ${stagingDir}`);

		await stageSdkSharedLibraries(stagingDir, args.target);
		await stageDependencyLibraries(stagingDir, args.target);

		fs.mkdirSync(args.outDir, { recursive: true });
		const tgzPath = path.join(args.outDir, `${args.target}.tgz`);
		await buildTarball(stagingDir, tgzPath);

		const sha256 = await sha256OfFile(tgzPath);
		const sizeBytes = fs.statSync(tgzPath).size;

		console.log(`[${SCRIPT}] Wrote ${tgzPath} (${sizeBytes} bytes, sha256=${sha256})`);
		return { tgzPath, sha256, version, sizeBytes };
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

/**
 * Copy the Foundry Local shared library shipped in the SDK's prebuild directory
 * for `target`. The Node-API addons are bundled with the product.
 */
async function stageSdkSharedLibraries(stagingDir: string, target: string): Promise<void> {
	const sourceDir = path.join(SDK_ROOT, 'prebuilds', target);
	if (!fs.existsSync(sourceDir)) {
		throw new Error(`[${SCRIPT}] Prebuild directory not found for ${target} at ${sourceDir}. Is ${SDK_PACKAGE_NAME} installed?`);
	}
	const targetDir = path.join(stagingDir, 'prebuilds', target);
	fs.mkdirSync(targetDir, { recursive: true });
	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		if (entry.isFile() && isSharedLibrary(entry.name)) {
			fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
		}
	}
	for (const name of requiredSdkSharedLibraryNames(target)) {
		if (!fs.existsSync(path.join(targetDir, name))) {
			throw new Error(`[${SCRIPT}] SDK shared library '${name}' not found for ${target} in ${sourceDir}.`);
		}
	}
}

/**
 * Fetch the ONNX libraries for `target` into the same flat prebuild directory,
 * using that target's explicit RID. Host-independent — `target` need not match
 * the build host.
 */
async function stageDependencyLibraries(stagingDir: string, target: string): Promise<void> {
	const dependencies = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'deps_versions.json'), 'utf8')) as IFoundryDependencyVersions;
	const artifacts = getStandardArtifacts(dependencies);

	const targetDir = path.join(stagingDir, 'prebuilds', target);
	await fetchDependencyLibraries(target, artifacts, targetDir, { skipIfPresent: true });
	normalizeOrtLibraryName(targetDir, target, dependencies.onnxruntime.version);

	for (const name of requiredDependencyLibraryNames(target, dependencies)) {
		if (!fs.existsSync(path.join(targetDir, name))) {
			throw new Error(`[${SCRIPT}] Dependency library '${name}' missing after install for ${target} — refusing to build an incomplete tarball.`);
		}
	}
}

function requiredSdkSharedLibraryNames(target: string): readonly string[] {
	const foundryLocalLibrary = target.startsWith('win32-')
		? 'foundry_local.dll'
		: target.startsWith('darwin-')
			? 'libfoundry_local.dylib'
			: 'libfoundry_local.so';
	return [foundryLocalLibrary];
}

function isSharedLibrary(name: string): boolean {
	return name.endsWith('.dll') || name.includes('.dylib') || name.includes('.so');
}

/**
 * Build the gzipped tar via node-tar so the output is consistent regardless of
 * which host's system tar would otherwise be used. `portable`/`mtime` strip
 * host-specific metadata for reproducible bytes across re-runs on the same host.
 */
async function buildTarball(stagingDir: string, outTgz: string): Promise<void> {
	await tar.c(
		{
			file: outTgz,
			cwd: stagingDir,
			gzip: { level: 9 },
			portable: true,
			mtime: new Date(0),
		},
		['prebuilds'],
	);
}

// #region CLI entry point

function isCliInvocation(): boolean {
	return import.meta.filename === process.argv[1];
}

function parseCliArgs(): IBuildArgs {
	const flags = parseFlags(process.argv.slice(2));
	const target = flags.get('target');
	if (!target) {
		throw new Error('--target=<platform-arch> is required (e.g. --target=darwin-arm64)');
	}
	const outDir = flags.get('out') ?? path.resolve(process.cwd(), 'out');
	return { target, outDir };
}

if (isCliInvocation()) {
	buildOne(parseCliArgs()).catch(err => {
		console.error(err);
		process.exit(1);
	});
}

// #endregion
