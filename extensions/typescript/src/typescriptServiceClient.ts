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

import { workspace, window, Uri, CancellationToken, OutputChannel, Memento, MessageItem } from 'vscode';
import * as Proto from './protocol';
import { ITypescriptServiceClient, ITypescriptServiceClientHost, API } from './typescriptService';

import * as VersionStatus from './utils/versionStatus';
import * as is from './utils/is';

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

enum MessageAction {
	useLocal,
	useBundled,
	neverCheckLocalVersion,
	close
}

interface MyMessageItem extends MessageItem {
	id: MessageAction;
}

export default class TypeScriptServiceClient implements ITypescriptServiceClient {

	private host: ITypescriptServiceClientHost;
	private storagePath: string;
	private globalState: Memento;
	private pathSeparator: string;

	private _onReady: { promise: Promise<void>; resolve: () => void; reject: () => void; };
	private tsdk: string;
	private _checkGlobalTSCVersion: boolean;
	private _experimentalAutoBuild: boolean;
	private trace: Trace;
	private _output: OutputChannel;
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
	private _apiVersion: API;
	private telemetryReporter: TelemetryReporter;

	constructor(host: ITypescriptServiceClientHost, storagePath: string, globalState: Memento) {
		this.host = host;
		this.storagePath = storagePath;
		this.globalState = globalState;
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
		this._experimentalAutoBuild = false; // configuration.get<boolean>('typescript.tsserver.experimentalAutoBuild', false);
		this._apiVersion = new API('1.0.0');
		this._checkGlobalTSCVersion = true;
		this.trace = this.readTrace();
		workspace.onDidChangeConfiguration(() => {
			this.trace = this.readTrace();
			let oldTsdk = this.tsdk;
			this.tsdk = workspace.getConfiguration().get<string>('typescript.tsdk', null);
			if (this.servicePromise === null && oldTsdk !== this.tsdk) {
				this.startService();
			}
		});
		if (this.packageInfo && this.packageInfo.aiKey) {
			this.telemetryReporter = new TelemetryReporter(this.packageInfo.name, this.packageInfo.version, this.packageInfo.aiKey);
		}
		this.startService();
	}

	private get output(): OutputChannel {
		if (!this._output) {
			this._output = window.createOutputChannel(localize('channelName', 'TypeScript'));
		}
		return this._output;
	}

	private readTrace(): Trace {
		let result: Trace = Trace.fromString(workspace.getConfiguration().get<string>('typescript.tsserver.trace', 'off'));
		if (result === Trace.Off && !!process.env.TSS_TRACE) {
			result = Trace.Messages;
		}
		return result;
	}

	public get experimentalAutoBuild(): boolean {
		return this._experimentalAutoBuild;
	}

	public get checkGlobalTSCVersion(): boolean {
		return this._checkGlobalTSCVersion;
	}

	public get apiVersion(): API {
		return this._apiVersion;
	}

	public onReady(): Promise<void> {
		return this._onReady.promise;
	}

	private data2String(data: any): string {
		if (data instanceof Error) {
			if (is.string(data.stack)) {
				return data.stack;
			}
			return (data as Error).message;
		}
		if (is.boolean(data.success) && !data.success && is.string(data.message)) {
			return data.message;
		}
		if (is.string(data)) {
			return data;
		}
		return data.toString();
	}

	public info(message: string, data?: any): void {
		this.output.appendLine(`[Info  - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
	}

	public warn(message: string, data?: any): void {
		this.output.appendLine(`[Warn  - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
	}

	public error(message: string, data?: any): void {
		// See https://github.com/Microsoft/TypeScript/issues/10496
		if (data && data.message === 'No content available.') {
			return;
		}
		this.output.appendLine(`[Error - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
		// VersionStatus.enable(true);
		// this.output.show(true);
	}

	private logTrace(message: string, data?: any): void {
		this.output.appendLine(`[Trace - ${(new Date().toLocaleTimeString())}] ${message}`);
		if (data) {
			this.output.appendLine(this.data2String(data));
		}
		// this.output.show(true);
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

	public logTelemetry(eventName: string, properties?: { [prop: string]: string }) {
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
		let modulePath = path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', 'tsserver.js');
		let showVersionStatusItem = false;

		if (this.tsdk) {
			this._checkGlobalTSCVersion = false;
			if ((<any>path).isAbsolute(this.tsdk)) {
				modulePath = path.join(this.tsdk, 'tsserver.js');
			} else if (workspace.rootPath) {
				modulePath = path.join(workspace.rootPath, this.tsdk, 'tsserver.js');
			}
		}
		const tsConfig = workspace.getConfiguration('typescript');
		const checkWorkspaceVersionKey = 'check.workspaceVersion';

		this.servicePromise = new Promise<cp.ChildProcess>((resolve, reject) => {
			let versionCheckPromise: Thenable<string> = Promise.resolve(modulePath);

			if (!workspace.rootPath) {
				versionCheckPromise = this.informAboutTS20(modulePath);
			} else {
				if (!this.tsdk && tsConfig.get(checkWorkspaceVersionKey, true)) {
					let localModulePath = path.join(workspace.rootPath, 'node_modules', 'typescript', 'lib', 'tsserver.js');
					if (fs.existsSync(localModulePath)) {
						let localVersion = this.getTypeScriptVersion(localModulePath);
						let shippedVersion = this.getTypeScriptVersion(modulePath);
						if (localVersion && localVersion !== shippedVersion) {
							this._checkGlobalTSCVersion = false;
							versionCheckPromise = window.showInformationMessage<MyMessageItem>(
								localize(
									'localTSFound',
									'The workspace folder contains TypeScript version {0}. Do you want to use this version instead of the bundled version {1}?',
									localVersion, shippedVersion
								),
								{
									title: localize('use', 'Use Workspace ({0})', localVersion),
									id: MessageAction.useLocal
								},
								{
									title: localize({
										key: 'useBundled',
										comment: ["Bundled has the meaning of packaged with VS Code itself."]
									}, 'Use Bundled ({0})', shippedVersion),
									id: MessageAction.useBundled,
								},
								{
									title: localize('neverCheckLocalVesion', 'Never Check for Workspace Version'),
									id: MessageAction.neverCheckLocalVersion
								},
								{
									title: localize('close', 'Close'),
									id: MessageAction.close,
									isCloseAffordance: true
								}
							).then((selected) => {
								if (!selected || selected.id === MessageAction.close) {
									return modulePath;
								}
								switch (selected.id) {
									case MessageAction.useLocal:
										let pathValue = './node_modules/typescript/lib';
										tsConfig.update('tsdk', pathValue, false);
										window.showInformationMessage(localize('updatedtsdk', 'Updated workspace setting \'typescript.tsdk\' to {0}', pathValue));
										showVersionStatusItem = true;
										return localModulePath;
									case MessageAction.useBundled:
										tsConfig.update(checkWorkspaceVersionKey, false, false);
										window.showInformationMessage(localize('updateLocalWorkspaceCheck', 'Updated workspace setting \'typescript.check.workspaceVersion\' to false'));
										return modulePath;
									case MessageAction.neverCheckLocalVersion:
										window.showInformationMessage(localize('updateGlobalWorkspaceCheck', 'Updated user setting \'typescript.check.workspaceVersion\' to false'));
										tsConfig.update(checkWorkspaceVersionKey, false, true);
										return modulePath;
									default:
										return modulePath;
								}
							});
						}
					} else {
						versionCheckPromise = this.informAboutTS20(modulePath);
					}
				}
			}

			versionCheckPromise.then((modulePath) => {
				this.info(`Using tsserver from location: ${modulePath}`);
				if (!fs.existsSync(modulePath)) {
					window.showErrorMessage(localize('noServerFound', 'The path {0} doesn\'t point to a valid tsserver install. TypeScript language features will be disabled.', path.dirname(modulePath)));
					this.servicePromise = null;
					reject(new Error('No TSServer found'));
					return;
				}

				let version = this.getTypeScriptVersion(modulePath);
				if (!version) {
					version = workspace.getConfiguration().get<string>('typescript.tsdk_version', undefined);
				}
				if (version) {
					this._apiVersion = new API(version);
				}

				const label = version || localize('versionNumber.custom', 'custom');
				const tooltip = modulePath;
				VersionStatus.enable(!!this.tsdk || showVersionStatusItem);
				VersionStatus.setInfo(label, tooltip);

				// This is backwards compatibility code to move the setting from the local
				// store into the workspace setting file.
				const doGlobalVersionCheckKey: string = 'doGlobalVersionCheck';
				const globalStateValue = this.globalState.get(doGlobalVersionCheckKey, true);
				const checkTscVersion = 'check.tscVersion';
				if (!globalStateValue) {
					tsConfig.update(checkTscVersion, false, true);
					this.globalState.update(doGlobalVersionCheckKey, true);
				}

				try {
					let options: electron.IForkOptions = {
						execArgv: [] // [`--debug-brk=5859`]
					};
					if (workspace.rootPath) {
						options.cwd = workspace.rootPath;
					}
					let value = process.env.TSS_DEBUG;
					if (value) {
						let port = parseInt(value);
						if (!isNaN(port)) {
							this.info(`TSServer started in debug mode using port ${port}`);
							options.execArgv = [`--debug=${port}`];
						}
					}
					let args: string[] = [];
					if (this.apiVersion.has206Features()) {
						args.push('--useSingleInferredProject');
						if (workspace.getConfiguration().get<boolean>('typescript.disableAutomaticTypeAcquisition', false)) {
							args.push('--disableAutomaticTypingAcquisition');
						}
					}
					if (this.apiVersion.has208Features()) {
						args.push('--enableTelemetry');
					}
					electron.fork(modulePath, args, options, (err: any, childProcess: cp.ChildProcess) => {
						if (err) {
							this.lastError = err;
							this.error('Starting TSServer failed with error.', err);
							window.showErrorMessage(localize('serverCouldNotBeStarted', 'TypeScript language server couldn\'t be started. Error message is: {0}', err.message || err));
							this.logTelemetry('error', { message: err.message });
							return;
						}
						this.lastStart = Date.now();
						childProcess.on('error', (err: Error) => {
							this.lastError = err;
							this.error('TSServer errored with error.', err);
							this.serviceExited(false);
						});
						childProcess.on('exit', (code: any) => {
							this.error(`TSServer exited with code: ${code ? code : 'unknown'}`);
							this.serviceExited(true);
						});
						this.reader = new Reader<Proto.Response>(childProcess.stdout, (msg) => {
							this.dispatchMessage(msg);
						});
						this._onReady.resolve();
						resolve(childProcess);
						this.serviceStarted(resendModels);
					});
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	private informAboutTS20(modulePath: string): Thenable<string> {
		return Promise.resolve(modulePath);
	}

	private serviceStarted(resendModels: boolean): void {
		let configureOptions: Proto.ConfigureRequestArguments = {
			hostInfo: 'vscode'
		};
		if (this._experimentalAutoBuild && this.storagePath) {
			try {
				fs.mkdirSync(this.storagePath);
			} catch (error) {
			}
			// configureOptions.autoDiagnostics = true;
			// configureOptions.metaDataDirectory = this.storagePath;
		}
		this.execute('configure', configureOptions);
		if (this.apiVersion.has206Features()) {
			let compilerOptions: Proto.ExternalProjectCompilerOptions = {
				module: 'CommonJS',
				target: 'ES6',
				allowSyntheticDefaultImports: true,
				allowNonTsExtensions: true,
				allowJs: true,
				jsx: 'Preserve'
			};
			let args: Proto.SetCompilerOptionsForInferredProjectsArgs = {
				options: compilerOptions
			};
			this.execute('compilerOptionsForInferredProjects', args).then(null, (err) => {
				this.error(`'compilerOptionsForInferredProjects' request failed with error.`, err);
			});
		}

		if (resendModels) {
			this.host.populateService();
		}
	}

	private getTypeScriptVersion(serverPath: string): string {
		let p = serverPath.split(path.sep);
		if (p.length <= 2) {
			return undefined;
		}
		let p2 = p.slice(0, -2);
		let modulePath = p2.join(path.sep);
		let fileName = path.join(modulePath, 'package.json');
		if (!fs.existsSync(fileName)) {
			return undefined;
		}
		let contents = fs.readFileSync(fileName).toString();
		let desc = null;
		try {
			desc = JSON.parse(contents);
		} catch (err) {
			return undefined;
		}
		if (!desc.version) {
			return undefined;
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
					window.showWarningMessage(localize('serverDied', 'The TypeScript language service died unexpectedly 5 times in the last 5 Minutes. Please consider to open a bug report.'));
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
		if (!result) {
			return null;
		}
		// Both \ and / must be escaped in regular expressions
		return result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/');
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
						resolve(undefined);
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
					this.logTrace(`TypeScript Service: canceled request with sequence number ${seq}`);
				}
				return true;
			}
		}
		if (this.trace !== Trace.Off) {
			this.logTrace(`TypeScript Service: tried to cancel request with sequence number ${seq}. But request got already delivered.`);
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
					this.host.syntaxDiagnosticsReceived(event as Proto.DiagnosticEvent);
				} else if (event.event === 'semanticDiag') {
					this.host.semanticDiagnosticsReceived(event as Proto.DiagnosticEvent);
				} else if (event.event === 'configFileDiag') {
					this.host.configFileDiagnosticsReceived(event as Proto.ConfigFileDiagnosticEvent);
				} else if (event.event === 'telemetry') {
					let telemetryData = (event as Proto.TelemetryEvent).body;
					let properties: Map<string> = Object.create(null);
					switch (telemetryData.telemetryEventName) {
						case 'typingsInstalled':
							let typingsInstalledPayload: Proto.TypingsInstalledTelemetryEventPayload = (telemetryData.payload as Proto.TypingsInstalledTelemetryEventPayload);
							properties['installedPackages'] = typingsInstalledPayload.installedPackages;
							if (is.defined(typingsInstalledPayload.installSuccess)) {
								properties['installSuccess'] = typingsInstalledPayload.installSuccess.toString();
							}
							if (is.string(typingsInstalledPayload.typingsInstallerVersion)) {
								properties['typingsInstallerVersion'] = typingsInstalledPayload.typingsInstallerVersion;
							}
							break;
						default:
							let payload = telemetryData.payload;
							if (payload) {
								Object.keys(payload).forEach((key) => {
									if (payload.hasOwnProperty(key) && is.string(payload[key])) {
										properties[key] = payload[key];
									}
								});
							}
							break;
					}
					this.logTelemetry(telemetryData.telemetryEventName, properties);
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
		let data: string = undefined;
		if (this.trace === Trace.Verbose && request.arguments) {
			data = `Arguments: ${JSON.stringify(request.arguments, null, 4)}`;
		}
		this.logTrace(`Sending request: ${request.command} (${request.seq}). Response expected: ${responseExpected ? 'yes' : 'no'}. Current queue length: ${this.requestQueue.length}`, data);
	}

	private traceResponse(response: Proto.Response, startTime: number): void {
		if (this.trace === Trace.Off) {
			return;
		}
		let data: string = undefined;
		if (this.trace === Trace.Verbose && response.body) {
			data = `Result: ${JSON.stringify(response.body, null, 4)}`;
		}
		this.logTrace(`Response received: ${response.command} (${response.request_seq}). Request took ${Date.now() - startTime} ms. Success: ${response.success} ${!response.success ? '. Message: ' + response.message : ''}`, data);
	}

	private traceEvent(event: Proto.Event): void {
		if (this.trace === Trace.Off) {
			return;
		}
		let data: string = undefined;
		if (this.trace === Trace.Verbose && event.body) {
			data = `Data: ${JSON.stringify(event.body, null, 4)}`;
		}
		this.logTrace(`Event received: ${event.event} (${event.seq}).`, data);
	}
}
