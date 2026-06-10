/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scans an artifact directory for `<sdk>-<version>-<target>.tgz.json` sidecars
 * produced by `package.ts`, asserts every expected (sdk, target) pair is
 * accounted for, and prints a markdown report with a JSON
 * `product.agentSdks` fragment that a human pastes into vscode-distro's
 * `product.json`.
 *
 * Expected targets are passed in via `--claude-targets=a,b,c --codex-targets=x,y`.
 * The pipeline passes the same arrays that drive its matrix fan-out, so the
 * YAML's `claudeTargets`/`codexTargets` are the single source of truth for
 * "what we build."
 *
 * After completeness validation, queries each SDK's registry
 * `optionalDependencies` and WARNS (does not fail) if upstream has added
 * platforms we don't yet build — early signal to update the YAML matrix.
 *
 * Designed to be invoked from the pipeline aggregate job with
 * `condition: succeededOrFailed()` so the operator sees what's missing even
 * when one or more per-target jobs failed.
 *
 * Usage:
 *   node build/agent-sdk/aggregate.ts --artifacts=<dir> \
 *     --claude-targets=darwin-x64,darwin-arm64,... \
 *     --codex-targets=darwin-x64,darwin-arm64,...
 */

import { fail, getRegistryTargets, listSidecars, parseFlags, type Sdk } from './common.ts';

const SCRIPT = 'aggregate.ts';
const SDKS: readonly Sdk[] = ['claude', 'codex'];

interface ICliArgs {
	artifactsDir: string;
	expectedTargets: { readonly [K in Sdk]: readonly string[] };
}

function parseArgs(): ICliArgs {
	const flags = parseFlags(process.argv.slice(2));
	const artifactsDir = flags.get('artifacts');
	if (!artifactsDir) {
		fail(SCRIPT, 'Missing --artifacts=<dir>');
	}
	const parseCsv = (key: string): readonly string[] => {
		const raw = flags.get(key);
		if (!raw) {
			fail(SCRIPT, `Missing --${key}=<comma,separated,list>`);
		}
		return raw.split(',').map(s => s.trim()).filter(Boolean);
	};
	return {
		artifactsDir,
		expectedTargets: {
			claude: parseCsv('claude-targets'),
			codex: parseCsv('codex-targets'),
		},
	};
}

interface ISdkFragment {
	readonly version: string;
	readonly urlTemplate: string;
	readonly sha256: { readonly [sdkTarget: string]: string };
}

/** Logs an Azure-Pipelines-flavored warning that surfaces in the build UI. */
function warn(msg: string): void {
	console.log(`##vso[task.logissue type=warning]${msg}`);
}

function main(): void {
	const args = parseArgs();
	const sidecars = listSidecars(args.artifactsDir, SCRIPT);
	if (sidecars.length === 0) {
		fail(SCRIPT, `No *.tgz.json sidecars found in ${args.artifactsDir}`);
	}

	// Index sidecars by (sdk, target). Fail loud on duplicates so a
	// pipeline-artifact mishap can't silently overwrite one with another.
	const bySdkTarget = new Map<string, typeof sidecars[number]>();
	for (const s of sidecars) {
		const key = `${s.sdk}/${s.sdkTarget}`;
		if (bySdkTarget.has(key)) {
			fail(SCRIPT, `Duplicate sidecar for ${key}`);
		}
		bySdkTarget.set(key, s);
	}

	// Completeness: every (sdk, target) the pipeline matrix was supposed to
	// produce MUST have a sidecar. The runtime treats missing
	// `sha256[target]` as unsupported, so a partial fragment pasted into
	// vscode-distro would silently disable platforms.
	const missing: string[] = [];
	for (const sdk of SDKS) {
		for (const target of args.expectedTargets[sdk]) {
			if (!bySdkTarget.has(`${sdk}/${target}`)) {
				missing.push(`${sdk}/${target}`);
			}
		}
	}
	if (missing.length > 0) {
		fail(SCRIPT, `Missing sidecars for ${missing.length} expected (sdk, target) pair(s):\n  - ${missing.join('\n  - ')}\n` +
			`Each missing entry corresponds to a per-target build job that did not produce its artifact. ` +
			`Investigate those job logs before pasting the fragment into vscode-distro.`);
	}

	// Drift detection (warn-only): does upstream declare any platforms we
	// aren't building? Failing here would block routine pipeline runs every
	// time an SDK publishes a new platform overnight, so just shout.
	for (const sdk of SDKS) {
		let upstream: readonly string[];
		try {
			upstream = getRegistryTargets(sdk);
		} catch (err) {
			warn(`aggregate: could not query registry targets for ${sdk}: ${(err as Error).message}`);
			continue;
		}
		const ours = new Set(args.expectedTargets[sdk]);
		const newUpstream = upstream.filter(t => !ours.has(t));
		if (newUpstream.length > 0) {
			warn(
				`${sdk}: upstream optionalDependencies declares ${newUpstream.length} platform(s) ` +
				`we don't build yet: [${newUpstream.join(', ')}]. ` +
				`Add to the ${sdk}Targets array in build/azure-pipelines/agent-sdk/product-build-agent-sdk.yml.`,
			);
		}
		const droppedUpstream = [...ours].filter(t => !upstream.includes(t));
		if (droppedUpstream.length > 0) {
			warn(
				`${sdk}: pipeline matrix includes ${droppedUpstream.length} platform(s) ` +
				`upstream no longer ships: [${droppedUpstream.join(', ')}]. ` +
				`Remove from the ${sdk}Targets array.`,
			);
		}
	}

	// Build the fragment. Group by SDK, sort targets for stable output.
	const fragment: { [sdk: string]: ISdkFragment } = {};
	for (const sdk of SDKS) {
		const targets = args.expectedTargets[sdk];
		const versions = new Set(targets.map(t => bySdkTarget.get(`${sdk}/${t}`)!.sdkVersion));
		if (versions.size !== 1) {
			fail(SCRIPT, `Inconsistent versions for ${sdk}: [${[...versions].join(', ')}]`);
		}
		const sha256: { [target: string]: string } = {};
		for (const t of [...targets].sort()) {
			sha256[t] = bySdkTarget.get(`${sdk}/${t}`)!.sha256;
		}
		fragment[sdk] = {
			version: [...versions][0],
			urlTemplate: `https://main.vscode-cdn.net/agent-sdk/${sdk}/{sdkVersion}/{sdkTarget}.tgz`,
			sha256,
		};
	}

	console.log('## product.agentSdks fragment');
	console.log('');
	console.log('Copy the following into vscode-distro\'s `product.json` under the top-level `agentSdks` key:');
	console.log('');
	console.log('```json');
	console.log(JSON.stringify({ agentSdks: fragment }, null, 2));
	console.log('```');
}

main();
