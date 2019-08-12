/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createApiFactoryAndRegisterActors } from 'vs/workbench/api/common/extHost.api.impl';
import { NodeModuleRequireInterceptor, VSCodeNodeModuleFactory, KeytarNodeModuleFactory, OpenNodeModuleFactory } from 'vs/workbench/api/node/extHostRequireInterceptor';
import { MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionActivationTimesBuilder } from 'vs/workbench/api/common/extHostExtensionActivator';
import { connectProxyResolver } from 'vs/workbench/services/extensions/node/proxyResolver';
import { AbstractExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtHostDownloadService } from 'vs/workbench/api/node/extHostDownloadService';
import { CLIServer } from 'vs/workbench/api/node/extHostCLIServer';

export class ExtHostExtensionService extends AbstractExtHostExtensionService {

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// initialize API and register actors
		const extensionApiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);

		// Register Download command
		this._instaService.createInstance(ExtHostDownloadService);

		// Register CLI Server for ipc
		if (this._initData.remote.isRemote && this._initData.remote.authority) {
			const cliServer = this._instaService.createInstance(CLIServer);
			process.env['VSCODE_IPC_HOOK_CLI'] = cliServer.ipcHandlePath;
		}

		// Module loading tricks
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		const extensionPaths = await this.getExtensionPathIndex();
		NodeModuleRequireInterceptor.INSTANCE.register(new VSCodeNodeModuleFactory(extensionApiFactory, extensionPaths, this._registry, configProvider));
		NodeModuleRequireInterceptor.INSTANCE.register(new KeytarNodeModuleFactory(this._extHostContext.getProxy(MainContext.MainThreadKeytar), this._initData.environment));
		if (this._initData.remote.isRemote) {
			NodeModuleRequireInterceptor.INSTANCE.register(new OpenNodeModuleFactory(
				this._extHostContext.getProxy(MainContext.MainThreadWindow),
				this._extHostContext.getProxy(MainContext.MainThreadTelemetry),
				extensionPaths
			));
		}

		// Do this when extension service exists, but extensions are not being activated yet.
		await connectProxyResolver(this._extHostWorkspace, configProvider, this, this._extHostLogService, this._mainThreadTelemetryProxy);

	}

	protected _loadCommonJSModule<T>(modulePath: string, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
		let r: T | null = null;
		activationTimesBuilder.codeLoadingStart();
		this._extHostLogService.info(`ExtensionService#loadCommonJSModule ${modulePath}`);
		try {
			r = require.__$__nodeRequire<T>(modulePath);
		} catch (e) {
			return Promise.reject(e);
		} finally {
			activationTimesBuilder.codeLoadingStop();
		}
		return Promise.resolve(r);
	}

	public async $setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		if (!this._initData.remote.isRemote) {
			return;
		}

		for (const key in env) {
			const value = env[key];
			if (value === null) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}
