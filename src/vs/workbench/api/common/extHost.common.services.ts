/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtHostOutputService, ExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { IExtHostWorkspace, ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostDecorations, ExtHostDecorations } from 'vs/workbench/api/common/extHostDecorations';
import { IExtHostConfiguration, ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IExtHostCommands, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostTerminalService, WorkerExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostTask, WorkerExtHostTask } from 'vs/workbench/api/common/extHostTask';
import { IExtHostDebugService, WorkerExtHostDebugService } from 'vs/workbench/api/common/extHostDebugService';
import { IExtHostSearch, ExtHostSearch } from 'vs/workbench/api/common/extHostSearch';
import { IExtensionStoragePaths, ExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { IExtHostStorage, ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { IExtHostTunnelService, ExtHostTunnelService } from 'vs/workbench/api/common/extHostTunnelService';
import { IExtHostApiDeprecationService, ExtHostApiDeprecationService, } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { IExtHostWindow, ExtHostWindow } from 'vs/workbench/api/common/extHostWindow';
import { IExtHostConsumerFileSystem, ExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { IExtHostFileSystemInfo, ExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { IExtHostSecretState, ExtHostSecretState } from 'vs/workbench/api/common/exHostSecretState';
import { ExtHostTelemetry, IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';

registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths);
registerSingleton(IExtHostApiDeprecationService, ExtHostApiDeprecationService);
registerSingleton(IExtHostCommands, ExtHostCommands);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration);
registerSingleton(IExtHostConsumerFileSystem, ExtHostConsumerFileSystem);
registerSingleton(IExtHostDebugService, WorkerExtHostDebugService);
registerSingleton(IExtHostDecorations, ExtHostDecorations);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors);
registerSingleton(IExtHostFileSystemInfo, ExtHostFileSystemInfo);
registerSingleton(IExtHostOutputService, ExtHostOutputService);
registerSingleton(IExtHostSearch, ExtHostSearch);
registerSingleton(IExtHostStorage, ExtHostStorage);
registerSingleton(IExtHostTask, WorkerExtHostTask);
registerSingleton(IExtHostTerminalService, WorkerExtHostTerminalService);
registerSingleton(IExtHostTunnelService, ExtHostTunnelService);
registerSingleton(IExtHostWindow, ExtHostWindow);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace);
registerSingleton(IExtHostSecretState, ExtHostSecretState);
registerSingleton(IExtHostTelemetry, ExtHostTelemetry);
