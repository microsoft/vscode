/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shellEscape } from './sshRemoteAgentHostHelpers.js';

const DETECT_MUSL_COMMAND = 'if [ -e /etc/alpine-release ]; then printf musl; elif command -v ldd >/dev/null 2>&1; then case "$(ldd --version 2>&1)" in *musl*) printf musl;; esac; fi';
const GIT_IDENTITY_KEYS = ['user.name', 'user.email'] as const;

export interface IDevContainerProbeResult {
	readonly os: string;
	readonly machine: string;
	readonly libc: string;
	readonly uid: string;
	readonly gid: string;
	/** Repository root that Git may reject because the container user does not own it. */
	readonly gitRootFolder: string | undefined;
}

export interface IDevContainerGitIdentity {
	readonly name: string | undefined;
	readonly email: string | undefined;
}

/** Each Dev Container CLI exec takes seconds to start, so startup reads everything it needs from the container at once. */
export function buildDevContainerProbeCommand(remoteWorkspaceFolder: string): string {
	return [
		'os="$(uname -s)" || exit',
		'machine="$(uname -m)" || exit',
		`libc="$(${DETECT_MUSL_COMMAND})"`,
		'printf \'os=%s\\nmachine=%s\\nlibc=%s\\nuid=%s\\ngid=%s\\n\' "$os" "$machine" "$libc" "$(id -u)" "$(id -g)"',
		`if command -v git >/dev/null 2>&1 && root="$(git -C ${shellEscape(remoteWorkspaceFolder)} rev-parse --show-toplevel)" && test "$(stat -c %u "$root")" != "$(id -u)"; then printf 'gitRoot=%s\\n' "$root"; fi`,
	].join('\n');
}

export function parseDevContainerProbeResult(result: { readonly stdout: string; readonly stderr: string }): IDevContainerProbeResult {
	const values = new Map<string, string>();
	for (const line of result.stdout.split(/\r?\n/)) {
		const separator = line.indexOf('=');
		if (separator > 0) {
			values.set(line.slice(0, separator), line.slice(separator + 1));
		}
	}
	return {
		os: values.get('os') ?? '',
		machine: values.get('machine') ?? '',
		libc: values.get('libc') ?? '',
		uid: values.get('uid') ?? '',
		gid: values.get('gid') ?? '',
		gitRootFolder: values.get('gitRoot')?.trim()
			|| /dubious ownership in repository at '(?<root>.+)'/.exec(result.stderr)?.groups?.root,
	};
}

/** Prints `added` only when the root was missing from the user's global safe.directory list. */
export function buildAddGitSafeDirectoryCommand(rootFolder: string): string {
	return [
		`root=${shellEscape(rootFolder)}`,
		'nl=\'\n\'',
		'configured="$(git config --global --get-all safe.directory)"',
		'case "$nl$configured$nl" in',
		'*"$nl$root$nl"*) ;;',
		'*) git config --global --add safe.directory "$root" && printf added ;;',
		'esac',
	].join('\n');
}

/**
 * Sets each host identity value the repository does not already provide and
 * prints the key of each value it set. Returns `undefined` when the host has no identity.
 */
export function buildConfigureGitIdentityCommand(identity: IDevContainerGitIdentity): string | undefined {
	const commands = [
		{ key: GIT_IDENTITY_KEYS[0], value: identity.name },
		{ key: GIT_IDENTITY_KEYS[1], value: identity.email },
	].flatMap(({ key, value }) => value ? [
		`configured="$(git config --get ${key})"`,
		'case "$configured" in',
		'*[![:space:]]*) ;;',
		`*) git config --global --replace-all ${key} ${shellEscape(value)} || exit; printf '%s\\n' ${key} ;;`,
		'esac',
	] : []);
	if (!commands.length) {
		return undefined;
	}
	return ['command -v git >/dev/null 2>&1 || exit 0', ...commands].join('\n');
}

export function parseConfiguredGitIdentityKeys(stdout: string): readonly string[] {
	return stdout.split(/\r?\n/).filter(line => (GIT_IDENTITY_KEYS as readonly string[]).includes(line));
}
