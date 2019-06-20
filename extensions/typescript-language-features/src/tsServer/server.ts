/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as stream from 'stream';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ServerResponse } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import TelemetryReporter from '../utils/telemetry';
import Tracer from '../utils/tracer';
import { TypeScriptVersion } from '../utils/versionProvider';
import { Reader } from '../utils/wireProtocol';
import { CallbackMap } from './callbackMap';
import { RequestItem, RequestQueue, RequestQueueingType } from './requestQueue';
import { TypeScriptServerError } from './serverError';

export interface OngoingRequestCanceller {
	tryCancelOngoingRequest(seq: number): boolean;
}

export class PipeRequestCanceller implements OngoingRequestCanceller {
	public constructor(
		private readonly _cancellationPipeName: string | undefined,
		private readonly _tracer: Tracer,
	) { }

	public tryCancelOngoingRequest(seq: number): boolean {
		if (!this._cancellationPipeName) {
			return false;
		}
		this._tracer.logTrace(`TypeScript Server: trying to cancel ongoing request with sequence number ${seq}`);
		try {
			fs.writeFileSync(this._cancellationPipeName + seq, '');
		} catch {
			// noop
		}
		return true;
	}
}

export interface ITypeScriptServer {
	readonly onEvent: vscode.Event<Proto.Event>;
	readonly onExit: vscode.Event<any>;
	readonly onError: vscode.Event<any>;
	readonly onReaderError: vscode.Event<Error>;

	readonly tsServerLogFile: string | undefined;

	kill(): void;

	executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: false, lowPriority?: boolean }): undefined;
	executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>>;
	executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>> | undefined;

	dispose(): void;
}

export interface TsServerProcess {
	readonly stdout: stream.Readable;
	write(serverRequest: Proto.Request): void;

	on(name: 'exit', handler: (code: number | null) => void): void;
	on(name: 'error', handler: (error: Error) => void): void;

	kill(): void;
}

export class ProcessBasedTsServer extends Disposable implements ITypeScriptServer {
	private readonly _reader: Reader<Proto.Response>;
	private readonly _requestQueue = new RequestQueue();
	private readonly _callbacks = new CallbackMap<Proto.Response>();
	private readonly _pendingResponses = new Set<number>();

	constructor(
		private readonly _process: TsServerProcess,
		private readonly _tsServerLogFile: string | undefined,
		private readonly _requestCanceller: OngoingRequestCanceller,
		private readonly _version: TypeScriptVersion,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _tracer: Tracer,
	) {
		super();
		this._reader = this._register(new Reader<Proto.Response>(this._process.stdout!));
		this._reader.onData(msg => this.dispatchMessage(msg));

		this._process.on('exit', code => {
			this._onExit.fire(code);
			this._callbacks.destroy('server exited');
		});
		this._process.on('error', error => {
			this._onError.fire(error);
			this._callbacks.destroy('server errored');
		});
	}

	private readonly _onEvent = this._register(new vscode.EventEmitter<Proto.Event>());
	public readonly onEvent = this._onEvent.event;

	private readonly _onExit = this._register(new vscode.EventEmitter<any>());
	public readonly onExit = this._onExit.event;

	private readonly _onError = this._register(new vscode.EventEmitter<any>());
	public readonly onError = this._onError.event;

	public get onReaderError() { return this._reader.onError; }

	public get tsServerLogFile() { return this._tsServerLogFile; }

	private write(serverRequest: Proto.Request) {
		this._process.write(serverRequest);
	}

	public dispose() {
		super.dispose();
		this._callbacks.destroy('server disposed');
		this._pendingResponses.clear();
	}

	public kill() {
		this._process.kill();
	}

	private dispatchMessage(message: Proto.Message) {
		try {
			switch (message.type) {
				case 'response':
					this.dispatchResponse(message as Proto.Response);
					break;

				case 'event':
					const event = message as Proto.Event;
					if (event.event === 'requestCompleted') {
						const seq = (event as Proto.RequestCompletedEvent).body.request_seq;
						const p = this._callbacks.fetch(seq);
						if (p) {
							this._tracer.traceRequestCompleted('requestCompleted', seq, p.startTime);
							p.onSuccess(undefined);
						}
					} else {
						this._tracer.traceEvent(event);
						this._onEvent.fire(event);
					}
					break;

				default:
					throw new Error(`Unknown message type ${message.type} received`);
			}
		} finally {
			this.sendNextRequests();
		}
	}

	private tryCancelRequest(seq: number, command: string): boolean {
		try {
			if (this._requestQueue.tryDeletePendingRequest(seq)) {
				this._tracer.logTrace(`TypeScript Server: canceled request with sequence number ${seq}`);
				return true;
			}

			if (this._requestCanceller.tryCancelOngoingRequest(seq)) {
				return true;
			}

			this._tracer.logTrace(`TypeScript Server: tried to cancel request with sequence number ${seq}. But request got already delivered.`);
			return false;
		} finally {
			const callback = this.fetchCallback(seq);
			if (callback) {
				callback.onSuccess(new ServerResponse.Cancelled(`Cancelled request ${seq} - ${command}`));
			}
		}
	}

	private dispatchResponse(response: Proto.Response) {
		const callback = this.fetchCallback(response.request_seq);
		if (!callback) {
			return;
		}

		this._tracer.traceResponse(response, callback.startTime);
		if (response.success) {
			callback.onSuccess(response);
		} else if (response.message === 'No content available.') {
			// Special case where response itself is successful but there is not any data to return.
			callback.onSuccess(ServerResponse.NoContent);
		} else {
			callback.onError(TypeScriptServerError.create(this._version, response));
		}
	}

	public executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: false, lowPriority?: boolean }): undefined;
	public executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>>;
	public executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<ServerResponse.Response<Proto.Response>> | undefined {
		const request = this._requestQueue.createRequest(command, args);
		const requestInfo: RequestItem = {
			request,
			expectsResponse: executeInfo.expectsResult,
			isAsync: executeInfo.isAsync,
			queueingType: ProcessBasedTsServer.getQueueingType(command, executeInfo.lowPriority)
		};
		let result: Promise<ServerResponse.Response<Proto.Response>> | undefined;
		if (executeInfo.expectsResult) {
			result = new Promise<ServerResponse.Response<Proto.Response>>((resolve, reject) => {
				this._callbacks.add(request.seq, { onSuccess: resolve, onError: reject, startTime: Date.now(), isAsync: executeInfo.isAsync }, executeInfo.isAsync);

				if (executeInfo.token) {
					executeInfo.token.onCancellationRequested(() => {
						this.tryCancelRequest(request.seq, command);
					});
				}
			}).catch((err: Error) => {
				if (err instanceof TypeScriptServerError) {
					if (!executeInfo.token || !executeInfo.token.isCancellationRequested) {
						/* __GDPR__
							"languageServiceErrorResponse" : {
								"command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
								"stack" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
								"errortext" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
								"${include}": [
									"${TypeScriptCommonProperties}"
								]
							}
						*/
						this._telemetryReporter.logTelemetry('languageServiceErrorResponse', {
							command: err.serverCommand,
							message: err.serverMessage || '',
							stack: err.serverStack || '',
							errortext: err.serverErrorText || '',
						});
					}
				}

				throw err;
			});
		}

		this._requestQueue.enqueue(requestInfo);
		this.sendNextRequests();

		return result;
	}

	private sendNextRequests(): void {
		while (this._pendingResponses.size === 0 && this._requestQueue.length > 0) {
			const item = this._requestQueue.dequeue();
			if (item) {
				this.sendRequest(item);
			}
		}
	}

	private sendRequest(requestItem: RequestItem): void {
		const serverRequest = requestItem.request;
		this._tracer.traceRequest(serverRequest, requestItem.expectsResponse, this._requestQueue.length);

		if (requestItem.expectsResponse && !requestItem.isAsync) {
			this._pendingResponses.add(requestItem.request.seq);
		}

		try {
			this.write(serverRequest);
		} catch (err) {
			const callback = this.fetchCallback(serverRequest.seq);
			if (callback) {
				callback.onError(err);
			}
		}
	}

	private fetchCallback(seq: number) {
		const callback = this._callbacks.fetch(seq);
		if (!callback) {
			return undefined;
		}

		this._pendingResponses.delete(seq);
		return callback;
	}

	private static readonly fenceCommands = new Set(['change', 'close', 'open', 'updateOpen']);

	private static getQueueingType(
		command: string,
		lowPriority?: boolean
	): RequestQueueingType {
		if (ProcessBasedTsServer.fenceCommands.has(command)) {
			return RequestQueueingType.Fence;
		}
		return lowPriority ? RequestQueueingType.LowPriority : RequestQueueingType.Normal;
	}
}

