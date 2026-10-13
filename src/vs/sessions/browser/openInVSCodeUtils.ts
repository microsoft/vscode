/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentHostEntry, IRemoteAgentHostService, IRemoteAgentHostSSHConnection, RemoteAgentHostEntryType } from '../../platform/agentHost/common/remoteAgentHostService.js';
import { ISessionsProvidersService } from '../services/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../common/agentHostSessionsProvider.js';
import { encodeHex, VSBuffer } from '../../base/common/buffer.js';
import { URI } from '../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri, LOCAL_AGENT_HOST_AUTHORITY } from '../../platform/agentHost/common/agentHostUri.js';
import { Schemas } from '../../base/common/network.js';
import { ISessionsProvider } from '../services/sessions/common/sessionsProvider.js';
import { findDevContainerSample } from '../../platform/agentHost/common/devContainerSamples.js';
import { localize } from '../../nls.js';

export interface IDevContainerSourceWorkspace {
	readonly folderUri: URI;
	readonly providerId: string;
}

export function resolveDevContainerSourceWorkspace(provider: ISessionsProvider | undefined): IDevContainerSourceWorkspace | undefined {
	const folderUri = provider && isAgentHostProvider(provider) ? provider.devContainerSourceWorkspace : undefined;
	if (!folderUri) {
		return undefined;
	}
	if (folderUri.scheme === Schemas.file || findDevContainerSample(folderUri)) {
		return { folderUri, providerId: LOCAL_AGENT_HOST_PROVIDER_ID };
	}
	if (folderUri.scheme === AGENT_HOST_SCHEME) {
		return { folderUri, providerId: `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}${folderUri.authority}` };
	}
	return undefined;
}

/**
 * Resolves the VS Code remote authority for the given session provider,
 * e.g. `ssh-remote+myhost` or `tunnel+myTunnel`.
 *
 * Returns `undefined` for local or WebSocket-only providers where no
 * VS Code remote extension can handle the connection.
 */
export function resolveRemoteAuthority(
	providerId: string,
	sessionsProvidersService: ISessionsProvidersService,
	remoteAgentHostService: IRemoteAgentHostService,
): string | undefined {
	const provider = sessionsProvidersService.getProvider(providerId);
	if (!provider || !isAgentHostProvider(provider) || !provider.remoteAddress) {
		return undefined;
	}

	const entry = remoteAgentHostService.getEntryByAddress(provider.remoteAddress);
	if (!entry) {
		return undefined;
	}

	return resolveRemoteAgentHostEntryAuthority(entry);
}

export function resolveRemoteAgentHostEntryAuthority(entry: IRemoteAgentHostEntry): string | undefined {
	switch (entry.connection.type) {
		case RemoteAgentHostEntryType.SSH:
			if (entry.connection.sshConfigHost) {
				return `ssh-remote+${entry.connection.sshConfigHost}`;
			}
			return `ssh-remote+${sshAuthorityString(entry.connection)}`;
		case RemoteAgentHostEntryType.Tunnel:
			return `tunnel+${entry.connection.label ?? `${entry.connection.tunnelId}.${entry.connection.clusterId}`}`;
		case RemoteAgentHostEntryType.WSL:
			return `wsl+${entry.connection.distro}`;
		case RemoteAgentHostEntryType.DevContainer: {
			if (entry.connection.repository) {
				return `dev-container+${encodeHex(VSBuffer.fromString(JSON.stringify(entry.connection.repository)))}`;
			}
			let { hostPath, hostAuthority } = entry.connection;
			if (hostAuthority?.startsWith('wsl+')) {
				// Dev Containers identifies WSL through a UNC host path, not an @wsl parent authority.
				hostPath = `\\\\wsl.localhost\\${hostAuthority.slice('wsl+'.length)}${hostPath.replace(/\//g, '\\')}`;
				hostAuthority = undefined;
			}
			return `dev-container+${encodeHex(VSBuffer.fromString(hostPath))}${hostAuthority ? `@${hostAuthority}` : ''}`;
		}
		default:
			return undefined;
	}
}

/** Resolves an Agent Host folder for the Editor window, or returns undefined when no remote resolver supports it. */
export function resolveRemoteFolderUri(
	folderUri: URI,
	providerId: string,
	sessionsProvidersService: ISessionsProvidersService,
	remoteAgentHostService: IRemoteAgentHostService,
): URI | undefined {
	if (findDevContainerSample(folderUri)) {
		throw new Error(localize('devContainerSample.notPrepared', "Send the first prompt to prepare this Dev Container sample before opening it in the editor."));
	}
	if (folderUri.scheme !== AGENT_HOST_SCHEME) {
		return folderUri;
	}

	const remoteAuthority = resolveRemoteAuthority(providerId, sessionsProvidersService, remoteAgentHostService);
	if (!remoteAuthority) {
		// Remote Agent Host filesystem connections belong to the originating window.
		return folderUri.authority === LOCAL_AGENT_HOST_AUTHORITY ? folderUri : undefined;
	}

	return fromAgentHostUri(folderUri).with({ authority: remoteAuthority, scheme: Schemas.vscodeRemote });
}

/**
 * Encodes an SSH connection into the authority string format expected by
 * the Remote SSH extension.
 */
export function sshAuthorityString(connection: IRemoteAgentHostSSHConnection): string {
	const hostName = connection.hostName;
	const needsEncoding = connection.user || connection.port
		|| /[A-Z/\\+]/.test(hostName) || !/^[a-zA-Z0-9.:\-]+$/.test(hostName);
	if (!needsEncoding) {
		return hostName;
	}

	const obj: Record<string, string | number> = { hostName };
	if (connection.user) {
		obj.user = connection.user;
	}
	if (connection.port) {
		obj.port = connection.port;
	}

	const json = JSON.stringify(obj);
	return encodeHex(VSBuffer.fromString(json));
}
