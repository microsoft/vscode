/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
	AGENT_HOST_SDK_PACKAGES,
	AGENT_HOST_SDK_TARGETS,
	checkVersionsPinnedEqual,
	fetchSdkForTarget,
	packageSdkBundle,
	pinnedDevDependencyVersion,
	productJsonPath,
	readProductSdks,
	repoRoot,
	withTempDir,
	type AgentHostSdkId,
	type IAgentHostSdkAsset,
} from '../lib/agentHostSdks.ts';

/**
 * Maintainer/CI entry point for the agent host SDK pins.
 *
 *   node build/npm/update-agent-host-sdks.ts            # write {file, sha256} into product.json
 *   node build/npm/update-agent-host-sdks.ts --check    # verify pins; non-zero exit on drift
 *   node build/npm/update-agent-host-sdks.ts --check --versions-only  # offline: version equality only
 *
 * See `src/vs/platform/agentHost/AGENT_HOST_SDK_DELIVERY_PLAN.md`.
 */

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');
const versionsOnly = args.has('--versions-only');
const outDir = path.join(repoRoot, '.build', 'agentHostSdks');

async function buildPlatforms(sdk: AgentHostSdkId, version: string): Promise<Record<string, IAgentHostSdkAsset>> {
	const platforms: Record<string, IAgentHostSdkAsset> = {};
	for (const target of AGENT_HOST_SDK_TARGETS) {
		console.log(`[agent-host-sdks] packaging ${sdk}@${version} for ${target.platform}`);
		const asset = await withTempDir(`agent-host-sdk-${sdk}-${target.platform}`, async stagingDir => {
			const nodeModulesDir = fetchSdkForTarget(sdk, version, target, stagingDir);
			return packageSdkBundle(sdk, version, target, nodeModulesDir, outDir);
		});
		platforms[target.platform] = asset;
	}
	return platforms;
}

async function write(): Promise<void> {
	const product = JSON.parse(readFileSync(productJsonPath(), 'utf8'));
	product.agentHostSdks ??= {};
	for (const sdk of Object.keys(AGENT_HOST_SDK_PACKAGES) as AgentHostSdkId[]) {
		const version = pinnedDevDependencyVersion(sdk);
		product.agentHostSdks[sdk] = { version, platforms: await buildPlatforms(sdk, version) };
	}
	writeFileSync(productJsonPath(), JSON.stringify(product, null, '\t') + '\n');
	console.log('[agent-host-sdks] product.json updated.');
}

async function check(): Promise<void> {
	const versionProblems = checkVersionsPinnedEqual();
	if (versionProblems.length) {
		fail(versionProblems);
	}
	console.log('[agent-host-sdks] version pins are consistent.');

	if (versionsOnly) {
		return;
	}

	const productSdks = readProductSdks();
	const problems: string[] = [];
	for (const sdk of Object.keys(AGENT_HOST_SDK_PACKAGES) as AgentHostSdkId[]) {
		const version = pinnedDevDependencyVersion(sdk);
		const expected = productSdks[sdk]?.platforms ?? {};
		const actual = await buildPlatforms(sdk, version);
		for (const [platform, asset] of Object.entries(actual)) {
			const pinned = expected[platform];
			if (!pinned) {
				problems.push(`${sdk}/${platform}: missing from product.json pin`);
			} else if (pinned.sha256 !== asset.sha256) {
				problems.push(`${sdk}/${platform}: sha256 mismatch (pinned ${pinned.sha256}, rebuilt ${asset.sha256})`);
			}
		}
	}
	if (problems.length) {
		fail([...problems, '', 'Run `npm run update-agent-host-sdks` and commit the updated product.json.']);
	}
	console.log('[agent-host-sdks] product.json hashes match freshly built bundles.');
}

function fail(lines: string[]): never {
	console.error('\n[agent-host-sdks] check failed:\n  ' + lines.join('\n  ') + '\n');
	process.exit(1);
}

await (checkMode ? check() : write());
