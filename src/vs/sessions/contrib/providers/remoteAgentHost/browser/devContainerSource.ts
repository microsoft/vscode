/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';

export function devContainerSourcePath(workspaceUri: URI): string {
	if (workspaceUri.scheme === Schemas.file) {
		return workspaceUri.fsPath;
	}
	const hostUri = fromAgentHostUri(workspaceUri);
	return hostUri.authority ? `//${hostUri.authority}${hostUri.path}` : hostUri.path;
}

export function getDevContainerSourceEntry(workspaceUri: URI, remoteAgentHostService: IRemoteAgentHostService): IRemoteAgentHostEntry | undefined {
	if (workspaceUri.scheme !== AGENT_HOST_SCHEME) {
		return undefined;
	}
	return remoteAgentHostService.configuredEntries.find(entry =>
		(entry.connection.type === RemoteAgentHostEntryType.SSH || entry.connection.type === RemoteAgentHostEntryType.Tunnel || entry.connection.type === RemoteAgentHostEntryType.WSL)
		&& agentHostAuthority(getEntryAddress(entry)) === workspaceUri.authority
	);
}

export async function resolveDevContainerSourceConnection(
	workspaceUri: URI,
	remoteAgentHostService: IRemoteAgentHostService,
	sessionsProvidersService: ISessionsProvidersService,
	token: CancellationToken,
): Promise<IAgentConnection> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const entry = getDevContainerSourceEntry(workspaceUri, remoteAgentHostService);
	if (!entry) {
		throw new Error(localize('devContainerAgentHost.sourceUnavailable', "The SSH, Tunnel, or WSL connection for this Dev Container workspace is no longer configured."));
	}
	const address = getEntryAddress(entry);
	let connection = remoteAgentHostService.getConnection(address);
	if (!connection) {
		const provider = sessionsProvidersService.getProviders().find(provider => isAgentHostProvider(provider) && provider.remoteAddress === address);
		if (provider && isAgentHostProvider(provider) && provider.connect) {
			await raceCancellationError(provider.connect(), token);
		} else {
			remoteAgentHostService.reconnect(address, true);
		}
		await raceCancellationError(remoteAgentHostService.waitForConnection(address), token);
		connection = remoteAgentHostService.getConnection(address);
	}
	if (!connection) {
		throw new Error(localize('devContainerAgentHost.sourceNotConnected', "The SSH, Tunnel, or WSL host could not be connected for this Dev Container workspace."));
	}
	return connection;
}
