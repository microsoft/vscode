/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import uri from 'vs/base/common/uri';
import { IDebugService, IConfig, IDebugConfigurationProvider, IBreakpoint, IFunctionBreakpoint, IBreakpointData, IAdapterExecutable, ITerminalSettings, IDebugAdapter } from 'vs/workbench/parts/debug/common/debug';
import { TPromise } from 'vs/base/common/winjs.base';
import {
	ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext,
	IExtHostContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, ISourceBreakpointDto, IFunctionBreakpointDto
} from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import severity from 'vs/base/common/severity';
import { AbstractDebugAdapter, convertToVSCPaths, convertToDAPaths } from 'vs/workbench/parts/debug/node/debugAdapter';
import * as paths from 'vs/base/common/paths';


@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape {

	private _proxy: ExtHostDebugServiceShape;
	private _toDispose: IDisposable[];
	private _breakpointEventsActive: boolean;
	private _extensionHostDebugAdapterProvider: ExtensionHostDebugAdapterProvider;

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private debugService: IDebugService
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

		this._extensionHostDebugAdapterProvider = new ExtensionHostDebugAdapterProvider(this._proxy);
	}

	public $registerDebugTypes(debugTypes: string[]) {
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugAdapterProvider(debugTypes, this._extensionHostDebugAdapterProvider));
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
					const delta: IBreakpointsDeltaDto = {};
					if (e.added) {
						delta.added = this.convertToDto(e.added);
					}
					if (e.removed) {
						delta.removed = e.removed.map(x => x.getId());
					}
					if (e.changed) {
						delta.changed = this.convertToDto(e.changed);
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
					added: this.convertToDto(bps).concat(this.convertToDto(fbps))
				});
			}
		}

		return TPromise.wrap<void>(undefined);
	}

	public $registerBreakpoints(DTOs: (ISourceMultiBreakpointDto | IFunctionBreakpointDto)[]): TPromise<void> {

		for (let dto of DTOs) {
			if (dto.type === 'sourceMulti') {
				const rawbps = dto.lines.map(l =>
					<IBreakpointData>{
						id: l.id,
						enabled: l.enabled,
						lineNumber: l.line + 1,
						column: l.character > 0 ? l.character + 1 : 0,
						condition: l.condition,
						hitCondition: l.hitCondition,
						logMessage: l.logMessage
					}
				);
				this.debugService.addBreakpoints(uri.revive(dto.uri), rawbps);
			} else if (dto.type === 'function') {
				this.debugService.addFunctionBreakpoint(dto.functionName, dto.id);
			}
		}
		return void 0;
	}

	public $unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[]): TPromise<void> {
		breakpointIds.forEach(id => this.debugService.removeBreakpoints(id));
		functionBreakpointIds.forEach(id => this.debugService.removeFunctionBreakpoints(id));
		return void 0;
	}

	private convertToDto(bps: (IBreakpoint | IFunctionBreakpoint)[]): (ISourceBreakpointDto | IFunctionBreakpointDto)[] {
		return bps.map(bp => {
			if ('name' in bp) {
				const fbp = <IFunctionBreakpoint>bp;
				return <IFunctionBreakpointDto>{
					type: 'function',
					id: fbp.getId(),
					enabled: fbp.enabled,
					condition: fbp.condition,
					hitCondition: fbp.hitCondition,
					logMessage: fbp.logMessage,
					functionName: fbp.name
				};
			} else {
				const sbp = <IBreakpoint>bp;
				return <ISourceBreakpointDto>{
					type: 'source',
					id: sbp.getId(),
					enabled: sbp.enabled,
					condition: sbp.condition,
					hitCondition: sbp.hitCondition,
					logMessage: sbp.logMessage,
					uri: sbp.uri,
					line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
					character: (typeof sbp.column === 'number' && sbp.column > 0) ? sbp.column - 1 : 0,
				};
			}
		});
	}

	public $registerDebugConfigurationProvider(debugType: string, hasProvide: boolean, hasResolve: boolean, hasDebugAdapterExecutable: boolean, handle: number): TPromise<void> {

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
		if (hasDebugAdapterExecutable) {
			provider.debugAdapterExecutable = (folder) => {
				return this._proxy.$debugAdapterExecutable(handle, folder);
			};
		}
		this.debugService.getConfigurationManager().registerDebugConfigurationProvider(handle, provider);

		return TPromise.wrap<void>(undefined);
	}

	public $unregisterDebugConfigurationProvider(handle: number): TPromise<any> {
		this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(handle);
		return TPromise.wrap<void>(undefined);
	}

	public $startDebugging(_folderUri: uri | undefined, nameOrConfiguration: string | IConfig): TPromise<boolean> {
		const folderUri = _folderUri ? uri.revive(_folderUri) : undefined;
		const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
		return this.debugService.startDebugging(launch, nameOrConfiguration).then(x => {
			return true;
		}, err => {
			return TPromise.wrapError(err && err.message ? err.message : 'cannot start debugging');
		});
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: any): TPromise<any> {
		const process = this.debugService.getModel().getProcesses().filter(p => p.getId() === sessionId).pop();
		if (process) {
			return process.session.custom(request, args).then(response => {
				if (response && response.success) {
					return response.body;
				} else {
					return TPromise.wrapError(new Error(response ? response.message : 'custom request failed'));
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

	public $acceptDAMessage(handle: number, message: DebugProtocol.ProtocolMessage) {

		convertToVSCPaths(message, source => {
			if (typeof source.path === 'object') {
				source.path = uri.revive(source.path).toString();
			}
		});

		this._extensionHostDebugAdapterProvider.acceptMessage(handle, message);
	}

	public $acceptDAError(handle: number, name: string, message: string, stack: string) {
		this._extensionHostDebugAdapterProvider.acceptDAError(handle, new Error(`${name}: ${message}\n${stack}`));
	}

	public $acceptDAExit(handle: number, code: number, signal: string) {
		this._extensionHostDebugAdapterProvider.acceptDAExit(handle, code, signal);
	}
}

class ExtensionHostDebugAdapter extends AbstractDebugAdapter {

	constructor(private _handle: number, private _proxy: ExtHostDebugServiceShape, private _debugType: string, private _adapterExecutable: IAdapterExecutable | null) {
		super();
	}

	public fireError(handle: number, err: Error) {
		this._onError.fire(err);
	}

	public fireExit(handle: number, code: number, signal: string) {
		this._onExit.fire(code);
	}

	public startSession(): TPromise<void> {
		return this._proxy.$startDASession(this._handle, this._debugType, this._adapterExecutable);
	}

	public sendMessage(message: DebugProtocol.ProtocolMessage): void {

		convertToDAPaths(message, source => {
			if (paths.isAbsolute(source.path)) {
				(<any>source).path = uri.file(source.path);
			} else {
				(<any>source).path = uri.parse(source.path);
			}
		});

		this._proxy.$sendDAMessage(this._handle, message);
	}

	public stopSession(): TPromise<void> {
		return this._proxy.$stopDASession(this._handle);
	}
}

class ExtensionHostDebugAdapterProvider {

	private _debugAdapters: Map<number, ExtensionHostDebugAdapter>;
	private _debugAdaptersHandleCounter = 1;

	constructor(private _proxy: ExtHostDebugServiceShape) {
		this._debugAdapters = new Map<number, ExtensionHostDebugAdapter>();
	}

	acceptMessage(handle: number, message: DebugProtocol.ProtocolMessage) {
		this._debugAdapters.get(handle).acceptMessage(message);
	}

	acceptDAError(handle: number, error: Error) {
		this._debugAdapters.get(handle).fireError(handle, error);
	}

	acceptDAExit(handle: number, code: number, signal: string) {
		this._debugAdapters.get(handle).fireExit(handle, code, signal);
	}

	createDebugAdapter(debugType: string, adapterInfo): IDebugAdapter {
		const handle = this._debugAdaptersHandleCounter++;
		const da = new ExtensionHostDebugAdapter(handle, this._proxy, debugType, adapterInfo);
		this._debugAdapters.set(handle, da);
		return da;
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {
		return this._proxy.$runInTerminal(args, config);
	}
}
