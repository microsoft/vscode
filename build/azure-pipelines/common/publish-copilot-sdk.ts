/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { buildSdkTarball } from './buildCopilotOverride.ts';
import { assertCommitSha, createVscodeSourceMetadata, SDK_NPM_NAME } from './copilotSource.ts';
import { assertSourceVersion, publishPackage } from './copilotSourcePublish.ts';

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`[copilot-source-publish] Missing required environment variable ${name}.`);
	}
	return value;
}

const ref = requiredEnv('COPILOT_SDK_SOURCE_REF');
const version = requiredEnv('COPILOT_SOURCE_VERSION');
const runtimeVersion = requiredEnv('COPILOT_RUNTIME_SOURCE_VERSION');
const registry = requiredEnv('COPILOT_SOURCE_REGISTRY');
assertCommitSha(ref, 'COPILOT_SDK_SOURCE_REF');
assertSourceVersion(version);
assertSourceVersion(runtimeVersion);
const vscodeSource = createVscodeSourceMetadata(
	path.join(import.meta.dirname, '../../..'),
	SDK_NPM_NAME,
	requiredEnv('BUILD_SOURCEVERSION'),
	ref,
	requiredEnv('BUILD_BUILDID'),
);

const source = {
	repo: 'github/copilot-sdk',
	ref,
};

const tarball = buildSdkTarball(source, { version, runtimeVersion, vscodeSource });
publishPackage(tarball, registry, 'vscode-source', { name: '@github/copilot-sdk', version });
