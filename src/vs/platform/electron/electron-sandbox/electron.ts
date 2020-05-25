/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonElectronService } from 'vs/platform/electron/common/electron';

export const IElectronService = createDecorator<IElectronService>('electronService');

export interface IElectronService extends ICommonElectronService { }
