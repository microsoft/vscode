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

/** Operating-system groups supported by the Copilot source pipeline. */
export interface CopilotPlatformSelection {
	readonly windows: boolean;
	readonly linux: boolean;
	readonly alpine: boolean;
	readonly macos: boolean;
}

/** Expands operating-system groups into publishable Copilot runtime targets. */
export function selectedCopilotPlatforms(selection: CopilotPlatformSelection): string[] {
	const selected = copilotPlatforms.filter(target =>
		(selection.windows && target.startsWith('win32-')) ||
		(selection.linux && target.startsWith('linux-')) ||
		(selection.alpine && target.startsWith('linuxmusl-')) ||
		(selection.macos && target.startsWith('darwin-'))
	);
	if (selected.length === 0) {
		throw new Error('[copilot-source] At least one runtime operating system must be selected.');
	}
	return selected;
}
