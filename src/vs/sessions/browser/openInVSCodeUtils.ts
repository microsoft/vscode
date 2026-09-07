/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentHostService, IRemoteAgentHostSSHConnection, RemoteAgentHostEntryType } from '../../platform/agentHost/common/remoteAgentHostService.js';
import { ISessionsProvidersService } from '../services/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../common/agentHostSessionsProvider.js';
import { encodeHex, VSBuffer } from '../../base/common/buffer.js';
import { URI } from '../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../platform/agentHost/common/agentHostUri.js';
import { Schemas } from '../../base/common/network.js';

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

	switch (entry.connection.type) {
		case RemoteAgentHostEntryType.SSH:
			if (entry.connection.sshConfigHost) {
				return `ssh-remote+${entry.connection.sshConfigHost}`;
			}
			return `ssh-remote+${sshAuthorityString(entry.connection)}`;
		case RemoteAgentHostEntryType.Tunnel:
			return `tunnel+${entry.connection.label ?? `${entry.connection.tunnelId}.${entry.connection.clusterId}`}`;
		case RemoteAgentHostEntryType.DevContainer:
			return `dev-container+${encodeHex(VSBuffer.fromString(entry.connection.hostPath))}`;
		default:
			return undefined;
	}
}

/** Resolves an Agent Host folder to the URI understood by its VS Code remote extension. */
export function resolveRemoteFolderUri(
	folderUri: URI,
	providerId: string,
	sessionsProvidersService: ISessionsProvidersService,
	remoteAgentHostService: IRemoteAgentHostService,
): URI {
	if (folderUri.scheme !== AGENT_HOST_SCHEME) {
		return folderUri;
	}

	const remoteAuthority = resolveRemoteAuthority(providerId, sessionsProvidersService, remoteAgentHostService);
	if (!remoteAuthority) {
		return folderUri;
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
