/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import stream = require('stream');
import uuid = require('vs/base/common/uuid');
import ee = require('vs/base/common/eventEmitter');
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import debug = require('vs/workbench/parts/debug/common/debug');

export class V8Protocol extends ee.EventEmitter {

	public emittedStopped: boolean;
	protected flowEventsCount: number;
	private static TWO_CRLF = '\r\n\r\n';

	private outputStream: stream.Writable;
	private sequence: number;
	private pendingRequests: { [id: number]: (e: DebugProtocol.Response) => void; };
	private rawData: Buffer;
	private id: string;
	private contentLength: number;

	constructor() {
		super();
		this.flowEventsCount = 0;
		this.emittedStopped = false;
		this.sequence = 1;
		this.contentLength = -1;
		this.pendingRequests = {};
		this.rawData = new Buffer(0);
		this.id = uuid.generateUuid();
	}

	public emit(eventType: string, data?: any): void {
		if (eventType === debug.SessionEvents.STOPPED) {
			this.emittedStopped = true;
		}
		if (eventType === debug.SessionEvents.CONTINUED || eventType === debug.SessionEvents.STOPPED ||
			eventType === debug.SessionEvents.DEBUGEE_TERMINATED || eventType === debug.SessionEvents.SERVER_EXIT) {
			this.flowEventsCount++;
		}
		if (data) {
			data.sessionId = this.getId();
		} else {
			data = { sessionId: this.getId() };
		}

		super.emit(eventType, data);
	}

	public getId(): string {
		return this.id;
	}

	protected connect(readable: stream.Readable, writable: stream.Writable): void {

		this.outputStream = writable;

		readable.on('data', (data: Buffer) => {
			this.rawData = Buffer.concat([this.rawData, data]);
			this.handleData();
		});
	}

	protected send(command: string, args: any): TPromise<DebugProtocol.Response> {
		return new Promise((completeDispatch, errorDispatch) => {
			this.doSend(command, args, (result: DebugProtocol.Response) => {
				if (result.success) {
					completeDispatch(result);
				} else {
					errorDispatch(result);
				}
			});
		});
	}

	private doSend(command: string, args: any, clb: (result: DebugProtocol.Response) => void): void {

		var request: DebugProtocol.Request = {
			type: 'request',
			seq: this.sequence++,
			command: command
		};
		if (args && Object.keys(args).length > 0) {
			request.arguments = args;
		}

		// store callback for this request
		this.pendingRequests[request.seq] = clb;

		var json = JSON.stringify(request);
		var length = Buffer.byteLength(json, 'utf8');

		this.outputStream.write('Content-Length: ' + length.toString() + V8Protocol.TWO_CRLF, 'utf8');
		this.outputStream.write(json, 'utf8');
	}

	private handleData(): void {
		while (true) {
			if (this.contentLength >= 0) {
				if (this.rawData.length >= this.contentLength) {
					var message = this.rawData.toString('utf8', 0, this.contentLength);
					this.rawData = this.rawData.slice(this.contentLength);
					this.contentLength = -1;
					if (message.length > 0) {
						this.dispatch(message);
					}
					continue;	// there may be more complete messages to process
				}
			} else {
				var s = this.rawData.toString('utf8', 0, this.rawData.length);
				var idx = s.indexOf(V8Protocol.TWO_CRLF);
				if (idx !== -1) {
					var match = /Content-Length: (\d+)/.exec(s);
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
		var rawData = JSON.parse(body);

		if (typeof rawData.event !== 'undefined') {
			var event = <DebugProtocol.Event> rawData;
			this.emit(event.event, event);
		} else {
			var response = <DebugProtocol.Response> rawData;
			var clb = this.pendingRequests[response.request_seq];
			if (clb) {
				delete this.pendingRequests[response.request_seq];
				clb(response);
			}
		}
	}
}
