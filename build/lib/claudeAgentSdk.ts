/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The platforms that @anthropic-ai/claude-agent-sdk ships platform-specific
 * native packages for. Each `@anthropic-ai/claude-agent-sdk-{platform}` package
 * contains a single `claude` executable that the SDK spawns at runtime.
 *
 * Linux has two variants per arch — `linux-{arch}` (glibc) and
 * `linux-{arch}-musl` (alpine/musl-libc). The SDK loader tries the musl variant
 * first on linux, then falls back to the glibc variant.
 */
export const claudeAgentSdkPlatforms = [
	'darwin-arm64', 'darwin-x64',
	'linux-arm64', 'linux-arm64-musl',
	'linux-x64', 'linux-x64-musl',
	'win32-arm64', 'win32-x64',
];

/**
 * Converts VS Code build platform/arch to the `@anthropic-ai/claude-agent-sdk-*`
 * package suffix that should be retained for that build target.
 *
 * Differs from the equivalent helper in `copilot.ts` because the claude
 * executable is statically linked against libc, so alpine builds must ship
 * the `-musl` variant.
 */
function toSdkPlatformArch(platform: string, arch: string): string {
	let nodePlatform = platform;
	let nodeArch = arch;
	let muslSuffix = '';

	if (platform === 'alpine') {
		nodePlatform = 'linux';
		muslSuffix = '-musl';
		if (arch === 'alpine') {
			// Legacy: { platform: 'linux', arch: 'alpine' } means alpine-x64
			nodeArch = 'x64';
		}
	}

	if (arch === 'armhf') {
		// VS Code build uses 'armhf'; Node reports process.arch === 'arm'
		nodeArch = 'arm';
	}

	return `${nodePlatform}-${nodeArch}${muslSuffix}`;
}

/**
 * Returns a glob filter that strips @anthropic-ai/claude-agent-sdk platform
 * packages for architectures other than the build target.
 *
 * For platforms the SDK doesn't natively support (anything that doesn't match
 * one of `claudeAgentSdkPlatforms`), ALL platform packages are stripped — the
 * agent host won't be functional on that target, which matches its current
 * runtime behavior.
 */
export function getClaudeAgentSdkExcludeFilter(platform: string, arch: string): string[] {
	const targetPlatformArch = toSdkPlatformArch(platform, arch);
	const nonTargetPlatforms = claudeAgentSdkPlatforms.filter(p => p !== targetPlatformArch);

	const excludes = nonTargetPlatforms.map(p => `!**/node_modules/@anthropic-ai/claude-agent-sdk-${p}/**`);

	return ['**', ...excludes];
}
