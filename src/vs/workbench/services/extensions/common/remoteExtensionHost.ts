/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { localize } from 'vs/nls';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { connectRemoteAgentExtensionHost, IConnectionOptions, IRemoteExtensionHostStartParams, ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAuthorityResolverService, IRemoteConnectionData } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { createMessageOfType, isMessageOfType, MessageType, IExtensionHostInitData, UIKind } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtensionHostExtensions, ExtensionHostLogFileName, IExtensionHost, remoteExtHostLog, RemoteRunningLocation } from 'vs/workbench/services/extensions/common/extensions';
import { Extensions, IOutputChannelRegistry } from 'vs/workbench/services/output/common/output';

export interface IRemoteExtensionHostInitData {
	readonly connectionData: IRemoteConnectionData | null;
	readonly pid: number;
	readonly appRoot: URI;
	readonly extensionHostLogsPath: URI;
	readonly globalStorageHome: URI;
	readonly workspaceStorageHome: URI;
	readonly allExtensions: IExtensionDescription[];
	readonly myExtensions: ExtensionIdentifier[];
}

export interface IRemoteExtensionHostDataProvider {
	readonly remoteAuthority: string;
	getInitData(): Promise<IRemoteExtensionHostInitData>;
}

export class RemoteExtensionHost extends Disposable implements IExtensionHost {

	public readonly remoteAuthority: string;
	public readonly lazyStart = false;
	public readonly extensions = new ExtensionHostExtensions();

	private _onExit: Emitter<[number, string | null]> = this._register(new Emitter<[number, string | null]>());
	public readonly onExit: Event<[number, string | null]> = this._onExit.event;

	private _protocol: PersistentProtocol | null;
	private _hasLostConnection: boolean;
	private _terminating: boolean;
	private readonly _isExtensionDevHost: boolean;

	constructor(
		public readonly runningLocation: RemoteRunningLocation,
		private readonly _initDataProvider: IRemoteExtensionHostDataProvider,
		private readonly _socketFactory: ISocketFactory,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
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
			socketFactory: this._socketFactory,
			addressProvider: {
				getAddress: async () => {
					const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(this._initDataProvider.remoteAuthority);
					return { host: authority.host, port: authority.port, connectionToken: authority.connectionToken };
				}
			},
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
						reject('The remote extenion host took longer than 60s to send its ready message.');
					}, 60 * 1000);

					let logFile: URI;

					const disposable = protocol.onMessage(msg => {

						if (isMessageOfType(msg, MessageType.Ready)) {
							// 1) Extension Host is ready to receive messages, initialize it
							this._createExtHostInitData(isExtensionDevelopmentDebug).then(data => {
								logFile = data.logFile;
								protocol.send(VSBuffer.fromString(JSON.stringify(data)));
							});
							return;
						}

						if (isMessageOfType(msg, MessageType.Initialized)) {
							// 2) Extension Host is initialized

							clearTimeout(handle);

							// stop listening for messages here
							disposable.dispose();

							// Register log channel for remote exthost log
							Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({ id: remoteExtHostLog, label: localize('remote extension host Log', "Remote Extension Host"), file: logFile, log: true });

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
		const [telemetryInfo, remoteInitData] = await Promise.all([this._telemetryService.getTelemetryInfo(), this._initDataProvider.getInitData()]);
		const workspace = this._contextService.getWorkspace();
		const deltaExtensions = this.extensions.set(remoteInitData.allExtensions, remoteInitData.myExtensions);
		return {
			commit: this._productService.commit,
			version: this._productService.version,
			parentPid: remoteInitData.pid,
			environment: {
				isExtensionDevelopmentDebug,
				appRoot: remoteInitData.appRoot,
				appName: this._productService.nameLong,
				appHost: this._productService.embedderIdentifier || 'desktop',
				appUriScheme: this._productService.urlProtocol,
				extensionTelemetryLogResource: this._environmentService.extHostTelemetryLogFile,
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
			allExtensions: deltaExtensions.toAdd,
			myExtensions: deltaExtensions.myToAdd,
			telemetryInfo,
			logLevel: this._logService.getLevel(),
			logsLocation: remoteInitData.extensionHostLogsPath,
			logFile: joinPath(remoteInitData.extensionHostLogsPath, `${ExtensionHostLogFileName}.log`),
			autoStart: true,
			uiKind: platform.isWeb ? UIKind.Web : UIKind.Desktop
		};
	}

	getInspectPort(): number | undefined {
		return undefined;
	}

	enableInspectPort(): Promise<boolean> {
		return Promise.resolve(false);
	}

	override dispose(): void {
		super.dispose();

		this._terminating = true;

		if (this._protocol) {
			// Send the extension host a request to terminate itself
			// (graceful termination)
			// setTimeout(() => {
			// console.log(`SENDING TERMINATE TO REMOTE EXT HOST!`);
			const socket = this._protocol.getSocket();
			this._protocol.send(createMessageOfType(MessageType.Terminate));
			this._protocol.sendDisconnect();
			this._protocol.dispose();
			// this._protocol.drain();
			socket.end();
			this._protocol = null;
			// }, 1000);
		}
	}
}
