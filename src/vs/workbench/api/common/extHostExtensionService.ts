/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import * as nls from '../../../nls.js';
import * as path from '../../../base/common/path.js';
import * as performance from '../../../base/common/performance.js';
import { originalFSPath, joinPath, extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { asPromise, Barrier, IntervalTimer, timeout } from '../../../base/common/async.js';
import { dispose, toDisposable, Disposable, DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtHostExtensionServiceShape, MainContext, MainThreadExtensionServiceShape, MainThreadTelemetryShape, MainThreadWorkspaceShape } from './extHost.protocol.js';
import { IExtensionDescriptionDelta, IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtHostConfiguration, IExtHostConfiguration } from './extHostConfiguration.js';
import { ActivatedExtension, EmptyExtension, ExtensionActivationTimes, ExtensionActivationTimesBuilder, ExtensionsActivator, IExtensionAPI, IExtensionModule, HostExtension, ExtensionActivationTimesFragment } from './extHostExtensionActivator.js';
import { ExtHostStorage, IExtHostStorage } from './extHostStorage.js';
import { ExtHostWorkspace, IExtHostWorkspace } from './extHostWorkspace.js';
import { MissingExtensionDependency, ActivationKind, checkProposedApiEnabled, isProposedApiEnabled, ExtensionActivationReason } from '../../services/extensions/common/extensions.js';
import { ExtensionDescriptionRegistry, IActivationEventsReader } from '../../services/extensions/common/extensionDescriptionRegistry.js';
import * as errors from '../../../base/common/errors.js';
import type * as vscode from 'vscode';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { ExtensionGlobalMemento, ExtensionMemento } from './extHostMemento.js';
import { RemoteAuthorityResolverError, ExtensionKind, ExtensionMode, ExtensionRuntime, ManagedResolvedAuthority as ExtHostManagedResolvedAuthority } from './extHostTypes.js';
import { ResolvedAuthority, ResolvedOptions, RemoteAuthorityResolverErrorCode, IRemoteConnectionData, getRemoteAuthorityPrefix, TunnelInformation, ManagedRemoteConnection, WebSocketRemoteConnection } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { IInstantiationService, createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { IExtensionStoragePaths } from './extHostStoragePaths.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IExtHostTunnelService } from './extHostTunnelService.js';
import { IExtHostTerminalService } from './extHostTerminalService.js';
import { IExtHostLanguageModels } from './extHostLanguageModels.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IExtensionActivationHost, checkActivateWorkspaceContainsExtension } from '../../services/extensions/common/workspaceContains.js';
import { ExtHostSecretState, IExtHostSecretState } from './extHostSecretState.js';
import { ExtensionSecrets } from './extHostSecrets.js';
import { Schemas } from '../../../base/common/network.js';
import { IResolveAuthorityResult } from '../../services/extensions/common/extensionHostProxy.js';
import { IExtHostLocalizationService } from './extHostLocalizationService.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { isCI, setTimeout0 } from '../../../base/common/platform.js';
import { IExtHostManagedSockets } from './extHostManagedSockets.js';
import { Dto } from '../../services/extensions/common/proxyIdentifier.js';

interface ITestRunner {
	/** Old test runner API, as exported from `vscode/lib/testrunner` */
	run(testsRoot: string, clb: (error: Error, failures?: number) => void): void;
}

interface INewTestRunner {
	/** New test runner API, as explained in the extension test doc */
	run(): Promise<void>;
}

export const IHostUtils = createDecorator<IHostUtils>('IHostUtils');

export interface IHostUtils {
	readonly _serviceBrand: undefined;
	readonly pid: number | undefined;
	exit(code: number): void;
	fsExists?(path: string): Promise<boolean>;
	fsRealpath?(path: string): Promise<string>;
}

type TelemetryActivationEventFragment = {
	id: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of an extension' };
	name: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The name of the extension' };
	extensionVersion: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The version of the extension' };
	publisherDisplayName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The publisher of the extension' };
	activationEvents: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'All activation events of the extension' };
	isBuiltin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'If the extension is builtin or git installed' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The activation event' };
	reasonId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The identifier of the activation event' };
};

export abstract class AbstractExtHostExtensionService extends Disposable implements ExtHostExtensionServiceShape {

	readonly _serviceBrand: undefined;

	abstract readonly extensionRuntime: ExtensionRuntime;

	private readonly _onDidChangeRemoteConnectionData = this._register(new Emitter<void>());
	public readonly onDidChangeRemoteConnectionData = this._onDidChangeRemoteConnectionData.event;

	protected readonly _hostUtils: IHostUtils;
	protected readonly _initData: IExtensionHostInitData;
	protected readonly _extHostContext: IExtHostRpcService;
	protected readonly _instaService: IInstantiationService;
	protected readonly _extHostWorkspace: ExtHostWorkspace;
	protected readonly _extHostConfiguration: ExtHostConfiguration;
	protected readonly _logService: ILogService;
	protected readonly _extHostTunnelService: IExtHostTunnelService;
	protected readonly _extHostTerminalService: IExtHostTerminalService;
	protected readonly _extHostLocalizationService: IExtHostLocalizationService;

	protected readonly _mainThreadWorkspaceProxy: MainThreadWorkspaceShape;
	protected readonly _mainThreadTelemetryProxy: MainThreadTelemetryShape;
	protected readonly _mainThreadExtensionsProxy: MainThreadExtensionServiceShape;

	private readonly _almostReadyToRunExtensions: Barrier;
	private readonly _readyToStartExtensionHost: Barrier;
	private readonly _readyToRunExtensions: Barrier;
	private readonly _eagerExtensionsActivated: Barrier;

	private readonly _activationEventsReader: SyncedActivationEventsReader;
	protected readonly _myRegistry: ExtensionDescriptionRegistry;
	protected readonly _globalRegistry: ExtensionDescriptionRegistry;
	private readonly _storage: ExtHostStorage;
	private readonly _secretState: ExtHostSecretState;
	private readonly _storagePath: IExtensionStoragePaths;
	private readonly _activator: ExtensionsActivator;
	private _extensionPathIndex: Promise<ExtensionPaths> | null;
	private _realPathCache = new Map<string, Promise<string>>();

	private readonly _resolvers: { [authorityPrefix: string]: vscode.RemoteAuthorityResolver };

	private _started: boolean;
	private _isTerminating: boolean = false;
	private _remoteConnectionData: IRemoteConnectionData | null;

	constructor(
		@IInstantiationService instaService: IInstantiationService,
		@IHostUtils hostUtils: IHostUtils,
		@IExtHostRpcService extHostContext: IExtHostRpcService,
		@IExtHostWorkspace extHostWorkspace: IExtHostWorkspace,
		@IExtHostConfiguration extHostConfiguration: IExtHostConfiguration,
		@ILogService logService: ILogService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtensionStoragePaths storagePath: IExtensionStoragePaths,
		@IExtHostTunnelService extHostTunnelService: IExtHostTunnelService,
		@IExtHostTerminalService extHostTerminalService: IExtHostTerminalService,
		@IExtHostLocalizationService extHostLocalizationService: IExtHostLocalizationService,
		@IExtHostManagedSockets private readonly _extHostManagedSockets: IExtHostManagedSockets,
		@IExtHostLanguageModels private readonly _extHostLanguageModels: IExtHostLanguageModels,
	) {
		super();
		this._hostUtils = hostUtils;
		this._extHostContext = extHostContext;
		this._initData = initData;

		this._extHostWorkspace = extHostWorkspace;
		this._extHostConfiguration = extHostConfiguration;
		this._logService = logService;
		this._extHostTunnelService = extHostTunnelService;
		this._extHostTerminalService = extHostTerminalService;
		this._extHostLocalizationService = extHostLocalizationService;

		this._mainThreadWorkspaceProxy = this._extHostContext.getProxy(MainContext.MainThreadWorkspace);
		this._mainThreadTelemetryProxy = this._extHostContext.getProxy(MainContext.MainThreadTelemetry);
		this._mainThreadExtensionsProxy = this._extHostContext.getProxy(MainContext.MainThreadExtensionService);

		this._almostReadyToRunExtensions = new Barrier();
		this._readyToStartExtensionHost = new Barrier();
		this._readyToRunExtensions = new Barrier();
		this._eagerExtensionsActivated = new Barrier();
		this._activationEventsReader = new SyncedActivationEventsReader(this._initData.extensions.activationEvents);
		this._globalRegistry = new ExtensionDescriptionRegistry(this._activationEventsReader, this._initData.extensions.allExtensions);
		const myExtensionsSet = new ExtensionIdentifierSet(this._initData.extensions.myExtensions);
		this._myRegistry = new ExtensionDescriptionRegistry(
			this._activationEventsReader,
			filterExtensions(this._globalRegistry, myExtensionsSet)
		);

		if (isCI) {
			this._logService.info(`Creating extension host with the following global extensions: ${printExtIds(this._globalRegistry)}`);
			this._logService.info(`Creating extension host with the following local extensions: ${printExtIds(this._myRegistry)}`);
		}

		this._storage = new ExtHostStorage(this._extHostContext, this._logService);
		this._secretState = new ExtHostSecretState(this._extHostContext);
		this._storagePath = storagePath;

		this._instaService = this._store.add(instaService.createChild(new ServiceCollection(
			[IExtHostStorage, this._storage],
			[IExtHostSecretState, this._secretState]
		)));

		this._activator = this._register(new ExtensionsActivator(
			this._myRegistry,
			this._globalRegistry,
			{
				onExtensionActivationError: (extensionId: ExtensionIdentifier, error: Error, missingExtensionDependency: MissingExtensionDependency | null): void => {
					this._mainThreadExtensionsProxy.$onExtensionActivationError(extensionId, errors.transformErrorForSerialization(error), missingExtensionDependency);
				},

				actualActivateExtension: async (extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension> => {
					if (ExtensionDescriptionRegistry.isHostExtension(extensionId, this._myRegistry, this._globalRegistry)) {
						await this._mainThreadExtensionsProxy.$activateExtension(extensionId, reason);
						return new HostExtension();
					}
					const extensionDescription = this._myRegistry.getExtensionDescription(extensionId)!;
					return this._activateExtension(extensionDescription, reason);
				}
			},
			this._logService
		));
		this._extensionPathIndex = null;
		this._resolvers = Object.create(null);
		this._started = false;
		this._remoteConnectionData = this._initData.remote.connectionData;
	}

	public getRemoteConnectionData(): IRemoteConnectionData | null {
		return this._remoteConnectionData;
	}

	public async initialize(): Promise<void> {
		try {

			await this._beforeAlmostReadyToRunExtensions();
			this._almostReadyToRunExtensions.open();

			await this._extHostWorkspace.waitForInitializeCall();
			performance.mark('code/extHost/ready');
			this._readyToStartExtensionHost.open();

			if (this._initData.autoStart) {
				this._startExtensionHost();
			}
		} catch (err) {
			errors.onUnexpectedError(err);
		}
	}

	private async _deactivateAll(): Promise<void> {
		this._storagePath.onWillDeactivateAll();

		let allPromises: Promise<void>[] = [];
		try {
			const allExtensions = this._myRegistry.getAllExtensionDescriptions();
			const allExtensionsIds = allExtensions.map(ext => ext.identifier);
			const activatedExtensions = allExtensionsIds.filter(id => this.isActivated(id));

			allPromises = activatedExtensions.map((extensionId) => {
				return this._deactivate(extensionId);
			});
		} catch (err) {
			// TODO: write to log once we have one
		}
		await Promise.all(allPromises);
	}

	public terminate(reason: string, code: number = 0): void {
		if (this._isTerminating) {
			// we are already shutting down...
			return;
		}
		this._isTerminating = true;
		this._logService.info(`Extension host terminating: ${reason}`);
		this._logService.flush();

		this._extHostTerminalService.dispose();
		this._activator.dispose();

		errors.setUnexpectedErrorHandler((err) => {
			this._logService.error(err);
		});

		// Invalidate all proxies
		this._extHostContext.dispose();

		const extensionsDeactivated = this._deactivateAll();

		// Give extensions at most 5 seconds to wrap up any async deactivate, then exit
		Promise.race([timeout(5000), extensionsDeactivated]).finally(() => {
			if (this._hostUtils.pid) {
				this._logService.info(`Extension host with pid ${this._hostUtils.pid} exiting with code ${code}`);
			} else {
				this._logService.info(`Extension host exiting with code ${code}`);
			}
			this._logService.flush();
			this._logService.dispose();
			this._hostUtils.exit(code);
		});
	}

	public isActivated(extensionId: ExtensionIdentifier): boolean {
		if (this._readyToRunExtensions.isOpen()) {
			return this._activator.isActivated(extensionId);
		}
		return false;
	}

	public async getExtension(extensionId: string): Promise<IExtensionDescription | undefined> {
		const ext = await this._mainThreadExtensionsProxy.$getExtension(extensionId);
		return ext && {
			...ext,
			identifier: new ExtensionIdentifier(ext.identifier.value),
			extensionLocation: URI.revive(ext.extensionLocation)
		};
	}

	private _activateByEvent(activationEvent: string, startup: boolean): Promise<void> {
		return this._activator.activateByEvent(activationEvent, startup);
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
		return this._readyToRunExtensions.wait().then(_ => this._myRegistry);
	}

	public getExtensionExports(extensionId: ExtensionIdentifier): IExtensionAPI | null | undefined {
		if (this._readyToRunExtensions.isOpen()) {
			return this._activator.getActivatedExtension(extensionId).exports;
		} else {
			try {
				return this._activator.getActivatedExtension(extensionId).exports;
			} catch (err) {
				return null;
			}
		}
	}

	/**
	 * Applies realpath to file-uris and returns all others uris unmodified.
	 * The real path is cached for the lifetime of the extension host.
	 */
	private async _realPathExtensionUri(uri: URI): Promise<URI> {
		if (uri.scheme === Schemas.file && this._hostUtils.fsRealpath) {
			const fsPath = uri.fsPath;
			if (!this._realPathCache.has(fsPath)) {
				this._realPathCache.set(fsPath, this._hostUtils.fsRealpath(fsPath));
			}
			const realpathValue = await this._realPathCache.get(fsPath)!;
			return URI.file(realpathValue);
		}
		return uri;
	}

	// create trie to enable fast 'filename -> extension id' look up
	public async getExtensionPathIndex(): Promise<ExtensionPaths> {
		if (!this._extensionPathIndex) {
			this._extensionPathIndex = this._createExtensionPathIndex(this._myRegistry.getAllExtensionDescriptions()).then((searchTree) => {
				return new ExtensionPaths(searchTree);
			});
		}
		return this._extensionPathIndex;
	}

	/**
	 * create trie to enable fast 'filename -> extension id' look up
	 */
	private async _createExtensionPathIndex(extensions: IExtensionDescription[]): Promise<TernarySearchTree<URI, IExtensionDescription>> {
		const tst = TernarySearchTree.forUris<IExtensionDescription>(key => {
			// using the default/biased extUri-util because the IExtHostFileSystemInfo-service
			// isn't ready to be used yet, e.g the knowledge about `file` protocol and others
			// comes in while this code runs
			return extUriBiasedIgnorePathCase.ignorePathCasing(key);
		});
		// const tst = TernarySearchTree.forUris<IExtensionDescription>(key => true);
		await Promise.all(extensions.map(async (ext) => {
			if (this._getEntryPoint(ext)) {
				const uri = await this._realPathExtensionUri(ext.extensionLocation);
				tst.set(uri, ext);
			}
		}));
		return tst;
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
					this._logService.error(err);
					return Promise.resolve(undefined);
				});
			}
		} catch (err) {
			this._logService.error(`An error occurred when deactivating the extension '${extensionId.value}':`);
			this._logService.error(err);
		}

		// clean up subscriptions
		try {
			extension.disposable.dispose();
		} catch (err) {
			this._logService.error(`An error occurred when disposing the subscriptions for extension '${extensionId.value}':`);
			this._logService.error(err);
		}

		return result;
	}

	// --- impl

	private async _activateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
		if (!this._initData.remote.isRemote) {
			// local extension host process
			await this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
		} else {
			// remote extension host process
			// do not wait for renderer confirmation
			this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
		}
		return this._doActivateExtension(extensionDescription, reason).then((activatedExtension) => {
			const activationTimes = activatedExtension.activationTimes;
			this._mainThreadExtensionsProxy.$onDidActivateExtension(extensionDescription.identifier, activationTimes.codeLoadingTime, activationTimes.activateCallTime, activationTimes.activateResolvedTime, reason);
			this._logExtensionActivationTimes(extensionDescription, reason, 'success', activationTimes);
			return activatedExtension;
		}, (err) => {
			this._logExtensionActivationTimes(extensionDescription, reason, 'failure');
			throw err;
		});
	}

	private _logExtensionActivationTimes(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason, outcome: string, activationTimes?: ExtensionActivationTimes) {
		const event = getTelemetryActivationEvent(extensionDescription, reason);
		type ExtensionActivationTimesClassification = {
			owner: 'jrieken';
			comment: 'Timestamps for extension activation';
			outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Did extension activation succeed or fail' };
		} & TelemetryActivationEventFragment & ExtensionActivationTimesFragment;

		type ExtensionActivationTimesEvent = {
			outcome: string;
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
		type ActivatePluginClassification = {
			owner: 'jrieken';
			comment: 'Data about how/why an extension was activated';
		} & TelemetryActivationEventFragment;
		this._mainThreadTelemetryProxy.$publicLog2<TelemetryActivationEvent, ActivatePluginClassification>('activatePlugin', event);
		const entryPoint = this._getEntryPoint(extensionDescription);
		if (!entryPoint) {
			// Treat the extension as being empty => NOT AN ERROR CASE
			return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}

		this._logService.info(`ExtensionService#_doActivateExtension ${extensionDescription.identifier.value}, startup: ${reason.startup}, activationEvent: '${reason.activationEvent}'${extensionDescription.identifier.value !== reason.extensionId.value ? `, root cause: ${reason.extensionId.value}` : ``}`);
		this._logService.flush();

		const isESM = this._isESM(extensionDescription);

		const extensionInternalStore = new DisposableStore(); // disposables that follow the extension lifecycle
		const activationTimesBuilder = new ExtensionActivationTimesBuilder(reason.startup);
		return Promise.all([
			isESM
				? this._loadESMModule<IExtensionModule>(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder)
				: this._loadCommonJSModule<IExtensionModule>(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder),
			this._loadExtensionContext(extensionDescription, extensionInternalStore)
		]).then(values => {
			performance.mark(`code/extHost/willActivateExtension/${extensionDescription.identifier.value}`);
			return AbstractExtHostExtensionService._callActivate(this._logService, extensionDescription.identifier, values[0], values[1], extensionInternalStore, activationTimesBuilder);
		}).then((activatedExtension) => {
			performance.mark(`code/extHost/didActivateExtension/${extensionDescription.identifier.value}`);
			return activatedExtension;
		});
	}

	private _loadExtensionContext(extensionDescription: IExtensionDescription, extensionInternalStore: DisposableStore): Promise<vscode.ExtensionContext> {

		const languageModelAccessInformation = this._extHostLanguageModels.createLanguageModelAccessInformation(extensionDescription);
		const globalState = extensionInternalStore.add(new ExtensionGlobalMemento(extensionDescription, this._storage));
		const workspaceState = extensionInternalStore.add(new ExtensionMemento(extensionDescription.identifier.value, false, this._storage));
		const secrets = extensionInternalStore.add(new ExtensionSecrets(extensionDescription, this._secretState));
		const extensionMode = extensionDescription.isUnderDevelopment
			? (this._initData.environment.extensionTestsLocationURI ? ExtensionMode.Test : ExtensionMode.Development)
			: ExtensionMode.Production;
		const extensionKind = this._initData.remote.isRemote ? ExtensionKind.Workspace : ExtensionKind.UI;

		this._logService.trace(`ExtensionService#loadExtensionContext ${extensionDescription.identifier.value}`);

		return Promise.all([
			globalState.whenReady,
			workspaceState.whenReady,
			this._storagePath.whenReady
		]).then(() => {
			const that = this;
			let extension: vscode.Extension<any> | undefined;

			let messagePassingProtocol: vscode.MessagePassingProtocol | undefined;
			const messagePort = isProposedApiEnabled(extensionDescription, 'ipc')
				? this._initData.messagePorts?.get(ExtensionIdentifier.toKey(extensionDescription.identifier))
				: undefined;

			return Object.freeze<vscode.ExtensionContext>({
				globalState,
				workspaceState,
				secrets,
				subscriptions: [],
				get languageModelAccessInformation() { return languageModelAccessInformation; },
				get extensionUri() { return extensionDescription.extensionLocation; },
				get extensionPath() { return extensionDescription.extensionLocation.fsPath; },
				asAbsolutePath(relativePath: string) { return path.join(extensionDescription.extensionLocation.fsPath, relativePath); },
				get storagePath() { return that._storagePath.workspaceValue(extensionDescription)?.fsPath; },
				get globalStoragePath() { return that._storagePath.globalValue(extensionDescription).fsPath; },
				get logPath() { return path.join(that._initData.logsLocation.fsPath, extensionDescription.identifier.value); },
				get logUri() { return URI.joinPath(that._initData.logsLocation, extensionDescription.identifier.value); },
				get storageUri() { return that._storagePath.workspaceValue(extensionDescription); },
				get globalStorageUri() { return that._storagePath.globalValue(extensionDescription); },
				get extensionMode() { return extensionMode; },
				get extension() {
					if (extension === undefined) {
						extension = new Extension(that, extensionDescription.identifier, extensionDescription, extensionKind, false);
					}
					return extension;
				},
				get extensionRuntime() {
					checkProposedApiEnabled(extensionDescription, 'extensionRuntime');
					return that.extensionRuntime;
				},
				get environmentVariableCollection() { return that._extHostTerminalService.getEnvironmentVariableCollection(extensionDescription); },
				get messagePassingProtocol() {
					if (!messagePassingProtocol) {
						if (!messagePort) {
							return undefined;
						}

						const onDidReceiveMessage = Event.buffer(Event.fromDOMEventEmitter(messagePort, 'message', e => e.data));
						messagePort.start();
						messagePassingProtocol = {
							onDidReceiveMessage,
							postMessage: messagePort.postMessage.bind(messagePort) as any
						};
					}

					return messagePassingProtocol;
				}
			});
		});
	}

	private static _callActivate(logService: ILogService, extensionId: ExtensionIdentifier, extensionModule: IExtensionModule, context: vscode.ExtensionContext, extensionInternalStore: IDisposable, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<ActivatedExtension> {
		// Make sure the extension's surface is not undefined
		extensionModule = extensionModule || {
			activate: undefined,
			deactivate: undefined
		};

		return this._callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder).then((extensionExports) => {
			return new ActivatedExtension(false, null, activationTimesBuilder.build(), extensionModule, extensionExports, toDisposable(() => {
				extensionInternalStore.dispose();
				dispose(context.subscriptions);
			}));
		});
	}

	private static _callActivateOptional(logService: ILogService, extensionId: ExtensionIdentifier, extensionModule: IExtensionModule, context: vscode.ExtensionContext, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<IExtensionAPI> {
		if (typeof extensionModule.activate === 'function') {
			try {
				activationTimesBuilder.activateCallStart();
				logService.trace(`ExtensionService#_callActivateOptional ${extensionId.value}`);
				const scope = typeof global === 'object' ? global : self; // `global` is nodejs while `self` is for workers
				const activateResult: Promise<IExtensionAPI> = extensionModule.activate.apply(scope, [context]);
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

	private _activateOneStartupFinished(desc: IExtensionDescription, activationEvent: string): void {
		this._activateById(desc.identifier, {
			startup: false,
			extensionId: desc.identifier,
			activationEvent: activationEvent
		}).then(undefined, (err) => {
			this._logService.error(err);
		});
	}

	private _activateAllStartupFinishedDeferred(extensions: IExtensionDescription[], start: number = 0): void {
		const timeBudget = 50; // 50 milliseconds
		const startTime = Date.now();

		setTimeout0(() => {
			for (let i = start; i < extensions.length; i += 1) {
				const desc = extensions[i];
				for (const activationEvent of (desc.activationEvents ?? [])) {
					if (activationEvent === 'onStartupFinished') {
						if (Date.now() - startTime > timeBudget) {
							// time budget for current task has been exceeded
							// set a new task to activate current and remaining extensions
							this._activateAllStartupFinishedDeferred(extensions, i);
							break;
						} else {
							this._activateOneStartupFinished(desc, activationEvent);
						}
					}
				}
			}
		});
	}

	private _activateAllStartupFinished(): void {
		// startup is considered finished
		this._mainThreadExtensionsProxy.$setPerformanceMarks(performance.getMarks());

		this._extHostConfiguration.getConfigProvider().then((configProvider) => {
			const shouldDeferActivation = configProvider.getConfiguration('extensions.experimental').get<boolean>('deferredStartupFinishedActivation');
			const allExtensionDescriptions = this._myRegistry.getAllExtensionDescriptions();
			if (shouldDeferActivation) {
				this._activateAllStartupFinishedDeferred(allExtensionDescriptions);
			} else {
				for (const desc of allExtensionDescriptions) {
					if (desc.activationEvents) {
						for (const activationEvent of desc.activationEvents) {
							if (activationEvent === 'onStartupFinished') {
								this._activateOneStartupFinished(desc, activationEvent);
							}
						}
					}
				}
			}
		});
	}

	// Handle "eager" activation extensions
	private _handleEagerExtensions(): Promise<void> {
		const starActivation = this._activateByEvent('*', true).then(undefined, (err) => {
			this._logService.error(err);
		});

		this._register(this._extHostWorkspace.onDidChangeWorkspace((e) => this._handleWorkspaceContainsEagerExtensions(e.added)));
		const folders = this._extHostWorkspace.workspace ? this._extHostWorkspace.workspace.folders : [];
		const workspaceContainsActivation = this._handleWorkspaceContainsEagerExtensions(folders);
		const remoteResolverActivation = this._handleRemoteResolverEagerExtensions();
		const eagerExtensionsActivation = Promise.all([remoteResolverActivation, starActivation, workspaceContainsActivation]).then(() => { });

		Promise.race([eagerExtensionsActivation, timeout(10000)]).then(() => {
			this._activateAllStartupFinished();
		});

		return eagerExtensionsActivation;
	}

	private _handleWorkspaceContainsEagerExtensions(folders: ReadonlyArray<vscode.WorkspaceFolder>): Promise<void> {
		if (folders.length === 0) {
			return Promise.resolve(undefined);
		}

		return Promise.all(
			this._myRegistry.getAllExtensionDescriptions().map((desc) => {
				return this._handleWorkspaceContainsEagerExtension(folders, desc);
			})
		).then(() => { });
	}

	private async _handleWorkspaceContainsEagerExtension(folders: ReadonlyArray<vscode.WorkspaceFolder>, desc: IExtensionDescription): Promise<void> {
		if (this.isActivated(desc.identifier)) {
			return;
		}

		const localWithRemote = !this._initData.remote.isRemote && !!this._initData.remote.authority;
		const host: IExtensionActivationHost = {
			logService: this._logService,
			folders: folders.map(folder => folder.uri),
			forceUsingSearch: localWithRemote || !this._hostUtils.fsExists,
			exists: (uri) => this._hostUtils.fsExists!(uri.fsPath),
			checkExists: (folders, includes, token) => this._mainThreadWorkspaceProxy.$checkExists(folders, includes, token)
		};

		const result = await checkActivateWorkspaceContainsExtension(host, desc);
		if (!result) {
			return;
		}

		return (
			this._activateById(desc.identifier, { startup: true, extensionId: desc.identifier, activationEvent: result.activationEvent })
				.then(undefined, err => this._logService.error(err))
		);
	}

	private async _handleRemoteResolverEagerExtensions(): Promise<void> {
		if (this._initData.remote.authority) {
			return this._activateByEvent(`onResolveRemoteAuthority:${this._initData.remote.authority}`, false);
		}
	}

	public async $extensionTestsExecute(): Promise<number> {
		await this._eagerExtensionsActivated.wait();
		try {
			return await this._doHandleExtensionTests();
		} catch (error) {
			console.error(error); // ensure any error message makes it onto the console
			throw error;
		}
	}

	private async _doHandleExtensionTests(): Promise<number> {
		const { extensionDevelopmentLocationURI, extensionTestsLocationURI } = this._initData.environment;
		if (!extensionDevelopmentLocationURI || !extensionTestsLocationURI) {
			throw new Error(nls.localize('extensionTestError1', "Cannot load test runner."));
		}

		const extensionDescription = (await this.getExtensionPathIndex()).findSubstr(extensionTestsLocationURI);
		const isESM = this._isESM(extensionDescription, extensionTestsLocationURI.path);

		// Require the test runner via node require from the provided path
		const testRunner = await (isESM
			? this._loadESMModule<ITestRunner | INewTestRunner | undefined>(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false))
			: this._loadCommonJSModule<ITestRunner | INewTestRunner | undefined>(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false)));

		if (!testRunner || typeof testRunner.run !== 'function') {
			throw new Error(nls.localize('extensionTestError', "Path {0} does not point to a valid extension test runner.", extensionTestsLocationURI.toString()));
		}

		// Execute the runner if it follows the old `run` spec
		return new Promise<number>((resolve, reject) => {
			const oldTestRunnerCallback = (error: Error, failures: number | undefined) => {
				if (error) {
					if (isCI) {
						this._logService.error(`Test runner called back with error`, error);
					}
					reject(error);
				} else {
					if (isCI) {
						if (failures) {
							this._logService.info(`Test runner called back with ${failures} failures.`);
						} else {
							this._logService.info(`Test runner called back with successful outcome.`);
						}
					}
					resolve((typeof failures === 'number' && failures > 0) ? 1 /* ERROR */ : 0 /* OK */);
				}
			};

			const extensionTestsPath = originalFSPath(extensionTestsLocationURI); // for the old test runner API

			const runResult = testRunner.run(extensionTestsPath, oldTestRunnerCallback);

			// Using the new API `run(): Promise<void>`
			if (runResult && runResult.then) {
				runResult
					.then(() => {
						if (isCI) {
							this._logService.info(`Test runner finished successfully.`);
						}
						resolve(0);
					})
					.catch((err: unknown) => {
						if (isCI) {
							this._logService.error(`Test runner finished with error`, err);
						}
						reject(err instanceof Error && err.stack ? err.stack : String(err));
					});
			}
		});
	}

	private _startExtensionHost(): Promise<void> {
		if (this._started) {
			throw new Error(`Extension host is already started!`);
		}
		this._started = true;

		return this._readyToStartExtensionHost.wait()
			.then(() => this._readyToRunExtensions.open())
			.then(() => {
				// wait for all activation events that came in during workbench startup, but at maximum 1s
				return Promise.race([this._activator.waitForActivatingExtensions(), timeout(1000)]);
			})
			.then(() => this._handleEagerExtensions())
			.then(() => {
				this._eagerExtensionsActivated.open();
				this._logService.info(`Eager extensions activated`);
			});
	}

	// -- called by extensions

	public registerRemoteAuthorityResolver(authorityPrefix: string, resolver: vscode.RemoteAuthorityResolver): vscode.Disposable {
		this._resolvers[authorityPrefix] = resolver;
		return toDisposable(() => {
			delete this._resolvers[authorityPrefix];
		});
	}

	public async getRemoteExecServer(remoteAuthority: string): Promise<vscode.ExecServer | undefined> {
		const { resolver } = await this._activateAndGetResolver(remoteAuthority);
		return resolver?.resolveExecServer?.(remoteAuthority, { resolveAttempt: 0 });
	}

	// -- called by main thread

	private async _activateAndGetResolver(remoteAuthority: string): Promise<{ authorityPrefix: string; resolver: vscode.RemoteAuthorityResolver | undefined }> {
		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			throw new RemoteAuthorityResolverError(`Not an authority that can be resolved!`, RemoteAuthorityResolverErrorCode.InvalidAuthority);
		}
		const authorityPrefix = remoteAuthority.substr(0, authorityPlusIndex);

		await this._almostReadyToRunExtensions.wait();
		await this._activateByEvent(`onResolveRemoteAuthority:${authorityPrefix}`, false);

		return { authorityPrefix, resolver: this._resolvers[authorityPrefix] };
	}

	public async $resolveAuthority(remoteAuthorityChain: string, resolveAttempt: number): Promise<Dto<IResolveAuthorityResult>> {
		const sw = StopWatch.create(false);
		const prefix = () => `[resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthorityChain)},${resolveAttempt})][${sw.elapsed()}ms] `;
		const logInfo = (msg: string) => this._logService.info(`${prefix()}${msg}`);
		const logWarning = (msg: string) => this._logService.warn(`${prefix()}${msg}`);
		const logError = (msg: string, err: any = undefined) => this._logService.error(`${prefix()}${msg}`, err);
		const normalizeError = (err: unknown) => {
			if (err instanceof RemoteAuthorityResolverError) {
				return {
					type: 'error' as const,
					error: {
						code: err._code,
						message: err._message,
						detail: err._detail
					}
				};
			}
			throw err;
		};

		const getResolver = async (remoteAuthority: string) => {
			logInfo(`activating resolver for ${remoteAuthority}...`);
			const { resolver, authorityPrefix } = await this._activateAndGetResolver(remoteAuthority);
			if (!resolver) {
				logError(`no resolver for ${authorityPrefix}`);
				throw new RemoteAuthorityResolverError(`No remote extension installed to resolve ${authorityPrefix}.`, RemoteAuthorityResolverErrorCode.NoResolverFound);
			}
			return { resolver, authorityPrefix, remoteAuthority };
		};

		const chain = remoteAuthorityChain.split(/@|%40/g).reverse();
		logInfo(`activating remote resolvers ${chain.join(' -> ')}`);

		let resolvers;
		try {
			resolvers = await Promise.all(chain.map(getResolver)).catch(async (e: Error) => {
				if (!(e instanceof RemoteAuthorityResolverError) || e._code !== RemoteAuthorityResolverErrorCode.InvalidAuthority) { throw e; }
				logWarning(`resolving nested authorities failed: ${e.message}`);
				return [await getResolver(remoteAuthorityChain)];
			});
		} catch (e) {
			return normalizeError(e);
		}

		const intervalLogger = new IntervalTimer();
		intervalLogger.cancelAndSet(() => logInfo('waiting...'), 1000);

		let result!: vscode.ResolverResult;
		let execServer: vscode.ExecServer | undefined;
		for (const [i, { authorityPrefix, resolver, remoteAuthority }] of resolvers.entries()) {
			try {
				if (i === resolvers.length - 1) {
					logInfo(`invoking final resolve()...`);
					performance.mark(`code/extHost/willResolveAuthority/${authorityPrefix}`);
					result = await resolver.resolve(remoteAuthority, { resolveAttempt, execServer });
					performance.mark(`code/extHost/didResolveAuthorityOK/${authorityPrefix}`);
					logInfo(`setting tunnel factory...`);
					this._register(await this._extHostTunnelService.setTunnelFactory(
						resolver,
						ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? result : undefined
					));
				} else {
					logInfo(`invoking resolveExecServer() for ${remoteAuthority}`);
					performance.mark(`code/extHost/willResolveExecServer/${authorityPrefix}`);
					execServer = await resolver.resolveExecServer?.(remoteAuthority, { resolveAttempt, execServer });
					if (!execServer) {
						throw new RemoteAuthorityResolverError(`Exec server was not available for ${remoteAuthority}`, RemoteAuthorityResolverErrorCode.NoResolverFound); // we did, in fact, break the chain :(
					}
					performance.mark(`code/extHost/didResolveExecServerOK/${authorityPrefix}`);
				}
			} catch (e) {
				performance.mark(`code/extHost/didResolveAuthorityError/${authorityPrefix}`);
				logError(`returned an error`, e);
				intervalLogger.dispose();
				return normalizeError(e);
			}
		}

		intervalLogger.dispose();

		const tunnelInformation: TunnelInformation = {
			environmentTunnels: result.environmentTunnels,
			features: result.tunnelFeatures ? {
				elevation: result.tunnelFeatures.elevation,
				privacyOptions: result.tunnelFeatures.privacyOptions,
				protocol: result.tunnelFeatures.protocol === undefined ? true : result.tunnelFeatures.protocol,
			} : undefined
		};

		// Split merged API result into separate authority/options
		const options: ResolvedOptions = {
			extensionHostEnv: result.extensionHostEnv,
			isTrusted: result.isTrusted,
			authenticationSession: result.authenticationSessionForInitializingExtensions ? { id: result.authenticationSessionForInitializingExtensions.id, providerId: result.authenticationSessionForInitializingExtensions.providerId } : undefined
		};

		// extension are not required to return an instance of ResolvedAuthority or ManagedResolvedAuthority, so don't use `instanceof`
		logInfo(`returned ${ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? 'managed authority' : `${result.host}:${result.port}`}`);

		let authority: ResolvedAuthority;
		if (ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result)) {
			// The socket factory is identified by the `resolveAttempt`, since that is a number which
			// always increments and is unique over all resolve() calls in a workbench session.
			const socketFactoryId = resolveAttempt;

			// There is only on managed socket factory at a time, so we can just overwrite the old one.
			this._extHostManagedSockets.setFactory(socketFactoryId, result.makeConnection);

			authority = {
				authority: remoteAuthorityChain,
				connectTo: new ManagedRemoteConnection(socketFactoryId),
				connectionToken: result.connectionToken
			};
		} else {
			authority = {
				authority: remoteAuthorityChain,
				connectTo: new WebSocketRemoteConnection(result.host, result.port),
				connectionToken: result.connectionToken
			};
		}

		return {
			type: 'ok',
			value: {
				authority: authority as Dto<ResolvedAuthority>,
				options,
				tunnelInformation,
			}
		};
	}

	public async $getCanonicalURI(remoteAuthority: string, uriComponents: UriComponents): Promise<UriComponents | null> {
		this._logService.info(`$getCanonicalURI invoked for authority (${getRemoteAuthorityPrefix(remoteAuthority)})`);

		const { resolver } = await this._activateAndGetResolver(remoteAuthority);
		if (!resolver) {
			// Return `null` if no resolver for `remoteAuthority` is found.
			return null;
		}

		const uri = URI.revive(uriComponents);

		if (typeof resolver.getCanonicalURI === 'undefined') {
			// resolver cannot compute canonical URI
			return uri;
		}

		const result = await asPromise(() => resolver.getCanonicalURI!(uri));
		if (!result) {
			return uri;
		}

		return result;
	}

	public async $startExtensionHost(extensionsDelta: IExtensionDescriptionDelta): Promise<void> {
		extensionsDelta.toAdd.forEach((extension) => (<any>extension).extensionLocation = URI.revive(extension.extensionLocation));

		const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
		const newSearchTree = await this._createExtensionPathIndex(myExtensions);
		const extensionsPaths = await this.getExtensionPathIndex();
		extensionsPaths.setSearchTree(newSearchTree);
		this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
		this._myRegistry.set(myExtensions);

		if (isCI) {
			this._logService.info(`$startExtensionHost: global extensions: ${printExtIds(this._globalRegistry)}`);
			this._logService.info(`$startExtensionHost: local extensions: ${printExtIds(this._myRegistry)}`);
		}

		return this._startExtensionHost();
	}

	public $activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		if (activationKind === ActivationKind.Immediate) {
			return this._almostReadyToRunExtensions.wait()
				.then(_ => this._activateByEvent(activationEvent, false));
		}

		return (
			this._readyToRunExtensions.wait()
				.then(_ => this._activateByEvent(activationEvent, false))
		);
	}

	public async $activate(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<boolean> {
		await this._readyToRunExtensions.wait();
		if (!this._myRegistry.getExtensionDescription(extensionId)) {
			// unknown extension => ignore
			return false;
		}
		await this._activateById(extensionId, reason);
		return true;
	}

	public async $deltaExtensions(extensionsDelta: IExtensionDescriptionDelta): Promise<void> {
		extensionsDelta.toAdd.forEach((extension) => (<any>extension).extensionLocation = URI.revive(extension.extensionLocation));

		// First build up and update the trie and only afterwards apply the delta
		const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
		const newSearchTree = await this._createExtensionPathIndex(myExtensions);
		const extensionsPaths = await this.getExtensionPathIndex();
		extensionsPaths.setSearchTree(newSearchTree);
		this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
		this._myRegistry.set(myExtensions);

		if (isCI) {
			this._logService.info(`$deltaExtensions: global extensions: ${printExtIds(this._globalRegistry)}`);
			this._logService.info(`$deltaExtensions: local extensions: ${printExtIds(this._myRegistry)}`);
		}

		return Promise.resolve(undefined);
	}

	public async $test_latency(n: number): Promise<number> {
		return n;
	}

	public async $test_up(b: VSBuffer): Promise<number> {
		return b.byteLength;
	}

	public async $test_down(size: number): Promise<VSBuffer> {
		const buff = VSBuffer.alloc(size);
		const value = Math.random() % 256;
		for (let i = 0; i < size; i++) {
			buff.writeUInt8(value, i);
		}
		return buff;
	}

	public async $updateRemoteConnectionData(connectionData: IRemoteConnectionData): Promise<void> {
		this._remoteConnectionData = connectionData;
		this._onDidChangeRemoteConnectionData.fire();
	}

	protected _isESM(extensionDescription: IExtensionDescription | undefined, modulePath?: string): boolean {
		modulePath ??= extensionDescription?.main;
		return modulePath?.endsWith('.mjs') || (extensionDescription?.type === 'module' && !modulePath?.endsWith('.cjs'));
	}

	protected abstract _beforeAlmostReadyToRunExtensions(): Promise<void>;
	protected abstract _getEntryPoint(extensionDescription: IExtensionDescription): string | undefined;
	protected abstract _loadCommonJSModule<T extends object | undefined>(extensionId: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T>;
	protected abstract _loadESMModule<T>(extension: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T>;
	public abstract $setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
}

function applyExtensionsDelta(activationEventsReader: SyncedActivationEventsReader, oldGlobalRegistry: ExtensionDescriptionRegistry, oldMyRegistry: ExtensionDescriptionRegistry, extensionsDelta: IExtensionDescriptionDelta) {
	activationEventsReader.addActivationEvents(extensionsDelta.addActivationEvents);
	const globalRegistry = new ExtensionDescriptionRegistry(activationEventsReader, oldGlobalRegistry.getAllExtensionDescriptions());
	globalRegistry.deltaExtensions(extensionsDelta.toAdd, extensionsDelta.toRemove);

	const myExtensionsSet = new ExtensionIdentifierSet(oldMyRegistry.getAllExtensionDescriptions().map(extension => extension.identifier));
	for (const extensionId of extensionsDelta.myToRemove) {
		myExtensionsSet.delete(extensionId);
	}
	for (const extensionId of extensionsDelta.myToAdd) {
		myExtensionsSet.add(extensionId);
	}
	const myExtensions = filterExtensions(globalRegistry, myExtensionsSet);

	return { globalRegistry, myExtensions };
}

type TelemetryActivationEvent = {
	id: string;
	name: string;
	extensionVersion: string;
	publisherDisplayName: string;
	activationEvents: string | null;
	isBuiltin: boolean;
	reason: string;
	reasonId: string;
};

function getTelemetryActivationEvent(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): TelemetryActivationEvent {
	const event = {
		id: extensionDescription.identifier.value,
		name: extensionDescription.name,
		extensionVersion: extensionDescription.version,
		publisherDisplayName: extensionDescription.publisher,
		activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(',') : null,
		isBuiltin: extensionDescription.isBuiltin,
		reason: reason.activationEvent,
		reasonId: reason.extensionId.value,
	};

	return event;
}

function printExtIds(registry: ExtensionDescriptionRegistry) {
	return registry.getAllExtensionDescriptions().map(ext => ext.identifier.value).join(',');
}

export const IExtHostExtensionService = createDecorator<IExtHostExtensionService>('IExtHostExtensionService');

export interface IExtHostExtensionService extends AbstractExtHostExtensionService {
	readonly _serviceBrand: undefined;
	initialize(): Promise<void>;
	terminate(reason: string): void;
	getExtension(extensionId: string): Promise<IExtensionDescription | undefined>;
	isActivated(extensionId: ExtensionIdentifier): boolean;
	activateByIdWithErrors(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void>;
	getExtensionExports(extensionId: ExtensionIdentifier): IExtensionAPI | null | undefined;
	getExtensionRegistry(): Promise<ExtensionDescriptionRegistry>;
	getExtensionPathIndex(): Promise<ExtensionPaths>;
	registerRemoteAuthorityResolver(authorityPrefix: string, resolver: vscode.RemoteAuthorityResolver): vscode.Disposable;
	getRemoteExecServer(authority: string): Promise<vscode.ExecServer | undefined>;

	onDidChangeRemoteConnectionData: Event<void>;
	getRemoteConnectionData(): IRemoteConnectionData | null;
}

export class Extension<T extends object | null | undefined> implements vscode.Extension<T> {

	#extensionService: IExtHostExtensionService;
	#originExtensionId: ExtensionIdentifier;
	#identifier: ExtensionIdentifier;

	readonly id: string;
	readonly extensionUri: URI;
	readonly extensionPath: string;
	readonly packageJSON: IExtensionDescription;
	readonly extensionKind: vscode.ExtensionKind;
	readonly isFromDifferentExtensionHost: boolean;

	constructor(extensionService: IExtHostExtensionService, originExtensionId: ExtensionIdentifier, description: IExtensionDescription, kind: ExtensionKind, isFromDifferentExtensionHost: boolean) {
		this.#extensionService = extensionService;
		this.#originExtensionId = originExtensionId;
		this.#identifier = description.identifier;
		this.id = description.identifier.value;
		this.extensionUri = description.extensionLocation;
		this.extensionPath = path.normalize(originalFSPath(description.extensionLocation));
		this.packageJSON = description;
		this.extensionKind = kind;
		this.isFromDifferentExtensionHost = isFromDifferentExtensionHost;
	}

	get isActive(): boolean {
		// TODO@alexdima support this
		return this.#extensionService.isActivated(this.#identifier);
	}

	get exports(): T {
		if (this.packageJSON.api === 'none' || this.isFromDifferentExtensionHost) {
			return undefined!; // Strict nulloverride - Public api
		}
		return <T>this.#extensionService.getExtensionExports(this.#identifier);
	}

	async activate(): Promise<T> {
		if (this.isFromDifferentExtensionHost) {
			throw new Error('Cannot activate foreign extension'); // TODO@alexdima support this
		}
		await this.#extensionService.activateByIdWithErrors(this.#identifier, { startup: false, extensionId: this.#originExtensionId, activationEvent: 'api' });
		return this.exports;
	}
}

function filterExtensions(globalRegistry: ExtensionDescriptionRegistry, desiredExtensions: ExtensionIdentifierSet): IExtensionDescription[] {
	return globalRegistry.getAllExtensionDescriptions().filter(
		extension => desiredExtensions.has(extension.identifier)
	);
}

export class ExtensionPaths {

	constructor(
		private _searchTree: TernarySearchTree<URI, IExtensionDescription>
	) { }

	setSearchTree(searchTree: TernarySearchTree<URI, IExtensionDescription>): void {
		this._searchTree = searchTree;
	}

	findSubstr(key: URI): IExtensionDescription | undefined {
		return this._searchTree.findSubstr(key);
	}

	forEach(callback: (value: IExtensionDescription, index: URI) => any): void {
		return this._searchTree.forEach(callback);
	}
}

/**
 * This mirrors the activation events as seen by the renderer. The renderer
 * is the only one which can have a reliable view of activation events because
 * implicit activation events are generated via extension points, and they
 * are registered only on the renderer side.
 */
class SyncedActivationEventsReader implements IActivationEventsReader {

	private readonly _map = new ExtensionIdentifierMap<string[]>();

	constructor(activationEvents: { [extensionId: string]: string[] }) {
		this.addActivationEvents(activationEvents);
	}

	public readActivationEvents(extensionDescription: IExtensionDescription): string[] {
		return this._map.get(extensionDescription.identifier) ?? [];
	}

	public addActivationEvents(activationEvents: { [extensionId: string]: string[] }): void {
		for (const extensionId of Object.keys(activationEvents)) {
			this._map.set(extensionId, activationEvents[extensionId]);
		}
	}
}
