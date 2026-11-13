/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { computeSSHConnectionKey, ISSHRemoteAgentHostService } from '../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toLocalAgentHostSessionType } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../common/agentHostSessionsProvider.js';
import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri, LOCAL_AGENT_HOST_AUTHORITY } from '../../../../platform/agentHost/common/agentHostUri.js';
import { Schemas } from '../../../../base/common/network.js';
import { ISessionsProvider } from '../common/sessionsProvider.js';
import { findDevContainerSample } from '../../../../platform/agentHost/common/devContainerSamples.js';
import { localize } from '../../../../nls.js';

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
	const entry = getRemoteAgentHostEntry(providerId, sessionsProvidersService, remoteAgentHostService);
	return entry && resolveRemoteAgentHostEntryAuthority(entry);
}

function getRemoteAgentHostEntry(
	providerId: string,
	sessionsProvidersService: ISessionsProvidersService,
	remoteAgentHostService: IRemoteAgentHostService,
): IRemoteAgentHostEntry | undefined {
	const provider = sessionsProvidersService.getProvider(providerId);
	if (!provider || !isAgentHostProvider(provider) || !provider.remoteAddress) {
		return undefined;
	}
	return remoteAgentHostService.getEntryByAddress(provider.remoteAddress);
}

export function resolveRemoteAgentHostEntryAuthority(entry: IRemoteAgentHostEntry): string | undefined {
	switch (entry.connection.type) {
		case RemoteAgentHostEntryType.SSH:
			return `ssh-remote+${sshAuthorityString(entry.connection.sshConfigHost ? { hostName: entry.connection.sshConfigHost } : entry.connection)}`;
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

	// eslint-disable-next-line local/code-agent-host-uri-mapping -- opens a wrapped host folder through the target window's remote authority
	return fromAgentHostUri(folderUri).with({ authority: remoteAuthority, scheme: Schemas.vscodeRemote });
}

/** Why the editor window cannot open a session from the connected remote agent host. */
export type EditorWindowSessionUnsupportedReason = 'unsupported' | 'differentAgentHost';

/** Editor-owned endpoints are shared only when the editor window follows the same stored SSH preference. */
export function getEditorWindowSessionUnsupportedReason(
	entry: IRemoteAgentHostEntry | undefined,
	tunnelAgentHostService: ITunnelAgentHostService,
	sshRemoteAgentHostService: ISSHRemoteAgentHostService,
	locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
): EditorWindowSessionUnsupportedReason | undefined {
	switch (entry?.connection.type) {
		case RemoteAgentHostEntryType.Tunnel:
			// Tunnel editor windows are named by label, so they cannot look up the stored preference and always use a standalone host.
			return tunnelAgentHostService.getSelectedServerType(getEntryAddress(entry)) === 'editor' ? 'differentAgentHost' : undefined;
		case RemoteAgentHostEntryType.SSH: {
			const address = getEntryAddress(entry);
			const hostKey = computeSSHConnectionKey({ sshConfigHost: entry.connection.sshConfigHost, username: entry.connection.user, host: entry.connection.hostName, port: entry.connection.port });
			return sshRemoteAgentHostService.connections.find(connection => connection.localAddress === address)?.serverType === 'editor'
				&& locationPreferenceService.getPreference(hostKey) !== 'editor' ? 'differentAgentHost' : undefined;
		}
		case RemoteAgentHostEntryType.WSL:
		case RemoteAgentHostEntryType.DevContainer:
			return undefined;
		default:
			return 'unsupported';
	}
}

/**
 * Names a session or chat as the editor window that opens its folder does, or returns why that window cannot open it.
 * Supported remote editor windows reach the shared host as their own agent host, using local session schemes.
 */
export function getEditorWindowSessionResource(
	resource: URI,
	providerId: string,
	sessionsProvidersService: ISessionsProvidersService,
	remoteAgentHostService: IRemoteAgentHostService,
	agentHostConnectionsService: IAgentHostConnectionsService,
	tunnelAgentHostService: ITunnelAgentHostService,
	sshRemoteAgentHostService: ISSHRemoteAgentHostService,
	locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
): URI | EditorWindowSessionUnsupportedReason {
	const connectionAuthority = agentHostConnectionsService.resolveSessionResourceIdentity(resource)?.connectionAuthority;
	if (!connectionAuthority || connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY) {
		return resource;
	}
	const sessionType = toLocalAgentHostSessionType(resource.scheme, connectionAuthority);
	if (!sessionType) {
		return 'unsupported';
	}
	const entry = getRemoteAgentHostEntry(providerId, sessionsProvidersService, remoteAgentHostService);
	const reason = getEditorWindowSessionUnsupportedReason(entry, tunnelAgentHostService, sshRemoteAgentHostService, locationPreferenceService);
	if (reason) {
		return reason;
	}
	return resource.with({ scheme: sessionType });
}

/** Explains why the editor window opened for a session's folder does not open the session as well. */
export function notifyEditorWindowSessionUnsupported(notificationService: INotificationService, reason: EditorWindowSessionUnsupportedReason): void {
	notificationService.info(reason === 'differentAgentHost'
		? localize('openInVSCode.differentAgentHostSessionUnsupported', "The session's folder was opened in a new editor window, but the session can't be opened there. This window is connected to a different agent host on the remote machine than the one its editor windows use.")
		: localize('openInVSCode.sessionUnsupported', "The session's folder was opened in a new editor window, but editor windows can't open sessions from this kind of remote."));
}

/**
 * Encodes an SSH host into the authority string of the Remote - SSH extension, mirroring its
 * `HostInfo.toAuthorityString`. The string identifies the remote, e.g. for recently opened folders.
 * An SSH config alias is passed as the host name without user or port.
 */
export function sshAuthorityString(host: { readonly hostName: string; readonly user?: string; readonly port?: number }): string {
	const hostName = host.hostName;
	if (!host.user && !host.port && hostName.toLowerCase() === hostName && !/[\/\\+]/.test(hostName)) {
		return hostName;
	}

	const obj: Record<string, string | number> = { hostName };
	if (host.user) {
		obj.user = host.user;
	}
	if (host.port) {
		obj.port = host.port;
	}

	const json = JSON.stringify(obj);
	return encodeHex(VSBuffer.fromString(json));
}
