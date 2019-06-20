/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { ServerResponse } from '../typescriptService';
import API from '../utils/api';
import { TsServerLogLevel, TypeScriptServiceConfiguration } from '../utils/configuration';
import { Disposable } from '../utils/dispose';
import * as electron from '../utils/electron';
import LogDirectoryProvider from '../utils/logDirectoryProvider';
import Logger from '../utils/logger';
import { TypeScriptPluginPathsProvider } from '../utils/pluginPathsProvider';
import { PluginManager } from '../utils/plugins';
import TelemetryReporter from '../utils/telemetry';
import Tracer from '../utils/tracer';
import { TypeScriptVersion, TypeScriptVersionProvider } from '../utils/versionProvider';
import { Reader } from '../utils/wireProtocol';
import { CallbackMap } from './callbackMap';
import { RequestItem, RequestQueue, RequestQueueingType } from './requestQueue';
import { TypeScriptServerError } from './serverError';

export class TypeScriptServerSpawner {
	public constructor(
		private readonly _versionProvider: TypeScriptVersionProvider,
		private readonly _logDirectoryProvider: LogDirectoryProvider,
		private readonly _pluginPathsProvider: TypeScriptPluginPathsProvider,
		private readonly _logger: Logger,
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _tracer: Tracer,
	) { }

	public spawn(
		version: TypeScriptVersion,
		configuration: TypeScriptServiceConfiguration,
		pluginManager: PluginManager
	): ITypeScriptServer {
		const apiVersion = version.version || API.defaultVersion;

		const { args, cancellationPipeName, tsServerLogFile } = this.getTsServerArgs(configuration, version, apiVersion, pluginManager);

		if (TypeScriptServerSpawner.isLoggingEnabled(apiVersion, configuration)) {
			if (tsServerLogFile) {
				this._logger.info(`TSServer log file: ${tsServerLogFile}`);
			} else {
				this._logger.error('Could not create TSServer log directory');
			}
		}

		this._logger.info('Forking TSServer');
		const childProcess = electron.fork(version.tsServerPath, args, this.getForkOptions());
		this._logger.info('Started TSServer');

		return new TypeScriptServer(
			new ChildServerProcess(childProcess),
			tsServerLogFile,
			new PipeRequestCanceller(cancellationPipeName, this._tracer),
			version,
			this._telemetryReporter,
			this._tracer);
	}

	private getForkOptions() {
		const debugPort = TypeScriptServerSpawner.getDebugPort();
		const tsServerForkOptions: electron.ForkOptions = {
			execArgv: debugPort ? [`--inspect=${debugPort}`] : [],
		};
		return tsServerForkOptions;
	}

	private getTsServerArgs(
		configuration: TypeScriptServiceConfiguration,
		currentVersion: TypeScriptVersion,
		apiVersion: API,
		pluginManager: PluginManager,
	): { args: string[], cancellationPipeName: string | undefined, tsServerLogFile: string | undefined } {
		const args: string[] = [];
		let cancellationPipeName: string | undefined;
		let tsServerLogFile: string | undefined;

		if (apiVersion.gte(API.v206)) {
			if (apiVersion.gte(API.v250)) {
				args.push('--useInferredProjectPerProjectRoot');
			} else {
				args.push('--useSingleInferredProject');
			}

			if (configuration.disableAutomaticTypeAcquisition) {
				args.push('--disableAutomaticTypingAcquisition');
			}
		}

		if (apiVersion.gte(API.v208)) {
			args.push('--enableTelemetry');
		}

		if (apiVersion.gte(API.v222)) {
			cancellationPipeName = electron.getTempFile('tscancellation');
			args.push('--cancellationPipeName', cancellationPipeName + '*');
		}

		if (TypeScriptServerSpawner.isLoggingEnabled(apiVersion, configuration)) {
			const logDir = this._logDirectoryProvider.getNewLogDirectory();
			if (logDir) {
				tsServerLogFile = path.join(logDir, `tsserver.log`);
				args.push('--logVerbosity', TsServerLogLevel.toString(configuration.tsServerLogLevel));
				args.push('--logFile', tsServerLogFile);
			}
		}

		if (apiVersion.gte(API.v230)) {
			const pluginPaths = this._pluginPathsProvider.getPluginPaths();

			if (pluginManager.plugins.length) {
				args.push('--globalPlugins', pluginManager.plugins.map(x => x.name).join(','));

				const isUsingBundledTypeScriptVersion = currentVersion.path === this._versionProvider.defaultVersion.path;
				for (const plugin of pluginManager.plugins) {
					if (isUsingBundledTypeScriptVersion || plugin.enableForWorkspaceTypeScriptVersions) {
						pluginPaths.push(plugin.path);
					}
				}
			}

			if (pluginPaths.length !== 0) {
				args.push('--pluginProbeLocations', pluginPaths.join(','));
			}
		}

		if (apiVersion.gte(API.v234)) {
			if (configuration.npmLocation) {
				args.push('--npmLocation', `"${configuration.npmLocation}"`);
			}
		}

		if (apiVersion.gte(API.v260)) {
			args.push('--locale', TypeScriptServerSpawner.getTsLocale(configuration));
		}

		if (apiVersion.gte(API.v291)) {
			args.push('--noGetErrOnBackgroundUpdate');
		}

		if (apiVersion.gte(API.v345)) {
			args.push('--validateDefaultNpmLocation');
		}

		return { args, cancellationPipeName, tsServerLogFile };
	}

	private static getDebugPort(): number | undefined {
		const value = process.env['TSS_DEBUG'];
		if (value) {
			const port = parseInt(value);
			if (!isNaN(port)) {
				return port;
			}
		}
		return undefined;
	}

	private static isLoggingEnabled(apiVersion: API, configuration: TypeScriptServiceConfiguration) {
		return apiVersion.gte(API.v222) &&
			configuration.tsServerLogLevel !== TsServerLogLevel.Off;
	}

	private static getTsLocale(configuration: TypeScriptServiceConfiguration): string {
		return configuration.locale
			? configuration.locale
			: vscode.env.language;
	}
}

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

export interface ServerProcess {
	readonly stdout: stream.Readable;
	write(serverRequest: Proto.Request): void;

	on(name: 'exit', handler: (code: number | null) => void): void;
	on(name: 'error', handler: (error: Error) => void): void;

	kill(): void;
}

class ChildServerProcess implements ServerProcess {

	public constructor(
		private readonly _process: child_process.ChildProcess,
	) { }

	get stdout(): stream.Readable { return this._process.stdout!; }

	write(serverRequest: Proto.Request): void {
		this._process.stdin!.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
	}

	on(name: 'exit', handler: (code: number | null) => void): void;
	on(name: 'error', handler: (error: Error) => void): void;
	on(name: any, handler: any) {
		this._process.on(name, handler);
	}

	kill(): void {
		this._process.kill();
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

export class TypeScriptServer extends Disposable implements ITypeScriptServer {
	private readonly _reader: Reader<Proto.Response>;
	private readonly _requestQueue = new RequestQueue();
	private readonly _callbacks = new CallbackMap<Proto.Response>();
	private readonly _pendingResponses = new Set<number>();

	constructor(
		private readonly _process: ServerProcess,
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
			queueingType: getQueueingType(command, executeInfo.lowPriority)
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
}

const fenceCommands = new Set(['change', 'close', 'open', 'updateOpen']);

function getQueueingType(
	command: string,
	lowPriority?: boolean
): RequestQueueingType {
	if (fenceCommands.has(command)) {
		return RequestQueueingType.Fence;
	}
	return lowPriority ? RequestQueueingType.LowPriority : RequestQueueingType.Normal;
}

