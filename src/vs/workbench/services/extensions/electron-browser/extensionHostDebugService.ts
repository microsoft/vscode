/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/workbench/services/extensions/common/extensionHostDebug';
import { URI } from 'vs/base/common/uri';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { ipcRenderer as ipc } from 'electron';

interface IReloadBroadcast {
	type: 'vscode:extensionReload';
	resource: string;
}

interface IAttachSessionBroadcast {
	type: 'vscode:extensionAttach';
	id: string;
	port: number;
}

interface ICloseBroadcast {
	type: 'vscode:extensionCloseExtensionHost';
	resource: string;
}

interface ILogToSessionBroadcast {
	type: 'vscode:extensionLog';
	id: string;
	log: IRemoteConsoleLog;
}

interface ITerminateSessionBroadcast {
	type: 'vscode:extensionTerminate';
	id: string;
}

const CHANNEL = 'vscode:extensionHostDebug';

class ExtensionHostDebugService implements IExtensionHostDebugService {
	_serviceBrand: any;

	private windowId: number;
	private readonly _onReload = new Emitter<URI>();
	private readonly _onClose = new Emitter<URI>();
	private readonly _onAttachSession = new Emitter<{ id: string, port: number }>();
	private readonly _onLogToSession = new Emitter<{ id: string, log: IRemoteConsoleLog }>();
	private readonly _onTerminateSession = new Emitter<string>();

	constructor(
		@IWindowService readonly windowService: IWindowService,
	) {
		this.windowId = windowService.getCurrentWindowId();

		ipc.on(CHANNEL, (_: unknown, broadcast: IReloadBroadcast | ICloseBroadcast | IAttachSessionBroadcast | ILogToSessionBroadcast | ITerminateSessionBroadcast) => {
			if (broadcast.type === 'vscode:extensionReload') {
				this._onReload.fire(URI.parse(broadcast.resource));
			}
			if (broadcast.type === 'vscode:extensionCloseExtensionHost') {
				this._onClose.fire(URI.parse(broadcast.resource));
			}
			if (broadcast.type === 'vscode:extensionAttach') {
				this._onAttachSession.fire({ id: broadcast.id, port: broadcast.port });
			}
			if (broadcast.type === 'vscode:extensionLog') {
				this._onLogToSession.fire({ id: broadcast.id, log: broadcast.log });
			}
			if (broadcast.type === 'vscode:extensionTerminate') {
				this._onTerminateSession.fire(broadcast.id);
			}
		});
	}

	reload(resource: URI): void {
		ipc.send(CHANNEL, this.windowId, <IReloadBroadcast>{
			type: 'vscode:extensionReload',
			resource: resource.toString()
		});
	}

	get onReload(): Event<URI> {
		return this._onReload.event;
	}

	close(resource: URI): void {
		ipc.send(CHANNEL, this.windowId, <ICloseBroadcast>{
			type: 'vscode:extensionCloseExtensionHost',
			resource: resource.toString()
		});
	}

	get onClose(): Event<URI> {
		return this._onClose.event;
	}

	attachSession(id: string, port: number): void {
		ipc.send(CHANNEL, this.windowId, <IAttachSessionBroadcast>{
			type: 'vscode:extensionAttach',
			id,
			port
		});
	}

	get onAttachSession(): Event<{ id: string, port: number }> {
		return this._onAttachSession.event;
	}

	logToSession(id: string, log: IRemoteConsoleLog): void {
		ipc.send(CHANNEL, this.windowId, <ILogToSessionBroadcast>{
			type: 'vscode:extensionLog',
			id,
			log
		});
	}

	get onLogToSession(): Event<{ id: string, log: IRemoteConsoleLog }> {
		return this._onLogToSession.event;
	}

	terminateSession(id: string): void {
		ipc.send(CHANNEL, this.windowId, <ITerminateSessionBroadcast>{
			type: 'vscode:extensionTerminate',
			id
		});
	}

	get onTerminateSession(): Event<string> {
		return this._onTerminateSession.event;
	}
}

registerSingleton(IExtensionHostDebugService, ExtensionHostDebugService, true);
