/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService, IAttachSessionEvent, ITerminateSessionEvent, ILogToSessionEvent, IReloadSessionEvent, ICloseSessionEvent } from 'vs/workbench/services/extensions/common/extensionHostDebug';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { ipcRenderer as ipc } from 'electron';

interface IReloadBroadcast extends IReloadSessionEvent {
	type: 'vscode:extensionReload';
}

interface IAttachSessionBroadcast extends IAttachSessionEvent {
	type: 'vscode:extensionAttach';
}

interface ICloseBroadcast extends ICloseSessionEvent {
	type: 'vscode:extensionCloseExtensionHost';
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
	private readonly _onReload = new Emitter<IReloadSessionEvent>();
	private readonly _onClose = new Emitter<ICloseSessionEvent>();
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
					this._onReload.fire(broadcast);
					break;
				case 'vscode:extensionCloseExtensionHost':
					this._onClose.fire(broadcast);
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

	reload(sessionId: string): void {
		ipc.send(CHANNEL, this.windowId, <IReloadBroadcast>{
			type: 'vscode:extensionReload',
			sessionId
		});
	}

	get onReload(): Event<IReloadSessionEvent> {
		return this._onReload.event;
	}

	close(sessionId: string): void {
		ipc.send(CHANNEL, this.windowId, <ICloseBroadcast>{
			type: 'vscode:extensionCloseExtensionHost',
			sessionId
		});
	}

	get onClose(): Event<ICloseSessionEvent> {
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
