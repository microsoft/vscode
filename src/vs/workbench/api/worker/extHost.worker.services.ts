/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { ExtensionStoragePaths, IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { ExtHostExtensionService } from 'vs/workbench/api/worker/extHostExtensionService';

// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################

registerSingleton(IExtHostExtensionService, ExtHostExtensionService, false);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, false);
