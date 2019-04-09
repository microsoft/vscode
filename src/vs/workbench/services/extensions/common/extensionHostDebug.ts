/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IRemoteConsoleLog } from 'vs/base/common/console';

export const IExtensionHostDebugService = createDecorator<IExtensionHostDebugService>('extensionHostDebugService');

export interface IExtensionHostDebugService {
	_serviceBrand: any;

	reload(resource: URI): void;
	onReload: Event<URI>;

	close(resource: URI): void;
	onClose: Event<URI>;

	attachSession(id: string, port: number): void;
	onAttachSession: Event<{ id: string, port: number }>;

	logToSession(id: string, log: IRemoteConsoleLog): void;
	onLogToSession: Event<{ id: string, log: IRemoteConsoleLog }>;

	terminateSession(id: string): void;
	onTerminateSession: Event<string>;
}