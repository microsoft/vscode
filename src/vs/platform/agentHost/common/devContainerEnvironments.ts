/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

/** Scheme of client URIs that identify a Dev Container environment on its source host. */
export const devContainerEnvironmentScheme = 'vscode-dev-container-environment';

/** Image of new Dev Container environments. */
export const devContainerEnvironmentImage = 'mcr.microsoft.com/devcontainers/base:ubuntu';

/** Images that hosts accept for Dev Container environments. */
export const devContainerEnvironmentImages: readonly string[] = [devContainerEnvironmentImage];

/** Workspace folder of a Dev Container environment, backed by the environment's Docker volume. */
export const devContainerEnvironmentWorkspaceFolder = '/workspaces';

/** Identifies a standalone Dev Container that is not created for a workspace folder. */
export interface IDevContainerEnvironmentReference {
	/** Client-chosen identifier that names the container's Docker volume and identity label. */
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
