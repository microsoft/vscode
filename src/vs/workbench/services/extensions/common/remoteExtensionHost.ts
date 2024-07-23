/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService, ILoggerService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IConnectionOptions, IRemoteExtensionHostStartParams, connectRemoteAgentExtensionHost } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAuthorityResolverService, IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteSocketFactoryService } from 'vs/platform/remote/common/remoteSocketFactoryService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isLoggingOnly } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { IExtensionHostInitData, MessageType, UIKind, createMessageOfType, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { RemoteRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost } from 'vs/workbench/services/extensions/common/extensions';

export interface IRemoteExtensionHostInitData {
	readonly connectionData: IRemoteConnectionData | null;
	readonly pid: number;
	readonly appRoot: URI;
	readonly extensionHostLogsPath: URI;
	readonly globalStorageHome: URI;
	readonly workspaceStorageHome: URI;
	readonly extensions: ExtensionHostExtensions;
}

export interface IRemoteExtensionHostDataProvider {
	readonly remoteAuthority: string;
	getInitData(): Promise<IRemoteExtensionHostInitData>;
}

export class RemoteExtensionHost extends Disposable implements IExtensionHost {

	public readonly pid = null;
	public readonly remoteAuthority: string;
	public readonly startup = ExtensionHostStartup.EagerAutoStart;
	public extensions: ExtensionHostExtensions | null = null;

	private _onExit: Emitter<[number, string | null]> = this._register(new Emitter<[number, string | null]>());
	public readonly onExit: Event<[number, string | null]> = this._onExit.event;

	private _protocol: PersistentProtocol | null;
	private _hasLostConnection: boolean;
	private _terminating: boolean;
	private _hasDisconnected = false;
	private readonly _isExtensionDevHost: boolean;

	constructor(
		public readonly runningLocation: RemoteRunningLocation,
		private readonly _initDataProvider: IRemoteExtensionHostDataProvider,
		@IRemoteSocketFactoryService private readonly remoteSocketFactoryService: IRemoteSocketFactoryService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService protected readonly _loggerService: ILoggerService,
		@ILabelService private readonly _labelService: ILabelService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService,
		@IProductService private readonly _productService: IProductService,
		@ISignService private readonly _signService: ISignService
	) {
		super();
		this.remoteAuthority = this._initDataProvider.remoteAuthority;
		this._protocol = null;
		this._hasLostConnection = false;
		this._terminating = false;

		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
	}

	public start(): Promise<IMessagePassingProtocol> {
		const options: IConnectionOptions = {
			commit: this._productService.commit,
			quality: this._productService.quality,
			addressProvider: {
				getAddress: async () => {
					const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(this._initDataProvider.remoteAuthority);
					return { connectTo: authority.connectTo, connectionToken: authority.connectionToken };
				}
			},
			remoteSocketFactoryService: this.remoteSocketFactoryService,
			signService: this._signService,
			logService: this._logService,
			ipcLogger: null
		};
		return this.remoteAuthorityResolverService.resolveAuthority(this._initDataProvider.remoteAuthority).then((resolverResult) => {

			const startParams: IRemoteExtensionHostStartParams = {
				language: platform.language,
				debugId: this._environmentService.debugExtensionHost.debugId,
				break: this._environmentService.debugExtensionHost.break,
				port: this._environmentService.debugExtensionHost.port,
				env: { ...this._environmentService.debugExtensionHost.env, ...resolverResult.options?.extensionHostEnv },
			};

			const extDevLocs = this._environmentService.extensionDevelopmentLocationURI;

			let debugOk = true;
			if (extDevLocs && extDevLocs.length > 0) {
				// TODO@AW: handles only first path in array
				if (extDevLocs[0].scheme === Schemas.file) {
					debugOk = false;
				}
			}

			if (!debugOk) {
				startParams.break = false;
			}

			return connectRemoteAgentExtensionHost(options, startParams).then(result => {
				this._register(result);
				const { protocol, debugPort, reconnectionToken } = result;
				const isExtensionDevelopmentDebug = typeof debugPort === 'number';
				if (debugOk && this._environmentService.isExtensionDevelopment && this._environmentService.debugExtensionHost.debugId && debugPort) {
					this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, debugPort, this._initDataProvider.remoteAuthority);
				}

				protocol.onDidDispose(() => {
					this._onExtHostConnectionLost(reconnectionToken);
				});

				protocol.onSocketClose(() => {
					if (this._isExtensionDevHost) {
						this._onExtHostConnectionLost(reconnectionToken);
					}
				});

				// 1) wait for the incoming `ready` event and send the initialization data.
				// 2) wait for the incoming `initialized` event.
				return new Promise<IMessagePassingProtocol>((resolve, reject) => {

					const handle = setTimeout(() => {
						reject('The remote extension host took longer than 60s to send its ready message.');
					}, 60 * 1000);

					const disposable = protocol.onMessage(msg => {

						if (isMessageOfType(msg, MessageType.Ready)) {
							// 1) Extension Host is ready to receive messages, initialize it
							this._createExtHostInitData(isExtensionDevelopmentDebug).then(data => {
								protocol.send(VSBuffer.fromString(JSON.stringify(data)));
							});
							return;
						}

						if (isMessageOfType(msg, MessageType.Initialized)) {
							// 2) Extension Host is initialized

							clearTimeout(handle);

							// stop listening for messages here
							disposable.dispose();

							// release this promise
							this._protocol = protocol;
							resolve(protocol);

							return;
						}

						console.error(`received unexpected message during handshake phase from the extension host: `, msg);
					});

				});
			});
		});
	}

	private _onExtHostConnectionLost(reconnectionToken: string): void {
		if (this._hasLostConnection) {
			// avoid re-entering this method
			return;
		}
		this._hasLostConnection = true;

		if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId) {
			this._extensionHostDebugService.close(this._environmentService.debugExtensionHost.debugId);
		}

		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		this._onExit.fire([0, reconnectionToken]);
	}

	private async _createExtHostInitData(isExtensionDevelopmentDebug: boolean): Promise<IExtensionHostInitData> {
		const remoteInitData = await this._initDataProvider.getInitData();
		this.extensions = remoteInitData.extensions;
		const workspace = this._contextService.getWorkspace();
		return {
			commit: this._productService.commit,
			version: this._productService.version,
			quality: this._productService.quality,
			parentPid: remoteInitData.pid,
			environment: {
				isExtensionDevelopmentDebug,
				appRoot: remoteInitData.appRoot,
				appName: this._productService.nameLong,
				appHost: this._productService.embedderIdentifier || 'desktop',
				appUriScheme: this._productService.urlProtocol,
				extensionTelemetryLogResource: this._environmentService.extHostTelemetryLogFile,
				isExtensionTelemetryLoggingOnly: isLoggingOnly(this._productService, this._environmentService),
				appLanguage: platform.language,
				extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
				extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
				globalStorageHome: remoteInitData.globalStorageHome,
				workspaceStorageHome: remoteInitData.workspaceStorageHome,
				extensionLogLevel: this._environmentService.extensionLogLevel
			},
			workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : {
				configuration: workspace.configuration,
				id: workspace.id,
				name: this._labelService.getWorkspaceLabel(workspace),
				transient: workspace.transient
			},
			remote: {
				isRemote: true,
				authority: this._initDataProvider.remoteAuthority,
				connectionData: remoteInitData.connectionData
			},
			consoleForward: {
				includeStack: false,
				logNative: Boolean(this._environmentService.debugExtensionHost.debugId)
			},
			extensions: this.extensions.toSnapshot(),
			telemetryInfo: {
				sessionId: this._telemetryService.sessionId,
				machineId: this._telemetryService.machineId,
				sqmId: this._telemetryService.sqmId,
				devDeviceId: this._telemetryService.devDeviceId,
				firstSessionDate: this._telemetryService.firstSessionDate,
				msftInternal: this._telemetryService.msftInternal
			},
			logLevel: this._logService.getLevel(),
			loggers: [...this._loggerService.getRegisteredLoggers()],
			logsLocation: remoteInitData.extensionHostLogsPath,
			autoStart: (this.startup === ExtensionHostStartup.EagerAutoStart),
			uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
		};
	}

	getInspectPort(): undefined {
		return undefined;
	}

	enableInspectPort(): Promise<boolean> {
		return Promise.resolve(false);
	}

	async disconnect() {
		if (this._protocol && !this._hasDisconnected) {
			this._protocol.send(createMessageOfType(MessageType.Terminate));
			this._protocol.sendDisconnect();
			this._hasDisconnected = true;
			await this._protocol.drain();
		}
	}

	override dispose(): void {
		super.dispose();

		this._terminating = true;
		this.disconnect();

		if (this._protocol) {
			// Send the extension host a request to terminate itself
			// (graceful termination)
			// setTimeout(() => {
			// console.log(`SENDING TERMINATE TO REMOTE EXT HOST!`);
			this._protocol.getSocket().end();
			// this._protocol.drain();
			this._protocol = null;
			// }, 1000);
		}
	}
}

