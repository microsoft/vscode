/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import { originalFSPath } from 'vs/base/common/resources';
import { Barrier } from 'vs/base/common/async';
import { dispose, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { TernarySearchTree } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { createApiFactory, IExtensionApiFactory } from 'vs/workbench/api/node/extHost.api.impl';
import { NodeModuleRequireInterceptor, VSCodeNodeModuleFactory, KeytarNodeModuleFactory, OpenNodeModuleFactory } from 'vs/workbench/api/node/extHostRequireInterceptor';
import { ExtHostExtensionServiceShape, IEnvironment, IInitData, IMainContext, MainContext, MainThreadExtensionServiceShape, MainThreadTelemetryShape, MainThreadWorkspaceShape, IResolveAuthorityResult } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { ActivatedExtension, EmptyExtension, ExtensionActivatedByAPI, ExtensionActivatedByEvent, ExtensionActivationReason, ExtensionActivationTimes, ExtensionActivationTimesBuilder, ExtensionsActivator, IExtensionAPI, IExtensionContext, IExtensionModule, HostExtension, ExtensionActivationTimesFragment } from 'vs/workbench/api/common/extHostExtensionActivator';
import { ExtHostLogService } from 'vs/workbench/api/common/extHostLogService';
import { ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { ExtensionActivationError } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { connectProxyResolver } from 'vs/workbench/services/extensions/node/proxyResolver';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import * as errors from 'vs/base/common/errors';
import * as vscode from 'vscode';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Schemas } from 'vs/base/common/network';
import { withNullAsUndefined } from 'vs/base/common/types';
import { VSBuffer } from 'vs/base/common/buffer';
import { ExtensionMemento } from 'vs/workbench/api/common/extHostMemento';
import { ExtensionStoragePaths } from 'vs/workbench/api/node/extHostStoragePaths';
import { RemoteAuthorityResolverError, ExtensionExecutionContext } from 'vs/workbench/api/common/extHostTypes';
import { IURITransformer } from 'vs/base/common/uriIpc';

interface ITestRunner {
	/** Old test runner API, as exported from `vscode/lib/testrunner` */
	run(testsRoot: string, clb: (error: Error, failures?: number) => void): void;
}

interface INewTestRunner {
	/** New test runner API, as explained in the extension test doc */
	run(): Promise<void>;
}

export interface IHostUtils {
	exit(code?: number): void;
	exists(path: string): Promise<boolean>;
	realpath(path: string): Promise<string>;
}

type TelemetryActivationEventFragment = {
	id: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	name: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	extensionVersion: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	publisherDisplayName: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	activationEvents: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	isBuiltin: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
	reason: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

export class ExtHostExtensionService implements ExtHostExtensionServiceShape {

	private static readonly WORKSPACE_CONTAINS_TIMEOUT = 7000;

	private readonly _hostUtils: IHostUtils;
	private readonly _initData: IInitData;
	private readonly _extHostContext: IMainContext;
	private readonly _extHostWorkspace: ExtHostWorkspace;
	private readonly _extHostConfiguration: ExtHostConfiguration;
	private readonly _environment: IEnvironment;
	private readonly _extHostLogService: ExtHostLogService;

	private readonly _mainThreadWorkspaceProxy: MainThreadWorkspaceShape;
	private readonly _mainThreadTelemetryProxy: MainThreadTelemetryShape;
	private readonly _mainThreadExtensionsProxy: MainThreadExtensionServiceShape;

	private readonly _almostReadyToRunExtensions: Barrier;
	private readonly _readyToStartExtensionHost: Barrier;
	private readonly _readyToRunExtensions: Barrier;
	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _storage: ExtHostStorage;
	private readonly _storagePath: ExtensionStoragePaths;
	private readonly _activator: ExtensionsActivator;
	private _extensionPathIndex: Promise<TernarySearchTree<IExtensionDescription>> | null;
	private readonly _extensionApiFactory: IExtensionApiFactory;

	private readonly _resolvers: { [authorityPrefix: string]: vscode.RemoteAuthorityResolver; };

	private _started: boolean;

	private readonly _disposables: DisposableStore;

	constructor(
		hostUtils: IHostUtils,
		initData: IInitData,
		extHostContext: IMainContext,
		extHostWorkspace: ExtHostWorkspace,
		extHostConfiguration: ExtHostConfiguration,
		environment: IEnvironment,
		extHostLogService: ExtHostLogService,
		uriTransformer: IURITransformer | null
	) {
		this._hostUtils = hostUtils;
		this._initData = initData;
		this._extHostContext = extHostContext;
		this._extHostWorkspace = extHostWorkspace;
		this._extHostConfiguration = extHostConfiguration;
		this._environment = environment;
		this._extHostLogService = extHostLogService;
		this._disposables = new DisposableStore();

		this._mainThreadWorkspaceProxy = this._extHostContext.getProxy(MainContext.MainThreadWorkspace);
		this._mainThreadTelemetryProxy = this._extHostContext.getProxy(MainContext.MainThreadTelemetry);
		this._mainThreadExtensionsProxy = this._extHostContext.getProxy(MainContext.MainThreadExtensionService);

		this._almostReadyToRunExtensions = new Barrier();
		this._readyToStartExtensionHost = new Barrier();
		this._readyToRunExtensions = new Barrier();
		this._registry = new ExtensionDescriptionRegistry(initData.extensions);
		this._storage = new ExtHostStorage(this._extHostContext);
		this._storagePath = new ExtensionStoragePaths(withNullAsUndefined(initData.workspace), initData.environment);

		const hostExtensions = new Set<string>();
		initData.hostExtensions.forEach((extensionId) => hostExtensions.add(ExtensionIdentifier.toKey(extensionId)));

		this._activator = new ExtensionsActivator(this._registry, initData.resolvedExtensions, initData.hostExtensions, {
			onExtensionActivationError: (extensionId: ExtensionIdentifier, error: ExtensionActivationError): void => {
				this._mainThreadExtensionsProxy.$onExtensionActivationError(extensionId, error);
			},

			actualActivateExtension: async (extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension> => {
				if (hostExtensions.has(ExtensionIdentifier.toKey(extensionId))) {
					const activationEvent = (reason instanceof ExtensionActivatedByEvent ? reason.activationEvent : null);
					await this._mainThreadExtensionsProxy.$activateExtension(extensionId, activationEvent);
					return new HostExtension();
				}
				const extensionDescription = this._registry.getExtensionDescription(extensionId)!;
				return this._activateExtension(extensionDescription, reason);
			}
		});
		this._extensionPathIndex = null;

		// initialize API first (i.e. do not release barrier until the API is initialized)
		this._extensionApiFactory = createApiFactory(
			this._initData,
			this._extHostContext,
			this._extHostWorkspace,
			this._extHostConfiguration,
			this,
			this._extHostLogService,
			this._storage,
			uriTransformer
		);

		this._resolvers = Object.create(null);

		this._started = false;

		this._initialize();

		if (this._initData.autoStart) {
			this._startExtensionHost();
		}
	}

	private async _initialize(): Promise<void> {
		try {
			const configProvider = await this._extHostConfiguration.getConfigProvider();
			const extensionPaths = await this.getExtensionPathIndex();
			NodeModuleRequireInterceptor.INSTANCE.register(new VSCodeNodeModuleFactory(this._extensionApiFactory, extensionPaths, this._registry, configProvider));
			NodeModuleRequireInterceptor.INSTANCE.register(new KeytarNodeModuleFactory(this._extHostContext.getProxy(MainContext.MainThreadKeytar), this._environment));
			if (this._initData.remote.isRemote) {
				NodeModuleRequireInterceptor.INSTANCE.register(new OpenNodeModuleFactory(
					this._extHostContext.getProxy(MainContext.MainThreadWindow),
					this._extHostContext.getProxy(MainContext.MainThreadTelemetry),
					extensionPaths
				));
			}

			// Do this when extension service exists, but extensions are not being activated yet.
			await connectProxyResolver(this._extHostWorkspace, configProvider, this, this._extHostLogService, this._mainThreadTelemetryProxy);
			this._almostReadyToRunExtensions.open();

			await this._extHostWorkspace.waitForInitializeCall();
			this._readyToStartExtensionHost.open();
		} catch (err) {
			errors.onUnexpectedError(err);
		}
	}

	public async deactivateAll(): Promise<void> {
		let allPromises: Promise<void>[] = [];
		try {
			const allExtensions = this._registry.getAllExtensionDescriptions();
			const allExtensionsIds = allExtensions.map(ext => ext.identifier);
			const activatedExtensions = allExtensionsIds.filter(id => this.isActivated(id));

			allPromises = activatedExtensions.map((extensionId) => {
				return this._deactivate(extensionId);
			});
		} catch (err) {
			// TODO: write to log once we have one
		}
		await allPromises;
	}

	public isActivated(extensionId: ExtensionIdentifier): boolean {
		if (this._readyToRunExtensions.isOpen()) {
			return this._activator.isActivated(extensionId);
		}
		return false;
	}

	private _activateByEvent(activationEvent: string, startup: boolean): Promise<void> {
		const reason = new ExtensionActivatedByEvent(startup, activationEvent);
		return this._activator.activateByEvent(activationEvent, reason);
	}

	private _activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		return this._activator.activateById(extensionId, reason);
	}

	public activateByIdWithErrors(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		return this._activateById(extensionId, reason).then(() => {
			const extension = this._activator.getActivatedExtension(extensionId);
			if (extension.activationFailed) {
				// activation failed => bubble up the error as the promise result
				return Promise.reject(extension.activationFailedError);
			}
			return undefined;
		});
	}

	public getExtensionRegistry(): Promise<ExtensionDescriptionRegistry> {
		return this._readyToRunExtensions.wait().then(_ => this._registry);
	}

	public getExtensionExports(extensionId: ExtensionIdentifier): IExtensionAPI | null | undefined {
		if (this._readyToRunExtensions.isOpen()) {
			return this._activator.getActivatedExtension(extensionId).exports;
		} else {
			return null;
		}
	}

	// create trie to enable fast 'filename -> extension id' look up
	public getExtensionPathIndex(): Promise<TernarySearchTree<IExtensionDescription>> {
		if (!this._extensionPathIndex) {
			const tree = TernarySearchTree.forPaths<IExtensionDescription>();
			const extensions = this._registry.getAllExtensionDescriptions().map(ext => {
				if (!ext.main) {
					return undefined;
				}
				return this._hostUtils.realpath(ext.extensionLocation.fsPath).then(value => tree.set(URI.file(value).fsPath, ext));
			});
			this._extensionPathIndex = Promise.all(extensions).then(() => tree);
		}
		return this._extensionPathIndex;
	}

	private _deactivate(extensionId: ExtensionIdentifier): Promise<void> {
		let result = Promise.resolve(undefined);

		if (!this._readyToRunExtensions.isOpen()) {
			return result;
		}

		if (!this._activator.isActivated(extensionId)) {
			return result;
		}

		const extension = this._activator.getActivatedExtension(extensionId);
		if (!extension) {
			return result;
		}

		// call deactivate if available
		try {
			if (typeof extension.module.deactivate === 'function') {
				result = Promise.resolve(extension.module.deactivate()).then(undefined, (err) => {
					// TODO: Do something with err if this is not the shutdown case
					return Promise.resolve(undefined);
				});
			}
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		// clean up subscriptions
		try {
			dispose(extension.subscriptions);
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		return result;
	}

	// --- impl

	private _activateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
		this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
		return this._doActivateExtension(extensionDescription, reason).then((activatedExtension) => {
			const activationTimes = activatedExtension.activationTimes;
			const activationEvent = (reason instanceof ExtensionActivatedByEvent ? reason.activationEvent : null);
			this._mainThreadExtensionsProxy.$onDidActivateExtension(extensionDescription.identifier, activationTimes.startup, activationTimes.codeLoadingTime, activationTimes.activateCallTime, activationTimes.activateResolvedTime, activationEvent);
			this._logExtensionActivationTimes(extensionDescription, reason, 'success', activationTimes);
			return activatedExtension;
		}, (err) => {
			this._logExtensionActivationTimes(extensionDescription, reason, 'failure');
			throw err;
		});
	}

	private _logExtensionActivationTimes(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason, outcome: string, activationTimes?: ExtensionActivationTimes) {
		const event = getTelemetryActivationEvent(extensionDescription, reason);
		/* __GDPR__
			"extensionActivationTimes" : {
				"${include}": [
					"${TelemetryActivationEvent}",
					"${ExtensionActivationTimes}"
				],
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		type ExtensionActivationTimesClassification = {
			outcome: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		} & TelemetryActivationEventFragment & ExtensionActivationTimesFragment;

		type ExtensionActivationTimesEvent = {
			outcome: string
		} & ActivationTimesEvent & TelemetryActivationEvent;

		type ActivationTimesEvent = {
			startup?: boolean;
			codeLoadingTime?: number;
			activateCallTime?: number;
			activateResolvedTime?: number;
		};

		this._mainThreadTelemetryProxy.$publicLog2<ExtensionActivationTimesEvent, ExtensionActivationTimesClassification>('extensionActivationTimes', {
			...event,
			...(activationTimes || {}),
			outcome
		});
	}

	private _doActivateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
		const event = getTelemetryActivationEvent(extensionDescription, reason);
		type ActivatePluginClassification = {} & TelemetryActivationEventFragment;
		this._mainThreadTelemetryProxy.$publicLog2<TelemetryActivationEvent, ActivatePluginClassification>('activatePlugin', event);
		if (!extensionDescription.main) {
			// Treat the extension as being empty => NOT AN ERROR CASE
			return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}

		this._extHostLogService.info(`ExtensionService#_doActivateExtension ${extensionDescription.identifier.value} ${JSON.stringify(reason)}`);

		const activationTimesBuilder = new ExtensionActivationTimesBuilder(reason.startup);
		return Promise.all<any>([
			loadCommonJSModule(this._extHostLogService, extensionDescription.main, activationTimesBuilder),
			this._loadExtensionContext(extensionDescription)
		]).then(values => {
			return ExtHostExtensionService._callActivate(this._extHostLogService, extensionDescription.identifier, <IExtensionModule>values[0], <IExtensionContext>values[1], activationTimesBuilder);
		});
	}

	private _loadExtensionContext(extensionDescription: IExtensionDescription): Promise<vscode.ExtensionContext> {

		const globalState = new ExtensionMemento(extensionDescription.identifier.value, true, this._storage);
		const workspaceState = new ExtensionMemento(extensionDescription.identifier.value, false, this._storage);

		this._extHostLogService.trace(`ExtensionService#loadExtensionContext ${extensionDescription.identifier.value}`);
		return Promise.all([
			globalState.whenReady,
			workspaceState.whenReady,
			this._storagePath.whenReady
		]).then(() => {
			const that = this;
			return Object.freeze(<IExtensionContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return extensionDescription.extensionLocation.fsPath; },
				storagePath: this._storagePath.workspaceValue(extensionDescription),
				globalStoragePath: this._storagePath.globalValue(extensionDescription),
				asAbsolutePath: (relativePath: string) => { return path.join(extensionDescription.extensionLocation.fsPath, relativePath); },
				logPath: that._extHostLogService.getLogDirectory(extensionDescription.identifier),
				executionContext: this._initData.remote.isRemote ? ExtensionExecutionContext.Remote : ExtensionExecutionContext.Local,
			});
		});
	}

	private static _callActivate(logService: ILogService, extensionId: ExtensionIdentifier, extensionModule: IExtensionModule, context: IExtensionContext, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<ActivatedExtension> {
		// Make sure the extension's surface is not undefined
		extensionModule = extensionModule || {
			activate: undefined,
			deactivate: undefined
		};

		return this._callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder).then((extensionExports) => {
			return new ActivatedExtension(false, null, activationTimesBuilder.build(), extensionModule, extensionExports, context.subscriptions);
		});
	}

	private static _callActivateOptional(logService: ILogService, extensionId: ExtensionIdentifier, extensionModule: IExtensionModule, context: IExtensionContext, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<IExtensionAPI> {
		if (typeof extensionModule.activate === 'function') {
			try {
				activationTimesBuilder.activateCallStart();
				logService.trace(`ExtensionService#_callActivateOptional ${extensionId.value}`);
				const activateResult: Promise<IExtensionAPI> = extensionModule.activate.apply(global, [context]);
				activationTimesBuilder.activateCallStop();

				activationTimesBuilder.activateResolveStart();
				return Promise.resolve(activateResult).then((value) => {
					activationTimesBuilder.activateResolveStop();
					return value;
				});
			} catch (err) {
				return Promise.reject(err);
			}
		} else {
			// No activate found => the module is the extension's exports
			return Promise.resolve<IExtensionAPI>(extensionModule);
		}
	}

	// -- eager activation

	// Handle "eager" activation extensions
	private _handleEagerExtensions(): Promise<void> {
		this._activateByEvent('*', true).then(undefined, (err) => {
			console.error(err);
		});

		this._disposables.add(this._extHostWorkspace.onDidChangeWorkspace((e) => this._handleWorkspaceContainsEagerExtensions(e.added)));
		const folders = this._extHostWorkspace.workspace ? this._extHostWorkspace.workspace.folders : [];
		return this._handleWorkspaceContainsEagerExtensions(folders);
	}

	private _handleWorkspaceContainsEagerExtensions(folders: ReadonlyArray<vscode.WorkspaceFolder>): Promise<void> {
		if (folders.length === 0) {
			return Promise.resolve(undefined);
		}

		return Promise.all(
			this._registry.getAllExtensionDescriptions().map((desc) => {
				return this._handleWorkspaceContainsEagerExtension(folders, desc);
			})
		).then(() => { });
	}

	private _handleWorkspaceContainsEagerExtension(folders: ReadonlyArray<vscode.WorkspaceFolder>, desc: IExtensionDescription): Promise<void> {
		const activationEvents = desc.activationEvents;
		if (!activationEvents) {
			return Promise.resolve(undefined);
		}

		if (this.isActivated(desc.identifier)) {
			return Promise.resolve(undefined);
		}

		const fileNames: string[] = [];
		const globPatterns: string[] = [];

		for (const activationEvent of activationEvents) {
			if (/^workspaceContains:/.test(activationEvent)) {
				const fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
				if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
					globPatterns.push(fileNameOrGlob);
				} else {
					fileNames.push(fileNameOrGlob);
				}
			}
		}

		if (fileNames.length === 0 && globPatterns.length === 0) {
			return Promise.resolve(undefined);
		}

		const fileNamePromise = Promise.all(fileNames.map((fileName) => this._activateIfFileName(folders, desc.identifier, fileName))).then(() => { });
		const globPatternPromise = this._activateIfGlobPatterns(folders, desc.identifier, globPatterns);

		return Promise.all([fileNamePromise, globPatternPromise]).then(() => { });
	}

	private async _activateIfFileName(folders: ReadonlyArray<vscode.WorkspaceFolder>, extensionId: ExtensionIdentifier, fileName: string): Promise<void> {

		// find exact path
		for (const { uri } of folders) {
			if (await this._hostUtils.exists(path.join(URI.revive(uri).fsPath, fileName))) {
				// the file was found
				return (
					this._activateById(extensionId, new ExtensionActivatedByEvent(true, `workspaceContains:${fileName}`))
						.then(undefined, err => console.error(err))
				);
			}
		}

		return undefined;
	}

	private async _activateIfGlobPatterns(folders: ReadonlyArray<vscode.WorkspaceFolder>, extensionId: ExtensionIdentifier, globPatterns: string[]): Promise<void> {
		this._extHostLogService.trace(`extensionHostMain#activateIfGlobPatterns: fileSearch, extension: ${extensionId.value}, entryPoint: workspaceContains`);

		if (globPatterns.length === 0) {
			return Promise.resolve(undefined);
		}

		const tokenSource = new CancellationTokenSource();
		const searchP = this._mainThreadWorkspaceProxy.$checkExists(folders.map(folder => folder.uri), globPatterns, tokenSource.token);

		const timer = setTimeout(async () => {
			tokenSource.cancel();
			this._activateById(extensionId, new ExtensionActivatedByEvent(true, `workspaceContainsTimeout:${globPatterns.join(',')}`))
				.then(undefined, err => console.error(err));
		}, ExtHostExtensionService.WORKSPACE_CONTAINS_TIMEOUT);

		let exists: boolean = false;
		try {
			exists = await searchP;
		} catch (err) {
			if (!errors.isPromiseCanceledError(err)) {
				console.error(err);
			}
		}

		tokenSource.dispose();
		clearTimeout(timer);

		if (exists) {
			// a file was found matching one of the glob patterns
			return (
				this._activateById(extensionId, new ExtensionActivatedByEvent(true, `workspaceContains:${globPatterns.join(',')}`))
					.then(undefined, err => console.error(err))
			);
		}

		return Promise.resolve(undefined);
	}

	private _handleExtensionTests(): Promise<void> {
		return this._doHandleExtensionTests().then(undefined, error => {
			console.error(error); // ensure any error message makes it onto the console

			return Promise.reject(error);
		});
	}

	private _doHandleExtensionTests(): Promise<void> {
		const { extensionDevelopmentLocationURI: extensionDevelopmentLocationURI, extensionTestsLocationURI } = this._initData.environment;
		if (!(extensionDevelopmentLocationURI && extensionTestsLocationURI && extensionTestsLocationURI.scheme === Schemas.file)) {
			return Promise.resolve(undefined);
		}

		const extensionTestsPath = originalFSPath(extensionTestsLocationURI);

		// Require the test runner via node require from the provided path
		let testRunner: ITestRunner | INewTestRunner | undefined;
		let requireError: Error | undefined;
		try {
			testRunner = <any>require.__$__nodeRequire(extensionTestsPath);
		} catch (error) {
			requireError = error;
		}

		// Execute the runner if it follows the old `run` spec
		if (testRunner && typeof testRunner.run === 'function') {
			return new Promise<void>((c, e) => {
				const oldTestRunnerCallback = (error: Error, failures: number | undefined) => {
					if (error) {
						e(error.toString());
					} else {
						c(undefined);
					}

					// after tests have run, we shutdown the host
					this._gracefulExit(error || (typeof failures === 'number' && failures > 0) ? 1 /* ERROR */ : 0 /* OK */);
				};

				const runResult = testRunner!.run(extensionTestsPath, oldTestRunnerCallback);

				// Using the new API `run(): Promise<void>`
				if (runResult && runResult.then) {
					runResult
						.then(() => {
							c();
							this._gracefulExit(0);
						})
						.catch((err: Error) => {
							e(err.toString());
							this._gracefulExit(1);
						});
				}
			});
		}

		// Otherwise make sure to shutdown anyway even in case of an error
		else {
			this._gracefulExit(1 /* ERROR */);
		}

		return Promise.reject(new Error(requireError ? requireError.toString() : nls.localize('extensionTestError', "Path {0} does not point to a valid extension test runner.", extensionTestsPath)));
	}

	private _gracefulExit(code: number): void {
		// to give the PH process a chance to flush any outstanding console
		// messages to the main process, we delay the exit() by some time
		setTimeout(() => {
			// If extension tests are running, give the exit code to the renderer
			if (this._initData.remote.isRemote && !!this._initData.environment.extensionTestsLocationURI) {
				this._mainThreadExtensionsProxy.$onExtensionHostExit(code);
				return;
			}

			this._hostUtils.exit(code);
		}, 500);
	}

	private _startExtensionHost(): Promise<void> {
		if (this._started) {
			throw new Error(`Extension host is already started!`);
		}
		this._started = true;

		return this._readyToStartExtensionHost.wait()
			.then(() => this._readyToRunExtensions.open())
			.then(() => this._handleEagerExtensions())
			.then(() => this._handleExtensionTests())
			.then(() => {
				this._extHostLogService.info(`eager extensions activated`);
			});
	}

	// -- called by extensions

	public registerRemoteAuthorityResolver(authorityPrefix: string, resolver: vscode.RemoteAuthorityResolver): vscode.Disposable {
		this._resolvers[authorityPrefix] = resolver;
		return toDisposable(() => {
			delete this._resolvers[authorityPrefix];
		});
	}

	// -- called by main thread

	public async $resolveAuthority(remoteAuthority: string, resolveAttempt: number): Promise<IResolveAuthorityResult> {
		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			throw new Error(`Not an authority that can be resolved!`);
		}
		const authorityPrefix = remoteAuthority.substr(0, authorityPlusIndex);

		await this._almostReadyToRunExtensions.wait();
		await this._activateByEvent(`onResolveRemoteAuthority:${authorityPrefix}`, false);

		const resolver = this._resolvers[authorityPrefix];
		if (!resolver) {
			throw new Error(`No remote extension installed to resolve ${authorityPrefix}.`);
		}

		try {
			const result = await resolver.resolve(remoteAuthority, { resolveAttempt });
			return {
				type: 'ok',
				value: {
					authority: remoteAuthority,
					host: result.host,
					port: result.port,
				}
			};
		} catch (err) {
			if (err instanceof RemoteAuthorityResolverError) {
				return {
					type: 'error',
					error: {
						code: err._code,
						message: err._message,
						detail: err._detail
					}
				};
			}
			throw err;
		}
	}

	public $startExtensionHost(enabledExtensionIds: ExtensionIdentifier[]): Promise<void> {
		this._registry.keepOnly(enabledExtensionIds);
		return this._startExtensionHost();
	}

	public $activateByEvent(activationEvent: string): Promise<void> {
		return (
			this._readyToRunExtensions.wait()
				.then(_ => this._activateByEvent(activationEvent, false))
		);
	}

	public async $activate(extensionId: ExtensionIdentifier, activationEvent: string): Promise<boolean> {
		await this._readyToRunExtensions.wait();
		if (!this._registry.getExtensionDescription(extensionId)) {
			// unknown extension => ignore
			return false;
		}
		await this._activateById(extensionId, new ExtensionActivatedByEvent(false, activationEvent));
		return true;
	}

	public async $deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void> {
		toAdd.forEach((extension) => (<any>extension).extensionLocation = URI.revive(extension.extensionLocation));

		const trie = await this.getExtensionPathIndex();

		await Promise.all(toRemove.map(async (extensionId) => {
			const extensionDescription = this._registry.getExtensionDescription(extensionId);
			if (!extensionDescription) {
				return;
			}
			const realpathValue = await this._hostUtils.realpath(extensionDescription.extensionLocation.fsPath);
			trie.delete(URI.file(realpathValue).fsPath);
		}));

		await Promise.all(toAdd.map(async (extensionDescription) => {
			const realpathValue = await this._hostUtils.realpath(extensionDescription.extensionLocation.fsPath);
			trie.set(URI.file(realpathValue).fsPath, extensionDescription);
		}));

		this._registry.deltaExtensions(toAdd, toRemove);
		return Promise.resolve(undefined);
	}

	public async $test_latency(n: number): Promise<number> {
		return n;
	}

	public async $test_up(b: VSBuffer): Promise<number> {
		return b.byteLength;
	}

	public async $test_down(size: number): Promise<VSBuffer> {
		let buff = VSBuffer.alloc(size);
		let value = Math.random() % 256;
		for (let i = 0; i < size; i++) {
			buff.writeUInt8(value, i);
		}
		return buff;
	}

}

function loadCommonJSModule<T>(logService: ILogService, modulePath: string, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
	let r: T | null = null;
	activationTimesBuilder.codeLoadingStart();
	logService.info(`ExtensionService#loadCommonJSModule ${modulePath}`);
	try {
		r = require.__$__nodeRequire<T>(modulePath);
	} catch (e) {
		return Promise.reject(e);
	} finally {
		activationTimesBuilder.codeLoadingStop();
	}
	return Promise.resolve(r);
}

type TelemetryActivationEvent = {
	id: string;
	name: string;
	extensionVersion: string;
	publisherDisplayName: string;
	activationEvents: string | null;
	isBuiltin: boolean;
	reason: string;
};

function getTelemetryActivationEvent(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): TelemetryActivationEvent {
	const reasonStr = reason instanceof ExtensionActivatedByEvent ? reason.activationEvent :
		reason instanceof ExtensionActivatedByAPI ? 'api' :
			'';
	const event = {
		id: extensionDescription.identifier.value,
		name: extensionDescription.name,
		extensionVersion: extensionDescription.version,
		publisherDisplayName: extensionDescription.publisher,
		activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(',') : null,
		isBuiltin: extensionDescription.isBuiltin,
		reason: reasonStr
	};

	return event;
}
