/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { readCopilotBuildOverrides } from './copilotSource.ts';
import { selectedCopilotPlatforms } from '../../lib/copilotPlatforms.ts';

function booleanEnv(name: string): boolean {
	const value = (process.env[name] ?? '').trim().toLowerCase();
	if (value !== 'true' && value !== 'false') {
		throw new Error(`[copilot-source] ${name} must be true or false.`);
	}
	return value === 'true';
}

const root = path.join(import.meta.dirname, '../../..');
selectedCopilotPlatforms({
	windows: booleanEnv('VSCODE_BUILD_WINDOWS'),
	linux: booleanEnv('VSCODE_BUILD_LINUX'),
	alpine: booleanEnv('VSCODE_BUILD_ALPINE'),
	macos: booleanEnv('VSCODE_BUILD_MACOS'),
});
const overrides = readCopilotBuildOverrides(root);
if (!overrides) {
	throw new Error('[copilot-source] package.json contains no Copilot buildOverrides. Add both Copilot package refs before running the Copilot source pipeline.');
}

console.log(`##vso[task.setvariable variable=COPILOT_SDK_SOURCE_REF;isOutput=true]${overrides.sdkRef}`);
console.log(`##vso[task.setvariable variable=COPILOT_RUNTIME_SOURCE_REF;isOutput=true]${overrides.runtimeRef}`);
console.log(`##vso[build.addbuildtag]copilot-sdk=git.${overrides.sdkRef}`);
console.log(`##vso[build.addbuildtag]copilot-runtime=git.${overrides.runtimeRef}`);
console.log(`[copilot-source] Resolved Copilot build overrides for SDK ${overrides.sdkVersion} and runtime ${overrides.runtimeVersion}.`);
