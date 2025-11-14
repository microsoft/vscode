/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExternalTerminalService as ICommonExternalTerminalService } from '../common/externalTerminal.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { registerMainProcessRemoteService } from '../../ipc/electron-browser/services.js';

export const IExternalTerminalService = createDecorator<IExternalTerminalService>('externalTerminal');

export interface IExternalTerminalService extends ICommonExternalTerminalService {
	readonly _serviceBrand: undefined;
}

registerMainProcessRemoteService(IExternalTerminalService, 'externalTerminal');
