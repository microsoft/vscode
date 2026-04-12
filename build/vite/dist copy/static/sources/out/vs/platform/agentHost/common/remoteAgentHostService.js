/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../base/common/event.js';
import { connectionTokenQueryName } from '../../../base/common/network.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
/** Connection status for a remote agent host. */
export var RemoteAgentHostConnectionStatus;
(function (RemoteAgentHostConnectionStatus) {
    RemoteAgentHostConnectionStatus["Connected"] = "connected";
    RemoteAgentHostConnectionStatus["Connecting"] = "connecting";
    RemoteAgentHostConnectionStatus["Disconnected"] = "disconnected";
})(RemoteAgentHostConnectionStatus || (RemoteAgentHostConnectionStatus = {}));
/** Configuration key for the list of remote agent host addresses. */
export const RemoteAgentHostsSettingId = 'chat.remoteAgentHosts';
/** Configuration key to enable remote agent host connections. */
export const RemoteAgentHostsEnabledSettingId = 'chat.remoteAgentHostsEnabled';
export var RemoteAgentHostInputValidationError;
(function (RemoteAgentHostInputValidationError) {
    RemoteAgentHostInputValidationError["Empty"] = "empty";
    RemoteAgentHostInputValidationError["Invalid"] = "invalid";
})(RemoteAgentHostInputValidationError || (RemoteAgentHostInputValidationError = {}));
export const IRemoteAgentHostService = createDecorator('remoteAgentHostService');
export class NullRemoteAgentHostService {
    constructor() {
        this.onDidChangeConnections = Event.None;
        this.connections = [];
        this.configuredEntries = [];
    }
    getConnection() { return undefined; }
    async addRemoteAgentHost() {
        throw new Error('Remote agent host connections are not supported in this environment.');
    }
    async removeRemoteAgentHost(_address) { }
    reconnect(_address) { }
    async addSSHConnection() {
        throw new Error('Remote agent host connections are not supported in this environment.');
    }
}
export function parseRemoteAgentHostInput(input) {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        return { error: "empty" /* RemoteAgentHostInputValidationError.Empty */ };
    }
    const candidate = extractRemoteAgentHostCandidate(trimmedInput);
    if (!candidate) {
        return { error: "invalid" /* RemoteAgentHostInputValidationError.Invalid */ };
    }
    const hasExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(candidate);
    try {
        const url = new URL(hasExplicitScheme ? candidate : `ws://${candidate}`);
        const normalizedProtocol = normalizeRemoteAgentHostProtocol(url.protocol);
        if (!normalizedProtocol || !url.host) {
            return { error: "invalid" /* RemoteAgentHostInputValidationError.Invalid */ };
        }
        const connectionToken = url.searchParams.get(connectionTokenQueryName) ?? undefined;
        url.searchParams.delete(connectionTokenQueryName);
        // Only preserve wss: in the address - the transport defaults to ws:
        const address = formatRemoteAgentHostAddress(url, normalizedProtocol === 'wss:' ? normalizedProtocol : undefined);
        if (!address) {
            return { error: "invalid" /* RemoteAgentHostInputValidationError.Invalid */ };
        }
        return {
            parsed: {
                address,
                connectionToken,
                suggestedName: url.host,
            },
        };
    }
    catch {
        return { error: "invalid" /* RemoteAgentHostInputValidationError.Invalid */ };
    }
}
function extractRemoteAgentHostCandidate(input) {
    const urlMatch = input.match(/(?<url>(?:https?|wss?):\/\/\S+)/i);
    const candidate = urlMatch?.groups?.url ?? input;
    const trimmedCandidate = candidate.trim().replace(/[),.;\]]+$/, '');
    return trimmedCandidate || undefined;
}
function normalizeRemoteAgentHostProtocol(protocol) {
    switch (protocol.toLowerCase()) {
        case 'ws:':
        case 'http:':
            return 'ws:';
        case 'wss:':
        case 'https:':
            return 'wss:';
        default:
            return undefined;
    }
}
function formatRemoteAgentHostAddress(url, protocol) {
    if (!url.host) {
        return undefined;
    }
    const path = url.pathname !== '/' ? url.pathname : '';
    const query = url.search;
    const base = protocol ? `${protocol}//${url.host}` : url.host;
    return `${base}${path}${query}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRzlFLGlEQUFpRDtBQUNqRCxNQUFNLENBQU4sSUFBa0IsK0JBSWpCO0FBSkQsV0FBa0IsK0JBQStCO0lBQ2hELDBEQUF1QixDQUFBO0lBQ3ZCLDREQUF5QixDQUFBO0lBQ3pCLGdFQUE2QixDQUFBO0FBQzlCLENBQUMsRUFKaUIsK0JBQStCLEtBQS9CLCtCQUErQixRQUloRDtBQUVELHFFQUFxRTtBQUNyRSxNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyx1QkFBdUIsQ0FBQztBQUVqRSxpRUFBaUU7QUFDakUsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsOEJBQThCLENBQUM7QUFXL0UsTUFBTSxDQUFOLElBQWtCLG1DQUdqQjtBQUhELFdBQWtCLG1DQUFtQztJQUNwRCxzREFBZSxDQUFBO0lBQ2YsMERBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQUhpQixtQ0FBbUMsS0FBbkMsbUNBQW1DLFFBR3BEO0FBWUQsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsZUFBZSxDQUEwQix3QkFBd0IsQ0FBQyxDQUFDO0FBZ0UxRyxNQUFNLE9BQU8sMEJBQTBCO0lBQXZDO1FBRVUsMkJBQXNCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNwQyxnQkFBVyxHQUE4QyxFQUFFLENBQUM7UUFDNUQsc0JBQWlCLEdBQXFDLEVBQUUsQ0FBQztJQVVuRSxDQUFDO0lBVEEsYUFBYSxLQUFtQyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbkUsS0FBSyxDQUFDLGtCQUFrQjtRQUN2QixNQUFNLElBQUksS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUNELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxRQUFnQixJQUFtQixDQUFDO0lBQ2hFLFNBQVMsQ0FBQyxRQUFnQixJQUFVLENBQUM7SUFDckMsS0FBSyxDQUFDLGdCQUFnQjtRQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7SUFDekYsQ0FBQztDQUNEO0FBRUQsTUFBTSxVQUFVLHlCQUF5QixDQUFDLEtBQWE7SUFDdEQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2xDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQixPQUFPLEVBQUUsS0FBSyx5REFBMkMsRUFBRSxDQUFDO0lBQzdELENBQUM7SUFFRCxNQUFNLFNBQVMsR0FBRywrQkFBK0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUNoRSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDaEIsT0FBTyxFQUFFLEtBQUssNkRBQTZDLEVBQUUsQ0FBQztJQUMvRCxDQUFDO0lBRUQsTUFBTSxpQkFBaUIsR0FBRyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDekUsSUFBSSxDQUFDO1FBQ0osTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sa0JBQWtCLEdBQUcsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QyxPQUFPLEVBQUUsS0FBSyw2REFBNkMsRUFBRSxDQUFDO1FBQy9ELENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLFNBQVMsQ0FBQztRQUNwRixHQUFHLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBRWxELG9FQUFvRTtRQUNwRSxNQUFNLE9BQU8sR0FBRyw0QkFBNEIsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDbEgsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxFQUFFLEtBQUssNkRBQTZDLEVBQUUsQ0FBQztRQUMvRCxDQUFDO1FBRUQsT0FBTztZQUNOLE1BQU0sRUFBRTtnQkFDUCxPQUFPO2dCQUNQLGVBQWU7Z0JBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxJQUFJO2FBQ3ZCO1NBQ0QsQ0FBQztJQUNILENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUixPQUFPLEVBQUUsS0FBSyw2REFBNkMsRUFBRSxDQUFDO0lBQy9ELENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUywrQkFBK0IsQ0FBQyxLQUFhO0lBQ3JELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNqRSxNQUFNLFNBQVMsR0FBRyxRQUFRLEVBQUUsTUFBTSxFQUFFLEdBQUcsSUFBSSxLQUFLLENBQUM7SUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNwRSxPQUFPLGdCQUFnQixJQUFJLFNBQVMsQ0FBQztBQUN0QyxDQUFDO0FBRUQsU0FBUyxnQ0FBZ0MsQ0FBQyxRQUFnQjtJQUN6RCxRQUFRLFFBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1FBQ2hDLEtBQUssS0FBSyxDQUFDO1FBQ1gsS0FBSyxPQUFPO1lBQ1gsT0FBTyxLQUFLLENBQUM7UUFDZCxLQUFLLE1BQU0sQ0FBQztRQUNaLEtBQUssUUFBUTtZQUNaLE9BQU8sTUFBTSxDQUFDO1FBQ2Y7WUFDQyxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsNEJBQTRCLENBQUMsR0FBUSxFQUFFLFFBQW9DO0lBQ25GLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLFFBQVEsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUN0RCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO0lBQ3pCLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxRQUFRLEtBQUssR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0lBQzlELE9BQU8sR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQ2pDLENBQUMifQ==