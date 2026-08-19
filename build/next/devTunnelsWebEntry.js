/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TunnelManagementHttpClient, ManagementApiVersions } from '@microsoft/dev-tunnels-management';
import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelAccessScopes } from '@microsoft/dev-tunnels-contracts';
// The package root resolves to lib/browser.js, a native-WebSocket wrapper. This deep import provides
// RFC 6455 framing for an existing duplex stream and must not be replaced with the package root.
import WebSocketConnection from 'websocket/lib/WebSocketConnection';

export {
	TunnelManagementHttpClient,
	ManagementApiVersions,
	TunnelRelayTunnelClient,
	TunnelAccessScopes,
	WebSocketConnection,
};
