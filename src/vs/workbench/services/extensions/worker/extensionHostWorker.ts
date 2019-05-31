/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { isMessageOfType, MessageType, createMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { IHostUtils } from 'vs/workbench/services/extensions/worker/extHostExtensionService';
import { ExtensionHostMain } from 'vs/workbench/services/extensions/worker/extensionHostMain';
import { ConsoleLogService } from 'vs/platform/log/common/log';

// worker-self
declare namespace self {
	function close(): void;
}

// do not allow extensions to call terminate
const nativeClose = self.close.bind(self);
self.close = () => console.trace('An extension called terminate and this was prevented');
let onTerminate = nativeClose;

const hostUtil = new class implements IHostUtils {
	exit(code?: number | undefined): void {
		nativeClose();
	}
	async exists(path: string): Promise<boolean> {
		return true;
	}
	async realpath(path: string): Promise<string> {
		return path;
	}
};

//todo@joh do not allow extensions to call postMessage and other globals...

class ExtensionWorker implements IRequestHandler {

	// worker-contract
	readonly _requestHandlerBrand: any;
	readonly onmessage: (data: any) => any;

	// protocol
	readonly protocol: IMessagePassingProtocol;

	constructor(postMessage: (message: any, transfer?: Transferable[]) => any) {

		let emitter = new Emitter<VSBuffer>();
		let terminating = false;

		this.onmessage = data => {
			if (!(data instanceof ArrayBuffer)) {
				console.warn('UNKNOWN data received', data);
				return;
			}

			const msg = VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength));
			if (isMessageOfType(msg, MessageType.Terminate)) {
				// handle terminate-message right here
				terminating = true;
				onTerminate();
				return;
			}

			// emit non-terminate messages to the outside
			emitter.fire(msg);
		};

		this.protocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				if (!terminating) {
					const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
					postMessage(data, [data]);
				}
			}
		};
	}
}

interface IRendererConnection {
	protocol: IMessagePassingProtocol;
	initData: IInitData;
}
function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>(resolve => {
		const once = protocol.onMessage(raw => {
			once.dispose();
			const initData = <IInitData>JSON.parse(raw.toString());
			protocol.send(createMessageOfType(MessageType.Initialized));
			resolve({ protocol, initData });
		});
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

export function create(postMessage: (message: any, transfer?: Transferable[]) => any): IRequestHandler {
	const res = new ExtensionWorker(postMessage);

	connectToRenderer(res.protocol).then(data => {
		// console.log('INIT_DATA', data.initData);

		// data.protocol.onMessage(msg => {
		// 	// console.log('SOME MSG', msg.toString());
		// });

		const extHostMain = new ExtensionHostMain(
			data.protocol,
			data.initData,
			hostUtil,
			() => { },
			() => new ConsoleLogService(),
			null,
		);

		onTerminate = () => extHostMain.terminate();
	});

	return res;
}
