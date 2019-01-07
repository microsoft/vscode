/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import BufferSyncSupport from './features/bufferSyncSupport';
import { DiagnosticKind, DiagnosticsManager } from './features/diagnostics';
import * as Proto from './protocol';
import { TypeScriptServer, TypeScriptServerSpawner } from './tsServer/server';
import { ITypeScriptServiceClient } from './typescriptService';
import API from './utils/api';
import { TsServerLogLevel, TypeScriptServiceConfiguration } from './utils/configuration';
import { Disposable } from './utils/dispose';
import * as fileSchemes from './utils/fileSchemes';
import LogDirectoryProvider from './utils/logDirectoryProvider';
import Logger from './utils/logger';
import { TypeScriptPluginPathsProvider } from './utils/pluginPathsProvider';
import { PluginManager } from './utils/plugins';
import TelemetryReporter from './utils/telemetry';
import Tracer from './utils/tracer';
import { inferredProjectConfig } from './utils/tsconfig';
import { TypeScriptVersionPicker } from './utils/versionPicker';
import { TypeScriptVersion, TypeScriptVersionProvider } from './utils/versionProvider';

const localize = nls.loadMessageBundle();

export interface TsDiagnostics {
	readonly kind: DiagnosticKind;
	readonly resource: vscode.Uri;
	readonly diagnostics: Proto.Diagnostic[];
}

export default class TypeScriptServiceClient extends Disposable implements ITypeScriptServiceClient {
	private static readonly WALK_THROUGH_SNIPPET_SCHEME_COLON = `${fileSchemes.walkThroughSnippet}:`;

	private pathSeparator: string;

	private _onReady?: { promise: Promise<void>; resolve: () => void; reject: () => void; };
	private _configuration: TypeScriptServiceConfiguration;
	private versionProvider: TypeScriptVersionProvider;
	private pluginPathsProvider: TypeScriptPluginPathsProvider;
	private versionPicker: TypeScriptVersionPicker;

	private tracer: Tracer;
	public readonly logger: Logger = new Logger();

	private readonly typescriptServerSpawner: TypeScriptServerSpawner;
	private forkedTsServer: TypeScriptServer | null;
	private lastError: Error | null;
	private lastStart: number;
	private numberRestarts: number;
	private isRestarting: boolean = false;
	private loadingIndicator = new ServerInitializingIndicator();

	public readonly telemetryReporter: TelemetryReporter;
	/**
	 * API version obtained from the version picker after checking the corresponding path exists.
	 */
	private _apiVersion: API;

	/**
	 * Version reported by currently-running tsserver.
	 */
	private _tsserverVersion: string | undefined;

	public readonly bufferSyncSupport: BufferSyncSupport;
	public readonly diagnosticsManager: DiagnosticsManager;

	constructor(
		private readonly workspaceState: vscode.Memento,
		private readonly onDidChangeTypeScriptVersion: (version: TypeScriptVersion) => void,
		public readonly pluginManager: PluginManager,
		private readonly logDirectoryProvider: LogDirectoryProvider,
		allModeIds: string[]
	) {
		super();
		this.pathSeparator = path.sep;
		this.lastStart = Date.now();

		// tslint:disable-next-line: no-var-keyword
		var p = new Promise<void>((resolve, reject) => {
			this._onReady = { promise: p, resolve, reject };
		});
		this._onReady!.promise = p;

		this.forkedTsServer = null;
		this.lastError = null;
		this.numberRestarts = 0;

		this._configuration = TypeScriptServiceConfiguration.loadFromWorkspace();
		this.versionProvider = new TypeScriptVersionProvider(this._configuration);
		this.pluginPathsProvider = new TypeScriptPluginPathsProvider(this._configuration);
		this.versionPicker = new TypeScriptVersionPicker(this.versionProvider, this.workspaceState);

		this._apiVersion = API.defaultVersion;
		this._tsserverVersion = undefined;
		this.tracer = new Tracer(this.logger);

		this.bufferSyncSupport = new BufferSyncSupport(this, allModeIds);
		this.onReady(() => { this.bufferSyncSupport.listen(); });

		this.diagnosticsManager = new DiagnosticsManager('typescript');
		this.bufferSyncSupport.onDelete(resource => {
			this.diagnosticsManager.delete(resource);
		}, null, this._disposables);

		vscode.workspace.onDidChangeConfiguration(() => {
			const oldConfiguration = this._configuration;
			this._configuration = TypeScriptServiceConfiguration.loadFromWorkspace();

			this.versionProvider.updateConfiguration(this._configuration);
			this.pluginPathsProvider.updateConfiguration(this._configuration);
			this.tracer.updateConfiguration();

			if (this.forkedTsServer) {
				if (this._configuration.checkJs !== oldConfiguration.checkJs
					|| this._configuration.experimentalDecorators !== oldConfiguration.experimentalDecorators
				) {
					this.setCompilerOptionsForInferredProjects(this._configuration);
				}

				if (!this._configuration.isEqualTo(oldConfiguration)) {
					this.restartTsServer();
				}
			}
		}, this, this._disposables);

		this.telemetryReporter = this._register(new TelemetryReporter(() => this._tsserverVersion || this._apiVersion.versionString));

		this.typescriptServerSpawner = new TypeScriptServerSpawner(this.versionProvider, this.logDirectoryProvider, this.pluginPathsProvider, this.logger, this.telemetryReporter, this.tracer);

		this._register(this.pluginManager.onDidUpdateConfig(update => {
			this.configurePlugin(update.pluginId, update.config);
		}));
	}

	public get configuration() {
		return this._configuration;
	}

	public dispose() {
		super.dispose();

		this.bufferSyncSupport.dispose();

		if (this.forkedTsServer) {
			this.forkedTsServer.kill();
		}

		this.loadingIndicator.reset();
	}

	public restartTsServer(): void {
		if (this.forkedTsServer) {
			this.info('Killing TS Server');
			this.isRestarting = true;
			this.forkedTsServer.kill();
			this.resetClientVersion();
		}

		this.forkedTsServer = this.startService(true);
	}

	private readonly _onTsServerStarted = this._register(new vscode.EventEmitter<API>());
	public readonly onTsServerStarted = this._onTsServerStarted.event;

	private readonly _onDiagnosticsReceived = this._register(new vscode.EventEmitter<TsDiagnostics>());
	public readonly onDiagnosticsReceived = this._onDiagnosticsReceived.event;

	private readonly _onConfigDiagnosticsReceived = this._register(new vscode.EventEmitter<Proto.ConfigFileDiagnosticEvent>());
	public readonly onConfigDiagnosticsReceived = this._onConfigDiagnosticsReceived.event;

	private readonly _onResendModelsRequested = this._register(new vscode.EventEmitter<void>());
	public readonly onResendModelsRequested = this._onResendModelsRequested.event;

	private readonly _onProjectLanguageServiceStateChanged = this._register(new vscode.EventEmitter<Proto.ProjectLanguageServiceStateEventBody>());
	public readonly onProjectLanguageServiceStateChanged = this._onProjectLanguageServiceStateChanged.event;

	private readonly _onDidBeginInstallTypings = this._register(new vscode.EventEmitter<Proto.BeginInstallTypesEventBody>());
	public readonly onDidBeginInstallTypings = this._onDidBeginInstallTypings.event;

	private readonly _onDidEndInstallTypings = this._register(new vscode.EventEmitter<Proto.EndInstallTypesEventBody>());
	public readonly onDidEndInstallTypings = this._onDidEndInstallTypings.event;

	private readonly _onTypesInstallerInitializationFailed = this._register(new vscode.EventEmitter<Proto.TypesInstallerInitializationFailedEventBody>());
	public readonly onTypesInstallerInitializationFailed = this._onTypesInstallerInitializationFailed.event;

	private readonly _onSurveyReady = this._register(new vscode.EventEmitter<Proto.SurveyReadyEventBody>());
	public readonly onSurveyReady = this._onSurveyReady.event;

	public get apiVersion(): API {
		return this._apiVersion;
	}

	public onReady(f: () => void): Promise<void> {
		return this._onReady!.promise.then(f);
	}

	private info(message: string, data?: any): void {
		this.logger.info(message, data);
	}

	private error(message: string, data?: any): void {
		this.logger.error(message, data);
	}

	private logTelemetry(eventName: string, properties?: { [prop: string]: string }) {
		this.telemetryReporter.logTelemetry(eventName, properties);
	}

	private service(): TypeScriptServer | null {
		if (this.forkedTsServer) {
			return this.forkedTsServer;
		}
		if (this.lastError) {
			throw this.lastError;
		}
		this.startService();
		if (this.forkedTsServer) {
			return this.forkedTsServer;
		}
		throw new Error('Could not create TS service');
	}

	public ensureServiceStarted() {
		if (!this.forkedTsServer) {
			this.startService();
		}
	}

	private token: number = 0;
	private startService(resendModels: boolean = false): TypeScriptServer | null {
		if (this.isDisposed) {
			return null;
		}

		let currentVersion = this.versionPicker.currentVersion;

		this.info(`Using tsserver from: ${currentVersion.path}`);
		if (!fs.existsSync(currentVersion.tsServerPath)) {
			vscode.window.showWarningMessage(localize('noServerFound', 'The path {0} doesn\'t point to a valid tsserver install. Falling back to bundled TypeScript version.', currentVersion.path));

			this.versionPicker.useBundledVersion();
			currentVersion = this.versionPicker.currentVersion;
		}

		this._apiVersion = this.versionPicker.currentVersion.version || API.defaultVersion;
		this.onDidChangeTypeScriptVersion(currentVersion);

		this.lastError = null;
		let mytoken = ++this.token;

		const handle = this.typescriptServerSpawner.spawn(currentVersion, this.configuration, this.pluginManager);
		this.lastStart = Date.now();

		handle.onError((err: Error) => {
			if (this.token !== mytoken) {
				// this is coming from an old process
				return;
			}

			if (err) {
				vscode.window.showErrorMessage(localize('serverExitedWithError', 'TypeScript language server exited with error. Error message is: {0}', err.message || err.name));
			}

			this.lastError = err;
			this.error('TSServer errored with error.', err);
			if (handle.tsServerLogFile) {
				this.error(`TSServer log file: ${handle.tsServerLogFile}`);
			}

			/* __GDPR__
				"tsserver.error" : {
					"${include}": [
						"${TypeScriptCommonProperties}"
					]
				}
			*/
			this.logTelemetry('tsserver.error');
			this.serviceExited(false);
			this.resetClientVersion();
		});

		handle.onExit((code: any) => {
			if (this.token !== mytoken) {
				// this is coming from an old process
				return;
			}

			if (code === null || typeof code === 'undefined') {
				this.info('TSServer exited');
			} else {
				this.error(`TSServer exited with code: ${code}`);
				/* __GDPR__
					"tsserver.exitWithCode" : {
						"code" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
						"${include}": [
							"${TypeScriptCommonProperties}"
						]
					}
				*/
				this.logTelemetry('tsserver.exitWithCode', { code: code });
			}

			if (handle.tsServerLogFile) {
				this.info(`TSServer log file: ${handle.tsServerLogFile}`);
			}
			this.serviceExited(!this.isRestarting);
			this.isRestarting = false;
		});

		handle.onReaderError(error => this.error('ReaderError', error));
		handle.onEvent(event => this.dispatchEvent(event));

		this._onReady!.resolve();
		this.forkedTsServer = handle;
		this._onTsServerStarted.fire(currentVersion.version);

		if (this._apiVersion.gte(API.v300)) {
			this.loadingIndicator.startedLoadingProject(undefined /* projectName */);
		}

		this.serviceStarted(resendModels);

		return handle;
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
		if (this.apiVersion.lt(API.v222)) {
			vscode.window.showErrorMessage(
				localize(
					'typescript.openTsServerLog.notSupported',
					'TS Server logging requires TS 2.2.2+'));
			return false;
		}

		if (this._configuration.tsServerLogLevel === TsServerLogLevel.Off) {
			vscode.window.showErrorMessage<vscode.MessageItem>(
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
						return vscode.workspace.getConfiguration().update('typescript.tsserver.log', 'verbose', true).then(() => {
							this.restartTsServer();
						});
					}
					return undefined;
				});
			return false;
		}

		if (!this.forkedTsServer || !this.forkedTsServer.tsServerLogFile) {
			vscode.window.showWarningMessage(localize(
				'typescript.openTsServerLog.noLogFile',
				'TS Server has not started logging.'));
			return false;
		}

		try {
			await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.forkedTsServer.tsServerLogFile));
			return true;
		} catch {
			vscode.window.showWarningMessage(localize(
				'openTsServerLog.openFileFailedFailed',
				'Could not open TS Server log file'));
			return false;
		}
	}

	private serviceStarted(resendModels: boolean): void {
		const configureOptions: Proto.ConfigureRequestArguments = {
			hostInfo: 'vscode',
		};
		this.executeWithoutWaitingForResponse('configure', configureOptions);
		this.setCompilerOptionsForInferredProjects(this._configuration);
		if (resendModels) {
			this._onResendModelsRequested.fire();
		}

		// Reconfigure any plugins
		for (const [config, pluginName] of this.pluginManager.configurations()) {
			this.configurePlugin(config, pluginName);
		}
	}

	private setCompilerOptionsForInferredProjects(configuration: TypeScriptServiceConfiguration): void {
		if (this.apiVersion.lt(API.v206)) {
			return;
		}

		const args: Proto.SetCompilerOptionsForInferredProjectsArgs = {
			options: this.getCompilerOptionsForInferredProjects(configuration)
		};
		this.executeWithoutWaitingForResponse('compilerOptionsForInferredProjects', args);
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
		this.loadingIndicator.reset();

		enum MessageAction {
			reportIssue
		}

		interface MyMessageItem extends vscode.MessageItem {
			id: MessageAction;
		}

		this.forkedTsServer = null;
		if (!restart) {
			this.resetClientVersion();
		} else {
			const diff = Date.now() - this.lastStart;
			this.numberRestarts++;
			let startService = true;
			if (this.numberRestarts > 5) {
				let prompt: Thenable<MyMessageItem | undefined> | undefined = undefined;
				this.numberRestarts = 0;
				if (diff < 10 * 1000 /* 10 seconds */) {
					this.lastStart = Date.now();
					startService = false;
					prompt = vscode.window.showErrorMessage<MyMessageItem>(
						localize('serverDiedAfterStart', 'The TypeScript language service died 5 times right after it got started. The service will not be restarted.'),
						{
							title: localize('serverDiedReportIssue', 'Report Issue'),
							id: MessageAction.reportIssue,
						});
					/* __GDPR__
						"serviceExited" : {
							"${include}": [
								"${TypeScriptCommonProperties}"
							]
						}
					*/
					this.logTelemetry('serviceExited');
					this.resetClientVersion();
				} else if (diff < 60 * 1000 /* 1 Minutes */) {
					this.lastStart = Date.now();
					prompt = vscode.window.showWarningMessage<MyMessageItem>(
						localize('serverDied', 'The TypeScript language service died unexpectedly 5 times in the last 5 Minutes.'),
						{
							title: localize('serverDiedReportIssue', 'Report Issue'),
							id: MessageAction.reportIssue
						});
				}
				if (prompt) {
					prompt.then(item => {
						if (item && item.id === MessageAction.reportIssue) {
							return vscode.commands.executeCommand('workbench.action.reportIssues');
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

	public normalizedPath(resource: vscode.Uri): string | undefined {
		if (this._apiVersion.gte(API.v213)) {
			if (resource.scheme === fileSchemes.walkThroughSnippet || resource.scheme === fileSchemes.untitled) {
				const dirName = path.dirname(resource.path);
				const fileName = this.inMemoryResourcePrefix + path.basename(resource.path);
				return resource.with({ path: path.posix.join(dirName, fileName) }).toString(true);
			}
		}

		if (resource.scheme !== fileSchemes.file) {
			return undefined;
		}

		const result = resource.fsPath;
		if (!result) {
			return undefined;
		}

		// Both \ and / must be escaped in regular expressions
		return result.replace(new RegExp('\\' + this.pathSeparator, 'g'), '/');
	}

	public toPath(resource: vscode.Uri): string | undefined {
		return this.normalizedPath(resource);
	}

	public toOpenedFilePath(document: vscode.TextDocument): string | undefined {
		if (!this.bufferSyncSupport.handles(document.uri)) {
			console.error(`Unexpected resource ${document.uri}`);
			return undefined;
		}
		return this.toPath(document.uri) || undefined;
	}

	private get inMemoryResourcePrefix(): string {
		return this._apiVersion.gte(API.v270) ? '^' : '';
	}

	public toResource(filepath: string): vscode.Uri {
		if (this._apiVersion.gte(API.v213)) {
			if (filepath.startsWith(TypeScriptServiceClient.WALK_THROUGH_SNIPPET_SCHEME_COLON) || (filepath.startsWith(fileSchemes.untitled + ':'))
			) {
				let resource = vscode.Uri.parse(filepath);
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
		return this.bufferSyncSupport.toResource(filepath);
	}

	public getWorkspaceRootForResource(resource: vscode.Uri): string | undefined {
		const roots = vscode.workspace.workspaceFolders;
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

	public execute(command: string, args: any, token: vscode.CancellationToken, lowPriority?: boolean): Promise<any> {
		return this.executeImpl(command, args, {
			isAsync: false,
			token,
			expectsResult: true,
			lowPriority
		});
	}

	public executeWithoutWaitingForResponse(command: string, args: any): void {
		this.executeImpl(command, args, {
			isAsync: false,
			token: undefined,
			expectsResult: false
		});
	}

	public executeAsync(command: string, args: Proto.GeterrRequestArgs, token: vscode.CancellationToken): Promise<any> {
		return this.executeImpl(command, args, {
			isAsync: true,
			token,
			expectsResult: true
		});
	}

	private executeImpl(command: string, args: any, executeInfo: { isAsync: boolean, token?: vscode.CancellationToken, expectsResult: boolean, lowPriority?: boolean }): Promise<any> {
		const server = this.service();
		if (!server) {
			return Promise.reject(new Error('Could not load TS Server'));
		}
		return server.executeImpl(command, args, executeInfo);
	}

	public interuptGetErr<R>(f: () => R): R {
		return this.bufferSyncSupport.interuptGetErr(f);
	}

	private dispatchEvent(event: Proto.Event) {
		switch (event.event) {
			case 'syntaxDiag':
			case 'semanticDiag':
			case 'suggestionDiag':
				// This event also roughly signals that the global project has been loaded successfully
				this.loadingIndicator.finishedLoadingProject(undefined /* projectName */);

				const diagnosticEvent = event as Proto.DiagnosticEvent;
				if (diagnosticEvent.body && diagnosticEvent.body.diagnostics) {
					this._onDiagnosticsReceived.fire({
						kind: getDignosticsKind(event),
						resource: this.toResource(diagnosticEvent.body.file),
						diagnostics: diagnosticEvent.body.diagnostics
					});
				}
				break;

			case 'configFileDiag':
				this._onConfigDiagnosticsReceived.fire(event as Proto.ConfigFileDiagnosticEvent);
				break;

			case 'telemetry':
				const telemetryData = (event as Proto.TelemetryEvent).body;
				this.dispatchTelemetryEvent(telemetryData);
				break;

			case 'projectLanguageServiceState':
				this._onProjectLanguageServiceStateChanged.fire((event as Proto.ProjectLanguageServiceStateEvent).body);
				break;

			case 'projectsUpdatedInBackground':
				const body = (event as Proto.ProjectsUpdatedInBackgroundEvent).body;
				const resources = body.openFiles.map(vscode.Uri.file);
				this.bufferSyncSupport.getErr(resources);
				break;

			case 'beginInstallTypes':
				this._onDidBeginInstallTypings.fire((event as Proto.BeginInstallTypesEvent).body);
				break;

			case 'endInstallTypes':
				this._onDidEndInstallTypings.fire((event as Proto.EndInstallTypesEvent).body);
				break;

			case 'typesInstallerInitializationFailed':
				this._onTypesInstallerInitializationFailed.fire((event as Proto.TypesInstallerInitializationFailedEvent).body);
				break;

			case 'surveyReady':
				this._onSurveyReady.fire((event as Proto.SurveyReadyEvent).body);
				break;

			case 'projectLoadingStart':
				this.loadingIndicator.startedLoadingProject((event as Proto.ProjectLoadingStartEvent).body.projectName);
				break;

			case 'projectLoadingFinish':
				this.loadingIndicator.finishedLoadingProject((event as Proto.ProjectLoadingFinishEvent).body.projectName);
				break;
		}
	}

	private dispatchTelemetryEvent(telemetryData: Proto.TelemetryEventBody): void {
		const properties: ObjectMap<string> = Object.create(null);
		switch (telemetryData.telemetryEventName) {
			case 'typingsInstalled':
				const typingsInstalledPayload: Proto.TypingsInstalledTelemetryEventPayload = (telemetryData.payload as Proto.TypingsInstalledTelemetryEventPayload);
				properties['installedPackages'] = typingsInstalledPayload.installedPackages;

				if (typeof typingsInstalledPayload.installSuccess === 'boolean') {
					properties['installSuccess'] = typingsInstalledPayload.installSuccess.toString();
				}
				if (typeof typingsInstalledPayload.typingsInstallerVersion === 'string') {
					properties['typingsInstallerVersion'] = typingsInstalledPayload.typingsInstallerVersion;
				}
				break;

			default:
				const payload = telemetryData.payload;
				if (payload) {
					Object.keys(payload).forEach((key) => {
						try {
							if (payload.hasOwnProperty(key)) {
								properties[key] = typeof payload[key] === 'string' ? payload[key] : JSON.stringify(payload[key]);
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
				"typingsInstallerVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		// __GDPR__COMMENT__: Other events are defined by TypeScript.
		this.logTelemetry(telemetryData.telemetryEventName, properties);
	}

	private resetClientVersion() {
		this._apiVersion = API.defaultVersion;
		this._tsserverVersion = undefined;
	}

	private configurePlugin(pluginName: string, configuration: {}): any {
		if (this._apiVersion.gte(API.v314)) {
			this.executeWithoutWaitingForResponse('configurePlugin', { pluginName, configuration });
		}
	}
}

function getDignosticsKind(event: Proto.Event) {
	switch (event.event) {
		case 'syntaxDiag': return DiagnosticKind.Syntax;
		case 'semanticDiag': return DiagnosticKind.Semantic;
		case 'suggestionDiag': return DiagnosticKind.Suggestion;
	}
	throw new Error('Unknown dignostics kind');
}

class ServerInitializingIndicator extends Disposable {
	private _task?: { project: string | undefined, resolve: () => void, reject: () => void };

	public reset(): void {
		if (this._task) {
			this._task.reject();
			this._task = undefined;
		}
	}

	/**
	 * Signal that a project has started loading.
	 */
	public startedLoadingProject(projectName: string | undefined): void {
		// TS projects are loaded sequentially. Cancel existing task because it should always be resolved before
		// the incoming project loading task is.
		this.reset();

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: localize('serverLoading.progress', "Initializing JS/TS language features"),
		}, () => new Promise((resolve, reject) => {
			this._task = { project: projectName, resolve, reject };
		}));
	}

	public finishedLoadingProject(projectName: string | undefined): void {
		if (this._task && this._task.project === projectName) {
			this._task.resolve();
			this._task = undefined;
		}
	}
}

