/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService, IAttachSessionEvent, ITerminateSessionEvent, ILogToSessionEvent } from 'vs/workbench/services/extensions/common/extensionHostDebug';
import { URI } from 'vs/base/common/uri';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { ipcRenderer as ipc } from 'electron';

interface IReloadBroadcast {
	type: 'vscode:extensionReload';
	resource: string;
}

interface IAttachSessionBroadcast extends IAttachSessionEvent {
	type: 'vscode:extensionAttach';
}

interface ICloseBroadcast {
	type: 'vscode:extensionCloseExtensionHost';
	resource: string;
}

interface ILogToSessionBroadcast extends ILogToSessionEvent {
	type: 'vscode:extensionLog';
}

interface ITerminateSessionBroadcast extends ITerminateSessionEvent {
	type: 'vscode:extensionTerminate';
}

const CHANNEL = 'vscode:extensionHostDebug';

class ExtensionHostDebugService implements IExtensionHostDebugService {
	_serviceBrand: any;

	private windowId: number;
	private readonly _onReload = new Emitter<URI>();
	private readonly _onClose = new Emitter<URI>();
	private readonly _onAttachSession = new Emitter<IAttachSessionEvent>();
	private readonly _onLogToSession = new Emitter<ILogToSessionEvent>();
	private readonly _onTerminateSession = new Emitter<ITerminateSessionEvent>();

	constructor(
		@IWindowService readonly windowService: IWindowService,
	) {
		this.windowId = windowService.windowId;

		ipc.on(CHANNEL, (_: unknown, broadcast: IReloadBroadcast | ICloseBroadcast | IAttachSessionBroadcast | ILogToSessionBroadcast | ITerminateSessionBroadcast) => {
			switch (broadcast.type) {
				case 'vscode:extensionReload':
					this._onReload.fire(URI.parse(broadcast.resource));
					break;
				case 'vscode:extensionCloseExtensionHost':
					this._onClose.fire(URI.parse(broadcast.resource));
					break;
				case 'vscode:extensionAttach':
					this._onAttachSession.fire(broadcast);
					break;
				case 'vscode:extensionLog':
					this._onLogToSession.fire(broadcast);
					break;
				case 'vscode:extensionTerminate':
					this._onTerminateSession.fire(broadcast);
					break;
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

	attachSession(sessionId: string, port: number, subId?: string): void {
		ipc.send(CHANNEL, this.windowId, <IAttachSessionBroadcast>{
			type: 'vscode:extensionAttach',
			sessionId,
			port,
			subId
		});
	}

	get onAttachSession(): Event<IAttachSessionEvent> {
		return this._onAttachSession.event;
	}

	logToSession(sessionId: string, log: IRemoteConsoleLog): void {
		ipc.send(CHANNEL, this.windowId, <ILogToSessionBroadcast>{
			type: 'vscode:extensionLog',
			sessionId,
			log
		});
	}

	get onLogToSession(): Event<ILogToSessionEvent> {
		return this._onLogToSession.event;
	}

	terminateSession(sessionId: string, subId?: string): void {
		ipc.send(CHANNEL, this.windowId, <ITerminateSessionBroadcast>{
			type: 'vscode:extensionTerminate',
			sessionId,
			subId
		});
	}

	get onTerminateSession(): Event<ITerminateSessionEvent> {
		return this._onTerminateSession.event;
	}
}

registerSingleton(IExtensionHostDebugService, ExtensionHostDebugService, true);
