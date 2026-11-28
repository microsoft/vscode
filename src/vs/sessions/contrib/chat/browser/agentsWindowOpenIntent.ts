/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { posix } from '../../../../base/common/path.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getRemoteName } from '../../../../platform/remote/common/remoteHosts.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { IRemoteWorkspaceFolder } from '../../../common/remoteWorkspaceHandoff.js';
import { WorkspaceArgumentKind, WorkspaceArgumentRemoteKind } from '../../../../workbench/services/sessions/common/workspaceSelection.js';

const DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX = 'dev-container+';

/** The workspace of an editor window connected to a remote, which has no local folder. */
export interface IAgentsWindowRemoteWorkspace {
	readonly kind: WorkspaceArgumentRemoteKind;
	/** The folder on an SSH, WSL or Tunnel machine, when that machine's remote agent host can provide it. */
	readonly folder: IRemoteWorkspaceFolder | undefined;
}

export interface IAgentsWindowFolderIntent {
	readonly folderUri: URI | undefined;
	readonly preferDevContainer: boolean;
	/** Set when the editor window was connected to a remote and its folder is not a local folder. */
	readonly remote?: IAgentsWindowRemoteWorkspace;
}

/** Classifies the original argument without exposing its path or remote authority. */
export function getAgentsWindowWorkspaceArgumentKind(workspaceUri: URI | undefined): WorkspaceArgumentKind {
	if (!workspaceUri) {
		return 'none';
	}
	if (workspaceUri.scheme === Schemas.file) {
		return 'local';
	}
	if (workspaceUri.scheme === Schemas.vscodeRemote) {
		return workspaceUri.authority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX) ? 'devContainer' : 'remote';
	}
	return 'other';
}

function getRemoteKind(remoteAuthority: string): WorkspaceArgumentRemoteKind {
	switch (getRemoteName(remoteAuthority)) {
		case 'ssh-remote': return 'ssh';
		case 'wsl': return 'wsl';
		case 'tunnel': return 'tunnel';
		case 'codespaces': return 'codespaces';
		case 'attached-container': return 'attachedContainer';
		default: return 'other';
	}
}

/** Classifies the remote hosting the original argument without exposing its authority. */
export function getAgentsWindowWorkspaceArgumentRemoteKind(workspaceUri: URI | undefined): WorkspaceArgumentRemoteKind {
	if (workspaceUri?.scheme !== Schemas.vscodeRemote) {
		return 'none';
	}
	if (workspaceUri.authority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX)) {
		const { config, parentAuthority } = splitDevContainerAuthority(workspaceUri.authority);
		if (parentAuthority) {
			return getRemoteKind(parentAuthority);
		}
		const hostPath = readDevContainerHostPath(config);
		return hostPath && parseWSLHostPath(hostPath) ? 'wsl' : 'none';
	}
	return getRemoteKind(workspaceUri.authority);
}

/**
 * Reads the distribution and path of a WSL source folder, which Dev Containers identifies by its UNC path
 * (`isWslPath` in Dev Containers) rather than a `wsl+` parent authority. Inverse of `resolveRemoteAgentHostEntryAuthority`.
 */
function parseWSLHostPath(hostPath: string): { readonly distro: string; readonly path: string } | undefined {
	const match = /^[\\/]{2}wsl(?:\.localhost|\$)?[\\/](?<distro>[^\\/]+)(?<path>[\\/].*)?$/i.exec(hostPath);
	return match?.groups ? { distro: match.groups.distro, path: match.groups.path?.replace(/\\/g, '/') || '/' } : undefined;
}

function toRemoteWorkspace(remoteAuthority: string, path: string | undefined): IAgentsWindowRemoteWorkspace {
	const kind = getRemoteKind(remoteAuthority);
	// Remote - WSL names a WSL on another machine with `@` (or `%40`); only this machine's WSL is reachable.
	const reachable = kind === 'ssh' || kind === 'tunnel' || (kind === 'wsl' && !/@|%40/i.test(remoteAuthority));
	return {
		kind,
		folder: path && reachable ? { remoteAuthority, path } : undefined,
	};
}

/** Converts a host-native Dev Container source path into URI path form; Windows hosts report drive-letter paths. */
function toRemoteUriPath(hostPath: string): string {
	return /^[a-zA-Z]:[\\/]/.test(hostPath) ? `/${hostPath.replace(/\\/g, '/')}` : hostPath;
}

/**
 * Splits a Dev Containers authority into its hex-encoded configuration and the
 * optional authority of the host running Docker. Mirrors `splitRemoteAuthority`
 * in the Dev Containers extension: the configuration ends at the first `@`, and
 * everything after it is the SSH or Tunnel authority of the parent host.
 */
function splitDevContainerAuthority(authority: string): { readonly config: string; readonly parentAuthority: string | undefined } {
	const remainder = authority.slice(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX.length);
	const separator = remainder.indexOf('@');
	return separator === -1
		? { config: remainder, parentAuthority: undefined }
		: { config: remainder.slice(0, separator), parentAuthority: remainder.slice(separator + 1) || undefined };
}

/** Decodes a Dev Containers authority configuration, or returns undefined when it isn't hex-encoded. */
function decodeDevContainerConfig(config: string): string | undefined {
	try {
		return decodeHex(config).toString();
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
}

/**
 * Reads the Docker host's workspace path from a Dev Containers authority
 * configuration. Mirrors `parseAuthority` in the Dev Containers extension: the
 * configuration is either a bare path or a JSON object carrying one. Containers
 * opened from a volume or a cloned repository carry no host path.
 */
function readDevContainerHostPath(config: string): string | undefined {
	const decoded = decodeDevContainerConfig(config);
	if (decoded === undefined) {
		return undefined;
	}
	if (!decoded.startsWith('{')) {
		return decoded || undefined;
	}
	try {
		const parsed: { hostPath?: unknown } = JSON.parse(decoded);
		return typeof parsed.hostPath === 'string' && parsed.hostPath ? parsed.hostPath : undefined;
	} catch {
		// A configuration that opens like JSON but does not parse is not a path either.
		return undefined;
	}
}

/** One of a folder's default Dev Container configuration files, relative to the folder. */
export type DefaultDevContainerConfigFile = '.devcontainer/devcontainer.json' | '.devcontainer.json';

/**
 * Whether a Dev Containers authority selects the container of a default configuration file of its source folder on the
 * default Docker host, which this window uses for the folder if the Dev Containers CLI selects that file for the folder.
 * Only the JSON form of the configuration can name a configuration file or another Docker host. Reopen in Container
 * names the configuration file it opened. Returns the default configuration file it names, if any, or `undefined` if it
 * selects another container.
 */
export function getDefaultDevContainerSelection(remoteAuthority: string): { readonly configFile: DefaultDevContainerConfigFile | undefined } | undefined {
	if (!remoteAuthority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX)) {
		return undefined;
	}
	const { config, parentAuthority } = splitDevContainerAuthority(remoteAuthority);
	const decoded = decodeDevContainerConfig(config);
	if (!decoded?.startsWith('{')) {
		return decoded ? { configFile: undefined } : undefined;
	}
	try {
		const parsed: unknown = JSON.parse(decoded);
		if (typeof parsed !== 'object' || parsed === null) {
			return undefined;
		}
		const { hostPath, localDocker, configFile, ...others } = parsed as Record<string, unknown>;
		if (typeof hostPath !== 'string' || !hostPath || Object.keys(others).length || localDocker) {
			return undefined;
		}
		if (configFile === undefined) {
			return { configFile: undefined };
		}
		const defaultConfigFile = getDefaultConfigFile(hostPath, parentAuthority, configFile);
		return defaultConfigFile ? { configFile: defaultConfigFile } : undefined;
	} catch {
		return undefined;
	}
}

/** Which of its folder's default configuration files the configuration file of a Dev Containers authority, a URI as JSON, is. */
function getDefaultConfigFile(hostPath: string, parentAuthority: string | undefined, configFile: unknown): DefaultDevContainerConfigFile | undefined {
	const path = typeof configFile === 'object' && configFile !== null ? (configFile as { readonly path?: unknown }).path : undefined;
	if (typeof path !== 'string') {
		return undefined;
	}
	// Dev Containers names the configuration file of a WSL folder by its Linux path.
	const wslSource = parentAuthority ? undefined : parseWSLHostPath(hostPath);
	const folder = wslSource?.path ?? URI.file(hostPath.replace(/\\/g, '/')).path;
	const ignoreCase = /^\/[a-zA-Z]:\//.test(folder);
	return (['.devcontainer/devcontainer.json', '.devcontainer.json'] as const)
		.find(defaultConfigFile => {
			const defaultPath = posix.join(folder, defaultConfigFile);
			return ignoreCase ? equalsIgnoreCase(defaultPath, path) : defaultPath === path;
		});
}

export function resolveAgentsWindowFolderIntent(workspaceUri: URI | undefined, configurationService: IConfigurationService): IAgentsWindowFolderIntent {
	if (workspaceUri?.scheme === Schemas.file) {
		return { folderUri: workspaceUri, preferDevContainer: false };
	}
	if (workspaceUri?.scheme !== Schemas.vscodeRemote) {
		return { folderUri: undefined, preferDevContainer: false };
	}
	if (!workspaceUri.authority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX)) {
		return { folderUri: undefined, preferDevContainer: false, remote: toRemoteWorkspace(workspaceUri.authority, workspaceUri.path) };
	}
	const { config, parentAuthority } = splitDevContainerAuthority(workspaceUri.authority);
	const hostPath = readDevContainerHostPath(config);
	const preferDevContainer = !!hostPath && configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true;
	const wslSource = !parentAuthority && hostPath ? parseWSLHostPath(hostPath) : undefined;
	const sourceAuthority = parentAuthority ?? (wslSource && `wsl+${wslSource.distro}`);
	if (sourceAuthority) {
		// The host path belongs to the SSH, Tunnel or WSL host of the container's source, not to this machine.
		const remote = toRemoteWorkspace(sourceAuthority, wslSource?.path ?? (hostPath && toRemoteUriPath(hostPath)));
		return { folderUri: undefined, preferDevContainer: preferDevContainer && !!remote.folder, remote };
	}
	if (!hostPath) {
		return { folderUri: undefined, preferDevContainer: false, remote: { kind: 'none', folder: undefined } };
	}
	return { folderUri: URI.file(hostPath), preferDevContainer };
}
