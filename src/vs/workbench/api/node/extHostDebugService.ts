/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import { MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID, IMainContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';

import * as vscode from 'vscode';
import URI from 'vs/base/common/uri';
import * as types from 'vs/workbench/api/node/extHostTypes';


export class ExtHostDebugService implements ExtHostDebugServiceShape {

	private _workspace: ExtHostWorkspace;

	private _handleCounter: number;
	private _handlers: Map<number, vscode.DebugConfigurationProvider>;

	private _debugServiceProxy: MainThreadDebugServiceShape;
	private _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	private _onDidStartDebugSession: Emitter<vscode.DebugSession>;
	get onDidStartDebugSession(): Event<vscode.DebugSession> { return this._onDidStartDebugSession.event; }

	private _onDidTerminateDebugSession: Emitter<vscode.DebugSession>;
	get onDidTerminateDebugSession(): Event<vscode.DebugSession> { return this._onDidTerminateDebugSession.event; }

	private _onDidChangeActiveDebugSession: Emitter<vscode.DebugSession | undefined>;
	get onDidChangeActiveDebugSession(): Event<vscode.DebugSession | undefined> { return this._onDidChangeActiveDebugSession.event; }

	private _activeDebugSession: ExtHostDebugSession | undefined;
	get activeDebugSession(): ExtHostDebugSession | undefined { return this._activeDebugSession; }

	private _onDidReceiveDebugSessionCustomEvent: Emitter<vscode.DebugSessionCustomEvent>;
	get onDidReceiveDebugSessionCustomEvent(): Event<vscode.DebugSessionCustomEvent> { return this._onDidReceiveDebugSessionCustomEvent.event; }


	constructor(mainContext: IMainContext, workspace: ExtHostWorkspace) {

		this._workspace = workspace;

		this._handleCounter = 0;
		this._handlers = new Map<number, vscode.DebugConfigurationProvider>();

		this._onDidStartDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidTerminateDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidChangeActiveDebugSession = new Emitter<vscode.DebugSession>();
		this._onDidReceiveDebugSessionCustomEvent = new Emitter<vscode.DebugSessionCustomEvent>();

		this._debugServiceProxy = mainContext.get(MainContext.MainThreadDebugService);
	}

	public registerDebugConfigurationProvider(type: string, provider: vscode.DebugConfigurationProvider): vscode.Disposable {
		if (!provider) {
			return new types.Disposable(() => { });
		}

		let handle = this.nextHandle();
		this._handlers.set(handle, provider);
		this._debugServiceProxy.$registerDebugConfigurationProvider(type, !!provider.provideDebugConfigurations, !!provider.resolveDebugConfiguration, handle);

		return new types.Disposable(() => {
			this._handlers.delete(handle);
			this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
		});
	}

	public $provideDebugConfigurations(handle: number, folderUri: URI | undefined): TPromise<vscode.DebugConfiguration[]> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<vscode.DebugConfiguration[]>(new Error('no handler found'));
		}
		if (!handler.provideDebugConfigurations) {
			return TPromise.wrapError<vscode.DebugConfiguration[]>(new Error('handler has no method provideDebugConfigurations'));
		}
		return asWinJsPromise(token => handler.provideDebugConfigurations(this.getFolder(folderUri), token));
	}


	public $resolveDebugConfiguration(handle: number, folderUri: URI | undefined, debugConfiguration: vscode.DebugConfiguration): TPromise<vscode.DebugConfiguration> {
		let handler = this._handlers.get(handle);
		if (!handler) {
			return TPromise.wrapError<vscode.DebugConfiguration>(new Error('no handler found'));
		}
		if (!handler.resolveDebugConfiguration) {
			return TPromise.wrapError<vscode.DebugConfiguration>(new Error('handler has no method resolveDebugConfiguration'));
		}
		return asWinJsPromise(token => handler.resolveDebugConfiguration(this.getFolder(folderUri), debugConfiguration, token));
	}

	public startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration): TPromise<boolean> {

		return this._debugServiceProxy.$startDebugging(folder ? <URI>folder.uri : undefined, nameOrConfig);
	}

	public startDebugSession(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): TPromise<vscode.DebugSession> {

		return this._debugServiceProxy.$startDebugSession(folder ? <URI>folder.uri : undefined, config).then((id: DebugSessionUUID) => {
			const debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, config.type, config.name);
			this._debugSessions.set(id, debugSession);
			return debugSession;
		});
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

	private getFolder(folderUri: URI | undefined) {
		if (folderUri) {
			const folders = this._workspace.getWorkspaceFolders();
			const found = folders.filter(f => f.uri.toString() === folderUri.toString());
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
	};

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
