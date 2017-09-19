/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import uri from 'vs/base/common/uri';
import { IDebugService, IConfig, IDebugConfigurationProvider } from 'vs/workbench/parts/debug/common/debug';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape {

	private _proxy: ExtHostDebugServiceShape;
	private _toDispose: IDisposable[];

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostDebugService);
		this._toDispose = [];
		this._toDispose.push(debugService.onDidNewProcess(proc => this._proxy.$acceptDebugSessionStarted(<DebugSessionUUID>proc.getId(), proc.configuration.type, proc.getName(false))));
		this._toDispose.push(debugService.onDidEndProcess(proc => this._proxy.$acceptDebugSessionTerminated(<DebugSessionUUID>proc.getId(), proc.configuration.type, proc.getName(false))));
		this._toDispose.push(debugService.getViewModel().onDidFocusProcess(proc => {
			if (proc) {
				this._proxy.$acceptDebugSessionActiveChanged(<DebugSessionUUID>proc.getId(), proc.configuration.type, proc.getName(false));
			} else {
				this._proxy.$acceptDebugSessionActiveChanged(undefined);
			}
		}));
		this._toDispose.push(debugService.onDidCustomEvent(event => {
			if (event && event.sessionId) {
				const process = this.debugService.findProcessByUUID(event.sessionId);
				this._proxy.$acceptDebugSessionCustomEvent(event.sessionId, process.configuration.type, process.configuration.name, event);
			}
		}));
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	public $registerDebugConfigurationProvider(debugType: string, hasProvide: boolean, hasResolve: boolean, handle: number): TPromise<void> {

		const provider = <IDebugConfigurationProvider>{
			type: debugType
		};
		if (hasProvide) {
			provider.provideDebugConfigurations = folder => {
				return this._proxy.$provideDebugConfigurations(handle, folder);
			};
		}
		if (hasResolve) {
			provider.resolveDebugConfiguration = (folder, debugConfiguration) => {
				return this._proxy.$resolveDebugConfiguration(handle, folder, debugConfiguration);
			};
		}
		this.debugService.getConfigurationManager().registerDebugConfigurationProvider(handle, provider);

		return TPromise.as<void>(undefined);
	}

	public $unregisterDebugConfigurationProvider(handle: number): TPromise<any> {
		this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(handle);
		return TPromise.as<void>(undefined);
	}

	public $startDebugging(folderUri: uri | undefined, nameOrConfiguration: string | IConfig): TPromise<boolean> {
		const folder = folderUri ? this.contextService.getWorkspace().folders.filter(wf => wf.uri.toString() === folderUri.toString()).pop() : undefined;
		return this.debugService.startDebugging(folder, nameOrConfiguration).then(x => {
			return true;
		}, err => {
			return TPromise.wrapError(err && err.message ? err.message : 'cannot start debugging');
		});
	}

	public $startDebugSession(folderUri: uri | undefined, configuration: IConfig): TPromise<DebugSessionUUID> {
		if (configuration.request !== 'launch' && configuration.request !== 'attach') {
			return TPromise.wrapError(new Error(`only 'launch' or 'attach' allowed for 'request' attribute`));
		}

		const folder = folderUri ? this.contextService.getWorkspace().folders.filter(wf => wf.uri.toString() === folderUri.toString()).pop() : undefined;
		return this.debugService.createProcess(folder, configuration).then(process => {
			if (process) {
				return <DebugSessionUUID>process.getId();
			}
			return TPromise.wrapError<DebugSessionUUID>(new Error('cannot create debug session'));
		}, err => {
			return TPromise.wrapError(err && err.message ? err.message : 'cannot start debug session');
		});
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: any): TPromise<any> {
		const process = this.debugService.findProcessByUUID(sessionId);
		if (process) {
			return process.session.custom(request, args).then(response => {
				if (response.success) {
					return response.body;
				} else {
					return TPromise.wrapError(new Error(response.message));
				}
			});
		}
		return TPromise.wrapError(new Error('debug session not found'));
	}
}
