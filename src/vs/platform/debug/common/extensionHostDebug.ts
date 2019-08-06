/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IRemoteConsoleLog } from 'vs/base/common/console';

export const IExtensionHostDebugService = createDecorator<IExtensionHostDebugService>('extensionHostDebugService');

export interface IAttachSessionEvent {
	sessionId: string;
	subId?: string;
	port: number;
}

export interface ILogToSessionEvent {
	sessionId: string;
	log: IRemoteConsoleLog;
}

export interface ITerminateSessionEvent {
	sessionId: string;
	subId?: string;
}

export interface IReloadSessionEvent {
	sessionId: string;
}

export interface ICloseSessionEvent {
	sessionId: string;
}

export interface IExtensionHostDebugService {
	_serviceBrand: any;

	reload(sessionId: string): void;
	onReload: Event<IReloadSessionEvent>;

	close(sessionId: string): void;
	onClose: Event<ICloseSessionEvent>;

	attachSession(sessionId: string, port: number, subId?: string): void;
	onAttachSession: Event<IAttachSessionEvent>;

	logToSession(sessionId: string, log: IRemoteConsoleLog): void;
	onLogToSession: Event<ILogToSessionEvent>;

	terminateSession(sessionId: string, subId?: string): void;
	onTerminateSession: Event<ITerminateSessionEvent>;
}