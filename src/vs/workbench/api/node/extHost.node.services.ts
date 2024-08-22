/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions';
import { ExtHostTerminalService } from './extHostTerminalService';
import { ExtHostTask } from './extHostTask';
import { ExtHostDebugService } from './extHostDebugService';
import { NativeExtHostSearch } from './extHostSearch';
import { ExtHostExtensionService } from './extHostExtensionService';
import { NodeExtHostTunnelService } from './extHostTunnelService';
import { IExtHostDebugService } from '../common/extHostDebugService';
import { IExtHostExtensionService } from '../common/extHostExtensionService';
import { IExtHostSearch } from '../common/extHostSearch';
import { IExtHostTask } from '../common/extHostTask';
import { IExtHostTerminalService } from '../common/extHostTerminalService';
import { IExtHostTunnelService } from '../common/extHostTunnelService';
import { IExtensionStoragePaths } from '../common/extHostStoragePaths';
import { ExtensionStoragePaths } from './extHostStoragePaths';
import { ExtHostLoggerService } from './extHostLoggerService';
import { ILogService, ILoggerService } from '../../../platform/log/common/log';
import { NodeExtHostVariableResolverProviderService } from './extHostVariableResolverService';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService';
import { ExtHostLogService } from '../common/extHostLogService';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors';
import { ISignService } from '../../../platform/sign/common/sign';
import { SignService } from '../../../platform/sign/node/signService';

// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################

registerSingleton(IExtHostExtensionService, ExtHostExtensionService, InstantiationType.Eager);
registerSingleton(ILoggerService, ExtHostLoggerService, InstantiationType.Delayed);
registerSingleton(ILogService, new SyncDescriptor(ExtHostLogService, [false], true));
registerSingleton(ISignService, SignService, InstantiationType.Delayed);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, InstantiationType.Eager);

registerSingleton(IExtHostDebugService, ExtHostDebugService, InstantiationType.Eager);
registerSingleton(IExtHostSearch, NativeExtHostSearch, InstantiationType.Eager);
registerSingleton(IExtHostTask, ExtHostTask, InstantiationType.Eager);
registerSingleton(IExtHostTerminalService, ExtHostTerminalService, InstantiationType.Eager);
registerSingleton(IExtHostTunnelService, NodeExtHostTunnelService, InstantiationType.Eager);
registerSingleton(IExtHostVariableResolverProvider, NodeExtHostVariableResolverProviderService, InstantiationType.Eager);
