import * as base from '@jupyter-widgets/base';
import { JSONObject, JSONValue, UUID } from '@lumino/coreutils';
import { Disposable } from 'vscode-notebook-renderer/events';
import type * as WebviewMessage from '../../../../src/vs/workbench/services/languageRuntime/common/erdosIPyWidgetsWebviewMessages';
import { KernelMessage } from '@jupyterlab/services';
import { Messaging } from './messaging';

export class Comm implements base.IClassicComm, Disposable {
	private _disposables: Disposable[] = [];
	private _on_msg: ((x: KernelMessage.ICommMsgMsg) => void) | undefined;
	private _on_close: ((x: KernelMessage.ICommCloseMsg) => void) | undefined;
	private _callbacks = new Map<string, base.ICallbacks>();

	private _unhandledCommMessages = new Array<WebviewMessage.ICommMessageToWebview>();

	constructor(
		readonly comm_id: string,
		readonly target_name: string,
		private readonly messaging: Messaging,
	) {
		this._disposables.push(messaging.onDidReceiveMessage(message => {
			if (!('comm_id' in message) || message.comm_id !== this.comm_id) {
				return;
			}

			switch (message.type) {
				case 'comm_close':
					this.handle_close(message);
					break;
				case 'comm_msg':
					this.handle_msg(message);
					break;
				default:
					console.warn(
						`Unhandled message from webview for client ${this.comm_id}: `
						+ JSON.stringify(message)
					);
					break;
			}
		}));
	}

	open(
		_data: JSONValue,
		_callbacks?: base.ICallbacks,
		_metadata?: JSONObject,
		_buffers?: ArrayBuffer[] | ArrayBufferView[]
	): string {
		throw new Error('Method not implemented.');
	}

	send(
		data: JSONValue,
		callbacks?: base.ICallbacks,
		_metadata?: JSONObject,
		buffers?: ArrayBuffer[] | ArrayBufferView[]
	): string {

		if (callbacks?.shell?.reply) {
			throw new Error('Callback shell.reply not implemented');
		}

		if (callbacks?.input) {
			throw new Error('Callback input not implemented');
		}

		if (callbacks?.iopub?.clear_output) {
			throw new Error('Callback iopub.clear_output not implemented');
		}

		if (callbacks?.iopub?.output) {
			throw new Error('Callback iopub.output not implemented');
		}

		let processedBuffers: Uint8Array[] | undefined;
		if (buffers && buffers.length > 0) {
			processedBuffers = buffers.map(bufferOrView => {
				if (bufferOrView instanceof ArrayBuffer) {
					return new Uint8Array(bufferOrView);
				} else if (ArrayBuffer.isView(bufferOrView)) {
					return new Uint8Array(bufferOrView.buffer, bufferOrView.byteOffset, bufferOrView.byteLength);
				} else {
					console.error(`Invalid buffer type encountered: ${typeof bufferOrView}. Skipping this buffer.`);
					return undefined;
				}
			}).filter(buffer => buffer !== undefined) as Uint8Array[];
		}

		const msgId = UUID.uuid4();

		if (callbacks?.iopub?.status) {
			if (this._callbacks.has(msgId)) {
				throw new Error(`Callbacks already set for message id ${msgId}`);
			}
			this._callbacks.set(msgId, { iopub: { status: callbacks.iopub.status } });
		}

		this.messaging.postMessage({
			type: 'comm_msg',
			comm_id: this.comm_id,
			msg_id: msgId,
			data: data,
			buffers: processedBuffers,
		});

		return msgId;
	}

	close(
		_data?: JSONValue | undefined,
		callbacks?: base.ICallbacks | undefined,
		_metadata?: JSONObject | undefined,
		_buffers?: ArrayBuffer[] | ArrayBufferView[] | undefined
	): string {
		if (callbacks) {
			throw new Error('Callbacks not supported in close');
		}

		this._on_msg = undefined;
		this._on_close = undefined;
		this._callbacks.clear();

		this.messaging.postMessage({
			type: 'comm_close',
			comm_id: this.comm_id,
		});

		return '';
	}

	on_msg(callback: (x: any) => void): void {
		this._on_msg = callback;

		if (this._unhandledCommMessages.length > 0) {
			for (const message of this._unhandledCommMessages) {
				this.handle_msg(message);
			}
			this._unhandledCommMessages = [];
		}
	}

	on_close(callback: (x: any) => void): void {
		this._on_close = callback;
	}

	private handle_close(_message: WebviewMessage.ICommCloseToWebview): void {
		if (this._on_close) {
			this._on_close?.({
				content: {
					comm_id: this.comm_id,
					data: {},
				},
				channel: 'shell',
				header: {
					date: '',
					msg_id: '',
					msg_type: 'comm_close',
					session: '',
					username: '',
					version: '',
				},
				parent_header: {},
				metadata: {},
			});
		} else {
			console.warn(`Attempted to close comm ${this.comm_id} without a close handler`);
		}
	}

	private handle_msg(message: WebviewMessage.ICommMessageToWebview): void {
		if (this._on_msg) {
			this._on_msg({
				content: {
					comm_id: this.comm_id,
					data: message.data as JSONObject,
				},
				buffers: message.buffers?.map(buffer => new Uint8Array(buffer)),
				channel: 'iopub',
				header: {
					date: '',
					msg_id: '',
					msg_type: 'comm_msg',
					session: '',
					username: '',
					version: '',
				},
				parent_header: {},
				metadata: {},
			});
		} else {
			this._unhandledCommMessages.push(message);
		}

		const msgId = message.parent_id;
		if (msgId) {
			const callbacks = this._callbacks.get(msgId);
			if (callbacks) {
				callbacks.iopub?.status?.({
					content: {
						execution_state: 'idle'
					},
					channel: 'iopub',
					header: {
						date: '',
						msg_id: '',
						msg_type: 'status',
						session: '',
						username: '',
						version: '',
					},
					parent_header: {},
					metadata: {},
				});
			}
		}
	}

	dispose(): void {
		for (const disposable of this._disposables) {
			disposable.dispose();
		}
		this._disposables = [];
	}
}

