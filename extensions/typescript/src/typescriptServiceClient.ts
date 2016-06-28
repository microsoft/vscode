/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import * as electron from './utils/electron';
import { Reader } from './utils/wireProtocol';

import { workspace, window, Uri, CancellationToken, OutputChannel }  from 'vscode';
import * as Proto from './protocol';
import { ITypescriptServiceClient, ITypescriptServiceClientHost }  from './typescriptService';

import * as VersionStatus from './utils/versionStatus';

import TelemetryReporter from 'vscode-extension-telemetry';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

interface CallbackItem {
	c: (value: any) => void;
	e: (err: any) => void;
	start: number;
}

interface CallbackMap {
	[key: number]: CallbackItem;
}

interface RequestItem {
	request: Proto.Request;
	promise: Promise<any>;
	callbacks: CallbackItem;
}

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

enum Trace {
	Off, Messages, Verbose
}

namespace Trace {
	export function fromString(value: string): Trace {
		value = value.toLowerCase();
		switch (value) {
			case 'off':
				return Trace.Off;
			case 'messages':
				return Trace.Messages;
			case 'verbose':
				return Trace.Verbose;
			default:
				return Trace.Off;
		}
	}
}

export default class TypeScriptServiceClient implements ITypescriptServiceClient {

	private host: ITypescriptServiceClientHost;
	private storagePath: string;
	private pathSeparator: string;

	private _onReady: { promise: Promise<void>; resolve: () => void; reject: () => void; };
	private tsdk: string;
	private _experimentalAutoBuild: boolean;
	private trace: Trace;
	private output: OutputChannel;
	private servicePromise: Promise<cp.ChildProcess>;
	private lastError: Error;
	private reader: Reader<Proto.Response>;
	private sequenceNumber: number;
	private exitRequested: boolean;
	private firstStart: number;
	private lastStart: number;
	private numberRestarts: number;

	private requestQueue: RequestItem[];
	private pendingResponses: number;
	private callbacks: CallbackMap;

	private _packageInfo: IPackageInfo;
	private telemetryReporter: TelemetryReporter;

	constructor(host: ITypescriptServiceClientHost, storagePath: string) {
		this.host = host;
		this.storagePath = storagePath;
		this.pathSeparator = path.sep;

		let p = new Promise<void>((resolve, reject) => {
			this._onReady = { promise: null, resolve, reject };
		});
		this._onReady.promise = p;

		this.servicePromise = null;
		this.lastError = null;
		this.sequenceNumber = 0;
		this.exitRequested = false;
		this.firstStart = Date.now();
		this.numberRestarts = 0;

		this.requestQueue = [];
		this.pendingResponses = 0;
		this.callbacks = Object.create(null);
		const configuration = workspace.getConfiguration();
		this.tsdk = configuration.get<string>('typescript.tsdk', null);
		this._experimentalAutoBuild = configuration.get<boolean>('typescript.tsserver.experimentalAutoBuild', false);
		this.trace = this.readTrace();
		workspace.onDidChangeConfiguration(() => {
			this.trace = this.readTrace();
			let oldTask = this.tsdk;
			this.tsdk = workspace.getConfiguration().get<string>('typescript.tsdk', null);
			if (this.servicePromise === null && oldTask !== this.tsdk) {
				this.startService();
			}
		});
		if (this.packageInfo && this.packageInfo.aiKey) {
			this.telemetryReporter = new TelemetryReporter(this.packageInfo.name, this.packageInfo.version, this.packageInfo.aiKey);
		}
		this.startService();
	}

	private readTrace(): Trace {
		let result: Trace = Trace.fromString(workspace.getConfiguration().get<string>('typescript.tsserver.trace', 'off'));
		if (result === Trace.Off && !!process.env.TSS_TRACE) {
			result = Trace.Messages;
		}
		if (result !== Trace.Off && !this.output) {
			this.output = window.createOutputChannel(localize('channelName', 'TypeScript'));
		}
		return result;
	}

	public get experimentalAutoBuild(): boolean {
		return this._experimentalAutoBuild;
	}

	public onReady(): Promise<void> {
		return this._onReady.promise;
	}

	private get packageInfo(): IPackageInfo {

		if (this._packageInfo !== undefined) {
			return this._packageInfo;
		}
		let packagePath = path.join(__dirname, './../package.json');
		let extensionPackage = require(packagePath);
		if (extensionPackage) {
			this._packageInfo = {
				name: extensionPackage.name,
				version: extensionPackage.version,
				aiKey: extensionPackage.aiKey
			};
		} else {
			this._packageInfo = null;
		}

		return this._packageInfo;
	}

	public logTelemetry(eventName: string, properties?: {[prop: string]: string}) {
		if (this.telemetryReporter) {
			this.telemetryReporter.sendTelemetryEvent(eventName, properties);
		}
	}

	private service(): Promise<cp.ChildProcess> {
		if (this.servicePromise) {
			return this.servicePromise;
		}
		if (this.lastError) {
			return Promise.reject<cp.ChildProcess>(this.lastError);
		}
		this.startService();
		return this.servicePromise;
	}

	private startService(resendModels: boolean = false): void {
		let modulePath = path.join(__dirname, '..', 'server', 'typescript', 'lib', 'tsserver.js');

		if (this.tsdk) {
			if ((<any>path).isAbsolute(this.tsdk)) {
				modulePath = path.join(this.tsdk, 'tsserver.js');
			} else if (workspace.rootPath) {
				modulePath = path.join(workspace.rootPath, this.tsdk, 'tsserver.js');
			}
		}

		if (!fs.existsSync(modulePath)) {
			window.showErrorMessage(localize('noServerFound', 'The path {0} doesn\'t point to a valid tsserver install. TypeScript language features will be disabled.', path.dirname(modulePath)));
			return;
		}

		let label = this.getTypeScriptVersion(modulePath);
		let tooltip = modulePath;
		VersionStatus.enable(!!this.tsdk);
		VersionStatus.setInfo(label, tooltip);

		this.servicePromise = new Promise<cp.ChildProcess>((resolve, reject) => {
			try {
				let options: electron.IForkOptions = {
					execArgv: [] // [`--debug-brk=5859`]
				};
				let value = process.env.TSS_DEBUG;
				if (value) {
					let port = parseInt(value);
					if (!isNaN(port)) {
						options.execArgv = [`--debug=${port}`];
					}
				}
				electron.fork(modulePath, [], options, (err: any, childProcess: cp.ChildProcess) => {
					if (err) {
						this.lastError = err;
						window.showErrorMessage(localize('serverCouldNotBeStarted', 'TypeScript language server couldn\'t be started. Error message is: {0}', err.message || err));
						this.logTelemetry('error', {message: err.message});
						return;
					}
					this.lastStart = Date.now();
					childProcess.on('error', (err: Error) => {
						this.lastError = err;
						this.serviceExited(false);
					});
					childProcess.on('exit', (err: Error) => {
						this.serviceExited(true);
					});
					this.reader = new Reader<Proto.Response>(childProcess.stdout, (msg) => {
						this.dispatchMessage(msg);
					});
					this._onReady.resolve();
					resolve(childProcess);
				});
			} catch (error) {
				reject(error);
			}
		});
		this.serviceStarted(resendModels);
	}

	private serviceStarted(resendModels: boolean): void {
		if (this._experimentalAutoBuild && this.storagePath) {
			try {
				fs.mkdirSync(this.storagePath);
			} catch(error) {
			}
			this.execute('configure', {
				autoBuild: true,
				metaDataDirectory: this.storagePath
			});
		}
		if (resendModels) {
			this.host.populateService();
		}
	}

	private getTypeScriptVersion(serverPath: string): string {
		const custom = localize('versionNumber.custom' ,'custom');
		let p = serverPath.split(path.sep);
		if (p.length <= 2) {
			return custom;
		}
		let p2 = p.slice(0, -2);
		let modulePath = p2.join(path.sep);
		let fileName = path.join(modulePath, 'package.json');
		if (!fs.existsSync(fileName)) {
			return custom;
		}
		let contents = fs.readFileSync(fileName).toString();
		let desc = null;
		try {
			desc = JSON.parse(contents);
		} catch(err) {
			return custom;
		}
		if (!desc.version) {
			return custom;
		}
		return desc.version;
	}

	private serviceExited(restart: boolean): void {
		this.servicePromise = null;
		Object.keys(this.callbacks).forEach((key) => {
			this.callbacks[parseInt(key)].e(new Error('Service died.'));
		});
		this.callbacks = Object.create(null);
		if (!this.exitRequested && restart) {
			let diff = Date.now() - this.lastStart;
			this.numberRestarts++;
			let startService = true;
			if (this.numberRestarts > 5) {
				if (diff < 60 * 1000 /* 1 Minutes */) {
					window.showWarningMessage(localize('serverDied','The TypeScript language service died unexpectedly 5 times in the last 5 Minutes. Please consider to open a bug report.'));
				} else if (diff < 2 * 1000 /* 2 seconds */) {
					startService = false;
					window.showErrorMessage(localize('serverDiedAfterStart', 'The TypeScript language service died 5 times right after it got started. The service will not be restarted. Please open a bug report.'));
					this.logTelemetry('serviceExited');
				}
			}
			if (startService) {
				this.startService(true);
			}
		}
	}

	public asAbsolutePath(resource: Uri): string {
		if (resource.scheme !== 'file') {
			return null;
		}
		let result = resource.fsPath;
		// Both \ and / must be escaped in regular expressions
		return result ? result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/') : null;
	}

	public asUrl(filepath: string): Uri {
		return Uri.file(filepath);
	}

	public execute(command: string, args: any, expectsResultOrToken?: boolean | CancellationToken, token?: CancellationToken): Promise<any> {
		let expectsResult = true;
		if (typeof expectsResultOrToken === 'boolean') {
			expectsResult = expectsResultOrToken;
		} else {
			token = expectsResultOrToken;
		}

		let request: Proto.Request = {
			seq: this.sequenceNumber++,
			type: 'request',
			command: command,
			arguments: args
		};
		let requestInfo: RequestItem = {
			request: request,
			promise: null,
			callbacks: null
		};
		let result: Promise<any> = null;
		if (expectsResult) {
			result = new Promise<any>((resolve, reject) => {
				requestInfo.callbacks = { c: resolve, e: reject, start: Date.now() };
				if (token) {
					token.onCancellationRequested(() => {
						this.tryCancelRequest(request.seq);
						let err = new Error('Canceled');
						err.message = 'Canceled';
						reject(err);
					});
				}
			});
		}
		requestInfo.promise = result;
		this.requestQueue.push(requestInfo);
		this.sendNextRequests();

		return result;
	}

	private sendNextRequests(): void {
		while (this.pendingResponses === 0 && this.requestQueue.length > 0) {
			this.sendRequest(this.requestQueue.shift());
		}
	}

	private sendRequest(requestItem: RequestItem): void {
		let serverRequest = requestItem.request;
		this.traceRequest(serverRequest, !!requestItem.callbacks);
		if (requestItem.callbacks) {
			this.callbacks[serverRequest.seq] = requestItem.callbacks;
			this.pendingResponses++;
		}
		this.service().then((childProcess) => {
			childProcess.stdin.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
		}).catch(err => {
			let callback = this.callbacks[serverRequest.seq];
			if (callback) {
				callback.e(err);
				delete this.callbacks[serverRequest.seq];
				this.pendingResponses--;
			}
		});
	}

	private tryCancelRequest(seq: number): boolean {
		for (let i = 0; i < this.requestQueue.length; i++) {
			if (this.requestQueue[i].request.seq === seq) {
				this.requestQueue.splice(i, 1);
				if (this.trace !== Trace.Off) {
					this.output.append(`TypeScript Service: canceled request with sequence number ${seq}\n`);
				}
				return true;
			}
		}
		if (this.trace !== Trace.Off) {
			this.output.append(`TypeScript Service: tried to cancel request with sequence number ${seq}. But request got already delivered.\n`);
		}
		return false;
	}

	private dispatchMessage(message: Proto.Message): void {
		try {
			if (message.type === 'response') {
				let response: Proto.Response = <Proto.Response>message;
				let p = this.callbacks[response.request_seq];
				if (p) {
					this.traceResponse(response, p.start);
					delete this.callbacks[response.request_seq];
					this.pendingResponses--;
					if (response.success) {
						p.c(response);
					} else {
						this.logTelemetry('requestFailed', {
							id: response.request_seq.toString(),
							command: response.command,
							message: response.message ? response.message : 'No detailed message provided'
						});
						p.e(response);
					}
				}
			} else if (message.type === 'event') {
				let event: Proto.Event = <Proto.Event>message;
				this.traceEvent(event);
				if (event.event === 'syntaxDiag') {
					this.host.syntaxDiagnosticsReceived(event);
				}
				if (event.event === 'semanticDiag') {
					this.host.semanticDiagnosticsReceived(event);
				}
			} else {
				throw new Error('Unknown message type ' + message.type + ' recevied');
			}
		} finally {
			this.sendNextRequests();
		}
	}

	private traceRequest(request: Proto.Request, responseExpected: boolean): void {
		if (this.trace === Trace.Off) {
			return;
		}
		this.output.append(`Sending request: ${request.command} (${request.seq}). Response expected: ${responseExpected ? 'yes' : 'no'}. Current queue length: ${this.requestQueue.length}\n`);
		if (this.trace === Trace.Verbose && request.arguments) {
			this.output.append(`Arguments: ${JSON.stringify(request.arguments, null, 4)}\n\n`);
		}
	}

	private traceResponse(response: Proto.Response, startTime: number): void {
		if (this.trace === Trace.Off) {
			return;
		}
		this.output.append(`Response received: ${response.command} (${response.request_seq}). Request took ${Date.now() - startTime} ms. Success: ${response.success} ${!response.success ? '. Message: ' + response.message : ''}\n`);
		if (this.trace === Trace.Verbose && response.body) {
			this.output.append(`Result: ${JSON.stringify(response.body, null, 4)}\n\n`);
		}
	}

	private traceEvent(event: Proto.Event): void {
		if (this.trace === Trace.Off) {
			return;
		}
		this.output.append(`Event received: ${event.event} (${event.seq}).\n`);
		if (this.trace === Trace.Verbose && event.body) {
			this.output.append(`Data: ${JSON.stringify(event.body, null, 4)}\n\n`);
		}
	}
}