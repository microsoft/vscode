/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../base/common/platform.js';
import type { ITerminalSandboxCommand } from '../../../../../platform/sandbox/common/terminalSandboxService.js';
import { gitGlobalOptionsWithValue, type ITerminalSandboxCommandRule, matchesTerminalSandboxCommandRule } from './terminalSandboxCommandRules.js';

export const enum TerminalSandboxReadAllowListOperation {
	Git = 'git',
	Node = 'node',
	Rust = 'rust',
	Go = 'go',
	Python = 'python',
	Java = 'java',
	Dotnet = 'dotnet',
	Nuget = 'nuget',
	Msbuild = 'msbuild',
	Ruby = 'ruby',
	NativeBuild = 'nativeBuild',
	Conan = 'conan',
	GnuPG = 'gnupg',
}

const terminalSandboxReadAllowListKeywordMap: ReadonlyMap<string, TerminalSandboxReadAllowListOperation> = new Map([
	['git', TerminalSandboxReadAllowListOperation.Git],
	['gh', TerminalSandboxReadAllowListOperation.Git],
	['node', TerminalSandboxReadAllowListOperation.Node],
	['npm', TerminalSandboxReadAllowListOperation.Node],
	['npx', TerminalSandboxReadAllowListOperation.Node],
	['pnpm', TerminalSandboxReadAllowListOperation.Node],
	['yarn', TerminalSandboxReadAllowListOperation.Node],
	['corepack', TerminalSandboxReadAllowListOperation.Node],
	['bun', TerminalSandboxReadAllowListOperation.Node],
	['deno', TerminalSandboxReadAllowListOperation.Node],
	['nvm', TerminalSandboxReadAllowListOperation.Node],
	['volta', TerminalSandboxReadAllowListOperation.Node],
	['fnm', TerminalSandboxReadAllowListOperation.Node],
	['asdf', TerminalSandboxReadAllowListOperation.Node],
	['mise', TerminalSandboxReadAllowListOperation.Node],
	['cargo', TerminalSandboxReadAllowListOperation.Rust],
	['rustc', TerminalSandboxReadAllowListOperation.Rust],
	['rustup', TerminalSandboxReadAllowListOperation.Rust],
	['go', TerminalSandboxReadAllowListOperation.Go],
	['gofmt', TerminalSandboxReadAllowListOperation.Go],
	['python', TerminalSandboxReadAllowListOperation.Python],
	['python3', TerminalSandboxReadAllowListOperation.Python],
	['pip', TerminalSandboxReadAllowListOperation.Python],
	['pip3', TerminalSandboxReadAllowListOperation.Python],
	['poetry', TerminalSandboxReadAllowListOperation.Python],
	['uv', TerminalSandboxReadAllowListOperation.Python],
	['pipx', TerminalSandboxReadAllowListOperation.Python],
	['pyenv', TerminalSandboxReadAllowListOperation.Python],
	['java', TerminalSandboxReadAllowListOperation.Java],
	['javac', TerminalSandboxReadAllowListOperation.Java],
	['jar', TerminalSandboxReadAllowListOperation.Java],
	['mvn', TerminalSandboxReadAllowListOperation.Java],
	['mvnw', TerminalSandboxReadAllowListOperation.Java],
	['gradle', TerminalSandboxReadAllowListOperation.Java],
	['gradlew', TerminalSandboxReadAllowListOperation.Java],
	['sdk', TerminalSandboxReadAllowListOperation.Java],
	['dotnet', TerminalSandboxReadAllowListOperation.Dotnet],
	['nuget', TerminalSandboxReadAllowListOperation.Nuget],
	['msbuild', TerminalSandboxReadAllowListOperation.Msbuild],
	['ruby', TerminalSandboxReadAllowListOperation.Ruby],
	['gem', TerminalSandboxReadAllowListOperation.Ruby],
	['bundle', TerminalSandboxReadAllowListOperation.Ruby],
	['bundler', TerminalSandboxReadAllowListOperation.Ruby],
	['rake', TerminalSandboxReadAllowListOperation.Ruby],
	['rbenv', TerminalSandboxReadAllowListOperation.Ruby],
	['rvm', TerminalSandboxReadAllowListOperation.Ruby],
	['ccache', TerminalSandboxReadAllowListOperation.NativeBuild],
	['sccache', TerminalSandboxReadAllowListOperation.NativeBuild],
	['cmake', TerminalSandboxReadAllowListOperation.NativeBuild],
	['conan', TerminalSandboxReadAllowListOperation.Conan],
]);

/**
 * Paths that common developer tools typically need to read when the user's home
 * directory is broadly denied. Broad keyword-based rules intentionally avoid obvious
 * credential and key material such as ~/.ssh, ~/.gnupg, cloud credentials,
 * package manager auth files, and git credential stores. Sensitive operations
 * should only be referenced by command-detail rules scoped to commands or
 * subcommands that require them.
 */

function getTerminalSandboxReadAllowListForOperation(operation: TerminalSandboxReadAllowListOperation, os: OperatingSystem): readonly string[] {
	switch (operation) {
		case TerminalSandboxReadAllowListOperation.Git:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.gitconfig',
						'~/.config/git/config',
						'~/.gitignore',
						'~/.gitignore_global',
						'~/.config/git/ignore',
						'~/.config/git/attributes',
					];
			}

		case TerminalSandboxReadAllowListOperation.Node:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/.npm',
						'~/Library/Caches/node',
						'~/Library/Caches/electron',
						'~/Library/Caches/ms-playwright',
						'~/Library/Caches/Yarn',
						'~/Library/Caches/deno',
						'~/Library/pnpm',
						'~/.electron-gyp',
						'~/.node-gyp',
						'~/.yarn/berry',
						'~/.local/share/pnpm',
						'~/.pnpm-store',
						'~/.bun/install/cache',
						'~/.bun/bin',
						'~/.deno',
						'~/.nvm/versions',
						'~/.nvm/alias',
						'~/.volta/bin',
						'~/.volta/tools',
						'~/.fnm',
						'~/.asdf/installs/nodejs',
						'~/.asdf/shims',
						'~/.local/share/mise/installs/node',
						'~/.local/share/mise/shims',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/.npm',
						'~/.cache/node',
						'~/.cache/node/corepack',
						'~/.cache/electron',
						'~/.cache/ms-playwright',
						'~/.cache/yarn',
						'~/.electron-gyp',
						'~/.node-gyp',
						'~/.yarn/berry',
						'~/.local/share/pnpm',
						'~/.pnpm-store',
						'~/.bun/install/cache',
						'~/.bun/bin',
						'~/.deno',
						'~/.cache/deno',
						'~/.nvm/versions',
						'~/.nvm/alias',
						'~/.volta/bin',
						'~/.volta/tools',
						'~/.fnm',
						'~/.asdf/installs/nodejs',
						'~/.asdf/shims',
						'~/.local/share/mise/installs/node',
						'~/.local/share/mise/shims',
					];
			}

		case TerminalSandboxReadAllowListOperation.Rust:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.cargo/bin',
						'~/.cargo/registry',
						'~/.cargo/git',
						'~/.rustup/toolchains',
					];
			}

		case TerminalSandboxReadAllowListOperation.Go:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/go/pkg/mod',
						'~/go/bin',
						'~/Library/Caches/go-build',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/go/pkg/mod',
						'~/go/bin',
						'~/.cache/go-build',
					];
			}

		case TerminalSandboxReadAllowListOperation.Python:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/Library/Caches/pip',
						'~/Library/Caches/pypoetry',
						'~/Library/Caches/uv',
						'~/.local/bin',
						'~/.local/share/virtualenv',
						'~/.local/share/pipx',
						'~/.pyenv/versions',
						'~/.pyenv/shims',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/.cache/pip',
						'~/.cache/pypoetry',
						'~/.cache/uv',
						'~/.local/bin',
						'~/.local/share/virtualenv',
						'~/.local/share/pipx',
						'~/.pyenv/versions',
						'~/.pyenv/shims',
					];
			}

		case TerminalSandboxReadAllowListOperation.Java:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.m2/repository',
						'~/.gradle/caches',
						'~/.gradle/wrapper/dists',
						'~/.sdkman/candidates',
					];
			}

		case TerminalSandboxReadAllowListOperation.Dotnet:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.dotnet',
					];
			}

		case TerminalSandboxReadAllowListOperation.Nuget:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/.nuget/packages',
						'~/Library/Caches/NuGet/v3-cache',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/.nuget/packages',
						'~/.local/share/NuGet/v3-cache',
					];
			}

		case TerminalSandboxReadAllowListOperation.Msbuild:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [];
			}

		case TerminalSandboxReadAllowListOperation.Ruby:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/.gem',
						'~/.rbenv/versions',
						'~/.rbenv/shims',
						'~/.rvm/rubies',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/.gem',
						'~/.rbenv/versions',
						'~/.rbenv/shims',
						'~/.rvm/rubies',
					];
			}

		case TerminalSandboxReadAllowListOperation.NativeBuild:
			switch (os) {
				case OperatingSystem.Macintosh:
					return [
						'~/Library/Caches/ccache',
						'~/Library/Caches/sccache',
					];
				case OperatingSystem.Linux:
				default:
					return [
						'~/.cache/ccache',
						'~/.cache/sccache',
					];
			}

		case TerminalSandboxReadAllowListOperation.Conan:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.conan2/p',
						'~/.conan2/b',
					];
			}

		case TerminalSandboxReadAllowListOperation.GnuPG:
			switch (os) {
				case OperatingSystem.Macintosh:
				case OperatingSystem.Linux:
				default:
					return [
						'~/.gnupg',
					];
			}
	}
}

function getTerminalSandboxReadAllowListForCommandDetails(os: OperatingSystem, commandDetails: readonly ITerminalSandboxCommand[]): readonly string[] {
	const operations = new Set<TerminalSandboxReadAllowListOperation>();
	for (const command of commandDetails) {
		for (const rule of terminalSandboxReadAllowListCommandDetailRules) {
			if (matchesTerminalSandboxCommandRule(command, rule, { os })) {
				operations.add(rule.value);
			}
		}
	}

	const paths = [...operations].flatMap(operation => getTerminalSandboxReadAllowListForOperation(operation, os));
	return [...new Set(paths)];
}

/**
 * Argument-aware allow-list rules. Keyword-only rules apply to a command
 * executable, while subcommand rules can skip global options before matching.
 *
 * For example, `git -C repo commit -S` matches the `git`/`commit` rule below,
 * while `gpg --list-keys` matches the keyword-only `gpg` rule.
 */
const terminalSandboxReadAllowListCommandDetailRules: readonly ITerminalSandboxCommandRule<TerminalSandboxReadAllowListOperation>[] = [
	{
		keywords: ['gpg', 'gpg2'],
		value: TerminalSandboxReadAllowListOperation.GnuPG,
	},
	{
		keywords: ['git'],
		value: TerminalSandboxReadAllowListOperation.GnuPG,
		subcommands: ['commit'],
		optionsWithValue: gitGlobalOptionsWithValue,
	},
];

export function getTerminalSandboxReadAllowListForCommands(os: OperatingSystem, commandKeywords: readonly string[], commandDetails: readonly ITerminalSandboxCommand[] = []): readonly string[] {
	if (commandKeywords.length === 0) {
		return getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails);
	}

	const operations = new Set<TerminalSandboxReadAllowListOperation>();
	for (const keyword of commandKeywords) {
		const operation = terminalSandboxReadAllowListKeywordMap.get(keyword.toLowerCase());
		if (operation) {
			operations.add(operation);
		}
	}

	const paths = [...operations].flatMap(operation => getTerminalSandboxReadAllowListForOperation(operation, os));
	return [...new Set([...paths, ...getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails)])];
}
