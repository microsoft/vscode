/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import stream = require('stream');
import uuid = require('vs/base/common/uuid');
import {TPromise} from 'vs/base/common/winjs.base';
import {canceled} from 'vs/base/common/errors';

export abstract class V8Protocol {

	private static TWO_CRLF = '\r\n\r\n';

	private outputStream: stream.Writable;
	private sequence: number;
	private pendingRequests: { [id: number]: (e: DebugProtocol.Response) => void; };
	private rawData: Buffer;
	private id: string;
	private contentLength: number;

	constructor() {
		this.sequence = 1;
		this.contentLength = -1;
		this.pendingRequests = {};
		this.rawData = new Buffer(0);
		this.id = uuid.generateUuid();
	}

	public getId(): string {
		return this.id;
	}

	protected abstract onServerError(err: Error): void;
	protected abstract onEvent(event: DebugProtocol.Event): void;
	protected abstract dispatchRequest(request: DebugProtocol.Request);

	protected connect(readable: stream.Readable, writable: stream.Writable): void {

		this.outputStream = writable;

		readable.on('data', (data: Buffer) => {
			this.rawData = Buffer.concat([this.rawData, data]);
			this.handleData();
		});
	}

	protected send(command: string, args: any): TPromise<DebugProtocol.Response> {
		let errorCallback;
		return new TPromise((completeDispatch, errorDispatch) => {
			errorCallback = errorDispatch;
			this.doSend(command, args, (result: DebugProtocol.Response) => {
				if (result.success) {
					completeDispatch(result);
				} else {
					errorDispatch(result);
				}
			});
		}, () => errorCallback(canceled()));
	}

	public sendResponse(response: DebugProtocol.Response): void {
		if (response.seq > 0) {
			console.error(`attempt to send more than one response for command ${response.command}`);
		} else {
			this.sendMessage('response', response);
		}
	}

	private doSend(command: string, args: any, clb: (result: DebugProtocol.Response) => void): void {

		const request: any = {
			command: command
		};
		if (args && Object.keys(args).length > 0) {
			request.arguments = args;
		}

		this.sendMessage('request', request);

		if (clb) {
			// store callback for this request
			this.pendingRequests[request.seq] = clb;
		}
	}

	private sendMessage(typ: 'request' | 'response' | 'event', message: DebugProtocol.ProtocolMessage): void {

		message.type = typ;
		message.seq = this.sequence++;

		const json = JSON.stringify(message);
		const length = Buffer.byteLength(json, 'utf8');

		this.outputStream.write('Content-Length: ' + length.toString() + V8Protocol.TWO_CRLF, 'utf8');
		this.outputStream.write(json, 'utf8');
	}

	private handleData(): void {
		while (true) {
			if (this.contentLength >= 0) {
				if (this.rawData.length >= this.contentLength) {
					const message = this.rawData.toString('utf8', 0, this.contentLength);
					this.rawData = this.rawData.slice(this.contentLength);
					this.contentLength = -1;
					if (message.length > 0) {
						this.dispatch(message);
					}
					continue;	// there may be more complete messages to process
				}
			} else {
				const s = this.rawData.toString('utf8', 0, this.rawData.length);
				const idx = s.indexOf(V8Protocol.TWO_CRLF);
				if (idx !== -1) {
					const match = /Content-Length: (\d+)/.exec(s);
					if (match && match[1]) {
						this.contentLength = Number(match[1]);
						this.rawData = this.rawData.slice(idx + V8Protocol.TWO_CRLF.length);
						continue;	// try to handle a complete message
					}
				}
			}
			break;
		}
	}

	private dispatch(body: string): void {
		try {
			const rawData = JSON.parse(body);
			switch (rawData.type) {
				case 'event':
					this.onEvent(<DebugProtocol.Event>rawData);
					break;
				case 'response':
					const response = <DebugProtocol.Response>rawData;
					const clb = this.pendingRequests[response.request_seq];
					if (clb) {
						delete this.pendingRequests[response.request_seq];
						clb(response);
					}
					break;
				case 'request':
					this.dispatchRequest(<DebugProtocol.Request>rawData);
					break;
			}
		} catch (e) {
			this.onServerError(new Error(e.message || e));
		}
	}
}
