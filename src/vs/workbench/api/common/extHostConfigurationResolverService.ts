/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

export interface IExtHostConfigurationResolverService extends IConfigurationResolverService {

}

export const IExtHostConfigurationResolverService = createDecorator<IExtHostConfigurationResolverService>('IExtHostConfigurationResolverService');
