/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExternalTerminalService as ICommonExternalTerminalService } from 'vs/platform/externalTerminal/common/externalTerminal';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('externalTerminal');

export interface IExternalTerminalService extends ICommonExternalTerminalService {
	readonly _serviceBrand: undefined;
}

registerMainProcessRemoteService(IExternalTerminalService, 'externalTerminal');
