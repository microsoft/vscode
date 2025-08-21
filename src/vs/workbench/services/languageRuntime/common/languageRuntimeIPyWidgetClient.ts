/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IRuntimeClientInstance, IRuntimeClientOutput, RuntimeClientState } from './languageRuntimeClientInstance.js';
import { FromWebviewMessage, ICommMessageFromWebview, ToWebviewMessage } from './erdosIPyWidgetsWebviewMessages.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export interface IIPyWidgetsWebviewMessaging {
	onDidReceiveMessage: Event<FromWebviewMessage>;
	postMessage(message: ToWebviewMessage): Promise<boolean>;
}

export class IPyWidgetClientInstance extends Disposable {
	private readonly _closeEmitter = this._register(new Emitter<void>());
	private _closed = false;

	onDidClose = this._closeEmitter.event;

	constructor(
		private readonly _client: IRuntimeClientInstance<any, any>,
		private readonly _messaging: IIPyWidgetsWebviewMessaging,
		private readonly _logService: ILogService,
		private readonly _rpcMethods: string[],
	) {
		super();

		this._register(_messaging.onDidReceiveMessage(async (message) => {
			if (!('comm_id' in message) || message.comm_id !== this._client.getClientId()) {
				return;
			}

			switch (message.type) {
				case 'comm_close':
					this.handleCommCloseFromWebview();
					break;
				case 'comm_msg':
					this.handleCommMessageFromWebview(message);
					break;
				default:
					this._logService.warn(
						`Unhandled message from webview for client ${this._client.getClientId()}: `
						+ JSON.stringify(message)
					);
					break;
			}
		}));

		this._register(_client.onDidReceiveData(event => {
			const data = event.data;
			if (event.buffers && event.buffers.length > 0) {
				this._logService.trace(`RECV comm_msg: ${JSON.stringify(data)} with ${event.buffers.length} buffers`);
			} else {
				this._logService.trace(`RECV comm_msg: ${JSON.stringify(data)}`);
			}

			switch (data.method) {
				case 'custom':
				case 'update':
					this.postCommMessage(event);
					break;
				default:
					this._logService.warn(
						`Unhandled message from client ${this._client.getClientId()} for webview: `
						+ JSON.stringify(data)
					);
					break;
			}
		}));

		const stateChangeEvent = Event.fromObservable(_client.clientState);
		this._register(stateChangeEvent(state => {
			if (!this._closed && state === RuntimeClientState.Closed) {
				this._closed = true;
				this._messaging.postMessage({
					type: 'comm_close',
					comm_id: this._client.getClientId(),
				});
				this._closeEmitter.fire();
			}
		}));
	}

	private async handleCommCloseFromWebview() {
		this._closed = true;
		this._client.dispose();
	}

	private async handleCommMessageFromWebview(message: ICommMessageFromWebview) {
		const data = message.data as any;
		if (
			data.method !== undefined &&
			this._rpcMethods.includes(data.method)) {
			this._logService.trace('SEND comm_msg:', data);
			const reply = await this._client.performRpcWithBuffers(data, 5000);

			this._logService.trace('RECV comm_msg:', reply);
			this.postCommMessage(reply, message.msg_id);
		} else {
			this._logService.trace('SEND comm_msg:', data, { buffers: message.buffers?.length });
			let vsBuffers: VSBuffer[] | undefined;
			if (Array.isArray(message.buffers) && message.buffers.every(b => b instanceof Uint8Array)) {
				vsBuffers = message.buffers.map(b => VSBuffer.wrap(b));
			} else if (message.buffers) {
				this._logService.warn('Invalid buffers received in comm_msg:', message.buffers);
			}
			this._client.sendMessage(message.data, vsBuffers);
		}
	}

	private postCommMessage(message: IRuntimeClientOutput<any>, parentId?: string) {
		this._messaging.postMessage({
			type: 'comm_msg',
			comm_id: this._client.getClientId(),
			data: message.data,
			buffers: message.buffers?.map(vsBuffer => vsBuffer.buffer),
			parent_id: parentId,
		});
	}
}
