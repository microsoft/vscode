/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-(vscode-platform, arch) agent-SDK producer. Builds the tarballs needed
 * by ONE VS Code build, optionally uploads them to the CDN, and writes a
 * small JSON results file that the gulpfile-side `packageTask` reads to
 * stamp `product.json`'s `agentSdks` field.
 *
 * Run as a pipeline step BEFORE the gulp packaging step on the same agent
 * (via `build/azure-pipelines/common/agent-sdk-produce.yml`).
 *
 * Behavior split by VSCODE_PUBLISH:
 *
 *   - VSCODE_PUBLISH=true (real release builds): build → upload (HEAD-then-
 *     decide idempotent) → write results JSON → emit task.setvariable so
 *     the gulp step stamps product.agentSdks.
 *
 *   - VSCODE_PUBLISH unset / not 'true' (PR / CI / test runs): build only.
 *     Tarballs stay on disk at `.build/agent-sdk/tarballs/` so the pipeline
 *     can publish them as artifacts for inspection, but no CDN upload
 *     happens and no results file is written — so product.json ships
 *     without `agentSdks` and the runtime stays on the dev-override path,
 *     same as a local `npm run gulp` invocation.
 *
 * Each (sdk, sdkTarget) pair has exactly one producer per pipeline run —
 * `darwin-arm64` is only built by the macOS arm64 job, `linux-x64-musl`
 * only by the Alpine x64 job, etc. So there's no cross-host race over
 * the same blob, and the HEAD-then-fail in `upload.ts` is purely a
 * defense against re-runs with drifted bytes (toolchain change, etc.).
 *
 * For VS Code builds where no SDK applies (e.g. armhf), exits with an
 * empty result set. product.json ships without `agentSdks` regardless of
 * VSCODE_PUBLISH.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
	buildCdnUrlTemplate,
	getSdks,
	getSdkTargetForBuild,
	type IAgentSdkResults,
	KNOWN_VSCODE_PLATFORMS,
	parseFlags,
	type Sdk,
	type VscodeBuildPlatform,
} from './common.ts';
import { type IBuildResult, buildOne } from './package.ts';
import { uploadOne } from './upload.ts';

const SCRIPT = 'produce.ts';

interface ICliArgs {
	readonly vscodePlatform: VscodeBuildPlatform;
	readonly arch: string;
	readonly resultsFile: string;
	readonly tarballsDir: string;
	readonly upload: boolean;
}

function parseCliArgs(): ICliArgs {
	const flags = parseFlags(process.argv.slice(2));
	const vscodePlatform = flags.get('vscode-platform');
	if (!vscodePlatform || !KNOWN_VSCODE_PLATFORMS.has(vscodePlatform as VscodeBuildPlatform)) {
		const known = [...KNOWN_VSCODE_PLATFORMS].join('|');
		throw new Error(`--vscode-platform=<${known}> is required (got '${vscodePlatform ?? ''}')`);
	}
	const arch = flags.get('arch');
	if (!arch) {
		throw new Error('--arch=<x64|arm64|armhf|...> is required');
	}
	// Upload only on real publish builds. VSCODE_PUBLISH is a pipeline
	// variable set to 'True' on publish runs and 'False' otherwise; Azure
	// Pipelines auto-injects it into every script step's env.
	const upload = (process.env.VSCODE_PUBLISH ?? '').toLowerCase() === 'true';
	// Stable, well-known paths so the pipeline can pick the tarballs up as
	// an artifact and the gulp step can find the results JSON via env.
	const tarballsDir = path.resolve(process.cwd(), '.build/agent-sdk/tarballs');
	const resultsFile = process.env.AGENT_SDK_RESULTS_FILE
		?? path.resolve(process.cwd(), `.build/agent-sdk/${vscodePlatform}-${arch}.json`);
	return { vscodePlatform: vscodePlatform as VscodeBuildPlatform, arch, resultsFile, tarballsDir, upload };
}

async function main(): Promise<void> {
	const args = parseCliArgs();
	console.log(`[${SCRIPT}] VSCODE_PUBLISH=${process.env.VSCODE_PUBLISH ?? '<unset>'} → upload=${args.upload}`);

	fs.mkdirSync(args.tarballsDir, { recursive: true });

	const results: IAgentSdkResults = {};
	const sdks = getSdks();
	const produced = await Promise.all(
		sdks.map(sdk => produceOne(sdk, args.vscodePlatform, args.arch, args.tarballsDir, args.upload)),
	);
	for (let i = 0; i < sdks.length; i++) {
		const entry = produced[i];
		if (entry) {
			results[sdks[i]] = entry;
		}
	}

	// Signal the pipeline that there's something in `tarballsDir` worth
	// publishing as an artifact. (Skipped if no SDK applied to this build,
	// e.g. armhf where every `produceOne` returns undefined.)
	const tarballCount = fs.readdirSync(args.tarballsDir).filter(f => f.endsWith('.tgz')).length;
	if (tarballCount > 0) {
		console.log(`##vso[task.setvariable variable=AGENT_SDK_TARBALLS_PRODUCED]true`);
	}

	if (!args.upload) {
		console.log(`[${SCRIPT}] upload=false — ${tarballCount} tarball(s) left in ${args.tarballsDir}; skipping results file and AGENT_SDK_RESULTS_FILE setvariable.`);
		return;
	}

	fs.mkdirSync(path.dirname(args.resultsFile), { recursive: true });
	fs.writeFileSync(args.resultsFile, JSON.stringify(results, null, 2) + '\n');
	const sdkCount = Object.keys(results).length;
	console.log(`[${SCRIPT}] Wrote ${sdkCount} SDK entr${sdkCount === 1 ? 'y' : 'ies'} to ${args.resultsFile}`);

	// Tell Azure Pipelines: subsequent steps in this job see
	// AGENT_SDK_RESULTS_FILE in their env (auto-injected from the variable).
	console.log(`##vso[task.setvariable variable=AGENT_SDK_RESULTS_FILE]${args.resultsFile}`);
}

async function produceOne(
	sdk: Sdk,
	vscodePlatform: VscodeBuildPlatform,
	arch: string,
	tarballsDir: string,
	upload: boolean,
): Promise<IAgentSdkResults[string] | undefined> {
	const sdkTarget = getSdkTargetForBuild(vscodePlatform, arch, sdk);
	if (!sdkTarget) {
		console.log(`[${SCRIPT}] ${sdk}: no target for ${vscodePlatform}/${arch} — skipping`);
		return undefined;
	}
	console.log(`[${SCRIPT}] ${sdk}: producing for ${vscodePlatform}/${arch} → ${sdkTarget}`);
	const built: IBuildResult = await buildOne({ sdk, sdkTarget, outDir: tarballsDir });
	if (!upload) {
		return undefined;
	}
	// Upload returns the per-target URL; we discard it and emit the
	// `{sdkTarget}` template instead. Every platform job ends up with
	// the same `urlTemplate` per SDK — only the version differs across
	// SDK bumps. The runtime substitutes `{sdkTarget}` per launch.
	await uploadOne({
		sdk,
		sdkVersion: built.sdkVersion,
		sdkTarget,
		tgzPath: built.tgzPath,
		sha256: built.sha256,
	});
	return { version: built.sdkVersion, urlTemplate: buildCdnUrlTemplate(sdk, built.sdkVersion) };
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
