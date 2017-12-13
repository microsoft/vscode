/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import uri from 'vs/base/common/uri';
import { IDebugService, IConfig, IDebugConfigurationProvider, IBreakpoint, IFunctionBreakpoint } from 'vs/workbench/parts/debug/common/debug';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext, IExtHostContext, IBreakpointsDelta, ISourceBreakpointData, IFunctionBreakpointData } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import severity from 'vs/base/common/severity';

@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape {

	private _proxy: ExtHostDebugServiceShape;
	private _toDispose: IDisposable[];
	private _breakpointEventsActive: boolean;

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private debugService: IDebugService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);
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
				const process = this.debugService.getModel().getProcesses().filter(p => p.getId() === event.sessionId).pop();
				if (process) {
					this._proxy.$acceptDebugSessionCustomEvent(event.sessionId, process.configuration.type, process.configuration.name, event);
				}
			}
		}));
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	public $startBreakpointEvents(): TPromise<any> {

		if (!this._breakpointEventsActive) {
			this._breakpointEventsActive = true;

			// set up a handler to send more
			this._toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
				if (e) {
					const delta: IBreakpointsDelta = {};
					if (e.added) {
						delta.added = this.toWire(e.added);
					}
					if (e.removed) {
						delta.removed = e.removed.map(x => x.getId());
					}
					if (e.changed) {
						delta.changed = this.toWire(e.changed);
					}

					if (delta.added || delta.removed || delta.changed) {
						this._proxy.$acceptBreakpointsDelta(delta);
					}
				}
			}));

			// send all breakpoints
			const bps = this.debugService.getModel().getBreakpoints();
			const fbps = this.debugService.getModel().getFunctionBreakpoints();
			if (bps.length > 0 || fbps.length > 0) {
				this._proxy.$acceptBreakpointsDelta({
					added: this.toWire(bps).concat(this.toWire(fbps))
				});
			}
		}

		return TPromise.wrap<void>(undefined);
	}

	private toWire(bps: (IBreakpoint | IFunctionBreakpoint)[]): (ISourceBreakpointData | IFunctionBreakpointData)[] {

		return bps.map(bp => {
			if ('name' in bp) {
				const fbp = <IFunctionBreakpoint>bp;
				return <IFunctionBreakpointData>{
					type: 'function',
					id: bp.getId(),
					enabled: bp.enabled,
					functionName: fbp.name,
					hitCondition: bp.hitCondition,
					/* condition: bp.condition */
				};
			} else {
				const sbp = <IBreakpoint>bp;
				return <ISourceBreakpointData>{
					type: 'source',
					id: bp.getId(),
					enabled: bp.enabled,
					condition: sbp.condition,
					hitCondition: bp.hitCondition,
					uri: sbp.uri,
					line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
					character: (typeof sbp.column === 'number' && sbp.column > 0) ? sbp.column - 1 : 0
				};
			}
		});
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

		return TPromise.wrap<void>(undefined);
	}

	public $unregisterDebugConfigurationProvider(handle: number): TPromise<any> {
		this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(handle);
		return TPromise.wrap<void>(undefined);
	}

	public $startDebugging(folderUri: uri | undefined, nameOrConfiguration: string | IConfig): TPromise<boolean> {
		const folder = folderUri ? this.contextService.getWorkspace().folders.filter(wf => wf.uri.toString() === folderUri.toString()).pop() : undefined;
		return this.debugService.startDebugging(folder, nameOrConfiguration).then(x => {
			return true;
		}, err => {
			return TPromise.wrapError(err && err.message ? err.message : 'cannot start debugging');
		});
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: any): TPromise<any> {
		const process = this.debugService.getModel().getProcesses().filter(p => p.getId() === sessionId).pop();
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

	public $appendDebugConsole(value: string): TPromise<any> {
		// Use warning as severity to get the orange color for messages coming from the debug extension
		this.debugService.logToRepl(value, severity.Warning);
		return TPromise.wrap<void>(undefined);
	}
}
