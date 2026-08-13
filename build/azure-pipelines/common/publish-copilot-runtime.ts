/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { assembleRuntimePackages, publishPackage } from './copilotSourcePublish.ts';

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`[copilot-source-publish] Missing required environment variable ${name}.`);
	}
	return value;
}

const artifactsDir = path.resolve(requiredEnv('COPILOT_RUNTIME_ARTIFACTS_DIR'));
const outputDir = path.resolve(requiredEnv('COPILOT_RUNTIME_PACKAGES_DIR'));
const version = requiredEnv('COPILOT_SOURCE_VERSION');
const registry = requiredEnv('COPILOT_SOURCE_REGISTRY');

for (const packageDir of assembleRuntimePackages(artifactsDir, outputDir, version)) {
	publishPackage(packageDir, registry);
}
