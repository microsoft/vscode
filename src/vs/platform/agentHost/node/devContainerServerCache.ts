/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../base/common/path.js';
import { vArray, vObj, vOptionalProp, vString, vUnion } from '../../../base/common/validation.js';
import { getRemoteCLIDataDir, shellEscape } from './sshRemoteAgentHostHelpers.js';

export const devContainerServerCacheMount = 'type=volume,source=vscode,target=/vscode,external=true';

const configurationValidator = vObj({
	configuration: vObj({
		dockerComposeFile: vOptionalProp(vUnion(vString(), vArray(vString()))),
		workspaceMount: vOptionalProp(vString()),
		runArgs: vOptionalProp(vArray(vString())),
	}),
	mergedConfiguration: vObj({
		mounts: vOptionalProp(vArray(vUnion(vString(), vObj({ target: vString() })))),
	}),
});

/** Compose controls its own mounts; do not shadow a configured mount to add an optional cache. */
export function canAddDevContainerServerCacheMount(output: string): boolean {
	const { content, error } = configurationValidator.validate(JSON.parse(output));
	if (error) {
		throw new Error(`Invalid Dev Container configuration: ${error.message}`);
	}
	const { configuration, mergedConfiguration } = content;
	const usesCachePath = (value: string) => /(?:^|[=:])\/vscode(?:\/|[,:\s]|$)/.test(value);
	return configuration.dockerComposeFile === undefined
		&& !configuration.runArgs?.some(usesCachePath)
		&& !usesCachePath(configuration.workspaceMount ?? '')
		&& !mergedConfiguration.mounts?.some(mount => usesCachePath(typeof mount === 'string' ? mount : mount.target));
}

export function getDevContainerServerCachePath(serverDataFolderName: string, platform: { os: string; arch: string }): string {
	return getDevContainerCachePath(serverDataFolderName, platform, 'servers');
}

export function getDevContainerCliCachePath(serverDataFolderName: string, platform: { os: string; arch: string }): string {
	return getDevContainerCachePath(serverDataFolderName, platform, 'bin');
}

function getDevContainerCachePath(serverDataFolderName: string, platform: { os: string; arch: string }, kind: 'servers' | 'bin'): string {
	getRemoteCLIDataDir(serverDataFolderName);
	const sharedFolderName = serverDataFolderName.replace(/^\.+/, '');
	if (!sharedFolderName) {
		throw new Error('Invalid Dev Container server data folder');
	}
	if (!['linux', 'alpine'].includes(platform.os) || !['x64', 'arm64', 'armhf'].includes(platform.arch)) {
		throw new Error(`Unsupported Dev Container server cache platform: ${platform.os}-${platform.arch}`);
	}
	return posix.join('/vscode', sharedFolderName, 'cli', kind, `${platform.os}-${platform.arch}`);
}

/** Creates only missing cache directories, without changing ownership of an existing shared cache. */
export function buildCreateDevContainerCacheCommand(cachePath: string, uid: string, gid: string): string {
	if (!/^\d+$/.test(uid) || !/^\d+$/.test(gid) || !cachePath.startsWith('/vscode/') || cachePath.endsWith('/') || posix.normalize(cachePath) !== cachePath) {
		throw new Error('Invalid Dev Container server cache path or user');
	}
	const parents: string[] = [];
	for (let parent = posix.dirname(cachePath); parent !== '/vscode'; parent = posix.dirname(parent)) {
		parents.unshift(parent);
	}
	return [
		'set -eu',
		'umask 022',
		...parents.flatMap(parent => [
			`test ! -L ${shellEscape(parent)}`,
			`test -d ${shellEscape(parent)} || mkdir ${shellEscape(parent)} || test -d ${shellEscape(parent)}`,
		]),
		`test ! -L ${shellEscape(cachePath)}`,
		`if mkdir ${shellEscape(cachePath)} 2>/dev/null; then chown ${shellEscape(`${uid}:${gid}`)} ${shellEscape(cachePath)}; else test -d ${shellEscape(cachePath)}; fi`,
	].join('\n');
}

/** Linux containers support ln -T, which prevents races from placing a link inside an existing directory. */
export function buildLinkDevContainerServerCacheCommand(serverDataFolderName: string, cachePath: string): string {
	return [
		'set -eu',
		`cli_dir=${getRemoteCLIDataDir(serverDataFolderName)}`,
		`cache_dir=${shellEscape(cachePath)}`,
		'servers="$cli_dir/servers"',
		'if [ -L "$servers" ]; then',
		'  if [ "$(readlink "$servers")" != "$cache_dir" ]; then echo "Preserving existing servers symlink" >&2; exit 1; fi',
		'elif [ -e "$servers" ]; then',
		'  echo "Preserving existing private server cache" >&2; exit 1',
		'fi',
		'test -d "$cache_dir" && test -w "$cache_dir" || { echo "Shared server cache is not writable" >&2; exit 1; }',
		'for entry in "$cache_dir/lru.json" "$cache_dir/.locks"; do',
		'  if [ -L "$entry" ] || { [ -e "$entry" ] && [ ! -w "$entry" ]; }; then echo "Shared server cache metadata is not writable" >&2; exit 1; fi',
		'done',
		'mkdir -p "$cli_dir"',
		'if [ ! -L "$servers" ]; then',
		'  ln -sT "$cache_dir" "$servers" || { test -L "$servers" && test "$(readlink "$servers")" = "$cache_dir"; }',
		'fi',
		'printf "%s" "$cache_dir"',
	].join('\n');
}
