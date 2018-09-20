/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI as uri } from 'vs/base/common/uri';
import { IDebugService, IConfig, IDebugConfigurationProvider, IBreakpoint, IFunctionBreakpoint, IBreakpointData, ITerminalSettings, IDebugAdapter, IDebugAdapterProvider, IDebugSession } from 'vs/workbench/parts/debug/common/debug';
import { TPromise } from 'vs/base/common/winjs.base';
import {
	ExtHostContext, ExtHostDebugServiceShape, MainThreadDebugServiceShape, DebugSessionUUID, MainContext,
	IExtHostContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, ISourceBreakpointDto, IFunctionBreakpointDto, IDebugSessionDto
} from 'vs/workbench/api/node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import severity from 'vs/base/common/severity';
import { AbstractDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import * as paths from 'vs/base/common/paths';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { convertToVSCPaths, convertToDAPaths } from 'vs/workbench/parts/debug/common/debugUtils';


@extHostNamedCustomer(MainContext.MainThreadDebugService)
export class MainThreadDebugService implements MainThreadDebugServiceShape, IDebugAdapterProvider {

	private _proxy: ExtHostDebugServiceShape;
	private _toDispose: IDisposable[];
	private _breakpointEventsActive: boolean;
	private _debugAdapters: Map<number, ExtensionHostDebugAdapter>;
	private _debugAdaptersHandleCounter = 1;

	constructor(
		extHostContext: IExtHostContext,
		@IDebugService private debugService: IDebugService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);
		this._toDispose = [];
		this._toDispose.push(debugService.onDidNewSession(session => {
			this._proxy.$acceptDebugSessionStarted(this.getSessionDto(session));
		}));
		// Need to start listening early to new session events because a custom event can come while a session is initialising
		this._toDispose.push(debugService.onWillNewSession(session => {
			this._toDispose.push(session.onDidCustomEvent(event => this._proxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
		}));
		this._toDispose.push(debugService.onDidEndSession(session => {
			this._proxy.$acceptDebugSessionTerminated(this.getSessionDto(session));
		}));
		this._toDispose.push(debugService.getViewModel().onDidFocusSession(session => {
			this._proxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
		}));

		this._debugAdapters = new Map<number, ExtensionHostDebugAdapter>();
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	// interface IDebugAdapterProvider

	createDebugAdapter(session: IDebugSession, folder: IWorkspaceFolder, config: IConfig): IDebugAdapter {
		const handle = this._debugAdaptersHandleCounter++;
		const da = new ExtensionHostDebugAdapter(handle, this._proxy, this.getSessionDto(session), folder, config);
		this._debugAdapters.set(handle, da);
		return da;
	}

	substituteVariables(folder: IWorkspaceFolder, config: IConfig): TPromise<IConfig> {
		return TPromise.wrap(this._proxy.$substituteVariables(folder ? folder.uri : undefined, config));
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, config: ITerminalSettings): TPromise<void> {
		return TPromise.wrap(this._proxy.$runInTerminal(args, config));
	}


	// RPC methods (MainThreadDebugServiceShape)

	public $registerDebugTypes(debugTypes: string[]) {
		this._toDispose.push(this.debugService.getConfigurationManager().registerDebugAdapterProvider(debugTypes, this));
	}

	public $startBreakpointEvents(): Thenable<void> {

		if (!this._breakpointEventsActive) {
			this._breakpointEventsActive = true;

			// set up a handler to send more
			this._toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(e => {
				// Ignore session only breakpoint events since they should only reflect in the UI
				if (e && !e.sessionOnly) {
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

	public $registerBreakpoints(DTOs: (ISourceMultiBreakpointDto | IFunctionBreakpointDto)[]): Thenable<void> {

		for (let dto of DTOs) {
			if (dto.type === 'sourceMulti') {
				const rawbps = dto.lines.map(l =>
					<IBreakpointData>{
						id: l.id,
						enabled: l.enabled,
						lineNumber: l.line + 1,
						column: l.character > 0 ? l.character + 1 : undefined, // a column value of 0 results in an omitted column attribute; see #46784
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

	public $unregisterBreakpoints(breakpointIds: string[], functionBreakpointIds: string[]): Thenable<void> {
		breakpointIds.forEach(id => this.debugService.removeBreakpoints(id));
		functionBreakpointIds.forEach(id => this.debugService.removeFunctionBreakpoints(id));
		return void 0;
	}


	public $registerDebugConfigurationProvider(debugType: string, hasProvide: boolean, hasResolve: boolean, hasProvideDebugAdapter: boolean, handle: number): Thenable<void> {

		const provider = <IDebugConfigurationProvider>{
			type: debugType
		};
		if (hasProvide) {
			provider.provideDebugConfigurations = (folder) => {
				return TPromise.wrap(this._proxy.$provideDebugConfigurations(handle, folder));
			};
		}
		if (hasResolve) {
			provider.resolveDebugConfiguration = (folder, config) => {
				return TPromise.wrap(this._proxy.$resolveDebugConfiguration(handle, folder, config));
			};
		}
		if (hasProvideDebugAdapter) {
			provider.provideDebugAdapter = (session, folder, config) => {
				return TPromise.wrap(this._proxy.$provideDebugAdapter(handle, this.getSessionDto(session), folder, config));
			};
		}
		this.debugService.getConfigurationManager().registerDebugConfigurationProvider(handle, provider);

		return TPromise.wrap<void>(undefined);
	}

	public $unregisterDebugConfigurationProvider(handle: number): Thenable<void> {
		this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(handle);
		return TPromise.wrap<void>(undefined);
	}

	public $startDebugging(_folderUri: uri | undefined, nameOrConfiguration: string | IConfig): Thenable<boolean> {
		const folderUri = _folderUri ? uri.revive(_folderUri) : undefined;
		const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
		return this.debugService.startDebugging(launch, nameOrConfiguration).then(x => {
			return true;
		}, err => {
			return TPromise.wrapError(new Error(err && err.message ? err.message : 'cannot start debugging'));
		});
	}

	public $customDebugAdapterRequest(sessionId: DebugSessionUUID, request: string, args: any): Thenable<any> {
		const session = this.debugService.getSession(sessionId);
		if (session) {
			return session.customRequest(request, args).then(response => {
				if (response && response.success) {
					return response.body;
				} else {
					return TPromise.wrapError(new Error(response ? response.message : 'custom request failed'));
				}
			});
		}
		return TPromise.wrapError(new Error('debug session not found'));
	}

	public $appendDebugConsole(value: string): Thenable<void> {
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

		this._debugAdapters.get(handle).acceptMessage(message);
	}

	public $acceptDAError(handle: number, name: string, message: string, stack: string) {
		this._debugAdapters.get(handle).fireError(handle, new Error(`${name}: ${message}\n${stack}`));
	}

	public $acceptDAExit(handle: number, code: number, signal: string) {
		this._debugAdapters.get(handle).fireExit(handle, code, signal);
	}

	// dto helpers

	private getSessionDto(session: IDebugSession): IDebugSessionDto {
		if (session) {
			return {
				id: <DebugSessionUUID>session.getId(),
				type: session.configuration.type,
				name: session.getName(false)
			};
		}
		return undefined;
	}

	private convertToDto(bps: (ReadonlyArray<IBreakpoint | IFunctionBreakpoint>)): (ISourceBreakpointDto | IFunctionBreakpointDto)[] {
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
}

/**
 * DebugAdapter that communicates via extension protocol with another debug adapter.
 */
class ExtensionHostDebugAdapter extends AbstractDebugAdapter {

	constructor(private _handle: number, private _proxy: ExtHostDebugServiceShape, private _sessionDto: IDebugSessionDto, private folder: IWorkspaceFolder, private config: IConfig) {
		super();
	}

	public fireError(handle: number, err: Error) {
		this._onError.fire(err);
	}

	public fireExit(handle: number, code: number, signal: string) {
		this._onExit.fire(code);
	}

	public startSession(): TPromise<void> {
		return TPromise.wrap(this._proxy.$startDASession(this._handle, this._sessionDto, this.folder ? this.folder.uri : undefined, this.config));
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
		return TPromise.wrap(this._proxy.$stopDASession(this._handle));
	}
}
