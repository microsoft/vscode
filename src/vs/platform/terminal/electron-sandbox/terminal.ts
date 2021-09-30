/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IPtyService } from 'vs/platform/terminal/common/terminal';

export const ILocalPtyService = createDecorator<ILocalPtyService>('localPtyService');

/**
 * A service responsible for communicating with the pty host process on Electron.
 *
 * **This service should only be used within the terminal component.**
 */
export interface ILocalPtyService extends IPtyService { }
