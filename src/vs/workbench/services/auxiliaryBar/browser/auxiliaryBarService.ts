/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IPanelService } from 'vs/workbench/services/panel/browser/panelService';

export const IAuxiliaryBarService = createDecorator<IAuxiliaryBarService>('auxiliaryBarService');

export interface IAuxiliaryBarService extends IPanelService { }
