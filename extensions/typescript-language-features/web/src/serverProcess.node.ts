/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Worker, MessageChannel } from 'worker_threads';
import * as path from 'path';

enum MessageType {
	Server = 'server',
	Watcher = 'watcher',
	Fs = 'fs',
	Log = 'log',
}

const args = process.argv.slice(2);
const serverPath = args[0];
const extUriIndex = args.indexOf('--extension-uri');
if (extUriIndex < 0 || extUriIndex === args.length - 1) {
	throw new Error('Now --extension-uri argument provided');
}
const extensionUri = args[extUriIndex + 1];

const workerPath = path.resolve(__dirname, 'worker.node.js');
const worker = new Worker(workerPath, {
	workerData: {
		serverPath: path.resolve(path.dirname(serverPath), 'tsserverlibrary.js')
	}
});

const tsserverChannel = new MessageChannel();
const watcherChannel = new MessageChannel();
const fsChannel = new MessageChannel();

// The ext host communicates with us using ipc. Hook this up to forward to the worker over the message channels
process.on('message', (message: any) => {
	switch (message.type) {
		case MessageType.Server:
			tsserverChannel.port1.postMessage(message.body);
			break;
		case MessageType.Watcher:
			watcherChannel.port1.postMessage(message.body);
			break;
		case MessageType.Fs:
			fsChannel.port1.postMessage(message.body);
			break;
		default:
			throw new Error('Unknown message type: ' + message.type);
	}
});

// The worker uses the message channel for all communication except logging
worker.on('message', message => {
	if (message.type === MessageType.Log) {
		process.send!(message);
	} else {
		console.log('Proxy process received unexpected message from worker', message);
	}
});

// Forward messages from the worker to the extension
tsserverChannel.port1.on('message', message => {
	process.send!({ 'type': MessageType.Server, body: message });
});
watcherChannel.port1.on('message', message => {
	process.send!({ 'type': MessageType.Watcher, body: message });
});
fsChannel.port1.on('message', message => {
	process.send!({ 'type': MessageType.Fs, body: message });
});

// Send a single initialization message that also establishes message channels
worker.postMessage({
	type: 'init',
	args,
	ports: {
		tsserver: tsserverChannel.port2,
		watcher: watcherChannel.port2,
		syncFs: fsChannel.port2,
	},
	extensionUri
}, [tsserverChannel.port2, watcherChannel.port2, fsChannel.port2]);
