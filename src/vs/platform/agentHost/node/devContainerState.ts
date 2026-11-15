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
/** Prefixes the dev container's id labels on its state volume, so tools that find containers or repository volumes by them ignore it. */
export const devContainerStateLabelPrefix = 'vscode.dev-container-state.label.';

const stateVolumePattern = /^vscode-state-(?:[a-z0-9][a-z0-9_.-]*-)?[0-9a-v]{12}$/;
const stateVolumeIdLength = 12;
const stateVolumeFolderNameLength = 32;
/** Id labels naming the dev container's folder or repository, in order of preference. */
const folderIdLabels = ['vsch.local.repository.folder', 'vsch.local.repository', 'devcontainer.local_folder', 'vsch.local.folder', 'vsch.local.volume'];
const stateFolderName = '.vscode-state';
const stateLayoutVersion = '1';
const knownServerDataFolderNames = ['.vscode-server', '.vscode-server-insiders'];
const serverStateFolders = ['data/User/globalStorage', 'data/User/workspaceStorage', 'data/User/History', 'data/agentSessionData'];
const homeStateFolders = ['.copilot'];
const linkProgressPrefix = 'vscode-state:';
const linkSteps = ['volume', 'stateFolder', 'statePath', 'stateLink', 'home', 'mountinfo', 'folders'];
const linkSkipReasons = ['parent', 'mounted', 'symlink', 'file', 'state', 'home', 'running'];

/** Computes the Dev Containers CLI's `${devcontainerId}` for the container's id labels. */
export function getDevContainerId(idLabels: readonly string[]): string {
	const labels = parseIdLabels(idLabels);
	const hash = createHash('sha256').update(JSON.stringify(labels, Object.keys(labels).sort()), 'utf8').digest('hex');
	return BigInt(`0x${hash}`).toString(32).padStart(52, '0');
}

function parseIdLabels(idLabels: readonly string[]): Record<string, string> {
	return idLabels.reduce<Record<string, string>>((obj, pair) => {
		const i = pair.indexOf('=');
		if (i !== -1) {
			obj[pair.substring(0, i)] = pair.substring(i + 1);
		}
		return obj;
	}, {});
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

/** Names the state volume after the dev container's folder or repository and the end of its `${devcontainerId}`. */
export function getDevContainerStateVolumeName(idLabels: readonly string[]): string {
	const labels = parseIdLabels(idLabels);
	const value = folderIdLabels.map(key => labels[key]).find(value => !!value);
	const baseName = value?.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.replace(/\.git$/i, '');
	// Volume names may only contain [a-zA-Z0-9_.-] and start with a letter or digit. Letters keep their base letter without accents.
	const folder = baseName?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').substring(0, stateVolumeFolderNameLength).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
	return `vscode-state-${folder ? `${folder}-` : ''}${getDevContainerId(idLabels).slice(-stateVolumeIdLength)}`;
}

/** Identifies the dev container a state volume belongs to. */
export function getDevContainerStateVolumeLabels(idLabels: readonly string[]): string[] {
	return [`${devContainerStateIdLabel}=${getDevContainerId(idLabels)}`, ...idLabels.filter(label => label.includes('=')).map(label => `${devContainerStateLabelPrefix}${label}`)];
}

/** Whether an existing volume's labels show it is the dev container's state volume, as its name is not unique. */
export function isDevContainerStateVolumeFor(volumeLabels: unknown, idLabels: readonly string[]): boolean {
	return typeof volumeLabels === 'object' && volumeLabels !== null && (volumeLabels as Record<string, unknown>)[devContainerStateIdLabel] === getDevContainerId(idLabels);
}

export function getDevContainerStateMount(idLabels: readonly string[], target: string): string {
	return `type=volume,source=${getDevContainerStateVolumeName(idLabels)},target=${target},external=true`;
}

export function findDevContainerStateMount<T extends { readonly Type: string; readonly Name?: string; readonly Destination: string }>(mounts: readonly T[]): T | undefined {
	// Other destinations are not from Dev Containers, e.g., the /volume of "Explore a Volume in a Dev Container".
	return mounts.find(mount => mount.Type === 'volume' && !!mount.Name && stateVolumePattern.test(mount.Name)
		&& [devContainerStateWorkspacesTarget, devContainerStateFallbackTarget].includes(normalizeMountTarget(mount.Destination)));
}

/** Whether a container's processes may be using its folders, from its Docker or Podman state, e.g., `{{.State}}` in `ps`. */
export function isDevContainerRunning(state: string): boolean {
	return ['running', 'paused', 'restarting'].includes(state.trim().toLowerCase());
}

export interface IDevContainerStateMountConfiguration {
	readonly dockerComposeFile?: unknown;
	readonly workspaceMount?: unknown;
	readonly mounts?: unknown;
	readonly runArgs?: unknown;
}

/**
 * Uses /workspaces unless Compose or a configured mount could conflict with a volume there. Throws if a configured mount
 * also uses the fallback target.
 */
export function getDevContainerStateMountTarget(configuration: IDevContainerStateMountConfiguration, additionalMounts: readonly unknown[] = []): string {
	// Checks all paths in a value, e.g., a mount's source and target in runArgs.
	const usesPath = (value: unknown, path: string) => typeof value === 'string' && value.split(/[=:,\s]/).some(part => part.startsWith('/') && normalizeMountTarget(part) === path);
	// Unresolved variables could resolve to /workspaces.
	const mayUseWorkspaces = (value: unknown) => typeof value === 'string' && (value.includes('${') || usesPath(value, devContainerStateWorkspacesTarget));
	const mountTargets = [...Array.isArray(configuration.mounts) ? configuration.mounts : [], ...additionalMounts]
		.map(mount => typeof mount === 'string' ? getMountTarget(mount) ?? mount : typeof mount === 'object' && mount !== null ? (mount as { readonly target?: unknown }).target : mount);
	const runArgs: readonly unknown[] = Array.isArray(configuration.runArgs) ? configuration.runArgs : [];
	const workspaceMountTarget = typeof configuration.workspaceMount === 'string' ? getMountTarget(configuration.workspaceMount) : undefined;
	if (configuration.dockerComposeFile !== undefined
		|| (configuration.workspaceMount !== undefined && (!workspaceMountTarget || !normalizeMountTarget(workspaceMountTarget).startsWith(`${devContainerStateWorkspacesTarget}/`) || workspaceMountTarget.includes('${')))
		|| runArgs.some(mayUseWorkspaces)
		|| mountTargets.some(mayUseWorkspaces)) {
		if ([workspaceMountTarget, ...runArgs, ...mountTargets].some(value => usesPath(value, devContainerStateFallbackTarget))) {
			throw new Error(`Both ${devContainerStateWorkspacesTarget} and ${devContainerStateFallbackTarget} may already be mounted`);
		}
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

/** Normalizes a mount destination like Docker, e.g., /workspaces/. and /workspaces// are /workspaces. */
function normalizeMountTarget(target: string): string {
	const normalized = posix.normalize(target);
	return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export interface IDevContainerStateLinkOptions {
	/** Where the state volume is mounted in the container. */
	readonly volumePath: string;
	/** The home folder of the server data folder. */
	readonly homeFolder: string;
	/** HOME of the user's processes if it differs, e.g., set by `remoteEnv`. Folders such as ~/.copilot are linked there. */
	readonly userHomeFolder?: string;
	readonly uid: string;
	readonly gid: string;
	readonly serverDataFolderName: string;
	/**
	 * Keeps folders that exist in the home folders instead of moving them to the volume or replacing them with its state,
	 * because the container was already running and its processes may be using them. If the volume's state replaces such a
	 * folder later, a copy of the folder is kept next to that state.
	 */
	readonly keepExistingFolders?: boolean;
}

/**
 * Links user state folders in the home folders to the state volume. Runs as root before the server or any
 * lifecycle command starts. Folders with a mount at, above or inside them are already persisted otherwise.
 * When the container was already running, e.g., after an earlier link failed, see `keepExistingFolders`.
 */
export function buildLinkDevContainerStateCommand(options: IDevContainerStateLinkOptions): string {
	const { uid, gid, serverDataFolderName } = options;
	const volumePath = normalizeMountTarget(options.volumePath);
	const homeFolder = normalizeMountTarget(options.homeFolder);
	const userHomeFolder = normalizeMountTarget(options.userHomeFolder ?? options.homeFolder);
	if (!posix.isAbsolute(volumePath) || volumePath === '/' || !posix.isAbsolute(homeFolder) || !posix.isAbsolute(userHomeFolder) || !/^\d+$/.test(uid) || !/^\d+$/.test(gid) || !isFolderName(serverDataFolderName)) {
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
			`if [ -d "$home_prefix/"${shellQuote(name)} ] || [ -d ./${shellQuote(name)} ]; then`,
			...links.map(line => `  ${line}`),
			'fi',
		];
	});
	return [
		'set -eu',
		'umask 022',
		`volume=${shellQuote(volumePath)}`,
		`home=${shellQuote(homeFolder)}`,
		`user_home=${shellQuote(userHomeFolder)}`,
		`owner=${shellQuote(`${uid}:${gid}`)}`,
		`state_owner=${shellQuote(`0:${gid}`)}`,
		`keep_existing=${options.keepExistingFolders ? '1' : ''}`,
		`state="$volume/"${shellQuote(stateFolderName)}`,
		`link_path=${shellQuote(devContainerStatePath)}`,
		// Progress on stdout for telemetry, see `parseLinkDevContainerStateOutput`; messages go to stderr.
		`progress() { echo ${shellQuote(linkProgressPrefix)}"$1"; }`,
		'progress step:volume',
		'test ! -L "$volume"',
		'test -d "$volume"',
		'volume_real=$(cd -P "$volume" && pwd -P)',
		'progress step:stateFolder',
		'test ! -L "$state"',
		'test -d "$state" || mkdir "$state" || test -d "$state"',
		// The user can own the volume's root folder, e.g., when Docker copied a user-owned /workspaces from the image, and then
		// replace the state folder at any time. Works inside the state folder after checking that it is on the volume and owned
		// by root, so a later replacement does not affect this script.
		'cd -P "$state"',
		`if [ "$(pwd -P)" != "$volume_real/"${shellQuote(stateFolderName)} ]; then echo "$state is not a folder on the volume" >&2; exit 1; fi`,
		'if [ "$(stat -c %u .)" != 0 ]; then echo "$state is not owned by root" >&2; exit 1; fi',
		// Moved folders are no longer protected by the home folder's permissions, so only the user's group may enter. Root
		// owns the state folder and the parents of moved folders, so the user cannot plant symlinks for this script to follow.
		'chown -h "$state_owner" .',
		'chmod 750 .',
		// Serializes links, e.g., from two windows opening the container, so a folder being moved is not taken for restored state.
		'locked=',
		'if command -v flock >/dev/null 2>&1; then exec 9<.; flock 9; locked=1; fi',
		`test -e .layout || printf '%s\\n' ${shellQuote(stateLayoutVersion)} > .layout`,
		'progress step:statePath',
		'if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then echo "$link_path exists and is not a symlink" >&2; exit 1; fi',
		'progress step:stateLink',
		'ln -sfnT "$state" "$link_path"',
		'progress step:home',
		'set_home() {',
		'  home_prefix=${1%/}',
		'  home_found=',
		'  if [ -d "$1" ]; then',
		'    home_real=$(cd "$1" && pwd -P)',
		'    home_real=${home_real%/}',
		'    home_found=1',
		'  fi',
		'}',
		'set_home "$home"',
		'if [ -z "$home_found" ]; then progress noHome; echo "Not persisting user state: home folder $home not found" >&2; exit 0; fi',
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
		// Relative to the state folder, see above.
		'  dst="./$rel"',
		'  target="$link_path/$rel"',
		'  if [ -z "$home_found" ]; then skip home "home folder $home_prefix not found"; return 0; fi',
		'  for parent in "$@"; do',
		'    if is_other "$home_prefix/$parent" || is_other "./$parent"; then skip parent "~/$parent is not a folder"; return 0; fi',
		'  done',
		'  if has_mount "$home_real/$rel"; then skip mounted "it is already mounted"; return 0; fi',
		'  if [ -L "$src" ]; then',
		'    if [ "$(readlink "$src")" != "$target" ]; then skip symlink "it is a symlink"; return 0; fi',
		'  elif [ -e "$src" ] && [ ! -d "$src" ]; then',
		'    skip file "it is not a folder"; return 0',
		'  fi',
		'  if is_other "$dst"; then skip state "$state/$rel is not a folder"; return 0; fi',
		// Moving or replacing a folder that is in use would lose the changes made to it meanwhile. The marker keeps a copy of
		// these changes when the volume's state replaces the folder later, see below.
		'  if [ -n "$keep_existing" ] && [ ! -L "$src" ] && [ -d "$src" ]; then',
		'    if [ -d "$dst" ]; then : > "$dst.deferred"; fi',
		'    skip running "it exists and the container was already running"; return 0',
		'  fi',
		'  for parent in "$@"; do',
		'    if [ ! -d "$home_prefix/$parent" ]; then',
		'      mkdir "$home_prefix/$parent" || test -d "$home_prefix/$parent"',
		'      chown -h "$owner" "$home_prefix/$parent"',
		'    fi',
		'    test -d "./$parent" || mkdir "./$parent" || test -d "./$parent"',
		'  done',
		'  result=existing',
		'  if [ ! -L "$src" ]; then',
		'    if [ -d "$dst" ]; then',
		'      result=restored',
		// Like a volume mount, existing state hides the container's own folder. A folder kept while the container was running
		// may have changed meanwhile, so a copy of it stays on the volume.
		'      if [ -d "$src" ]; then',
		'        if [ -e "$dst.deferred" ]; then',
		// A new folder, because the user owns earlier copies and could plant symlinks in them.
		'          copy=$(mktemp -d "$dst.deferred.XXXXXX")',
		'          cp -a "$src/." "$copy"',
		'          echo "Keeping the previous ~/$rel in $state/${copy#./}" >&2',
		'        fi',
		'        rm -rf "$src"',
		'      fi',
		'    elif [ -d "$src" ]; then',
		'      result=moved',
		// Copies, publishes the complete copy and only then removes the source, so an interrupted move is either retried or
		// taken for restored state. Unfinished copies of other runs are removed only while holding the lock.
		'      if [ -n "$locked" ]; then rm -rf "$dst".moving.*; else rm -rf "$dst.moving.$$"; fi',
		'      cp -a "$src" "$dst.moving.$$"',
		'      mv "$dst.moving.$$" "$dst"',
		'      rm -rf "$src"',
		'    else',
		'      result=created',
		'    fi',
		'    rm -f "$dst.deferred"',
		'  fi',
		'  test -d "$dst" || mkdir "$dst" || test -d "$dst"',
		'  if [ "$(stat -c %u:%g "$dst")" != "$owner" ]; then chown -R "$owner" "$dst"; fi',
		'  if [ ! -L "$src" ]; then',
		'    ln -sT "$target" "$src" || test "$(readlink "$src")" = "$target"',
		'    echo "Persisting ~/$rel in $state/$rel" >&2',
		'  fi',
		'  progress "folder:$result"',
		'}',
		'progress step:folders',
		...serverLinks,
		'set_home "$user_home"',
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
// Other commands' arguments and other subcommands can contain local values.
const errorMessageCommands = ['docker', 'podman', 'docker-compose'];
const errorMessageSubcommands = ['build', 'buildx', 'compose', 'container', 'cp', 'create', 'down', 'exec', 'image', 'inspect', 'network', 'ps', 'pull', 'rm', 'run', 'start', 'stop', 'up', 'volume'];

/**
 * Builds an error message for telemetry from parts such as an error message and a command's stderr. Removes command
 * lines, Dev Containers CLI log entries, ids and the container user. The telemetry service redacts paths and secrets.
 */
export function sanitizeDevContainerStateErrorMessage(parts: readonly (string | undefined)[], values: IDevContainerStateErrorValues = {}): string | undefined {
	const replacements: [RegExp, string][] = [
		// State volume names include the folder name.
		[/vscode-state-[a-z0-9_.-]*[a-z0-9]/g, 'vscode-state-<name>'],
		[/\b(?:[0-9a-f]{64}|[0-9a-f]{12})\b/g, '<id>'],
	];
	const homeFolder = values.homeFolder?.replace(/\/+$/, '');
	if (homeFolder) {
		replacements.push([new RegExp(`${escapeRegExp(homeFolder)}(?![\\w.-])`, 'g'), '~']);
	}
	if (values.user && values.user !== 'root') {
		replacements.push([new RegExp(`(?<![\\w.-])${escapeRegExp(values.user)}(?![\\w.-])`, 'g'), '<user>']);
	}
	const summarizeCommand = (_match: string, prefix: string, command: string, subcommand: string | undefined, args: string) => {
		const name = command.split(/[\\/]/).pop();
		const keep = !!subcommand && errorMessageCommands.includes(name?.replace(/\.exe$/i, '') || '') && errorMessageSubcommands.includes(subcommand);
		return `${prefix}: ${name}${keep ? ` ${subcommand}` : ''}${(subcommand && !keep) || args.trim() ? ' <args>' : ''}`;
	};
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
