/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file has two copies that must be kept in sync:
// - microsoft/vscode: src/vs/platform/agentHost/node/devContainerState.ts
// - microsoft/vscode-remote-containers: src/node/devContainerState.ts
// The copies differ only in their copyright header and `path` import.

import { createHash } from 'crypto';
import { posix, win32 } from '../../../base/common/path.js';

/** Stable path in the container that links to the user state folder on the state volume. */
export const devContainerStatePath = '/vscode-state';
/** Preferred state volume target, which also persists sibling folders such as agent worktrees. */
export const devContainerStateWorkspacesTarget = '/workspaces';
export const devContainerStateFallbackTarget = '/.vscode-volume';
export const devContainerStateIdLabel = 'vscode.dev-container-state.id';

const stateVolumePattern = /^vscode-state-[0-9a-v]{52}$/;
const stateFolderName = '.vscode-state';
const stateLayoutVersion = '1';
const knownServerDataFolderNames = ['.vscode-server', '.vscode-server-insiders'];
const serverStateFolders = ['data/User/globalStorage', 'data/User/workspaceStorage', 'data/User/History', 'data/agentSessionData'];
const homeStateFolders = ['.copilot'];
const linkProgressPrefix = 'vscode-state:';
const linkSteps = ['volume', 'stateFolder', 'statePath', 'stateLink', 'home', 'mountinfo', 'folders'];
const linkSkipReasons = ['parent', 'mounted', 'symlink', 'file', 'state'];

/** Computes the Dev Containers CLI's `${devcontainerId}` for the container's id labels. */
export function getDevContainerId(idLabels: readonly string[]): string {
	const labels = idLabels.reduce<Record<string, string>>((obj, pair) => {
		const i = pair.indexOf('=');
		if (i !== -1) {
			obj[pair.substring(0, i)] = pair.substring(i + 1);
		}
		return obj;
	}, {});
	const hash = createHash('sha256').update(JSON.stringify(labels, Object.keys(labels).sort()), 'utf8').digest('hex');
	return BigInt(`0x${hash}`).toString(32).padStart(52, '0');
}

/** The id labels the Dev Containers CLI gives a new container when no `--id-label` is passed. */
export function getDefaultDevContainerIdLabels(platform: string, workspaceFolder: string, configFile: string): string[] {
	const localFolder = (platform === 'win32' ? win32 : posix).resolve(workspaceFolder);
	return [
		`devcontainer.local_folder=${normalizeLabelPath(platform, localFolder)}`,
		`devcontainer.config_file=${normalizeLabelPath(platform, configFile)}`,
	];
}

function normalizeLabelPath(platform: string, value: string): string {
	if (platform !== 'win32') {
		return value;
	}
	const normalized = win32.normalize(value);
	return normalized.length >= 2 && normalized[1] === ':' ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
}

export function getDevContainerStateVolumeName(devContainerId: string): string {
	return `vscode-state-${devContainerId}`;
}

export function getDevContainerStateVolumeLabels(devContainerId: string): string[] {
	return [`${devContainerStateIdLabel}=${devContainerId}`];
}

export function getDevContainerStateMount(devContainerId: string, target: string): string {
	return `type=volume,source=${getDevContainerStateVolumeName(devContainerId)},target=${target},external=true`;
}

export function findDevContainerStateMount<T extends { readonly Type: string; readonly Name?: string }>(mounts: readonly T[]): T | undefined {
	return mounts.find(mount => mount.Type === 'volume' && !!mount.Name && stateVolumePattern.test(mount.Name));
}

export interface IDevContainerStateMountConfiguration {
	readonly dockerComposeFile?: unknown;
	readonly workspaceMount?: unknown;
	readonly mounts?: unknown;
	readonly runArgs?: unknown;
}

/** Uses /workspaces unless Compose or a configured mount could conflict with a volume there. */
export function getDevContainerStateMountTarget(configuration: IDevContainerStateMountConfiguration, additionalMounts: readonly unknown[] = []): string {
	// Unresolved variables could resolve to /workspaces.
	const mayUseWorkspaces = (value: unknown) => typeof value === 'string' && (value.includes('${') || /(?:^|[=:])\/workspaces\/?(?=$|[,:\s])/.test(value));
	const mounts = [...Array.isArray(configuration.mounts) ? configuration.mounts : [], ...additionalMounts];
	const workspaceMountTarget = typeof configuration.workspaceMount === 'string' ? getMountTarget(configuration.workspaceMount) : undefined;
	if (configuration.dockerComposeFile !== undefined
		|| (configuration.workspaceMount !== undefined && (!workspaceMountTarget?.startsWith('/workspaces/') || workspaceMountTarget.includes('${')))
		|| (Array.isArray(configuration.runArgs) && configuration.runArgs.some(mayUseWorkspaces))
		|| mounts.some(mount => mayUseWorkspaces(typeof mount === 'string' ? getMountTarget(mount) ?? mount : typeof mount === 'object' && mount !== null ? (mount as { readonly target?: unknown }).target : mount))) {
		return devContainerStateFallbackTarget;
	}
	return devContainerStateWorkspacesTarget;
}

/** Classifies a state volume target for telemetry. */
export function getDevContainerStateTargetKind(target: string): 'workspaces' | 'volume' {
	return target === devContainerStateWorkspacesTarget ? 'workspaces' : 'volume';
}

function getMountTarget(mount: string): string | undefined {
	for (const option of mount.split(',')) {
		const i = option.indexOf('=');
		if (i !== -1 && ['target', 'dst', 'destination'].includes(option.substring(0, i).trim())) {
			return option.substring(i + 1).trim();
		}
	}
	return undefined;
}

export interface IDevContainerStateLinkOptions {
	/** Where the state volume is mounted in the container. */
	readonly volumePath: string;
	readonly homeFolder: string;
	readonly uid: string;
	readonly gid: string;
	readonly serverDataFolderName: string;
}

/**
 * Links user state folders in the home folder to the state volume. Runs as root before the server or any
 * lifecycle command starts. Folders with a mount at, above or inside them are already persisted otherwise.
 */
export function buildLinkDevContainerStateCommand(options: IDevContainerStateLinkOptions): string {
	const { uid, gid, serverDataFolderName } = options;
	const normalize = (value: string) => {
		const normalized = posix.normalize(value);
		return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
	};
	const volumePath = normalize(options.volumePath);
	const homeFolder = normalize(options.homeFolder);
	if (!posix.isAbsolute(volumePath) || volumePath === '/' || !posix.isAbsolute(homeFolder) || !/^\d+$/.test(uid) || !/^\d+$/.test(gid) || !isFolderName(serverDataFolderName)) {
		throw new Error('Invalid Dev Container state folder or user');
	}
	const link = (folder: string) => {
		const segments = folder.split('/');
		const parents = segments.slice(1).map((_, i) => segments.slice(0, i + 1).join('/'));
		return `link_state ${[folder, ...parents].map(shellQuote).join(' ')}`;
	};
	const serverLinks = [...new Set([serverDataFolderName, ...knownServerDataFolderNames])].flatMap(name => {
		const links = serverStateFolders.map(folder => link(`${name}/${folder}`));
		return name === serverDataFolderName ? links : [
			// Persist another product's state only if it is used in this container.
			`if [ -d "$home_prefix/"${shellQuote(name)} ] || [ -d "$state/"${shellQuote(name)} ]; then`,
			...links.map(line => `  ${line}`),
			'fi',
		];
	});
	return [
		'set -eu',
		'umask 022',
		`volume=${shellQuote(volumePath)}`,
		`home=${shellQuote(homeFolder)}`,
		`owner=${shellQuote(`${uid}:${gid}`)}`,
		`state="$volume/"${shellQuote(stateFolderName)}`,
		`link_path=${shellQuote(devContainerStatePath)}`,
		// Progress on stdout for telemetry, see `parseLinkDevContainerStateOutput`; messages go to stderr.
		`progress() { echo ${shellQuote(linkProgressPrefix)}"$1"; }`,
		'progress step:volume',
		'test ! -L "$volume"',
		'test -d "$volume"',
		'progress step:stateFolder',
		'test ! -L "$state"',
		'test -d "$state" || mkdir "$state" || test -d "$state"',
		// Moved folders are no longer protected by the home folder's permissions.
		'chown "$owner" "$state"',
		'chmod 700 "$state"',
		`test -e "$state/.layout" || printf '%s\\n' ${shellQuote(stateLayoutVersion)} > "$state/.layout"`,
		'progress step:statePath',
		'if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then echo "$link_path exists and is not a symlink" >&2; exit 1; fi',
		'progress step:stateLink',
		'ln -sfnT "$state" "$link_path"',
		'progress step:home',
		'if [ ! -d "$home" ]; then progress noHome; echo "Not persisting user state: home folder $home not found" >&2; exit 0; fi',
		'home_prefix=${home%/}',
		'home_real=$(cd "$home" && pwd -P)',
		'home_real=${home_real%/}',
		'progress step:mountinfo',
		'test -r /proc/self/mountinfo',
		`mounts=$(cut -d' ' -f5 /proc/self/mountinfo | sed 's/\\\\040/ /g')`,
		'has_mount() {',
		'  while IFS= read -r mount; do',
		'    case "$mount" in',
		'      ""|/) ;;',
		'      "$1"|"$1"/*) return 0 ;;',
		'      *) case "$1" in "$mount"/*) return 0 ;; esac ;;',
		'    esac',
		'  done <<EOF',
		'$mounts',
		'EOF',
		'  return 1',
		'}',
		'is_other() { [ -L "$1" ] || { [ -e "$1" ] && [ ! -d "$1" ]; }; }',
		'skip() { progress "skip:$1"; echo "Not persisting ~/$rel: $2" >&2; }',
		'link_state() {',
		'  rel=$1',
		'  shift',
		'  src="$home_prefix/$rel"',
		'  dst="$state/$rel"',
		'  target="$link_path/$rel"',
		'  for parent in "$@"; do',
		'    if is_other "$home_prefix/$parent" || is_other "$state/$parent"; then skip parent "~/$parent is not a folder"; return 0; fi',
		'  done',
		'  if has_mount "$home_real/$rel"; then skip mounted "it is already mounted"; return 0; fi',
		'  if [ -L "$src" ]; then',
		'    if [ "$(readlink "$src")" != "$target" ]; then skip symlink "it is a symlink"; return 0; fi',
		'  elif [ -e "$src" ] && [ ! -d "$src" ]; then',
		'    skip file "it is not a folder"; return 0',
		'  fi',
		'  if is_other "$dst"; then skip state "$dst is not a folder"; return 0; fi',
		'  for parent in "$@"; do',
		'    if [ ! -d "$home_prefix/$parent" ]; then',
		'      mkdir "$home_prefix/$parent" || test -d "$home_prefix/$parent"',
		'      chown "$owner" "$home_prefix/$parent"',
		'    fi',
		'    test -d "$state/$parent" || mkdir "$state/$parent" || test -d "$state/$parent"',
		'  done',
		'  result=existing',
		'  if [ ! -L "$src" ]; then',
		'    if [ -d "$dst" ]; then',
		'      result=restored',
		// Like a volume mount, existing state hides the container's own folder.
		'      if [ -d "$src" ]; then rm -rf "$src"; fi',
		'    elif [ -d "$src" ]; then',
		'      result=moved',
		'      mv "$src" "$dst"',
		'    else',
		'      result=created',
		'    fi',
		'  fi',
		'  test -d "$dst" || mkdir "$dst" || test -d "$dst"',
		'  if [ "$(stat -c %u:%g "$dst")" != "$owner" ]; then chown -R "$owner" "$dst"; fi',
		'  if [ ! -L "$src" ]; then',
		'    ln -sT "$target" "$src" || test "$(readlink "$src")" = "$target"',
		'    echo "Persisting ~/$rel in $dst" >&2',
		'  fi',
		'  progress "folder:$result"',
		'}',
		'progress step:folders',
		...serverLinks,
		...homeStateFolders.map(link),
	].join('\n');
}

/** What the link command reported on stdout, for telemetry. */
export interface IDevContainerStateLinkProgress {
	/** The last step the command started, which is the failed step if the command failed. */
	readonly step: string | undefined;
	readonly homeFound: boolean;
	/** Folders whose state from an earlier container replaced the container's own folder. */
	readonly restoredFolders: number;
	/** Folders moved from the container to the state volume. */
	readonly movedFolders: number;
	readonly createdFolders: number;
	/** Folders that were already linked. */
	readonly existingFolders: number;
	readonly skippedFolders: number;
	/** Sorted, comma-separated reasons for not persisting folders. */
	readonly skipReasons: string;
}

export function parseLinkDevContainerStateOutput(stdout: string): IDevContainerStateLinkProgress {
	let step: string | undefined;
	let homeFound = true;
	const folders: Record<string, number> = { restored: 0, moved: 0, created: 0, existing: 0 };
	let skippedFolders = 0;
	const skipReasons = new Set<string>();
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.startsWith(linkProgressPrefix)) {
			continue;
		}
		const [kind, value] = line.substring(linkProgressPrefix.length).split(':');
		if (kind === 'step' && linkSteps.includes(value)) {
			step = value;
		} else if (kind === 'noHome') {
			homeFound = false;
		} else if (kind === 'skip') {
			skippedFolders++;
			skipReasons.add(linkSkipReasons.includes(value) ? value : 'unknown');
		} else if (kind === 'folder' && Object.prototype.hasOwnProperty.call(folders, value)) {
			folders[value]++;
		}
	}
	return {
		step,
		homeFound,
		restoredFolders: folders.restored,
		movedFolders: folders.moved,
		createdFolders: folders.created,
		existingFolders: folders.existing,
		skippedFolders,
		skipReasons: [...skipReasons].sort().join(','),
	};
}

/** Values that identify the container user, removed from error messages for telemetry. */
export interface IDevContainerStateErrorValues {
	readonly homeFolder?: string;
	readonly user?: string;
}

const maxErrorMessageLength = 1000;
const errorMessageHeadLength = 300;
const failedCommandPattern = String.raw`\b(Command(?: in \w+)? failed): (\S+)(?: ([a-z][\w-]*)(?=\s|$))?`;

/**
 * Builds an error message for telemetry from parts such as an error message and a command's stderr. Removes command
 * lines, Dev Containers CLI log entries, ids and the container user. The telemetry service redacts paths and secrets.
 */
export function sanitizeDevContainerStateErrorMessage(parts: readonly (string | undefined)[], values: IDevContainerStateErrorValues = {}): string | undefined {
	const replacements: [RegExp, string][] = [
		[/vscode-state-[0-9a-v]{52}/g, 'vscode-state-<id>'],
		[/\b(?:[0-9a-f]{64}|[0-9a-f]{12})\b/g, '<id>'],
	];
	const homeFolder = values.homeFolder?.replace(/\/+$/, '');
	if (homeFolder) {
		replacements.push([new RegExp(`${escapeRegExp(homeFolder)}(?![\\w.-])`, 'g'), '~']);
	}
	if (values.user && values.user !== 'root') {
		replacements.push([new RegExp(`(?<![\\w.-])${escapeRegExp(values.user)}(?![\\w.-])`, 'g'), '<user>']);
	}
	const summarizeCommand = (_match: string, prefix: string, command: string, subcommand: string | undefined, args: string) =>
		`${prefix}: ${command.split(/[\\/]/).pop()}${subcommand ? ` ${subcommand}` : ''}${args.trim() ? ' <args>' : ''}`;
	const lines = parts.flatMap(part => {
		let text = (part || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
		// A part starting with a failed command is the command line, which can span lines and contain local values.
		const wholePart = new RegExp(`^\\s*${failedCommandPattern}([\\s\\S]*)$`);
		text = wholePart.test(text) ? text.replace(wholePart, summarizeCommand) : text.replace(new RegExp(`${failedCommandPattern}(.*)`, 'g'), summarizeCommand);
		return text.split(/\r?\n/)
			// CLI log entries include command lines. The link command's messages are informational.
			.map(line => line.replace(/\[\d+ ms\].*/, '').replace(/(^|: )\s*(?:Persisting|Not persisting) ~\/.*/, '$1'))
			.map(line => replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), line).trim())
			.filter(line => !!line);
	});
	const message = lines.join('\n');
	if (message.length <= maxErrorMessageLength) {
		return message || undefined;
	}
	// The specific error is usually at the end.
	return `${message.substring(0, errorMessageHeadLength)}\n…\n${message.substring(message.length - (maxErrorMessageLength - errorMessageHeadLength - 3))}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFolderName(value: string): boolean {
	return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..';
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
