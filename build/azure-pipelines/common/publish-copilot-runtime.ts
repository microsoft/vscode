/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { createVscodeSourceMetadata, RUNTIME_NPM_NAME } from './copilotSource.ts';
import { assembleRuntimePackages, publishPackage } from './copilotSourcePublish.ts';
import { selectedCopilotPlatforms } from '../../lib/copilotPlatforms.ts';

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`[copilot-source-publish] Missing required environment variable ${name}.`);
	}
	return value;
}

function booleanEnv(name: string): boolean {
	const value = requiredEnv(name).toLowerCase();
	if (value !== 'true' && value !== 'false') {
		throw new Error(`[copilot-source-publish] ${name} must be true or false.`);
	}
	return value === 'true';
}

const artifactsDir = path.resolve(requiredEnv('COPILOT_RUNTIME_ARTIFACTS_DIR'));
const outputDir = path.resolve(requiredEnv('COPILOT_RUNTIME_PACKAGES_DIR'));
const version = requiredEnv('COPILOT_SOURCE_VERSION');
const registry = requiredEnv('COPILOT_SOURCE_REGISTRY');
const runtimeRef = requiredEnv('COPILOT_RUNTIME_SOURCE_REF');
const targets = selectedCopilotPlatforms({
	windows: booleanEnv('VSCODE_BUILD_WINDOWS'),
	linux: booleanEnv('VSCODE_BUILD_LINUX'),
	alpine: booleanEnv('VSCODE_BUILD_ALPINE'),
	macos: booleanEnv('VSCODE_BUILD_MACOS'),
});
const vscodeSource = createVscodeSourceMetadata(
	path.join(import.meta.dirname, '../../..'),
	RUNTIME_NPM_NAME,
	requiredEnv('BUILD_SOURCEVERSION'),
	runtimeRef,
	requiredEnv('BUILD_BUILDID'),
);

for (const packageDir of assembleRuntimePackages(artifactsDir, outputDir, version, runtimeRef, vscodeSource, targets)) {
	publishPackage(packageDir, registry);
}
