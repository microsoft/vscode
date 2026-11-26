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
const linkSteps = ['capabilities', 'rootfs', 'volume', 'stateFolder', 'statePath', 'stateLink', 'home', 'mountinfo', 'folders'];
const linkSkipReasons = ['parent', 'mounted', 'symlink', 'file', 'state', 'home', 'running', 'untrusted'];
const linkSkippedOutcomes = ['missingCapabilities', 'readOnlyRootfs', 'homeInaccessible', 'stateNotRootOwned', 'untrustedState'] as const;
/** Capabilities root needs to manage another user's folders or to enter their home folder, by their bit in `CapEff`. */
const linkCapabilities = { CAP_CHOWN: 0, CAP_DAC_OVERRIDE: 1, CAP_DAC_READ_SEARCH: 2, CAP_FOWNER: 3 };
const stateOwners = ['root', 'user', 'other'] as const;

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
		`user_uid=${shellQuote(uid)}`,
		`state_owner=${shellQuote(`0:${gid}`)}`,
		`keep_existing=${options.keepExistingFolders ? '1' : ''}`,
		`state="$volume/"${shellQuote(stateFolderName)}`,
		`link_path=${shellQuote(devContainerStatePath)}`,
		// Progress on stdout for telemetry, see `parseLinkDevContainerStateOutput`; messages go to stderr.
		`progress() { echo ${shellQuote(linkProgressPrefix)}"$1"; }`,
		'progress step:capabilities',
		// Root needs capabilities to manage another user's folders, which cap_drop can remove. Not needed for a root user.
		// CAP_FOWNER is needed only for copying folders, see `need_fowner`.
		'script_uid=',
		'cap_eff=',
		'if [ -r /proc/self/status ]; then',
		'  while read -r key first second rest; do',
		'    case "$key" in',
		'      Uid:) script_uid=$second ;;',
		'      CapEff:) cap_eff=$first ;;',
		'    esac',
		'  done < /proc/self/status',
		'fi',
		'case "$script_uid" in "") ;; 0) progress uid:root ;; *) progress uid:other ;; esac',
		'case "$cap_eff" in ""|*[!0-9a-fA-F]*) cap_eff= ;; *) progress "capEff:$cap_eff"; cap_low=${cap_eff#"${cap_eff%?}"} ;; esac',
		// True if the capabilities are unknown.
		'has_cap() { [ -z "$cap_eff" ] || [ $((0x$cap_low >> $1 & 1)) = 1 ]; }',
		'missing=',
		'need_cap() {',
		'  if ! has_cap $1; then progress "missing:$2"; missing="$missing $2"; fi',
		'}',
		`case "$owner" in 0:0) ;; *) need_cap ${linkCapabilities.CAP_CHOWN} CAP_CHOWN ;; esac`,
		`case "$owner" in 0:*) ;; *) need_cap ${linkCapabilities.CAP_DAC_OVERRIDE} CAP_DAC_OVERRIDE ;; esac`,
		'if [ -n "$missing" ]; then progress skipped:missingCapabilities; echo "Not persisting user state: the container lacks$missing" >&2; exit 0; fi',
		'progress step:rootfs',
		// The state link is in the root folder.
		'if [ -r /proc/self/mountinfo ]; then',
		'  root_options=',
		'  while read -r mount_id parent_id device root mount_point mount_options rest; do',
		'    if [ "$mount_point" = / ]; then root_options=$mount_options; fi',
		'  done < /proc/self/mountinfo',
		'  case ",$root_options," in *,ro,*) progress skipped:readOnlyRootfs; echo "Not persisting user state: the root file system is read-only" >&2; exit 0 ;; esac',
		'fi',
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
		'owner_kind() { case "$1" in 0) echo root ;; "$user_uid") echo user ;; *) echo other ;; esac; }',
		'state_uid=$(stat -c %u .)',
		'progress "stateOwner:$(owner_kind "$state_uid")"',
		// The volume's root folder.
		'volume_uid=$(stat -c %u ..)',
		'progress "volumeOwner:$(owner_kind "$volume_uid")"',
		// E.g., after a `chown -R` of the volume in a lifecycle command. Taking ownership again would not make the folders and
		// symlinks the user could add meanwhile safe for this script to work in.
		'if [ "$state_uid" != 0 ]; then',
		'  progress skipped:stateNotRootOwned',
		'  echo "Not persisting user state: $state is not owned by root. To keep it, give it and its contents back to root (chown -R root:root) if you trust them, or remove it to start fresh" >&2',
		'  exit 0',
		'fi',
		'root_only() { case "$(stat -c %u:%A "$1")" in 0:d????-??-?*) return 0 ;; *) return 1 ;; esac; }',
		// A root user's state must neither come from nor be replaceable by another user, e.g., hooks in ~/.copilot run as root.
		'if [ "$user_uid" = 0 ]; then',
		'  if ! root_only . || ! root_only ..; then',
		'    progress skipped:untrustedState; echo "Not persisting user state: a user other than root can write to $state or $volume" >&2; exit 0',
		'  fi',
		// Another user could replace the state folder with their own.
		'elif [ "$(owner_kind "$volume_uid")" = other ]; then',
		'  progress skipped:untrustedState; echo "Not persisting user state: another user owns $volume" >&2; exit 0',
		'fi',
		// Moved folders are no longer protected by the home folder's permissions, so only the user's group may enter. Root
		// owns the state folder and the parents of moved folders, so the user cannot plant symlinks for this script to follow.
		'chown -h "$state_owner" .',
		'chmod 750 .',
		// Serializes links, e.g., from two windows opening the container, so a folder being moved is not taken for restored state.
		'locked=',
		'if command -v flock >/dev/null 2>&1; then exec 9<.; flock 9; locked=1; fi',
		`test -e .layout || test -L .layout || printf '%s\\n' ${shellQuote(stateLayoutVersion)} > .layout`,
		'progress step:statePath',
		'if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then echo "$link_path exists and is not a symlink" >&2; exit 1; fi',
		'progress step:stateLink',
		'ln -sfnT "$state" "$link_path"',
		'progress step:home',
		'set_home() {',
		'  home_prefix=${1%/}',
		'  home_found=',
		'  home_inaccessible=',
		'  if [ -d "$1" ]; then',
		'    if home_real=$(cd "$1" 2>/dev/null && pwd -P); then',
		'      home_real=${home_real%/}',
		'      home_found=1',
		'    else',
		'      home_inaccessible=1',
		'    fi',
		'  else',
		'    check_home_access "$1"',
		'  fi',
		'}',
		// The home folder or a symlink's target may exist below a folder that root cannot enter. Only reads, never writes.
		'check_home_access() {',
		'  home_path=$1',
		'  home_links=0',
		'  while [ $home_links -lt 40 ]; do',
		'    while [ "$home_path" != / ] && [ ! -e "$home_path" ] && [ ! -L "$home_path" ]; do home_path=$(dirname "$home_path"); done',
		'    if [ -e "$home_path" ] || [ ! -L "$home_path" ]; then break; fi',
		'    home_target=$(readlink "$home_path") || return 0',
		'    case "$home_target" in /*) home_path=$home_target ;; *) home_path=$(dirname "$home_path")/$home_target ;; esac',
		'    home_links=$((home_links + 1))',
		'  done',
		'  if [ -d "$home_path" ] && ! (cd "$home_path" 2>/dev/null); then home_inaccessible=1; fi',
		'}',
		'set_home "$home"',
		'if [ -n "$home_inaccessible" ]; then',
		// E.g., a home folder with mode 700 that root does not own.
		`  if has_cap ${linkCapabilities.CAP_DAC_OVERRIDE} || has_cap ${linkCapabilities.CAP_DAC_READ_SEARCH}; then`,
		'    progress skipped:homeInaccessible; echo "Not persisting user state: home folder $home is not accessible" >&2',
		'  else',
		'    progress missing:CAP_DAC_OVERRIDE; progress missing:CAP_DAC_READ_SEARCH; progress skipped:missingCapabilities',
		'    echo "Not persisting user state: root cannot enter home folder $home without CAP_DAC_OVERRIDE or CAP_DAC_READ_SEARCH" >&2',
		'  fi',
		'  exit 0',
		'fi',
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
		// Copying the user's files with their permissions changes files root does not own. Checked before replacing anything.
		'need_fowner() {',
		'  case "$owner" in 0:*) return 0 ;; esac',
		`  if ! has_cap ${linkCapabilities.CAP_FOWNER}; then`,
		'    progress missing:CAP_FOWNER; progress skipped:missingCapabilities',
		'    echo "Not persisting ~/$rel and the remaining folders: the container lacks CAP_FOWNER" >&2; exit 0',
		'  fi',
		'}',
		// Restoring files another user wrote, e.g., before a change of the container user, would let them plant hooks that run
		// as this user. Nobody else may be able to change a root user's files either. With ACLs, the group bits are the mask,
		// which limits named users and groups. True if there is such a file or `find` fails.
		'untrusted_files() {',
		'  if [ "$user_uid" = 0 ]; then',
		'    set -- "$1" \\( ! -user 0 -o ! -type l \\( -perm -020 -o -perm -002 \\) \\)',
		'  else',
		'    set -- "$1" ! -user 0 ! -user "$user_uid"',
		'  fi',
		'  { find "$@" -print 2>&1 || echo failed; } | { read -r line; }',
		'}',
		'link_state() {',
		'  rel=$1',
		'  shift',
		'  src="$home_prefix/$rel"',
		// Relative to the state folder, see above.
		'  dst="./$rel"',
		'  target="$link_path/$rel"',
		'  if [ -z "$home_found" ]; then',
		'    if [ -n "$home_inaccessible" ]; then skip home "home folder $home_prefix is not accessible"; else skip home "home folder $home_prefix not found"; fi',
		'    return 0',
		'  fi',
		'  for parent in "$@"; do',
		'    if is_other "$home_prefix/$parent" || is_other "./$parent"; then skip parent "~/$parent is not a folder"; return 0; fi',
		// Like the state folder, only root may change the folders this script works in. Checked top-down, so a checked folder
		// cannot be replaced.
		'    if [ -d "./$parent" ] && ! root_only "./$parent"; then',
		// The link would keep using the folder. Root writes no marker, see below, into a folder other users can change.
		'      if [ -L "$src" ] && [ "$(readlink "$src")" = "$target" ]; then rm -f "$src"; fi',
		'      skip untrusted "a user other than root can change $state/$parent"; return 0',
		'    fi',
		'  done',
		'  if has_mount "$home_real/$rel"; then skip mounted "it is already mounted"; return 0; fi',
		'  if [ -L "$src" ]; then',
		'    if [ "$(readlink "$src")" != "$target" ]; then skip symlink "it is a symlink"; return 0; fi',
		'  elif [ -e "$src" ] && [ ! -d "$src" ]; then',
		'    skip file "it is not a folder"; return 0',
		'  fi',
		'  if is_other "$dst"; then skip state "$state/$rel is not a folder"; return 0; fi',
		// Restoring the volume's state would remove the folder without keeping a copy of it, or fail after removing it.
		'  if [ -L "$dst.deferred" ] || { [ -e "$dst.deferred" ] && [ ! -f "$dst.deferred" ]; }; then skip state "$state/$rel.deferred is not a file"; return 0; fi',
		// Moving or replacing a folder that is in use would lose the changes made to it meanwhile. The marker keeps a copy of
		// these changes when the volume's state replaces the folder later, see below. Recorded before checking the volume's
		// state, which may become eligible later.
		'  if [ -n "$keep_existing" ] && [ ! -L "$src" ] && [ -d "$src" ]; then',
		'    if [ -d "$dst" ]; then : > "$dst.deferred"; fi',
		'    skip running "it exists and the container was already running"; return 0',
		'  fi',
		// Also for an earlier link once another container user took the folder over, which changes its owner, see below. Only
		// then does connecting again check every file.
		'  if [ -d "$dst" ] && { [ ! -L "$src" ] || [ "$(stat -c %u:%g "$dst")" != "$owner" ]; } && untrusted_files "$dst"; then',
		// The container's folder stays in use, see above, as does one the user creates meanwhile. The link would keep using
		// the volume's folder.
		'    if [ -L "$src" ]; then rm -f "$src"; fi',
		'    : > "$dst.deferred"',
		'    skip untrusted "a user other than root or the container user owns or can change files in $state/$rel"; return 0',
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
		'          need_fowner',
		// A new folder, because the user owns earlier copies and could plant symlinks in them.
		'          copy=$(mktemp -d "$dst.deferred.XXXXXX")',
		'          cp -a "$src/." "$copy"',
		'          echo "Keeping the previous ~/$rel in $state/${copy#./}" >&2',
		'        fi',
		'        rm -rf "$src"',
		'      fi',
		'    elif [ -d "$src" ]; then',
		'      result=moved',
		'      need_fowner',
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
		// The folder itself first, unlike GNU `chown -R`, so an interrupted change still shows in its owner.
		'  if [ "$(stat -c %u:%g "$dst")" != "$owner" ]; then chown -h "$owner" "$dst"; chown -R "$owner" "$dst"; fi',
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
	/** Why the command did not link state folders, if it skipped them all. */
	readonly skipped?: DevContainerStateLinkSkippedOutcome;
	/** The capabilities root needs for the container user's folders and lacks, if it skipped linking because of them. At the `home` step, root needs either of them. */
	readonly missingCapabilities?: readonly string[];
	/** Whether the command ran as root. */
	readonly scriptUser?: 'root' | 'other';
	/** The command's effective capabilities, if it could read them. */
	readonly capChown?: boolean;
	readonly capDacOverride?: boolean;
	readonly capDacReadSearch?: boolean;
	readonly capFowner?: boolean;
	/** Who owns the state folder. */
	readonly stateOwner?: typeof stateOwners[number];
	/** Who owns the volume's root folder, which can replace the state folder. */
	readonly volumeOwner?: typeof stateOwners[number];
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

/** Link outcomes for containers that cannot have their state folders linked. */
export type DevContainerStateLinkSkippedOutcome = typeof linkSkippedOutcomes[number];

export function parseLinkDevContainerStateOutput(stdout: string): IDevContainerStateLinkProgress {
	let step: string | undefined;
	let homeFound = true;
	let skipped: DevContainerStateLinkSkippedOutcome | undefined;
	const missingCapabilities: string[] = [];
	let scriptUser: 'root' | 'other' | undefined;
	let capabilities: number | undefined;
	let stateOwner: typeof stateOwners[number] | undefined;
	let volumeOwner: typeof stateOwners[number] | undefined;
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
		} else if (kind === 'skipped') {
			skipped = linkSkippedOutcomes.find(outcome => outcome === value);
		} else if (kind === 'missing' && Object.prototype.hasOwnProperty.call(linkCapabilities, value)) {
			missingCapabilities.push(value);
		} else if (kind === 'uid' && (value === 'root' || value === 'other')) {
			scriptUser = value;
		} else if (kind === 'capEff' && /^[0-9a-f]+$/i.test(value)) {
			// The capabilities used are in the last digit.
			capabilities = parseInt(value.slice(-1), 16);
		} else if (kind === 'stateOwner') {
			stateOwner = stateOwners.find(owner => owner === value);
		} else if (kind === 'volumeOwner') {
			volumeOwner = stateOwners.find(owner => owner === value);
		}
	}
	const hasCapability = (bit: number) => capabilities !== undefined && (capabilities >> bit & 1) === 1;
	return {
		step,
		homeFound,
		...(skipped ? { skipped } : {}),
		...(missingCapabilities.length ? { missingCapabilities } : {}),
		...(scriptUser ? { scriptUser } : {}),
		...(capabilities !== undefined ? {
			capChown: hasCapability(linkCapabilities.CAP_CHOWN),
			capDacOverride: hasCapability(linkCapabilities.CAP_DAC_OVERRIDE),
			capDacReadSearch: hasCapability(linkCapabilities.CAP_DAC_READ_SEARCH),
			capFowner: hasCapability(linkCapabilities.CAP_FOWNER),
		} : {}),
		...(stateOwner ? { stateOwner } : {}),
		...(volumeOwner ? { volumeOwner } : {}),
		restoredFolders: folders.restored,
		movedFolders: folders.moved,
		createdFolders: folders.created,
		existingFolders: folders.existing,
		skippedFolders,
		skipReasons: [...skipReasons].sort().join(','),
	};
}

/** Describes why the link command skipped linking state folders, if it did. */
export function getDevContainerStateLinkSkippedMessage(progress: IDevContainerStateLinkProgress): string | undefined {
	switch (progress.skipped) {
		case 'missingCapabilities':
			if (progress.step === 'home') {
				return `root lacks capabilities it needs to enter the home folder (${(progress.missingCapabilities ?? []).join(' or ')}), e.g., because of cap_drop`;
			}
			if (progress.step === 'folders') {
				return `root lacks capabilities it needs to copy the container user's folders to the volume (${(progress.missingCapabilities ?? []).join(', ')}), e.g., because of cap_drop`;
			}
			return `root lacks capabilities it needs for the container user's folders (${(progress.missingCapabilities ?? []).join(', ')}), e.g., because of cap_drop`;
		case 'readOnlyRootfs':
			return 'the container\'s root file system is read-only';
		case 'homeInaccessible':
			return 'root cannot access the home folder';
		case 'stateNotRootOwned':
			return `the volume's ${stateFolderName} folder is not owned by root, e.g., after a lifecycle command ran \`chown -R\` on the volume. To keep its state, give it and its contents back to root if you trust them, or remove it to start fresh`;
		case 'untrustedState':
			return 'another user can change the state folder or the volume\'s root folder';
		default:
			return undefined;
	}
}

/** Docker security settings of a container that can explain why linking failed, for telemetry. */
export interface IDevContainerSecurityOptions {
	/** Whether `CapDrop` includes ALL or CHOWN. */
	readonly capDropChown?: boolean;
	readonly privileged?: boolean;
	/** Whether `UsernsMode` is set, e.g., to `host`. */
	readonly usernsMode?: boolean;
	readonly readonlyRootfs?: boolean;
	/** The OCI runtime as a fixed category: runc, crun, gvisor, kata, sysbox, nvidia, youki, oci (Podman) or other. */
	readonly runtime?: string;
}

// Checked in order, e.g., sysbox-runc is sysbox.
const runtimeKinds = [['sysbox', 'sysbox'], ['runsc', 'gvisor'], ['gvisor', 'gvisor'], ['kata', 'kata'], ['nvidia', 'nvidia'], ['crun', 'crun'], ['youki', 'youki'], ['runc', 'runc']];

/** Reads the security settings from a container's `HostConfig` in `docker inspect`. */
export function getDevContainerSecurityOptions(hostConfig: unknown): IDevContainerSecurityOptions {
	if (typeof hostConfig !== 'object' || hostConfig === null) {
		return {};
	}
	const { CapDrop, Privileged, UsernsMode, ReadonlyRootfs, Runtime } = hostConfig as Record<string, unknown>;
	const capDrop: readonly unknown[] | undefined = Array.isArray(CapDrop) ? CapDrop : CapDrop === null ? [] : undefined;
	const runtime = typeof Runtime === 'string' ? Runtime.toLowerCase() : '';
	return {
		...(capDrop ? { capDropChown: capDrop.some(cap => typeof cap === 'string' && ['ALL', 'CHOWN'].includes(cap.toUpperCase().replace(/^CAP_/, ''))) } : {}),
		...(typeof Privileged === 'boolean' ? { privileged: Privileged } : {}),
		...(typeof UsernsMode === 'string' ? { usernsMode: !!UsernsMode } : {}),
		...(typeof ReadonlyRootfs === 'boolean' ? { readonlyRootfs: ReadonlyRootfs } : {}),
		...(runtime ? { runtime: runtimeKinds.find(([name]) => runtime.includes(name))?.[1] ?? (runtime === 'oci' ? 'oci' : 'other') } : {}),
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
// Commands that Dev Containers runs itself. Other command names can be user content (e.g., an initializeCommand) or part of a path with a space.
const errorMessageKnownCommands = [...errorMessageCommands, 'sh', 'bash', 'cmd', 'set', 'test', 'id'];
// Node.js network errors are followed by the host name or address.
const networkErrorAddressPattern = /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH) \S+/g;
const ipv4AddressPattern = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g;

/**
 * Builds an error message for telemetry from parts such as an error message and a command's stderr. Removes command
 * lines, Dev Containers CLI log entries, paths in parentheses, network addresses, ids and the container user. The
 * telemetry service redacts other paths, URLs and secrets.
 */
export function sanitizeDevContainerStateErrorMessage(parts: readonly (string | undefined)[], values: IDevContainerStateErrorValues = {}): string | undefined {
	const replacements: [RegExp, string][] = [
		// State volume names include the folder name.
		[/vscode-state-[a-z0-9_.-]*[a-z0-9]/g, 'vscode-state-<name>'],
		[/\b(?:[0-9a-f]{64}|[0-9a-f]{12})\b/g, '<id>'],
		[networkErrorAddressPattern, '$1 <address>'],
		[ipv4AddressPattern, '<address>'],
	];
	const homeFolder = values.homeFolder?.replace(/\/+$/, '');
	if (homeFolder) {
		replacements.push([new RegExp(`${escapeRegExp(homeFolder)}(?![\\w.-])`, 'g'), '~']);
	}
	if (values.user && values.user !== 'root') {
		replacements.push([new RegExp(`(?<![\\w.-])${escapeRegExp(values.user)}(?![\\w.-])`, 'g'), '<user>']);
	}
	const summarizeCommand = (_match: string, prefix: string, command: string, subcommand: string | undefined, args: string) => {
		const name = command.split(/[\\/]/).pop() || '';
		const knownName = name.replace(/\.exe$/i, '').toLowerCase();
		const keep = !!subcommand && errorMessageCommands.includes(knownName) && errorMessageSubcommands.includes(subcommand);
		return `${prefix}: ${errorMessageKnownCommands.includes(knownName) ? name : '<command>'}${keep ? ` ${subcommand}` : ''}${(subcommand && !keep) || args.trim() ? ' <args>' : ''}`;
	};
	const lines = parts.flatMap(part => {
		let text = (part || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
		// A part starting with a failed command is the command line, which can span lines and contain local values.
		const wholePart = new RegExp(`^\\s*${failedCommandPattern}([\\s\\S]*)$`);
		text = wholePart.test(text) ? text.replace(wholePart, summarizeCommand) : text.replace(new RegExp(`${failedCommandPattern}(.*)`, 'g'), summarizeCommand);
		return text.split(/\r?\n/)
			// CLI log entries include command lines. The link command's messages are informational.
			.map(line => line.replace(/\[\d+ ms\].*/, '').replace(/(^|: )\s*(?:Persisting|Not persisting) ~\/.*/, '$1'))
			.map(line => replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), redactParenthesizedPaths(line)).trim())
			.filter(line => !!line);
	});
	const message = lines.join('\n');
	if (message.length <= maxErrorMessageLength) {
		return message || undefined;
	}
	// The specific error is usually at the end.
	return `${message.substring(0, errorMessageHeadLength)}\n…\n${message.substring(message.length - (maxErrorMessageLength - errorMessageHeadLength - 3))}`;
}

const parenthesizedPathStartPattern = /\((?:[a-zA-Z]:)?[\\/]/y;
// Node.js error codes that can follow a path, e.g., "(ENOENT)".
const parenthesizedErrorCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ENOTDIR', 'EISDIR', 'ENOTEMPTY', 'EBUSY', 'EROFS', 'ENOSPC', 'EMFILE', 'ELOOP', 'ENAMETOOLONG', 'EINVAL', 'EIO', 'EXDEV', 'EPIPE', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

/**
 * Replaces paths in parentheses, e.g., the config file in "Dev container config (<path>) not found.", since the telemetry
 * service only partially redacts paths with spaces. Folder names can contain parentheses, so the end of a path can be
 * ambiguous. After the path's balanced closing parenthesis, the redaction extends over unmatched closing parentheses
 * and parenthesized text other than known error codes (e.g., "(ENOENT)") up to the next path. An unclosed parenthesis
 * extends it to the end of the line. Scans the line once.
 */
function redactParenthesizedPaths(line: string): string {
	const isPathStart = (index: number) => {
		parenthesizedPathStartPattern.lastIndex = index;
		return parenthesizedPathStartPattern.test(line);
	};
	let result = '';
	let kept = 0;
	let i = line.indexOf('(');
	while (i !== -1 && i < line.length) {
		if (!isPathStart(i)) {
			i = line.indexOf('(', i + 1);
			continue;
		}
		result += `${line.substring(kept, i)}(<path>)`;
		let depth = 0;
		let end: number | undefined;
		let groupStart = i;
		for (; i < line.length; i++) {
			if (line[i] === '(') {
				if (end !== undefined && depth === 0) {
					if (isPathStart(i)) {
						break;
					}
					groupStart = i;
				}
				depth++;
			} else if (line[i] === ')') {
				depth--;
				if (end === undefined ? depth === 0 : depth < 0 || (depth === 0 && !parenthesizedErrorCodes.has(line.substring(groupStart + 1, i)))) {
					end = i + 1;
					depth = 0;
				}
			}
		}
		kept = end === undefined || depth > 0 ? line.length : end;
	}
	return result + line.substring(kept);
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

/** Whether a Docker or Podman error reports that the target is mounted more than once. */
export function isDevContainerDuplicateMountError(errorText: string, target: string): boolean {
	// Paths are case-sensitive and the reported destination must be the whole target.
	const escapedTarget = escapeRegExp(target.replace(/\/+$/, ''));
	return new RegExp(`[Dd]uplicate mount point: ${escapedTarget}/*(?=$|[\\s"'\\\\,;)]|\\.(?:\\s|$))`, 'm').test(errorText)
		|| new RegExp(`(?<=^|[\\s'(])"?${escapedTarget}/*"?: [Dd]uplicate mount destination`, 'm').test(errorText);
}

/**
 * Cause of a `devcontainer up` failure that the failed command doesn't identify, e.g., a mount error of `docker run`
 * or a configuration error without a failed command. Reported instead of the error message.
 */
export type DevContainerUpErrorCause = 'duplicateMount' | 'volume' | 'mount' | 'daemon' | 'config' | 'lifecycle' | 'feature' | 'other';

const upErrorLifecyclePattern = /\b(?:initialize|onCreate|updateContent|postCreate|postStart|postAttach)Command\b.*\bfailed\.$/;
const upErrorConfigPattern = /^(?:Dev container config \(.*\) (?:not found|is missing one of|must contain a JSON object literal)|No dev container config and no workspace found|A Dev Container using Docker Compose requires a workspace folder|Dockerfile \(.*\) not found|Service '.*' configured in devcontainer\.json not found|An error occurred retrieving the Docker Compose configuration|No image information specified|--platform or --push require BuildKit|Failed to read\/parse secrets)|can not be resolved because no environment variable name is given/m;
const upErrorTextPatterns: [DevContainerUpErrorCause, RegExp][] = [
	['feature', /^Cannot use the '.*' Feature since it was reported to be problematic|Legacy feature '.*' not supported|Failure resolving Features|Feature '.*' (?:in 'overrideFeatureInstallOrder' )?could not be processed|Failed to download package for|Digest did not match for|Failed to compute Feature installation order|cannot be read for Feature|Feature ".*" \(.*\) failed to install!/m],
	['duplicateMount', /Duplicate mount point|duplicate mount destination/i],
	['daemon', /Cannot connect to the Docker daemon|Is the docker daemon running|failed to connect to the docker API|error during connect|permission denied while trying to connect to the Docker daemon|Cannot connect to Podman|unable to connect to Podman/i],
	['volume', /invalid mount config for type "volume"|error while mounting volume|external volume .* not found|refers to undefined volume|invalid volume specification|no such volume|volume .* is in use/i],
	['mount', /invalid mount|bind source path does not exist|error (?:while )?mounting|Mounts denied|trying to mount a directory onto a file/i],
];

/**
 * Classifies a failed `devcontainer up` from the CLI's error result and output. Lifecycle and configuration errors,
 * which the CLI's description identifies, take precedence over errors in the output of the commands they run.
 */
export function getDevContainerUpErrorCause(result: { readonly description?: unknown; readonly message?: unknown } | undefined, output = ''): DevContainerUpErrorCause {
	const description = typeof result?.description === 'string' ? result.description : '';
	const message = typeof result?.message === 'string' ? result.message : '';
	if (upErrorLifecyclePattern.test(description)) {
		return 'lifecycle';
	}
	if (upErrorConfigPattern.test(`${description}\n${message}`)) {
		return 'config';
	}
	// Command lines, including the Dev Containers extension's log of the CLI invocation, can contain arguments such as mounts.
	const text = `${description}\n${message}\n${output}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/)
		.filter(line => !/^\s*(?:\[\d+ ms\]\s*)?(?:Start: |Stop \(\d+ ms\): |Running Dev Containers CLI: )/.test(line))
		.map(line => line.replace(new RegExp(`${failedCommandPattern}.*`), '$1'))
		.join('\n');
	return upErrorTextPatterns.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}
