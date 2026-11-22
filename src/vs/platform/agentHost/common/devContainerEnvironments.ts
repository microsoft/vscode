/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { LOCAL_AGENT_HOST_AUTHORITY } from './agentHostUri.js';

/** Scheme of client URIs that identify a Dev Container environment on its source host. */
export const devContainerEnvironmentScheme = 'vscode-dev-container-environment';

/** Image of new Dev Container environments. */
export const devContainerEnvironmentImage = 'mcr.microsoft.com/devcontainers/base:ubuntu';

/** Images that hosts accept for Dev Container environments. */
export const devContainerEnvironmentImages: readonly string[] = [devContainerEnvironmentImage];

/** Where an environment's Docker volume is mounted in its container. */
export const devContainerEnvironmentVolumeTarget = '/workspaces';

/** A folder in a Docker volume, by which the Dev Containers extension identifies the container it opens the folder in. */
export interface IDevContainerVolumeFolder {
	readonly volumeName: string;
	readonly folder: string;
}

/** The workspace folder of an environment: like New Dev Container, a folder in its volume that is named like the volume. */
export function getDevContainerEnvironmentWorkspaceFolder(volumeName: string): string {
	return `${devContainerEnvironmentVolumeTarget}/${volumeName}`;
}

/** Reads the volume and folder of an environment from its workspace folder, see {@link getDevContainerEnvironmentWorkspaceFolder}. */
export function parseDevContainerEnvironmentWorkspaceFolder(workspaceFolder: string): IDevContainerVolumeFolder | undefined {
	const name = /^\/workspaces\/(?<name>[a-zA-Z0-9][a-zA-Z0-9_.-]*)$/.exec(workspaceFolder)?.groups?.name;
	return name ? { volumeName: name, folder: name } : undefined;
}

/** Identifies a standalone Dev Container that is not created for a workspace folder. */
export interface IDevContainerEnvironmentReference {
	/** Client-chosen identifier that labels the container's Docker volumes. */
	readonly environmentId: string;
}

/** Creates or reuses a standalone Dev Container from an image, with its workspace in a Docker volume. */
export interface IDevContainerEnvironmentSource extends IDevContainerEnvironmentReference {
	readonly image: string;
}

export function isDevContainerEnvironmentId(value: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

export function devContainerEnvironmentUri(sourceAuthority: string, environmentId: string): URI {
	return URI.from({ scheme: devContainerEnvironmentScheme, authority: sourceAuthority, path: `/${environmentId}` });
}

/** Returns the Agent Host authority of the source host and the environment identifier of a Dev Container environment URI. */
export function findDevContainerEnvironment(uri: URI): { readonly sourceAuthority: string; readonly environmentId: string } | undefined {
	if (uri.scheme !== devContainerEnvironmentScheme || !uri.authority || uri.query || uri.fragment) {
		return undefined;
	}
	const environmentId = uri.path.slice(1);
	return isDevContainerEnvironmentId(environmentId) ? { sourceAuthority: uri.authority, environmentId } : undefined;
}

/** Creates the URI of a Dev Container environment on this computer rather than on a remote host. */
export function localDevContainerEnvironmentUri(environmentId: string): URI {
	return devContainerEnvironmentUri(LOCAL_AGENT_HOST_AUTHORITY, environmentId);
}

/** Whether a URI identifies a Dev Container environment on this computer. No remote host's Agent Host authority is the local authority. */
export function isLocalDevContainerEnvironment(uri: URI): boolean {
	return findDevContainerEnvironment(uri)?.sourceAuthority === LOCAL_AGENT_HOST_AUTHORITY;
}
