/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { connectRemoteAgentExtensionHost, IRemoteExtensionHostStartParams, IConnectionOptions, ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { MessageType, createMessageOfType, isMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import * as platform from 'vs/base/common/platform';
import { Schemas } from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { VSBuffer } from 'vs/base/common/buffer';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IProductService } from 'vs/platform/product/common/product';
import { ISignService } from 'vs/platform/sign/common/sign';

export interface IInitDataProvider {
	readonly remoteAuthority: string;
	getInitData(): Promise<IRemoteAgentEnvironment>;
}

export class RemoteExtensionHostClient extends Disposable implements IExtensionHostStarter {

	private _onExit: Emitter<[number, string | null]> = this._register(new Emitter<[number, string | null]>());
	public readonly onExit: Event<[number, string | null]> = this._onExit.event;

	private _protocol: PersistentProtocol | null;

	private readonly _isExtensionDevHost: boolean;

	private _terminating: boolean;

	constructor(
		private readonly _allExtensions: Promise<IExtensionDescription[]>,
		private readonly _initDataProvider: IInitDataProvider,
		private readonly _socketFactory: ISocketFactory,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ILogService private readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService,
		@IProductService private readonly _productService: IProductService,
		@ISignService private readonly _signService: ISignService
	) {
		super();
		this._protocol = null;
		this._terminating = false;

		this._register(this._lifecycleService.onShutdown(reason => this.dispose()));

		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
	}

	public start(): Promise<IMessagePassingProtocol> {
		const options: IConnectionOptions = {
			commit: this._productService.commit,
			socketFactory: this._socketFactory,
			addressProvider: {
				getAddress: async () => {
					const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(this._initDataProvider.remoteAuthority);
					return { host: authority.host, port: authority.port };
				}
			},
			signService: this._signService
		};
		return this.remoteAuthorityResolverService.resolveAuthority(this._initDataProvider.remoteAuthority).then((resolverResult) => {

			const startParams: IRemoteExtensionHostStartParams = {
				language: platform.language,
				debugId: this._environmentService.debugExtensionHost.debugId,
				break: this._environmentService.debugExtensionHost.break,
				port: this._environmentService.debugExtensionHost.port,
				env: resolverResult.options && resolverResult.options.extensionHostEnv
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
				let { protocol, debugPort } = result;
				const isExtensionDevelopmentDebug = typeof debugPort === 'number';
				if (debugOk && this._environmentService.isExtensionDevelopment && this._environmentService.debugExtensionHost.debugId && debugPort) {
					this._extensionHostDebugService.attachSession(this._environmentService.debugExtensionHost.debugId, debugPort, this._initDataProvider.remoteAuthority);
				}

				protocol.onClose(() => {
					this._onExtHostConnectionLost();
				});

				protocol.onSocketClose(() => {
					if (this._isExtensionDevHost) {
						this._onExtHostConnectionLost();
					}
				});

				// 1) wait for the incoming `ready` event and send the initialization data.
				// 2) wait for the incoming `initialized` event.
				return new Promise<IMessagePassingProtocol>((resolve, reject) => {

					let handle = setTimeout(() => {
						reject('timeout');
					}, 60 * 1000);

					const disposable = protocol.onMessage(msg => {

						if (isMessageOfType(msg, MessageType.Ready)) {
							// 1) Extension Host is ready to receive messages, initialize it
							this._createExtHostInitData(isExtensionDevelopmentDebug).then(data => protocol.send(VSBuffer.fromString(JSON.stringify(data))));
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

	private _onExtHostConnectionLost(): void {

		if (this._isExtensionDevHost && this._environmentService.debugExtensionHost.debugId) {
			this._extensionHostDebugService.close(this._environmentService.debugExtensionHost.debugId);
		}

		if (this._terminating) {
			// Expected termination path (we asked the process to terminate)
			return;
		}

		this._onExit.fire([0, null]);
	}

	private _createExtHostInitData(isExtensionDevelopmentDebug: boolean): Promise<IInitData> {
		return Promise.all([this._allExtensions, this._telemetryService.getTelemetryInfo(), this._initDataProvider.getInitData()]).then(([allExtensions, telemetryInfo, remoteExtensionHostData]) => {
			// Collect all identifiers for extension ids which can be considered "resolved"
			const resolvedExtensions = allExtensions.filter(extension => !extension.main).map(extension => extension.identifier);
			const hostExtensions = allExtensions.filter(extension => extension.main && extension.api === 'none').map(extension => extension.identifier);
			const workspace = this._contextService.getWorkspace();
			const r: IInitData = {
				commit: this._productService.commit,
				version: this._productService.version,
				parentPid: remoteExtensionHostData.pid,
				environment: {
					isExtensionDevelopmentDebug,
					appRoot: remoteExtensionHostData.appRoot,
					appSettingsHome: remoteExtensionHostData.appSettingsHome,
					appName: this._productService.nameLong,
					appUriScheme: this._productService.urlProtocol,
					appLanguage: platform.language,
					extensionDevelopmentLocationURI: this._environmentService.extensionDevelopmentLocationURI,
					extensionTestsLocationURI: this._environmentService.extensionTestsLocationURI,
					globalStorageHome: remoteExtensionHostData.globalStorageHome,
					userHome: remoteExtensionHostData.userHome,
					webviewResourceRoot: this._environmentService.webviewResourceRoot,
					webviewCspSource: this._environmentService.webviewCspSource,
				},
				workspace: this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : {
					configuration: workspace.configuration,
					id: workspace.id,
					name: this._labelService.getWorkspaceLabel(workspace)
				},
				remote: {
					isRemote: true,
					authority: this._initDataProvider.remoteAuthority
				},
				resolvedExtensions: resolvedExtensions,
				hostExtensions: hostExtensions,
				extensions: remoteExtensionHostData.extensions,
				telemetryInfo,
				logLevel: this._logService.getLevel(),
				logsLocation: remoteExtensionHostData.extensionHostLogsPath,
				autoStart: true,
			};
			return r;
		});
	}

	getInspectPort(): number | undefined {
		return undefined;
	}

	dispose(): void {
		super.dispose();

		this._terminating = true;

		if (this._protocol) {
			// Send the extension host a request to terminate itself
			// (graceful termination)
			const socket = this._protocol.getSocket();
			this._protocol.send(createMessageOfType(MessageType.Terminate));
			this._protocol.sendDisconnect();
			this._protocol.dispose();
			socket.end();
			this._protocol = null;
		}
	}
}
