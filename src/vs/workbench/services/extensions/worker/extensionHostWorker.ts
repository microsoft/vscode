/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { isMessageOfType, MessageType, createMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionHostMain } from 'vs/workbench/services/extensions/common/extensionHostMain';
import { IHostUtils } from 'vs/workbench/api/common/extHostExtensionService';
import 'vs/workbench/services/extensions/worker/extHost.services';

// worker-self
declare namespace self {
	function close(): void;
}

// do not allow extensions to call terminate
const nativeClose = self.close.bind(self);
self.close = () => console.trace('An extension called terminate and this was prevented');
let onTerminate = nativeClose;

const hostUtil = new class implements IHostUtils {
	_serviceBrand: any;
	exit(_code?: number | undefined): void {
		nativeClose();
	}
	async exists(_path: string): Promise<boolean> {
		return true;
	}
	async realpath(path: string): Promise<string> {
		return path;
	}
};

//todo@joh do not allow extensions to call postMessage and other globals...

class ExtensionWorker {

	// protocol
	readonly protocol: IMessagePassingProtocol;

	constructor() {

		let emitter = new Emitter<VSBuffer>();
		let terminating = false;

		onmessage = event => {
			const { data } = event;
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

(function create(): void {
	const res = new ExtensionWorker();

	connectToRenderer(res.protocol).then(data => {

		const extHostMain = new ExtensionHostMain(
			data.protocol,
			data.initData,
			hostUtil,
			null,
		);

		onTerminate = () => extHostMain.terminate();
	});
})();
