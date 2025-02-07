/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { ExtHostTerminalService } from './extHostTerminalService.js';
import { ExtHostTask } from './extHostTask.js';
import { ExtHostDebugService } from './extHostDebugService.js';
import { NativeExtHostSearch } from './extHostSearch.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';
import { NodeExtHostTunnelService } from './extHostTunnelService.js';
import { IExtHostDebugService } from '../common/extHostDebugService.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { IExtHostSearch } from '../common/extHostSearch.js';
import { IExtHostTask } from '../common/extHostTask.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostTunnelService } from '../common/extHostTunnelService.js';
import { IExtensionStoragePaths } from '../common/extHostStoragePaths.js';
import { ExtensionStoragePaths } from './extHostStoragePaths.js';
import { ExtHostLoggerService } from './extHostLoggerService.js';
import { ILogService, ILoggerService } from '../../../platform/log/common/log.js';
import { NodeExtHostVariableResolverProviderService } from './extHostVariableResolverService.js';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';
import { ExtHostLogService } from '../common/extHostLogService.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { SignService } from '../../../platform/sign/node/signService.js';
import { ExtHostTelemetry, IExtHostTelemetry } from '../common/extHostTelemetry.js';

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
registerSingleton(IExtHostTelemetry, new SyncDescriptor(ExtHostTelemetry, [false], true));

registerSingleton(IExtHostDebugService, ExtHostDebugService, InstantiationType.Eager);
registerSingleton(IExtHostSearch, NativeExtHostSearch, InstantiationType.Eager);
registerSingleton(IExtHostTask, ExtHostTask, InstantiationType.Eager);
registerSingleton(IExtHostTerminalService, ExtHostTerminalService, InstantiationType.Eager);
registerSingleton(IExtHostTunnelService, NodeExtHostTunnelService, InstantiationType.Eager);
registerSingleton(IExtHostVariableResolverProvider, NodeExtHostVariableResolverProviderService, InstantiationType.Eager);
