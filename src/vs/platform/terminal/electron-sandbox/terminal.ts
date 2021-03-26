/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IPtyService } from 'vs/platform/terminal/common/terminal';

export const ILocalPtyService = createDecorator<ILocalPtyService>('localPtyService');
export interface ILocalPtyService extends IPtyService { }
