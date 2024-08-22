/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions';
import { ILogService } from '../../../platform/log/common/log';
import { IExtHostExtensionService } from '../common/extHostExtensionService';
import { ExtHostLogService } from '../common/extHostLogService';
import { ExtensionStoragePaths, IExtensionStoragePaths } from '../common/extHostStoragePaths';
import { ExtHostExtensionService } from './extHostExtensionService';

// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################

registerSingleton(ILogService, new SyncDescriptor(ExtHostLogService, [true], true));
registerSingleton(IExtHostExtensionService, ExtHostExtensionService, InstantiationType.Eager);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, InstantiationType.Eager);
