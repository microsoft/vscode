/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import { NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { makeRawSocketHeaders } from 'vs/platform/remote/common/managedSocket';
import { IConnectCallback, ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { WebSocketRemoteConnection } from 'vs/platform/remote/common/remoteAuthorityResolver';

export const nodeSocketFactory = new class implements ISocketFactory<WebSocketRemoteConnection> {
	connect({ host, port }: WebSocketRemoteConnection, path: string, query: string, debugLabel: string, callback: IConnectCallback): void {
		const errorListener = (err: any) => callback(err, undefined);

		const socket = net.createConnection({ host: host, port: port }, () => {
			socket.removeListener('error', errorListener);

			socket.write(makeRawSocketHeaders(path, query, debugLabel));

			const onData = (data: Buffer) => {
				const strData = data.toString();
				if (strData.indexOf('\r\n\r\n') >= 0) {
					// headers received OK
					socket.off('data', onData);
					callback(undefined, new NodeSocket(socket, debugLabel));
				}
			};
			socket.on('data', onData);
		});
		// Disable Nagle's algorithm.
		socket.setNoDelay(true);
		socket.once('error', errorListener);
	}
};
