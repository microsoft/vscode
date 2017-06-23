/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, MainThreadDebugServiceShape, ExtHostDebugServiceShape, DebugSessionUUID } from 'vs/workbench/api/node/extHost.protocol';

import * as vscode from 'vscode';


export class ExtHostDebugService extends ExtHostDebugServiceShape {

	private _debugServiceProxy: MainThreadDebugServiceShape;
	private _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	private _onDidTerminateDebugSession: Emitter<vscode.DebugSession>;
	get onDidTerminateDebugSession(): Event<vscode.DebugSession> { return this._onDidTerminateDebugSession.event; }


	constructor(threadService: IThreadService) {
		super();

		this._onDidTerminateDebugSession = new Emitter<vscode.DebugSession>();
		this._debugServiceProxy = threadService.get(MainContext.MainThreadDebugService);
	}

	public createDebugSession(config: vscode.DebugConfiguration): TPromise<vscode.DebugSession> {

		return this._debugServiceProxy.$createDebugSession(config).then((id: DebugSessionUUID) => {
			const debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, config.type, config.name);
			this._debugSessions.set(id, debugSession);
			return debugSession;
		});
	}

	public $acceptDebugSessionTerminated(id: DebugSessionUUID, type: string, name: string): void {

		let debugSession = this._debugSessions.get(id);
		if (!debugSession) {
			debugSession = new ExtHostDebugSession(this._debugServiceProxy, id, type, name);
		}
		this._onDidTerminateDebugSession.fire(debugSession);
		this._debugSessions.delete(id);
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
