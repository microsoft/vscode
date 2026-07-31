/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The platforms that @github/copilot ships platform-specific packages for.
 * These are the `@github/copilot-{platform}` optional dependency packages.
 *
 * Deliberately alone in a module with no imports: the runtime source build runs
 * on agents that never install VS Code's dependencies, so anything it needs must
 * be reachable without `npm ci`. Re-exported by copilot.ts for everything else.
 */
export const copilotPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-x64',
	'linuxmusl-arm64', 'linuxmusl-x64',
	'win32-arm64', 'win32-x64',
];
