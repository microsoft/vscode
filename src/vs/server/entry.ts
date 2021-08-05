/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import * as proxyAgent from 'vs/base/node/proxy_agent';
import { enableCustomMarketplace } from 'vs/server/marketplace';
import { ConsoleMainLogger } from 'vs/platform/log/common/log';
import { Server as WebSocketServer } from 'ws';
import { CodeServer, VscodeServerArgs as ServerArgs } from 'vs/server/server';
import { createServer, IncomingMessage } from 'http';
import * as net from 'net';
// import { VSBuffer } from 'vs/base/common/buffer';
// import { ProtocolMessage } from 'vs/base/parts/ipc/common/ipc.net';

const logger = new ConsoleMainLogger();

setUnexpectedErrorHandler((error) => {
	logger.warn('Uncaught error', error instanceof Error ? error.message : error);
});
enableCustomMarketplace();
proxyAgent.monkeyPatch(true);

type UpgradeHandler = (request: IncomingMessage, socket: net.Socket, upgradeHead: Buffer) => void;

export async function main(args: ServerArgs) {
	const httpServer = createServer();

	const serverUrl = new URL(`ws://${args.server}`);
	logger.info('server', serverUrl.toJSON());

	const wss = new WebSocketServer({
		// port: parseInt(serverUrl.port, 10),
		noServer: true,
		perMessageDeflate: false,
		// perMessageDeflate: {
		// 	zlibDeflateOptions: {
		// 		// See zlib defaults.
		// 		chunkSize: 1024,
		// 		memLevel: 7,
		// 		level: 3,
		// 	},
		// 	zlibInflateOptions: {
		// 		chunkSize: 10 * 1024,
		// 	},
		// 	// Other options settable:
		// 	clientNoContextTakeover: true, // Defaults to negotiated value.
		// 	serverNoContextTakeover: true, // Defaults to negotiated value.
		// 	serverMaxWindowBits: 10, // Defaults to negotiated value.
		// 	// Below options specified as default values.
		// 	concurrencyLimit: 10, // Limits zlib concurrency for perf.
		// 	threshold: 1024, // Size (in bytes) below which messages
		// 	// should not be compressed.
		// },
	});



	const codeServer = new CodeServer();
	const workbenchConstructionOptions = await codeServer.startup();


	logger.info(JSON.stringify(workbenchConstructionOptions.folderUri));
	wss.on('error', (error) => logger.error(error.message));

	const upgrade: UpgradeHandler = (request, socket, head) => {
		let query = new URLSearchParams();

		if (request.url) {
			const upgradeUrl = new URL(request.url, serverUrl.toString());
			logger.info('Upgrade from', upgradeUrl.searchParams.toString());

			query = upgradeUrl.searchParams;
		}

		wss.handleUpgrade(request, socket, head, function done(ws) {
			// logger.info('headers', request.rawHeaders);

			codeServer.handleWebSocket(ws, socket, query, !!wss.options.perMessageDeflate);
			// wss.emit('connection', ws, request);
		});
	};

	httpServer.on('upgrade', upgrade);

	httpServer.listen(parseInt(serverUrl.port, 10));

	return new Promise((resolve, reject) => {

	});
}
