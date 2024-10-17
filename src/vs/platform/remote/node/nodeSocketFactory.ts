/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { NodeSocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { makeRawSocketHeaders } from '../common/managedSocket.js';
import { RemoteConnectionType, WebSocketRemoteConnection } from '../common/remoteAuthorityResolver.js';
import { ISocketFactory } from '../common/remoteSocketFactoryService.js';

export const nodeSocketFactory = new class implements ISocketFactory<RemoteConnectionType.WebSocket> {

	supports(connectTo: WebSocketRemoteConnection): boolean {
		return true;
	}

	connect({ host, port }: WebSocketRemoteConnection, path: string, query: string, debugLabel: string): Promise<ISocket> {
		return new Promise<ISocket>((resolve, reject) => {
			const socket = net.createConnection({ host: host, port: port }, () => {
				socket.removeListener('error', reject);

				socket.write(makeRawSocketHeaders(path, query, debugLabel));

				const onData = (data: Buffer) => {
					const strData = data.toString();
					if (strData.indexOf('\r\n\r\n') >= 0) {
						// headers received OK
						socket.off('data', onData);
						resolve(new NodeSocket(socket, debugLabel));
					}
				};
				socket.on('data', onData);
			});
			// Disable Nagle's algorithm.
			socket.setNoDelay(true);
			socket.once('error', reject);
		});
	}
};
