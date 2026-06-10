/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scans an artifact directory for `<sdk>-<version>-<target>.tgz.json` sidecars
 * produced by `package.ts`, asserts every expected (sdk, target) pair the
 * SDK declares in its `optionalDependencies` is accounted for, and prints
 * a markdown report with a JSON `product.agentSdks` fragment that a human
 * pastes into vscode-distro's `product.json`.
 *
 * Designed to be invoked from the pipeline aggregate job with
 * `condition: succeededOrFailed()` so the operator sees what's missing even
 * when one or more per-target jobs failed.
 *
 * Usage:
 *   node build/agent-sdk/aggregate.ts --artifacts=<dir>
 */

import { fail, getTargets, listSidecars, parseFlags, type Sdk } from './common.ts';

const SCRIPT = 'aggregate.ts';
const SDKS: readonly Sdk[] = ['claude', 'codex'];

function parseArgs(): { artifactsDir: string } {
	const flags = parseFlags(process.argv.slice(2));
	const artifactsDir = flags.get('artifacts');
	if (!artifactsDir) {
		fail(SCRIPT, 'Missing --artifacts=<dir>');
	}
	return { artifactsDir };
}

interface ISdkFragment {
	readonly version: string;
	readonly urlTemplate: string;
	readonly sha256: { readonly [sdkTarget: string]: string };
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

	// Completeness: every (sdk, target) the SDK declares in its
	// `optionalDependencies` MUST have a sidecar. The runtime treats missing
	// `sha256[target]` as unsupported, so a partial fragment pasted into
	// vscode-distro would silently disable platforms.
	const expected = new Map<Sdk, readonly string[]>(SDKS.map(sdk => [sdk, getTargets(sdk)]));
	const missing: string[] = [];
	for (const [sdk, targets] of expected) {
		for (const target of targets) {
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

	// Build the fragment. Group by SDK, sort targets for stable output.
	const fragment: { [sdk: string]: ISdkFragment } = {};
	for (const [sdk, targets] of expected) {
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
