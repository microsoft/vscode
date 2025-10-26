import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import dotenv from 'dotenv';

dotenv.config();

const server = http.createServer((req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('CoCode Yjs WebSocket Server\n');
});

const wss = new WebSocketServer({ server });

console.log('[Yjs-WS] Starting WebSocket server...');

wss.on('connection', (conn, req) => {
	const url = req.url || '';
	console.log(`[Yjs-WS] New connection: ${url}`);

	try {
		setupWSConnection(conn as unknown as WebSocket, req, {
			// Optional: Add persistence with y-leveldb
			// persistence: {
			//   provider: require('y-leveldb'),
			//   path: './db'
			// }
		});
	} catch (err) {
		console.error('[Yjs-WS] Connection error:', err);
		conn.close();
	}
});

wss.on('error', (err) => {
	console.error('[Yjs-WS] WebSocket server error:', err);
});

const port = process.env.PORT || 1234;
server.listen(port, () => {
	console.log(`[Yjs-WS] Running on port ${port}`);
});
