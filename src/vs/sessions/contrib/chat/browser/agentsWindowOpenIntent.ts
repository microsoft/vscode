/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../common/devContainerAgentHostService.js';
import { WorkspaceArgumentKind } from '../../../common/workspaceSelection.js';

const DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX = 'dev-container+';

export interface IAgentsWindowFolderIntent {
	readonly folderUri: URI | undefined;
	readonly preferDevContainer: boolean;
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

/**
 * Reads the Docker host's workspace path from a Dev Containers authority
 * configuration. Mirrors `parseAuthority` in the Dev Containers extension: the
 * configuration is either a bare path or a JSON object carrying one. Containers
 * opened from a volume or a cloned repository carry no host path.
 */
function readDevContainerHostPath(config: string): string | undefined {
	let decoded: string;
	try {
		decoded = decodeHex(config).toString();
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
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

export function resolveAgentsWindowFolderIntent(workspaceUri: URI | undefined, configurationService: IConfigurationService): IAgentsWindowFolderIntent {
	if (workspaceUri?.scheme === Schemas.file) {
		return { folderUri: workspaceUri, preferDevContainer: false };
	}
	if (workspaceUri?.scheme !== Schemas.vscodeRemote || !workspaceUri.authority.startsWith(DEV_CONTAINER_REMOTE_AUTHORITY_PREFIX)) {
		return { folderUri: undefined, preferDevContainer: false };
	}
	const { config, parentAuthority } = splitDevContainerAuthority(workspaceUri.authority);
	// A parent authority means the path belongs to an SSH or Tunnel host, so it
	// cannot be offered as a local folder. Suggest no workspace instead.
	const hostPath = parentAuthority ? undefined : readDevContainerHostPath(config);
	if (!hostPath) {
		return { folderUri: undefined, preferDevContainer: false };
	}
	return {
		folderUri: URI.file(hostPath),
		preferDevContainer: configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true,
	};
}
