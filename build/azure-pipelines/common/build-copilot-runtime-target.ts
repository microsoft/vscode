/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { copilotPlatforms } from '../../lib/copilotPlatforms.ts';
import { buildRuntimeTarget, isRuntimeSourceActive, runtimeSourceRef, smokeRunPackage } from '../../lib/copilotRuntimeSource.ts';

/**
 * Builds the `@github/copilot` runtime from source for a single target and
 * stages it for publishing as a pipeline artifact.
 *
 * Entry point for the per-target jobs in the `CopilotRuntime` stage (see
 * `copilot/runtime-source-build.yml`). The packaging jobs then download the
 * artifact instead of building the runtime themselves — see
 * `build/lib/copilotRuntimeSource.ts` for why that separation matters.
 *
 *   node build/azure-pipelines/common/build-copilot-runtime-target.ts \
 *     --target=linuxmusl-arm64 --out=<staging dir>
 *
 * Exits successfully without producing anything when the build carries no
 * runtime *source* override, so the stage can be gated on the coarse "a runtime
 * override was requested" signal that is available when stages are expanded,
 * without failing a build that merely pins a published version.
 */

function requiredArg(name: string): string {
	const prefix = `--${name}=`;
	const value = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length).trim();
	if (!value) {
		throw new Error(`[copilot-runtime-build] Missing required argument --${name}=<value>.`);
	}
	return value;
}

function main(): void {
	const target = requiredArg('target');
	const outDir = path.resolve(requiredArg('out'));
	if (!copilotPlatforms.includes(target)) {
		throw new Error(`[copilot-runtime-build] Unknown target "${target}". Expected one of: ${copilotPlatforms.join(', ')}.`);
	}

	if (!isRuntimeSourceActive()) {
		console.log(`[copilot-runtime-build] No runtime source override for this build; skipping ${target}.`);
		return;
	}

	const built = buildRuntimeTarget(target);
	// A package can satisfy every structural assertion and still fail to load.
	// Catch that here rather than on a user's machine.
	smokeRunPackage(built, target);

	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	fs.cpSync(built, outDir, { recursive: true });

	// Gates the publish step: the artifact only exists when this build actually
	// produced one.
	console.log(`##vso[task.setvariable variable=COPILOT_RUNTIME_ARTIFACT_READY]true`);
	console.log(`[copilot-runtime-build] Staged ${target} (${runtimeSourceRef()}) at ${outDir}`);
}

main();
