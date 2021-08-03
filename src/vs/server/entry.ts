/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import * as proxyAgent from 'vs/base/node/proxy_agent';
// import { CodeServerMessage, VscodeMessage } from 'vs/base/common/ipc';
import { enableCustomMarketplace } from 'vs/server/marketplace';
// import { VscodeServer } from 'vs/server/server';
import { ConsoleMainLogger } from 'vs/platform/log/common/log';
import { Server as WebSocketServer } from 'ws';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import * as strings from 'vs/base/common/strings';

const logger = new ConsoleMainLogger();

setUnexpectedErrorHandler((error) => {
	logger.warn('Uncaught error', error instanceof Error ? error.message : error);
});
enableCustomMarketplace();
proxyAgent.monkeyPatch(true);

interface ServerParsedArgs extends NativeParsedArgs {
	server: string
}

function bindWebSocketServer(wss: WebSocketServer, onClose: (error?: Error) => void) {
	wss.on('connection', function connection(ws) {
		ws.on('message', function incoming(message) {
			const resp = strings.decodeUTF8(message as Buffer);
			logger.info('received: %s', resp);

			// switch (message) {
			// 	case value:

			// 		break;

			// 	default:
			// 		break;
			// }
		});

		ws.send('something');
	});

	wss.on('error', (event) => onClose(new Error(event.message)));
}

export function main(args: ServerParsedArgs) {
	const serverUrl = new URL(`http://${args.server}`);
	logger.info('server', serverUrl.toJSON());

	const wss = new WebSocketServer({
		port: parseInt(serverUrl.port, 10),
		perMessageDeflate: {
			zlibDeflateOptions: {
				// See zlib defaults.
				chunkSize: 1024,
				memLevel: 7,
				level: 3,
			},
			zlibInflateOptions: {
				chunkSize: 10 * 1024,
			},
			// Other options settable:
			clientNoContextTakeover: true, // Defaults to negotiated value.
			serverNoContextTakeover: true, // Defaults to negotiated value.
			serverMaxWindowBits: 10, // Defaults to negotiated value.
			// Below options specified as default values.
			concurrencyLimit: 10, // Limits zlib concurrency for perf.
			threshold: 1024, // Size (in bytes) below which messages
			// should not be compressed.
		},
	});

	return new Promise((resolve, reject) => {
		bindWebSocketServer(wss, (error) => {
			if (error) {
				logger.error(error.message);
				reject(error);
			}

			// resolve()
		});
	});
}
