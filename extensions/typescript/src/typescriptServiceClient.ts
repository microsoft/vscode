/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import * as electron from './utils/electron';
import { Reader, ICallback } from './utils/wireProtocol';

import { workspace, window, Uri, CancellationToken, Disposable, Memento, MessageItem, EventEmitter, Event, commands, env } from 'vscode';
import * as Proto from './protocol';
import { ITypeScriptServiceClient } from './typescriptService';
import { TypeScriptServerPlugin } from './utils/plugins';
import Logger from './utils/logger';

import * as is from './utils/is';
import TelemetryReporter from './utils/telemetry';
import Tracer from './utils/tracer';
import API from './utils/api';

import * as nls from 'vscode-nls';
import { TypeScriptServiceConfiguration, TsServerLogLevel } from './utils/configuration';
import { TypeScriptVersionProvider, TypeScriptVersion } from './utils/versionProvider';
import { TypeScriptVersionPicker } from './utils/versionPicker';
import * as fileSchemes from './utils/fileSchemes';
import { inferredProjectConfig } from './utils/tsconfig';
import LogDirectoryProvider from './utils/logDirectoryProvider';
import { disposeAll } from './utils/dipose';

const localize = nls.loadMessageBundle();

interface CallbackItem {
	c: (value: any) => void;
	e: (err: any) => void;
	start: number;
}

class CallbackMap {
	private readonly callbacks: Map<number, CallbackItem> = new Map();
	public pendingResponses: number = 0;

	public destroy(e: any): void {
		for (const callback of this.callbacks.values()) {
			callback.e(e);
		}
		this.callbacks.clear();
		this.pendingResponses = 0;
	}

	public add(seq: number, callback: CallbackItem) {
		this.callbacks.set(seq, callback);
		++this.pendingResponses;
	}

	public fetch(seq: number): CallbackItem | undefined {
		const callback = this.callbacks.get(seq);
		this.delete(seq);
		return callback;
	}

	private delete(seq: number) {
		if (this.callbacks.delete(seq)) {
			--this.pendingResponses;
		}
	}
}

interface RequestItem {
	request: Proto.Request;
	callbacks: CallbackItem | null;
}

class RequestQueue {
	private queue: RequestItem[] = [];
	private sequenceNumber: number = 0;

	public get length(): number {
		return this.queue.length;
	}

	public push(item: RequestItem): void {
		this.queue.push(item);
	}

	public shift(): RequestItem | undefined {
		return this.queue.shift();
	}

	public tryCancelPendingRequest(seq: number): boolean {
		for (let i = 0; i < this.queue.length; i++) {
			if (this.queue[i].request.seq === seq) {
				this.queue.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	public createRequest(command: string, args: any): Proto.Request {
		return {
			seq: this.sequenceNumber++,
			type: 'request',
			command: command,
			arguments: args
		};
	}
}

class ForkedTsServerProcess {
	constructor(
		private childProcess: cp.ChildProcess
	) { }

	public onError(cb: (err: Error) => void): void {
		this.childProcess.on('error', cb);
	}

	public onExit(cb: (err: any) => void): void {
		this.childProcess.on('exit', cb);
	}

	public write(serverRequest: Proto.Request) {
		this.childProcess.stdin.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
	}

	public createReader(
		callback: ICallback<Proto.Response>,
		onError: (error: any) => void = () => ({})
	) {
		// tslint:disable-next-line:no-unused-expression
		new Reader<Proto.Response>(this.childProcess.stdout, callback, onError);
	}

	public kill() {
		this.childProcess.kill();
	}
}

export default class TypeScriptServiceClient implements ITypeScriptServiceClient {
	private static readonly WALK_THROUGH_SNIPPET_SCHEME_COLON = `${fileSchemes.walkThroughSnippet}:`;

	private pathSeparator: string;

	private _onReady?: { promise: Promise<void>; resolve: () => void; reject: () => void; };
	private _configuration: TypeScriptServiceConfiguration;
	private versionProvider: TypeScriptVersionProvider;
	private versionPicker: TypeScriptVersionPicker;

	private tracer: Tracer;
	public readonly logger: Logger = new Logger();
	private tsServerLogFile: string | null = null;
	private servicePromise: Thenable<ForkedTsServerProcess> | null;
	private lastError: Error | null;
	private lastStart: number;
	private numberRestarts: number;
	private isRestarting: boolean = false;

	private cancellationPipeName: string | null = null;

	private requestQueue: RequestQueue;
	private callbacks: CallbackMap;

	private readonly _onTsServerStarted = new EventEmitter<void>();
	private readonly _onProjectLanguageServiceStateChanged = new EventEmitter<Proto.ProjectLanguageServiceStateEventBody>();
	private readonly _onDidBeginInstallTypings = new EventEmitter<Proto.BeginInstallTypesEventBody>();
	private readonly _onDidEndInstallTypings = new EventEmitter<Proto.EndInstallTypesEventBody>();
	private readonly _onTypesInstallerInitializationFailed = new EventEmitter<Proto.TypesInstallerInitializationFailedEventBody>();

	public readonly telemetryReporter: TelemetryReporter;
	/**
	 * API version obtained from the version picker after checking the corresponding path exists.
	 */
	private _apiVersion: API;
	/**
	 * Version reported by currently-running tsserver.
	 */
	private _tsserverVersion: string | undefined;

	private readonly disposables: Disposable[] = [];

	constructor(
		private readonly workspaceState: Memento,
		private readonly onDidChangeTypeScriptVersion: (version: TypeScriptVersion) => void,
		public readonly plugins: TypeScriptServerPlugin[],
		private readonly logDirectoryProvider: LogDirectoryProvider
	) {
		this.pathSeparator = path.sep;
		this.lastStart = Date.now();

		var p = new Promise<void>((resolve, reject) => {
			this._onReady = { promise: p, resolve, reject };
		});
		this._onReady!.promise = p;

		this.servicePromise = null;
		this.lastError = null;
		this.numberRestarts = 0;

		this.requestQueue = new RequestQueue();
		this.callbacks = new CallbackMap();
		this._configuration = TypeScriptServiceConfiguration.loadFromWorkspace();
		this.versionProvider = new TypeScriptVersionProvider(this._configuration);
		this.versionPicker = new TypeScriptVersionPicker(this.versionProvider, this.workspaceState);

		this._apiVersion = API.defaultVersion;
		this._tsserverVersion = undefined;
		this.tracer = new Tracer(this.logger);

		workspace.onDidChangeConfiguration(() => {
			const oldConfiguration = this._configuration;
			this._configuration = TypeScriptServiceConfiguration.loadFromWorkspace();

			this.versionProvider.updateConfiguration(this._configuration);
			this.tracer.updateConfiguration();

			if (this.servicePromise) {
				if (this._configuration.checkJs !== oldConfiguration.checkJs
					|| this._configuration.experimentalDecorators !== oldConfiguration.experimentalDecorators
				) {
					this.setCompilerOptionsForInferredProjects(this._configuration);
				}

				if (!this._configuration.isEqualTo(oldConfiguration)) {
					this.restartTsServer();
				}
			}
		}, this, this.disposables);
		this.telemetryReporter = new TelemetryReporter(() => this._tsserverVersion || this._apiVersion.versionString);
		this.disposables.push(this.telemetryReporter);
	}

	private _onSyntaxDiagnosticsReceived = new EventEmitter<Proto.DiagnosticEvent>();
	public get onSyntaxDiagnosticsReceived(): Event<Proto.DiagnosticEvent> { return this._onSyntaxDiagnosticsReceived.event; }

	private _onSemanticDiagnosticsReceived = new EventEmitter<Proto.DiagnosticEvent>();
	public get onSemanticDiagnosticsReceived(): Event<Proto.DiagnosticEvent> { return this._onSemanticDiagnosticsReceived.event; }

	private _onConfigDiagnosticsReceived = new EventEmitter<Proto.ConfigFileDiagnosticEvent>();
	public get onConfigDiagnosticsReceived(): Event<Proto.ConfigFileDiagnosticEvent> { return this._onConfigDiagnosticsReceived.event; }

	private _onResendModelsRequested = new EventEmitter<void>();
	public get onResendModelsRequested(): Event<void> { return this._onResendModelsRequested.event; }

	public get configuration() {
		return this._configuration;
	}

	public dispose() {
		if (this.servicePromise) {
			this.servicePromise.then(childProcess => {
				childProcess.kill();
			}).then(undefined, () => void 0);
		}

		disposeAll(this.disposables);
		this._onSyntaxDiagnosticsReceived.dispose();
		this._onSemanticDiagnosticsReceived.dispose();
		this._onConfigDiagnosticsReceived.dispose();
		this._onResendModelsRequested.dispose();
	}

	public restartTsServer(): void {
		const start = () => {
			this.servicePromise = this.startService(true);
			return this.servicePromise;
		};

		if (this.servicePromise) {
			this.servicePromise = this.servicePromise.then(childProcess => {
				this.info('Killing TS Server');
				this.isRestarting = true;
				childProcess.kill();
				this.resetClientVersion();
			}).then(start);
		} else {
			start();
		}
	}

	get onTsServerStarted(): Event<void> {
		return this._onTsServerStarted.event;
	}

	get onProjectLanguageServiceStateChanged(): Event<Proto.ProjectLanguageServiceStateEventBody> {
		return this._onProjectLanguageServiceStateChanged.event;
	}

	get onDidBeginInstallTypings(): Event<Proto.BeginInstallTypesEventBody> {
		return this._onDidBeginInstallTypings.event;
	}

	get onDidEndInstallTypings(): Event<Proto.EndInstallTypesEventBody> {
		return this._onDidEndInstallTypings.event;
	}

	get onTypesInstallerInitializationFailed(): Event<Proto.TypesInstallerInitializationFailedEventBody> {
		return this._onTypesInstallerInitializationFailed.event;
	}

	public get apiVersion(): API {
		return this._apiVersion;
	}

	public onReady(f: () => void): Promise<void> {
		return this._onReady!.promise.then(f);
	}

	private info(message: string, data?: any): void {
		this.logger.info(message, data);
	}

	public warn(message: string, data?: any): void {
		this.logger.warn(message, data);
	}

	private error(message: string, data?: any): void {
		this.logger.error(message, data);
	}

	public logTelemetry(eventName: string, properties?: { [prop: string]: string }) {
		this.telemetryReporter.logTelemetry(eventName, properties);
	}

	private service(): Thenable<ForkedTsServerProcess> {
		if (this.servicePromise) {
			return this.servicePromise;
		}
		if (this.lastError) {
			return Promise.reject<ForkedTsServerProcess>(this.lastError);
		}
		this.startService();
		if (this.servicePromise) {
			return this.servicePromise;
		}
		return Promise.reject<ForkedTsServerProcess>(new Error('Could not create TS service'));
	}

	public ensureServiceStarted() {
		if (!this.servicePromise) {
			this.startService();
		}
	}

	private startService(resendModels: boolean = false): Promise<ForkedTsServerProcess> {
		let currentVersion = this.versionPicker.currentVersion;

		this.info(`Using tsserver from: ${currentVersion.path}`);
		if (!fs.existsSync(currentVersion.tsServerPath)) {
			window.showWarningMessage(localize('noServerFound', 'The path {0} doesn\'t point to a valid tsserver install. Falling back to bundled TypeScript version.', currentVersion.path));

			this.versionPicker.useBundledVersion();
			currentVersion = this.versionPicker.currentVersion;
		}

		this._apiVersion = this.versionPicker.currentVersion.version || API.defaultVersion;
		this.onDidChangeTypeScriptVersion(currentVersion);

		this.requestQueue = new RequestQueue();
		this.callbacks = new CallbackMap();
		this.lastError = null;

		return this.servicePromise = new Promise<ForkedTsServerProcess>(async (resolve, reject) => {
			try {
				const tsServerForkArgs = await this.getTsServerArgs(currentVersion);
				const debugPort = this.getDebugPort();
				const tsServerForkOptions: electron.IForkOptions = {
					execArgv: debugPort ? [`--inspect=${debugPort}`] : [] // [`--debug-brk=5859`]
				};
				electron.fork(currentVersion.tsServerPath, tsServerForkArgs, tsServerForkOptions, this.logger, (err: any, childProcess: cp.ChildProcess | null) => {
					if (err || !childProcess) {
						this.lastError = err;
						this.error('Starting TSServer failed with error.', err);
						window.showErrorMessage(localize('serverCouldNotBeStarted', 'TypeScript language server couldn\'t be started. Error message is: {0}', err.message || err));
						/* __GDPR__
							"error" : {}
						*/
						this.logTelemetry('error');
						this.resetClientVersion();
						return;
					}

					this.info('Started TSServer');
					const handle = new ForkedTsServerProcess(childProcess);
					this.lastStart = Date.now();

					handle.onError((err: Error) => {
						this.lastError = err;
						this.error('TSServer errored with error.', err);
						if (this.tsServerLogFile) {
							this.error(`TSServer log file: ${this.tsServerLogFile}`);
						}
						/* __GDPR__
							"tsserver.error" : {}
						*/
						this.logTelemetry('tsserver.error');
						this.serviceExited(false);
					});
					handle.onExit((code: any) => {
						if (code === null || typeof code === 'undefined') {
							this.info('TSServer exited');
						} else {
							this.error(`TSServer exited with code: ${code}`);
							/* __GDPR__
								"tsserver.exitWithCode" : {
									"code" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
								}
							*/
							this.logTelemetry('tsserver.exitWithCode', { code: code });
						}

						if (this.tsServerLogFile) {
							this.info(`TSServer log file: ${this.tsServerLogFile}`);
						}
						this.serviceExited(!this.isRestarting);
						this.isRestarting = false;
					});

					handle.createReader(
						msg => { this.dispatchMessage(msg); },
						error => { this.error('ReaderError', error); });

					this._onReady!.resolve();
					resolve(handle);
					this._onTsServerStarted.fire();

					this.serviceStarted(resendModels);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	public onVersionStatusClicked(): Thenable<void> {
		return this.showVersionPicker(false);
	}

	private showVersionPicker(firstRun: boolean): Thenable<void> {
		return this.versionPicker.show(firstRun).then(change => {
			if (firstRun || !change.newVersion || !change.oldVersion || change.oldVersion.path === change.newVersion.path) {
				return;
			}
			this.restartTsServer();
		});
	}

	public async openTsServerLogFile(): Promise<boolean> {
		if (!this.apiVersion.has222Features()) {
			window.showErrorMessage(
				localize(
					'typescript.openTsServerLog.notSupported',
					'TS Server logging requires TS 2.2.2+'));
			return false;
		}

		if (this._configuration.tsServerLogLevel === TsServerLogLevel.Off) {
			window.showErrorMessage<MessageItem>(
				localize(
					'typescript.openTsServerLog.loggingNotEnabled',
					'TS Server logging is off. Please set `typescript.tsserver.log` and restart the TS server to enable logging'),
				{
					title: localize(
						'typescript.openTsServerLog.enableAndReloadOption',
						'Enable logging and restart TS server'),
				})
				.then(selection => {
					if (selection) {
						return workspace.getConfiguration().update('typescript.tsserver.log', 'verbose', true).then(() => {
							this.restartTsServer();
						});
					}
					return undefined;
				});
			return false;
		}

		if (!this.tsServerLogFile) {
			window.showWarningMessage(localize(
				'typescript.openTsServerLog.noLogFile',
				'TS Server has not started logging.'));
			return false;
		}

		try {
			await commands.executeCommand('revealFileInOS', Uri.parse(this.tsServerLogFile));
			return true;
		} catch {
			window.showWarningMessage(localize(
				'openTsServerLog.openFileFailedFailed',
				'Could not open TS Server log file'));
			return false;
		}
	}

	private serviceStarted(resendModels: boolean): void {
		const configureOptions: Proto.ConfigureRequestArguments = {
			hostInfo: 'vscode'
		};
		this.execute('configure', configureOptions);
		this.setCompilerOptionsForInferredProjects(this._configuration);
		if (resendModels) {
			this._onResendModelsRequested.fire();
		}
	}

	private setCompilerOptionsForInferredProjects(configuration: TypeScriptServiceConfiguration): void {
		if (!this.apiVersion.has206Features()) {
			return;
		}

		const args: Proto.SetCompilerOptionsForInferredProjectsArgs = {
			options: this.getCompilerOptionsForInferredProjects(configuration)
		};
		this.execute('compilerOptionsForInferredProjects', args, true);
	}

	private getCompilerOptionsForInferredProjects(configuration: TypeScriptServiceConfiguration): Proto.ExternalProjectCompilerOptions {
		return {
			...inferredProjectConfig(configuration),
			allowJs: true,
			allowSyntheticDefaultImports: true,
			allowNonTsExtensions: true,
		};
	}

	private serviceExited(restart: boolean): void {
		enum MessageAction {
			reportIssue
		}

		interface MyMessageItem extends MessageItem {
			id: MessageAction;
		}

		this.servicePromise = null;
		this.tsServerLogFile = null;
		this.callbacks.destroy(new Error('Service died.'));
		this.callbacks = new CallbackMap();
		if (!restart) {
			this.resetClientVersion();
		}
		else {
			const diff = Date.now() - this.lastStart;
			this.numberRestarts++;
			let startService = true;
			if (this.numberRestarts > 5) {
				let prompt: Thenable<MyMessageItem | undefined> | undefined = undefined;
				this.numberRestarts = 0;
				if (diff < 10 * 1000 /* 10 seconds */) {
					this.lastStart = Date.now();
					startService = false;
					prompt = window.showErrorMessage<MyMessageItem>(
						localize('serverDiedAfterStart', 'The TypeScript language service died 5 times right after it got started. The service will not be restarted.'),
						{
							title: localize('serverDiedReportIssue', 'Report Issue'),
							id: MessageAction.reportIssue
						});
					/* __GDPR__
						"serviceExited" : {}
					*/
					this.logTelemetry('serviceExited');
					this.resetClientVersion();
				} else if (diff < 60 * 1000 /* 1 Minutes */) {
					this.lastStart = Date.now();
					prompt = window.showWarningMessage<MyMessageItem>(
						localize('serverDied', 'The TypeScript language service died unexpectedly 5 times in the last 5 Minutes.'),
						{
							title: localize('serverDiedReportIssue', 'Report Issue'),
							id: MessageAction.reportIssue
						});
				}
				if (prompt) {
					prompt.then(item => {
						if (item && item.id === MessageAction.reportIssue) {
							return commands.executeCommand('workbench.action.reportIssues');
						}
						return undefined;
					});
				}
			}
			if (startService) {
				this.startService(true);
			}
		}
	}

	public normalizePath(resource: Uri): string | null {
		if (this._apiVersion.has213Features()) {
			if (resource.scheme === fileSchemes.walkThroughSnippet || resource.scheme === fileSchemes.untitled) {
				const dirName = path.dirname(resource.path);
				const fileName = this.inMemoryResourcePrefix + path.basename(resource.path);
				return resource.with({ path: path.posix.join(dirName, fileName) }).toString(true);
			}
		}

		if (resource.scheme !== fileSchemes.file) {
			return null;
		}

		const result = resource.fsPath;
		if (!result) {
			return null;
		}

		// Both \ and / must be escaped in regular expressions
		return result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/');
	}

	private get inMemoryResourcePrefix(): string {
		return this._apiVersion.has270Features() ? '^' : '';
	}

	public asUrl(filepath: string): Uri {
		if (this._apiVersion.has213Features()) {
			if (filepath.startsWith(TypeScriptServiceClient.WALK_THROUGH_SNIPPET_SCHEME_COLON) || (filepath.startsWith(fileSchemes.untitled + ':'))
			) {
				let resource = Uri.parse(filepath);
				if (this.inMemoryResourcePrefix) {
					const dirName = path.dirname(resource.path);
					const fileName = path.basename(resource.path);
					if (fileName.startsWith(this.inMemoryResourcePrefix)) {
						resource = resource.with({ path: path.posix.join(dirName, fileName.slice(this.inMemoryResourcePrefix.length)) });
					}
				}
				return resource;
			}
		}
		return Uri.file(filepath);
	}

	public getWorkspaceRootForResource(resource: Uri): string | undefined {
		const roots = workspace.workspaceFolders;
		if (!roots || !roots.length) {
			return undefined;
		}

		if (resource.scheme === fileSchemes.file || resource.scheme === fileSchemes.untitled) {
			for (const root of roots.sort((a, b) => a.uri.fsPath.length - b.uri.fsPath.length)) {
				if (resource.fsPath.startsWith(root.uri.fsPath + path.sep)) {
					return root.uri.fsPath;
				}
			}
			return roots[0].uri.fsPath;
		}

		return undefined;
	}

	public execute(command: string, args: any, expectsResultOrToken?: boolean | CancellationToken): Promise<any> {
		let token: CancellationToken | undefined = undefined;
		let expectsResult = true;
		if (typeof expectsResultOrToken === 'boolean') {
			expectsResult = expectsResultOrToken;
		} else {
			token = expectsResultOrToken;
		}

		const request = this.requestQueue.createRequest(command, args);
		const requestInfo: RequestItem = {
			request: request,
			callbacks: null
		};
		let result: Promise<any>;
		if (expectsResult) {
			let wasCancelled = false;
			result = new Promise<any>((resolve, reject) => {
				requestInfo.callbacks = { c: resolve, e: reject, start: Date.now() };
				if (token) {
					token.onCancellationRequested(() => {
						wasCancelled = true;
						this.tryCancelRequest(request.seq);
					});
				}
			}).catch((err: any) => {
				if (!wasCancelled) {
					this.error(`'${command}' request failed with error.`, err);
					const properties = this.parseErrorText(err && err.message, command);
					this.logTelemetry('languageServiceErrorResponse', properties);
				}
				throw err;
			});
		} else {
			result = Promise.resolve(null);
		}
		this.requestQueue.push(requestInfo);
		this.sendNextRequests();

		return result;
	}

	/**
	 * Given a `errorText` from a tsserver request indicating failure in handling a request,
	 * prepares a payload for telemetry-logging.
	 */
	private parseErrorText(errorText: string | undefined, command: string) {
		const properties: ObjectMap<string> = Object.create(null);
		properties['command'] = command;
		if (errorText) {
			properties['errorText'] = errorText;

			const errorPrefix = 'Error processing request. ';
			if (errorText.startsWith(errorPrefix)) {
				const prefixFreeErrorText = errorText.substr(errorPrefix.length);
				const newlineIndex = prefixFreeErrorText.indexOf('\n');
				if (newlineIndex >= 0) {
					// Newline expected between message and stack.
					properties['message'] = prefixFreeErrorText.substring(0, newlineIndex);
					properties['stack'] = prefixFreeErrorText.substring(newlineIndex + 1);
				}
			}
		}
		return properties;
	}

	private sendNextRequests(): void {
		while (this.callbacks.pendingResponses === 0 && this.requestQueue.length > 0) {
			const item = this.requestQueue.shift();
			if (item) {
				this.sendRequest(item);
			}
		}
	}

	private sendRequest(requestItem: RequestItem): void {
		const serverRequest = requestItem.request;
		this.tracer.traceRequest(serverRequest, !!requestItem.callbacks, this.requestQueue.length);
		if (requestItem.callbacks) {
			this.callbacks.add(serverRequest.seq, requestItem.callbacks);
		}
		this.service()
			.then((childProcess) => {
				childProcess.write(serverRequest);
			})
			.then(undefined, err => {
				const callback = this.callbacks.fetch(serverRequest.seq);
				if (callback) {
					callback.e(err);
				}
			});
	}

	private tryCancelRequest(seq: number): boolean {
		try {
			if (this.requestQueue.tryCancelPendingRequest(seq)) {
				this.tracer.logTrace(`TypeScript Service: canceled request with sequence number ${seq}`);
				return true;
			}

			if (this.apiVersion.has222Features() && this.cancellationPipeName) {
				this.tracer.logTrace(`TypeScript Service: trying to cancel ongoing request with sequence number ${seq}`);
				try {
					fs.writeFileSync(this.cancellationPipeName + seq, '');
				} catch {
					// noop
				}
				return true;
			}

			this.tracer.logTrace(`TypeScript Service: tried to cancel request with sequence number ${seq}. But request got already delivered.`);
			return false;
		} finally {
			const p = this.callbacks.fetch(seq);
			if (p) {
				p.e(new Error(`Cancelled Request ${seq}`));
			}
		}
	}

	private dispatchMessage(message: Proto.Message): void {
		try {
			if (message.type === 'response') {
				const response: Proto.Response = message as Proto.Response;
				const p = this.callbacks.fetch(response.request_seq);
				if (p) {
					this.tracer.traceResponse(response, p.start);
					if (response.success) {
						p.c(response);
					} else {
						p.e(response);
					}
				}
			} else if (message.type === 'event') {
				const event: Proto.Event = <Proto.Event>message;
				this.tracer.traceEvent(event);
				this.dispatchEvent(event);
			} else {
				throw new Error('Unknown message type ' + message.type + ' recevied');
			}
		} finally {
			this.sendNextRequests();
		}
	}

	private dispatchEvent(event: Proto.Event) {
		switch (event.event) {
			case 'syntaxDiag':
				this._onSyntaxDiagnosticsReceived.fire(event as Proto.DiagnosticEvent);
				break;

			case 'semanticDiag':
				this._onSemanticDiagnosticsReceived.fire(event as Proto.DiagnosticEvent);
				break;

			case 'configFileDiag':
				this._onConfigDiagnosticsReceived.fire(event as Proto.ConfigFileDiagnosticEvent);
				break;

			case 'telemetry':
				const telemetryData = (event as Proto.TelemetryEvent).body;
				this.dispatchTelemetryEvent(telemetryData);
				break;

			case 'projectLanguageServiceState':
				if (event.body) {
					this._onProjectLanguageServiceStateChanged.fire((event as Proto.ProjectLanguageServiceStateEvent).body);
				}
				break;

			case 'beginInstallTypes':
				if (event.body) {
					this._onDidBeginInstallTypings.fire((event as Proto.BeginInstallTypesEvent).body);
				}
				break;

			case 'endInstallTypes':
				if (event.body) {
					this._onDidEndInstallTypings.fire((event as Proto.EndInstallTypesEvent).body);
				}
				break;

			case 'typesInstallerInitializationFailed':
				if (event.body) {
					this._onTypesInstallerInitializationFailed.fire((event as Proto.TypesInstallerInitializationFailedEvent).body);
				}
				break;
		}
	}

	private dispatchTelemetryEvent(telemetryData: Proto.TelemetryEventBody): void {
		const properties: ObjectMap<string> = Object.create(null);
		switch (telemetryData.telemetryEventName) {
			case 'typingsInstalled':
				const typingsInstalledPayload: Proto.TypingsInstalledTelemetryEventPayload = (telemetryData.payload as Proto.TypingsInstalledTelemetryEventPayload);
				properties['installedPackages'] = typingsInstalledPayload.installedPackages;

				if (is.defined(typingsInstalledPayload.installSuccess)) {
					properties['installSuccess'] = typingsInstalledPayload.installSuccess.toString();
				}
				if (is.string(typingsInstalledPayload.typingsInstallerVersion)) {
					properties['typingsInstallerVersion'] = typingsInstalledPayload.typingsInstallerVersion;
				}
				break;

			default:
				const payload = telemetryData.payload;
				if (payload) {
					Object.keys(payload).forEach((key) => {
						try {
							if (payload.hasOwnProperty(key)) {
								properties[key] = is.string(payload[key]) ? payload[key] : JSON.stringify(payload[key]);
							}
						} catch (e) {
							// noop
						}
					});
				}
				break;
		}
		if (telemetryData.telemetryEventName === 'projectInfo') {
			this._tsserverVersion = properties['version'];
		}

		/* __GDPR__
			"typingsInstalled" : {
				"installedPackages" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"installSuccess": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"typingsInstallerVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		*/
		// __GDPR__COMMENT__: Other events are defined by TypeScript.
		this.logTelemetry(telemetryData.telemetryEventName, properties);
	}

	private async getTsServerArgs(
		currentVersion: TypeScriptVersion
	): Promise<string[]> {
		const args: string[] = [];

		if (this.apiVersion.has206Features()) {
			if (this.apiVersion.has250Features()) {
				args.push('--useInferredProjectPerProjectRoot');
			} else {
				args.push('--useSingleInferredProject');
			}

			if (this._configuration.disableAutomaticTypeAcquisition) {
				args.push('--disableAutomaticTypingAcquisition');
			}
		}

		if (this.apiVersion.has208Features()) {
			args.push('--enableTelemetry');
		}

		if (this.apiVersion.has222Features()) {
			this.cancellationPipeName = electron.getTempFile(`tscancellation-${electron.makeRandomHexString(20)}`);
			args.push('--cancellationPipeName', this.cancellationPipeName + '*');
		}

		if (this.apiVersion.has222Features()) {
			if (this._configuration.tsServerLogLevel !== TsServerLogLevel.Off) {
				const logDir = await this.logDirectoryProvider.getNewLogDirectory();
				if (logDir) {
					this.tsServerLogFile = path.join(logDir, `tsserver.log`);
					this.info(`TSServer log file: ${this.tsServerLogFile}`);
				} else {
					this.tsServerLogFile = null;
					this.error('Could not create TSServer log directory');
				}

				if (this.tsServerLogFile) {
					args.push('--logVerbosity', TsServerLogLevel.toString(this._configuration.tsServerLogLevel));
					args.push('--logFile', this.tsServerLogFile);
				}
			}
		}

		if (this.apiVersion.has230Features()) {
			if (this.plugins.length) {
				args.push('--globalPlugins', this.plugins.map(x => x.name).join(','));
				if (currentVersion.path === this.versionProvider.defaultVersion.path) {
					args.push('--pluginProbeLocations', this.plugins.map(x => x.path).join(','));
				}
			}
		}

		if (this.apiVersion.has234Features()) {
			if (this._configuration.npmLocation) {
				args.push('--npmLocation', `"${this._configuration.npmLocation}"`);
			}
		}

		if (this.apiVersion.has260Features()) {
			const tsLocale = getTsLocale(this._configuration);
			if (tsLocale) {
				args.push('--locale', tsLocale);
			}
		}
		return args;
	}


	private getDebugPort(): number | undefined {
		const value = process.env['TSS_DEBUG'];
		if (value) {
			const port = parseInt(value);
			if (!isNaN(port)) {
				return port;
			}
		}
		return undefined;
	}

	private resetClientVersion() {
		this._apiVersion = API.defaultVersion;
		this._tsserverVersion = undefined;
	}
}


const getTsLocale = (configuration: TypeScriptServiceConfiguration): string | undefined =>
	(configuration.locale
		? configuration.locale
		: env.language);