/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtHostLogService } from 'vs/workbench/api/common/extHostLogService';
import { ExtensionStoragePaths, IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { ExtHostExtensionService } from 'vs/workbench/api/worker/extHostExtensionService';

// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################

registerSingleton(ILogService, new SyncDescriptor(ExtHostLogService, [true], true));
registerSingleton(IExtHostExtensionService, ExtHostExtensionService, InstantiationType.Eager);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, InstantiationType.Eager);
