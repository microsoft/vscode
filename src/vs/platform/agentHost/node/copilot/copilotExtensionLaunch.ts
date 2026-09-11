/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient } from '@github/copilot-sdk';
import { promises as fs } from 'fs';
import { dirname, extname, isAbsolute, join } from '../../../../base/common/path.js';

interface ICopilotExtensionLaunch {
	readonly extensionSdkPath: string;
	readonly onExtensionLaunch: (request: { readonly modulePath: string }) => {
		launch?: { executable: string; args: string[]; env: Record<string, string> };
	};
}

/**
 * Adapts runtime-discovered entrypoints to its bundled bootstrap. Older SDKs cannot
 * register this callback and must not opt sessions into standalone extensions.
 */
export async function getCopilotExtensionLaunch(
	cliPath: string,
	sdk: object = CopilotClient,
	executable: string = process.execPath,
	access: (path: string) => Promise<void> = fs.access,
): Promise<ICopilotExtensionLaunch | undefined> {
	if (!('supportsExtensionLaunchProvider' in sdk) || sdk.supportsExtensionLaunchProvider !== true) {
		return undefined;
	}
	const runtimeDirectory = dirname(cliPath);
	const extensionSdkPath = join(runtimeDirectory, 'copilot-sdk');
	const bootstrap = join(runtimeDirectory, 'preloads', 'extension_bootstrap.mjs');
	await Promise.all([
		access(join(extensionSdkPath, 'index.js')),
		access(join(extensionSdkPath, 'extension.js')),
		access(bootstrap),
		access(join(runtimeDirectory, 'preloads', 'extension_sdk_resolver.mjs')),
	]);
	return {
		extensionSdkPath,
		onExtensionLaunch: request => {
			if (!isAbsolute(request.modulePath) || !['.mjs', '.cjs', '.js'].includes(extname(request.modulePath))) {
				return {};
			}
			return {
				launch: {
					executable,
					args: [bootstrap],
					env: {
						EXTENSION_PATH: request.modulePath,
						ELECTRON_RUN_AS_NODE: '1',
						COPILOT_CLI_RUN_AS_NODE: '1',
					},
				},
			};
		},
	};
}
