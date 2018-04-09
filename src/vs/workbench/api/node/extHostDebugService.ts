/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, Emitter } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import {
	MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID,
	IMainContext, IBreakpointsDeltaDto, ISourceMultiBreakpointDto, IFunctionBreakpointDto
} from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import * as vscode from 'vscode';
import URI, { UriComponents } from 'vs/base/common/uri';
import { Disposable, Position, Location, SourceBreakpoint, FunctionBreakpoint } from 'vs/workbench/api/node/extHostTypes';
import { generateUuid } from 'vs/base/common/uuid';
import { DebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { convertToVSCPaths, convertToDAPaths } from 'vs/workbench/parts/debug/node/DapPathConverter';
import * as paths from 'vs/base/common/paths';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { IAdapterExecutable } from 'vs/workbench/parts/debug/common/debug';


export class ExtHostDebugService implements ExtHostDebugServiceShape {

	private _handleCounter: number;
	private _handlers: Map<number, vscode.DebugConfigurationProvider>;

	private _debugServiceProxy: MainThreadDebugServiceShape;
	private _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	private readonly _onDidStartDebugSession: Emitter<vscode.DebugSession>;
	get onDidStartDebugSession(): Event<vscode.DebugSession> { return this._onDidStartDebugSession.event; }

	private readonly _onDidTerminateDebugSession: Emitter<vscode.DebugSession>;
	get onDidTerminateDebugSession(): Event<vscode.DebugSession> { return this._onDidTerminateDebugSession.event; }

	private readonly _onDidChangeActiveDebugSession: Emitter<vscode.DebugSession | undefined>;
	get onDidChangeActiveDebugSession(): Event<vscode.DebugSession | undefined> { return this._onDidChangeActiveDebugSession.event; }

	private _activeDebugSession: ExtHostDebugSession | undefined;
	get activeDebugSession(): ExtHostDebugSession | undefined { return this._activeDebugSession; }

	private readonly _onDidReceiveDebugSessionCustomEvent: Emitter<vscode.DebugSessionCustomEvent>;
	get onDidReceiveDebugSessionCustomEvent(): Event<vscode.DebugSessionCustomEvent> { return this._onDidReceiveDebugSessionCustomEvent.event; }

	private _activeDebugConsole: ExtHostDebugConsole;
	get activeDebugConsole(): ExtHostDebugConsole { return this._activeDebugConsole; }

	private _breakpoints: Map<string, vscode.Breakpoint>;
	private _breakpointEventsActive: boolean;

	private readonly _onDidChangeBreakpoints: Emitter<vscode.BreakpointsChangeEvent>;

	private _debugAdapters: Map<number, DebugAdapter>;


	constructor(mainContext: IMainContext, private _workspace: ExtHostWorkspace, private _extensionService: ExtHostExtensionService) {

		this._handleCounter = 0;
		this._handlers = new Map<number, vscode.DebugConfigurationProvider>();

		this._onDidStartDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidTerminateDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidChangeActiveDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidReceiveDebugSessionCustomEvent = new Emitter<vscode.DebugSessionCustomEvent>();

		this._debugServiceProxy = mainContext.getProxy(MainContext.MainThreadDebugService);

		this._onDidChangeBreakpoints = new Emitter<vscode.BreakpointsChangeEvent>({
			onFirstListenerAdd: () => {
				this.startBreakpoints();
			}
		});

		this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);

		this._breakpoints = new Map<string, vscode.Breakpoint>();
		this._breakpointEventsActive = false;

		this._debugAdapters = new Map<number, DebugAdapter>();
	}

	public $startDASession(handle: number, debugType: string, adpaterExecutable: IAdapterExecutable | null): TPromise<void> {
		const mythis = this;

		const da = new class extends DebugAdapter {

			// DA -> VS Code
			public acceptMessage(message: DebugProtocol.ProtocolMessage) {
				convertToVSCPaths(message, source => {
					if (paths.isAbsolute(source.path)) {
						(<any>source).path = URI.file(source.path);
					}
				});
				mythis._debugServiceProxy.$acceptDAMessage(handle, message);
			}

		}(debugType, adpaterExecutable, this._extensionService.getAllExtensionDescriptions());

		this._debugAdapters.set(handle, da);
		da.onError(err => this._debugServiceProxy.$acceptDAError(handle, err.name, err.message, err.stack));
		da.onExit(code => this._debugServiceProxy.$acceptDAExit(handle, code, null));
		return da.startSession();
	}

	public $sendDAMessage(handle: number, message: DebugProtocol.ProtocolMessage): TPromise<void> {
		// VS Code -> DA
		convertToDAPaths(message, source => {
			if (typeof source.path === 'object') {
				source.path = URI.revive(source.path).fsPath;
			}
		});
		const da = this._debugAdapters.get(handle);
		if (da) {
			da.sendMessage(message);
		}
		return void 0;
	}

	public $stopDASession(handle: number): TPromise<void> {
		const da = this._debugAdapters.get(handle);
		this._debugAdapters.delete(handle);
		return da ? da.stopSession() : void 0;
	}

	private startBreakpoints() {
		if (!this._breakpointEventsActive) {
			this._breakpointEventsActive = true;
			this._debugServiceProxy.$startBreakpointEvents();
		}
	}

	get onDidChangeBreakpoints(): Event<vscode.BreakpointsChangeEvent> {
		return this._onDidChangeBreakpoints.event;
	}

	get breakpoints(): vscode.Breakpoint[] {

		this.startBreakpoints();

		const result: vscode.Breakpoint[] = [];
		this._breakpoints.forEach(bp => result.push(bp));
		return result;
	}

	public $acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void {

		let a: vscode.Breakpoint[] = [];
		let r: vscode.Breakpoint[] = [];
		let c: vscode.Breakpoint[] = [];

		if (delta.added) {
			for (const bpd of delta.added) {

				if (!this._breakpoints.has(bpd.id)) {
					let bp: vscode.Breakpoint;
					if (bpd.type === 'function') {
						bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					} else {
						const uri = URI.revive(bpd.uri);
						bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					}
					bp['_id'] = bpd.id;
					this._breakpoints.set(bpd.id, bp);
					a.push(bp);
				}
			}
		}

		if (delta.removed) {
			for (const id of delta.removed) {
				const bp = this._breakpoints.get(id);
				if (bp) {
					this._breakpoints.delete(id);
					r.push(bp);
				}
			}
		}

		if (delta.changed) {
			for (const bpd of delta.changed) {
				let bp = this._breakpoints.get(bpd.id);
				if (bp) {
					if (bp instanceof FunctionBreakpoint && bpd.type === 'function') {
						const fbp = <any>bp;
						fbp.enabled = bpd.enabled;
						fbp.condition = bpd.condition;
						fbp.hitCondition = bpd.hitCondition;
						fbp.logMessage = bpd.logMessage;
						fbp.functionName = bpd.functionName;
					} else if (bp instanceof SourceBreakpoint && bpd.type === 'source') {
						const sbp = <any>bp;
						sbp.enabled = bpd.enabled;
						sbp.condition = bpd.condition;
						sbp.hitCondition = bpd.hitCondition;
						sbp.logMessage = bpd.logMessage;
						sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
					}
					c.push(bp);
				}
			}
		}

		this.fireBreakpointChanges(a, r, c);
	}

	public addBreakpoints(breakpoints0: vscode.Breakpoint[]): TPromise<void> {

		this.startBreakpoints();

		// assign uuids for brand new breakpoints
		const breakpoints: vscode.Breakpoint[] = [];
		for (const bp of breakpoints0) {
			let id = bp['_id'];
			if (id) {	// has already id
				if (this._breakpoints.has(id)) {
					// already there
				} else {
					breakpoints.push(bp);
				}
			} else {
				id = generateUuid();
				bp['_id'] = id;
				this._breakpoints.set(id, bp);
				breakpoints.push(bp);
			}
		}

		// send notification for added breakpoints
		this.fireBreakpointChanges(breakpoints, [], []);

		// convert added breakpoints to DTOs
		const dtos: (ISourceMultiBreakpointDto | IFunctionBreakpointDto)[] = [];
		const map = new Map<string, ISourceMultiBreakpointDto>();
		for (const bp of breakpoints) {
			if (bp instanceof SourceBreakpoint) {
				let dto = map.get(bp.location.uri.toString());
				if (!dto) {
					dto = <ISourceMultiBreakpointDto>{
						type: 'sourceMulti',
						uri: bp.location.uri,
						lines: []
					};
					map.set(bp.location.uri.toString(), dto);
					dtos.push(dto);
				}
				dto.lines.push({
					id: bp['_id'],
					enabled: bp.enabled,
					condition: bp.condition,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					line: bp.location.range.start.line,
					character: bp.location.range.start.character
				});
			} else if (bp instanceof FunctionBreakpoint) {
				dtos.push({
					type: 'function',
					id: bp['_id'],
					enabled: bp.enabled,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					condition: bp.condition,
					functionName: bp.functionName
				});
			}
		}

		// send DTOs to VS Code
		return this._debugServiceProxy.$registerBreakpoints(dtos);
	}

	public removeBreakpoints(breakpoints0: vscode.Breakpoint[]): TPromise<void> {

		this.startBreakpoints();

		// remove from array
		const breakpoints: vscode.Breakpoint[] = [];
		for (const b of breakpoints0) {
			let id = b['_id'];
			if (id && this._breakpoints.delete(id)) {
				breakpoints.push(b);
			}
		}

		// send notification
		this.fireBreakpointChanges([], breakpoints, []);

		// unregister with VS Code
		const ids = breakpoints.filter(bp => bp instanceof SourceBreakpoint).map(bp => bp['_id']);
		const fids = breakpoints.filter(bp => bp instanceof FunctionBreakpoint).map(bp => bp['_id']);
		return this._debugServiceProxy.$unregisterBreakpoints(ids, fids);
	}

	private fireBreakpointChanges(added: vscode.Breakpoint[], removed: vscode.Breakpoint[], changed: vscode.Breakpoint[]) {
		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			this._onDidChangeBreakpoints.fire(Object.freeze({
				added: Object.freeze<vscode.Breakpoint[]>(added),
				removed: Object.freeze<vscode.Breakpoint[]>(removed),
				changed: Object.freeze<vscode.Breakpoint[]>(changed)
			}));
		}
	}

	public registerDebugConfigurationProvider(type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable {
		if (!provider) {
			return new Disposable(() => { });
		}

		let handle = this.nextHandle();
		this._handlers.set(handle, provider);
		this._debugServiceProxy.$registerDebugConfigurationProvider(type,
			!!provider.provideDebugConfigurations,
			!!provider.resolveDebugConfiguration,
			!!provider.debugAdapterExecutable, handle);

		return new Disposable(() => {
			this._handlers.delete(handle);
			this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
		});
	}

	public $provideDebugConfigurations(handle: number, folderUri: UriComponents | undefined): TPromise<vscode.DebugConfiguration[]> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<vscode.DebugConfiguration[]>(new Error('no handler found'));
		}
		if (!handler.provideDebugConfigurations) {
			return TPromise.wrapError<vscode.DebugConfiguration[]>(new Error('handler has no method provideDebugConfigurations'));
		}
		return asWinJsPromise(token => handler.provideDebugConfigurations(this.getFolder(folderUri), token));
	}

	public $resolveDebugConfiguration(handle: number, folderUri: UriComponents | undefined, debugConfiguration: vscode.DebugConfiguration): TPromise<vscode.DebugConfiguration> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<vscode.DebugConfiguration>(new Error('no handler found'));
		}
		if (!handler.resolveDebugConfiguration) {
			return TPromise.wrapError<vscode.DebugConfiguration>(new Error('handler has no method resolveDebugConfiguration'));
		}
		return asWinJsPromise(token => handler.resolveDebugConfiguration(this.getFolder(folderUri), debugConfiguration, token));
	}

	public $debugAdapterExecutable(handle: number, folderUri: UriComponents | undefined): TPromise<vscode.DebugAdapterExecutable> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<vscode.DebugAdapterExecutable>(new Error('no handler found'));
		}
		if (!handler.debugAdapterExecutable) {
			return TPromise.wrapError<vscode.DebugAdapterExecutable>(new Error('handler has no method debugAdapterExecutable'));
		}
		return asWinJsPromise(token => handler.debugAdapterExecutable(this.getFolder(folderUri), token));
	}

	public startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration): TPromise<boolean> {
		return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig);
	}

	public $acceptDebugSessionStarted(id: DebugSessionUUID, type: string, name: string): void {

		let debugSession = this._debugSessions.get(id);
		if (!debugSession) {
			debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, type, name);
			this._debugSessions.set(id, debugSession);
		}
		this._onDidStartDebugSession.fire(debugSession);
	}

	public $acceptDebugSessionTerminated(id: DebugSessionUUID, type: string, name: string): void {

		let debugSession = this._debugSessions.get(id);
		if (!debugSession) {
			debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, type, name);
			this._debugSessions.set(id, debugSession);
		}
		this._onDidTerminateDebugSession.fire(debugSession);
		this._debugSessions.delete(id);
	}

	public $acceptDebugSessionActiveChanged(id: DebugSessionUUID | undefined, type?: string, name?: string): void {

		if (id) {
			this._activeDebugSession = this._debugSessions.get(id);
			if (!this._activeDebugSession) {
				this._activeDebugSession = new ExtHostDebugSession(this._debugServiceProxy, id, type, name);
				this._debugSessions.set(id, this._activeDebugSession);
			}
		} else {
			this._activeDebugSession = undefined;
		}
		this._onDidChangeActiveDebugSession.fire(this._activeDebugSession);
	}

	public $acceptDebugSessionCustomEvent(id: DebugSessionUUID, type: string, name: string, event: any): void {

		let debugSession = this._debugSessions.get(id);
		if (!debugSession) {
			debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, type, name);
			this._debugSessions.set(id, debugSession);
		}
		const ee: vscode.DebugSessionCustomEvent = {
			session: debugSession,
			event: event.event,
			body: event.body
		};
		this._onDidReceiveDebugSessionCustomEvent.fire(ee);
	}

	private getFolder(_folderUri: UriComponents | undefined) {
		if (_folderUri) {
			const folderUriString = URI.revive(_folderUri).toString();
			const folders = this._workspace.getWorkspaceFolders();
			const found = folders.filter(f => f.uri.toString() === folderUriString);
			if (found && found.length > 0) {
				return found[0];
			}
		}
		return undefined;
	}

	private nextHandle(): number {
		return this._handleCounter++;
	}
}

export class ExtHostDebugSession implements vscode.DebugSession {

	private _debugServiceProxy: MainThreadDebugServiceShape;

	private _id: DebugSessionUUID;

	private _type: string;
	private _name: string;

	constructor(proxy: MainThreadDebugServiceShape, id: DebugSessionUUID, type: string, name: string) {
		this._debugServiceProxy = proxy;
		this._id = id;
		this._type = type;
		this._name = name;
	}

	public get id(): string {
		return this._id;
	}

	public get type(): string {
		return this._type;
	}

	public get name(): string {
		return this._name;
	}

	public customRequest(command: string, args: any): Thenable<any> {
		return this._debugServiceProxy.$customDebugAdapterRequest(this._id, command, args);
	}
}

export class ExtHostDebugConsole implements vscode.DebugConsole {

	private _debugServiceProxy: MainThreadDebugServiceShape;

	constructor(proxy: MainThreadDebugServiceShape) {
		this._debugServiceProxy = proxy;
	}

	append(value: string): void {
		this._debugServiceProxy.$appendDebugConsole(value);
	}

	appendLine(value: string): void {
		this.append(value + '\n');
	}
}
