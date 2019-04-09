/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { importWrappedScript } from 'vs/workbench/contrib/workerExtensions/worker/extensionLoader';

class ExtensionWorker implements IRequestHandler {

	// worker-contract
	readonly _requestHandlerBrand: any;
	readonly onmessage: (data: any) => any;

	// protocol
	readonly protocol: IMessagePassingProtocol;

	constructor(postMessage: (message: any, transfer?: Transferable[]) => any) {

		const emitter = new Emitter<VSBuffer>();
		this.onmessage = data => {
			if (data instanceof ArrayBuffer) {
				emitter.fire(VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength)));
			} else {
				console.warn('UNKNOWN data received', data);
			}
		};

		this.protocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
				postMessage(data, [data]);
			}
		};
	}
}

export function create(postMessage: (message: any, transfer?: Transferable[]) => any): IRequestHandler {
	const res = new ExtensionWorker(postMessage);
	res.protocol.onMessage(buff => console.log(buff.toString()));
	res.protocol.send(VSBuffer.fromString('HELLO from WORKER'));

	const source = `Object.defineProperty(exports, "__esModule", { value: true });
const model = require('./model');
const vscode = require('vscode');
function activate() {
\tconsole.log('HELLO');
}
exports.activate = activate;`;

	importWrappedScript(source, 'somepath');

	return res;
}
